# Elementary capped-relative p-adic fields and rings.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _p_adic_prime(value: Any) -> int:
    prime = runtime.normalize_integer(value)
    if (
        runtime.jstype(prime) != "number"
        or not runtime.number.isSafeInteger(prime)
        or prime < 2
        or not sage.is_prime(prime)
    ):
        raise ValueError("p must be prime")
    return prime


def _p_adic_precision(value: Any) -> int:
    precision = runtime.normalize_integer(value)
    if (
        runtime.jstype(precision) != "number"
        or not runtime.number.isSafeInteger(precision)
        or precision < 1
    ):
        raise ValueError("p-adic precision must be positive")
    return precision


def _bigint_abs(value: Any) -> Any:
    if value < 0:
        return -value
    return value


def _valuation_and_unit(value: Any, prime: Any) -> tuple[int, Any]:
    value = runtime.integer_bigint(value)
    prime = runtime.integer_bigint(prime)
    if value == 0:
        return 0, value
    unit = _bigint_abs(value)
    valuation = 0
    while unit % prime == 0:
        unit = runtime.integer_bigint(unit // prime)
        valuation += 1
    if value < 0:
        unit = -unit
    return valuation, unit


def _inverse_mod(value: Any, modulus: Any) -> Any:
    old_remainder = runtime.integer_bigint(value)
    remainder = runtime.integer_bigint(modulus)
    old_coefficient = runtime.bigint(1)
    coefficient = runtime.bigint(0)
    while remainder != 0:
        quotient = runtime.integer_bigint(old_remainder // remainder)
        temporary = runtime.integer_bigint(old_remainder - quotient * remainder)
        old_remainder = remainder
        remainder = temporary
        temporary = runtime.integer_bigint(old_coefficient - quotient * coefficient)
        old_coefficient = coefficient
        coefficient = temporary
    if old_remainder != 1 and old_remainder != -1:
        raise ZeroDivisionError("p-adic denominator is not a unit")
    if old_remainder == -1:
        old_coefficient = -old_coefficient
    return runtime.integer_bigint(old_coefficient % modulus)


def _p_adic_power_text(prime: int, exponent: int) -> str:
    if exponent == 0:
        return ""
    if exponent == 1:
        return str(prime)
    return str(prime) + "^" + str(exponent)


def _p_adic_term_text(
    digit: int,
    prime: int,
    exponent: int,
) -> str:
    if exponent == 0:
        return str(digit)
    power = _p_adic_power_text(prime, exponent)
    if digit == 1:
        return power
    return str(digit) + "*" + power


def _wrapped_p_adic_sum(terms: list[str]) -> str:
    if len(terms) == 0:
        return "0"
    text = terms[0]
    line_length = len(terms[0])
    for term in terms[1:]:
        addition = " + " + term
        if line_length + len(addition) > 70:
            text += "\n  + " + term
            line_length = 4 + len(term)
        else:
            text += addition
            line_length += len(addition)
    return text


@runtime.lightweight_math_class
class PAdicElement(sage.Element):
    def __init__(
        self,
        parent: PAdicParent,
        value: Any,
    ) -> None:
        self._parent = parent
        self._value = sage.QQ(value)
        numerator_valuation, _unit = _valuation_and_unit(
            self._value._numerator, parent._prime
        )
        denominator_valuation, _unit = _valuation_and_unit(
            self._value._denominator, parent._prime
        )
        if parent._kind == "Zp" and numerator_valuation - denominator_valuation < 0:
            raise ValueError("negative valuation is not in this p-adic ring")
        runtime.object.freeze(self)

    def _new(self, value: Any) -> PAdicElement:
        return PAdicElement(self._parent, value)

    def _add_(self, other: PAdicElement) -> PAdicElement:
        return self._new(self._value + other._value)

    def _sub_(self, other: PAdicElement) -> PAdicElement:
        return self._new(self._value - other._value)

    def _mul_(self, other: PAdicElement) -> PAdicElement:
        return self._new(self._value * other._value)

    def _truediv_(self, other: PAdicElement) -> PAdicElement:
        return self._new(self._value / other._value)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __neg__(self) -> PAdicElement:
        return self._new(-self._value)

    def _eq_(self, other: PAdicElement) -> bool:
        return self._value == other._value

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def valuation(self) -> Any:
        if self._value._numerator == 0:
            return float("inf")
        numerator_valuation, _unit = _valuation_and_unit(
            self._value._numerator, self._parent._prime
        )
        denominator_valuation, _unit = _valuation_and_unit(
            self._value._denominator, self._parent._prime
        )
        return numerator_valuation - denominator_valuation

    def __repr__(self) -> str:
        prime = self._parent._prime
        precision = self._parent._precision
        if self._value._numerator == 0:
            return "0 + O(" + str(prime) + "^" + str(precision) + ")"
        numerator_valuation, numerator = _valuation_and_unit(
            self._value._numerator, prime
        )
        denominator_valuation, denominator = _valuation_and_unit(
            self._value._denominator, prime
        )
        valuation = numerator_valuation - denominator_valuation
        prime_bigint = runtime.bigint(prime)
        modulus = prime_bigint ** runtime.bigint(precision)
        numerator_residue = runtime.native_mod(
            runtime.integer_bigint(numerator), modulus
        )
        denominator_residue = runtime.native_mod(
            runtime.integer_bigint(denominator), modulus
        )
        inverse = runtime.integer_bigint(_inverse_mod(denominator_residue, modulus))
        residue = runtime.native_mod(
            runtime.native_mul(numerator_residue, inverse),
            modulus,
        )
        terms = []
        exponent = valuation
        for _index in range(precision):
            digit = int(runtime.native_mod(residue, prime_bigint))
            if digit:
                terms.append(_p_adic_term_text(digit, prime, exponent))
            residue = runtime.native_div(residue, prime_bigint)
            exponent += 1
        terms.append("O(" + str(prime) + "^" + str(valuation + precision) + ")")
        return _wrapped_p_adic_sum(terms)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class PAdicParent(sage.Parent):
    def __init__(
        self,
        prime: int,
        precision: int,
        kind: str,
    ) -> None:
        self._prime = prime
        self._precision = precision
        self._kind = kind
        noun = "Field" if kind == "Qp" else "Ring"
        self._name = (
            str(prime)
            + "-adic "
            + noun
            + " with capped relative precision "
            + str(precision)
        )

    def __call__(self, value: Any = 0) -> PAdicElement:
        if isinstance(value, PAdicElement):
            if value._parent is self:
                return value
            value = value._value
        return PAdicElement(self, value)

    def __contains__(self, value: object) -> bool:
        try:
            self(value)
            return True
        except Exception:
            return False

    def prime(self) -> int:
        return self._prime

    def precision_cap(self) -> int:
        return self._precision


_qp_cache = runtime.map()
_zp_cache = runtime.map()


def _p_adic_parent(
    prime: Any,
    precision: Any,
    kind: str,
) -> PAdicParent:
    selected_prime = _p_adic_prime(prime)
    selected_precision = _p_adic_precision(precision)
    cache = _qp_cache if kind == "Qp" else _zp_cache
    by_precision = cache.get(selected_prime)
    if by_precision is runtime.undefined:
        by_precision = runtime.map()
        cache.set(selected_prime, by_precision)
    parent = by_precision.get(selected_precision)
    if parent is runtime.undefined:
        parent = PAdicParent(selected_prime, selected_precision, kind)
        by_precision.set(selected_precision, parent)
    return parent


def Qp(prime: Any, prec: Any = 20) -> PAdicParent:
    """Construct a capped-relative p-adic field."""
    return _p_adic_parent(prime, prec, "Qp")


def Zp(prime: Any, prec: Any = 20) -> PAdicParent:
    """Construct a capped-relative p-adic ring."""
    return _p_adic_parent(prime, prec, "Zp")


runtime.register_doc(
    "Qp",
    Qp,
    {
        "kind": "function",
        "module": "sage.rings.padics.factory",
        "aliases": ["Zp"],
        "tags": ["number theory", "p-adic fields", "p-adic rings"],
        "backends": ["Sage.js exact rational expansion"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Capped-relative parents and exact rational expansions are "
                "compatible; analytic and extension-field operations are "
                "not yet implemented."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath p-adic factory API",
                "url": ("https://doc.sagemath.org/html/en/reference/padics/"),
                "license": "GPL-2.0-or-later",
            },
        ],
        "implementation": {
            "algorithm": ("modular inversion followed by base-p digit extraction"),
        },
        "limitations": [
            "Only exact rational elements are currently supported.",
        ],
    },
)
