"""Exact univariate Puiseux series over Sage.js coefficient rings.

The representation is a Laurent series in a hidden ramified parameter.  A
positive integer ramification index records that integer exponent `n` in the
Laurent series denotes exponent `n/e` in the public Puiseux variable.  Every
operation normalizes the common divisor of the support, precision, and
ramification index, so equal series have a canonical rational-exponent scale.
The sole exception is Sage's deliberately reproduced transient `e=0`
construction state, which raises on exponent-dependent observation.

This module is ordinary Python and is loaded only when `PuiseuxSeriesRing` is
first requested.  The arithmetic itself uses the portable Laurent-series
fallback, including when native acceleration is disabled.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

__all__ = [
    "PuiseuxSeries",
    "PuiseuxSeriesElement",
    "PuiseuxSeriesRing",
    "PuiseuxSeriesRingParent",
]


def _gcd(left: int, right: int) -> int:
    return int(
        runtime.bigint_gcd(
            runtime.integer_bigint(left),
            runtime.integer_bigint(right),
        )
    )


def _lcm(left: int, right: int) -> int:
    return left // _gcd(left, right) * right


def _coefficients(value: Any) -> list[Any]:
    return value._parent._polynomial_ring._from_native(value._native).coefficients()


def _convert_laurent(target: Any, value: Any) -> Any:
    coefficients = [target.base_ring()(entry) for entry in _coefficients(value)]
    polynomial = target._polynomial_ring._from_coefficients(coefficients)
    return target._from_native(
        polynomial._legacy_polynomial_oracle_input(),
        value._shift,
        value._precision,
    )


def _rational(numerator: Any, denominator: Any) -> Any:
    return sage.QQ(numerator) / sage.QQ(denominator)


def _power_text(variable: str, numerator: int, denominator: int) -> str:
    rational = _rational(numerator, denominator)
    numerator = int(rational.numerator())
    denominator = int(rational.denominator())
    if numerator == 0:
        return "1"
    if denominator == 1:
        if numerator == 1:
            return variable
        return variable + "^" + str(numerator)
    return variable + "^(" + str(rational) + ")"


def _truncate_rational(value: Any) -> int:
    rational = sage.QQ(value)
    return runtime.normalize_integer(
        runtime.native_div(rational._numerator, rational._denominator)
    )


def _series_base_is_field(base: Any) -> bool:
    kind = getattr(base, "_kind", None)
    if kind in ["QQ", "GF", "GF_EXTENSION"]:
        return True
    if kind == "ZMOD":
        method = runtime.reflect.get(base, "is_field")
        return bool(runtime.reflect.apply(method, base, []))
    return False


def _series_base_is_integral_domain(base: Any) -> bool:
    if base is sage.ZZ or _series_base_is_field(base):
        return True
    if getattr(base, "_kind", None) == "ZMOD":
        method = runtime.reflect.get(base, "is_integral_domain")
        return bool(runtime.reflect.apply(method, base, []))
    return False


def _series_base_fraction_field(base: Any) -> Any:
    if base is sage.ZZ:
        return sage.QQ
    if _series_base_is_field(base):
        return base
    raise ValueError("must be an integral domain")


def _is_series_element(value: Any) -> bool:
    parent = getattr(value, "_parent", None)
    return getattr(parent, "_kind", None) in ["PowerSeriesRing", "LaurentSeriesRing"]


def _is_series_parent(value: Any) -> bool:
    return getattr(value, "_kind", None) in ["PowerSeriesRing", "LaurentSeriesRing"]


def _has_coerce_map(target: Any, source: Any) -> bool:
    """Return the exact base-extension maps supported by the portable rings."""
    if target is source:
        return True
    source_kind = getattr(source, "_kind", None)
    target_kind = getattr(target, "_kind", None)
    if source_kind == "ZZ":
        return target_kind in ["ZZ", "QQ", "GF", "GF_EXTENSION", "ZMOD"]
    if source_kind != target_kind:
        return False
    if source_kind in ["GF", "ZMOD"]:
        return getattr(source, "_modulus", None) == getattr(target, "_modulus", None)
    return False


def _laurent_series_ring(*arguments: Any) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, "LaurentSeriesRing")
    if constructor is runtime.undefined:
        raise RuntimeError("LaurentSeriesRing is not available in this runtime")
    return runtime.reflect.apply(constructor, runtime.undefined, arguments)


def _power_series_ring(*arguments: Any) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, "PowerSeriesRing")
    if constructor is runtime.undefined:
        raise RuntimeError("PowerSeriesRing is not available in this runtime")
    return runtime.reflect.apply(constructor, runtime.undefined, arguments)


@runtime.lightweight_math_class
class PuiseuxSeriesElement(sage.Element):
    """A rational-exponent series stored as a normalized Laurent series."""

    _supports_exact_rational_powers = True

    def __init__(
        self, parent: PuiseuxSeriesRingParent, laurent: Any, ramification: int
    ) -> None:
        self._parent = parent
        self._laurent = laurent
        self._ramification = ramification
        runtime.object.freeze(self)

    def laurent_part(self) -> Any:
        return self._laurent

    def ramification_index(self) -> int:
        return self._ramification

    def _common_ramification_index(self, other: PuiseuxSeriesElement) -> Any:
        common = _lcm(self._ramification, other._ramification)
        return runtime.math_tuple(
            [
                common,
                common // self._ramification,
                common // other._ramification,
            ]
        )

    def _coerce_other(self, other: Any) -> PuiseuxSeriesElement:
        return self._parent(other)

    def _add_(self, other: PuiseuxSeriesElement) -> PuiseuxSeriesElement:
        common = _lcm(self._ramification, other._ramification)
        left = self._laurent._inflate(common // self._ramification)
        right = other._laurent._inflate(common // other._ramification)
        return self._parent._from_laurent(left._add_(right), common)

    def _sub_(self, other: PuiseuxSeriesElement) -> PuiseuxSeriesElement:
        common = _lcm(self._ramification, other._ramification)
        left = self._laurent._inflate(common // self._ramification)
        right = other._laurent._inflate(common // other._ramification)
        return self._parent._from_laurent(left._sub_(right), common)

    def _mul_(self, other: PuiseuxSeriesElement) -> PuiseuxSeriesElement:
        common = _lcm(self._ramification, other._ramification)
        left = self._laurent._inflate(common // self._ramification)
        right = other._laurent._inflate(common // other._ramification)
        return self._parent._from_laurent(left._mul_(right), common)

    def _truediv_(self, other: PuiseuxSeriesElement) -> PuiseuxSeriesElement:
        common = _lcm(self._ramification, other._ramification)
        left = self._laurent._inflate(common // self._ramification)
        right = other._laurent._inflate(common // other._ramification)
        return self._parent._from_laurent(left._truediv_(right), common)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __neg__(self) -> PuiseuxSeriesElement:
        return self._parent._from_laurent(-self._laurent, self._ramification)

    def __pow__(self, exponent: Any) -> PuiseuxSeriesElement:
        rational = sage.QQ(exponent)
        numerator = int(rational.numerator())
        denominator = int(rational.denominator())
        if denominator == 1:
            return self._parent._from_laurent(
                self._laurent**numerator,
                self._ramification,
            )
        if not self.is_monomial():
            raise ValueError("can only exponentiate single term by rational")
        if numerator < 0 and self._laurent._precision is not None:
            raise ValueError("For finite precision only positive arguments allowed")
        if numerator > 0:
            # Sage substitutes V(numerator) before changing ramification.  In
            # particular, this scales finite absolute precision together with
            # the support instead of applying Laurent multiplication power
            # precision.
            powered = self._laurent._inflate(numerator)
        else:
            powered = self._laurent**numerator
        return self._parent._from_laurent(
            powered,
            self._ramification * denominator,
        )

    def inverse(self) -> PuiseuxSeriesElement:
        return self._parent._from_laurent(
            self._laurent.inverse(),
            self._ramification,
        )

    __invert__ = inverse

    def valuation(self) -> Any:
        value = self._laurent.valuation()
        if value == runtime.number.POSITIVE_INFINITY:
            return value
        return _rational(value, self._ramification)

    def precision_absolute(self) -> Any:
        if self._laurent._precision is None:
            return runtime.number.POSITIVE_INFINITY
        return _rational(self._laurent._precision, self._ramification)

    prec = precision_absolute

    def precision_relative(self) -> Any:
        precision = self.precision_absolute()
        valuation = self.valuation()
        if precision == runtime.number.POSITIVE_INFINITY:
            return precision
        return precision - valuation

    def common_prec(self, other: Any) -> Any:
        other = self._coerce_other(other)
        return min(self.prec(), other.prec())

    def add_bigoh(self, precision: Any) -> PuiseuxSeriesElement:
        if precision == runtime.number.POSITIVE_INFINITY:
            return self
        rational = sage.QQ(precision)
        if self._laurent._precision is not None and rational >= self.prec():
            return self
        integer_precision = _truncate_rational(rational * self._ramification)
        return self._parent._from_laurent(
            self._laurent.add_bigoh(integer_precision),
            self._ramification,
        )

    def change_ring(self, base: Any) -> PuiseuxSeriesElement:
        return self._parent.change_ring(base)(self)

    def variable(self) -> str:
        return self._parent.variable_name()

    def is_zero(self) -> bool:
        return self._laurent._native_is_zero()

    def is_monomial(self) -> bool:
        coefficients = _coefficients(self._laurent)
        one = self._parent.base_ring()(1)
        nonzero = [
            coefficient
            for coefficient in coefficients
            if coefficient != self._parent.base_ring()(0)
        ]
        return len(nonzero) == 1 and nonzero[0] == one

    def is_unit(self) -> bool:
        if self.is_zero():
            return False
        leading = _coefficients(self._laurent)[0]
        if self._parent.base_ring() is sage.ZZ:
            return leading == 1 or leading == -1
        if self._parent.is_field():
            return True
        method = getattr(leading, "is_unit", None)
        if method is None:
            return False
        return bool(method())

    def coefficients(self) -> list[Any]:
        zero = self._parent.base_ring()(0)
        return [
            coefficient
            for coefficient in _coefficients(self._laurent)
            if coefficient != zero
        ]

    def list(self) -> list[Any]:
        return _coefficients(self._laurent)

    def laurent_series(self) -> Any:
        if self._ramification != 1:
            raise ArithmeticError("self is not a Laurent series")
        return self._laurent

    def power_series(self) -> Any:
        if self._ramification != 1 or self._laurent._shift < 0:
            raise ArithmeticError("self is not a power series")
        power_ring = _power_series_ring(
            self._parent.base_ring(),
            self._parent.variable_name(),
            self._parent.default_prec(),
            None,
            self._parent.is_sparse(),
        )
        return power_ring(self._laurent)

    def exponents(self) -> list[Any]:
        zero = self._parent.base_ring()(0)
        result = []
        coefficients = _coefficients(self._laurent)
        for index in range(len(coefficients)):
            if coefficients[index] != zero:
                result.append(
                    _rational(
                        self._laurent._shift + index,
                        self._ramification,
                    )
                )
        return result

    def degree(self) -> Any:
        exponents = self.exponents()
        if len(exponents) == 0:
            return -1
        return exponents[len(exponents) - 1]

    def __getitem__(self, exponent: Any) -> Any:
        scaled = sage.QQ(exponent) * self._ramification
        if scaled.denominator() != 1:
            return self._parent.base_ring()(0)
        return self._laurent[int(scaled.numerator())]

    def shift(self, exponent: Any) -> PuiseuxSeriesElement:
        # Sage shifts on the element's existing ramification lattice.  A
        # rational shift which is not represented on that lattice is truncated
        # toward zero rather than extending the lattice.
        amount = _truncate_rational(sage.QQ(exponent) * self._ramification)
        shifted = self._laurent * self._laurent._parent.gen() ** amount
        return self._parent._from_laurent(shifted, self._ramification)

    def truncate(self, precision: Any) -> PuiseuxSeriesElement:
        truncated = self.add_bigoh(precision)
        laurent = truncated._laurent
        exact = laurent._parent._from_native(
            laurent._native,
            laurent._shift,
            None,
        )
        return self._parent._from_laurent(exact, truncated._ramification)

    def __lshift__(self, exponent: Any) -> PuiseuxSeriesElement:
        return self.shift(exponent)

    def __rshift__(self, exponent: Any) -> PuiseuxSeriesElement:
        return self.shift(-sage.QQ(exponent))

    def _eq_(self, other: PuiseuxSeriesElement) -> bool:
        if self._ramification != other._ramification:
            return False
        return self._laurent == other._laurent

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _bigoh(self) -> PuiseuxSeriesElement:
        return self._parent(0).add_bigoh(self.valuation())

    def __repr__(self) -> str:
        variable = self._parent.variable_name()
        base = self._parent.base_ring()
        zero = base(0)
        one = base(1)
        pieces = []
        coefficients = _coefficients(self._laurent)
        for index in range(len(coefficients)):
            coefficient = coefficients[index]
            if coefficient == zero:
                continue
            numerator = self._laurent._shift + index
            power = _power_text(variable, numerator, self._ramification)
            if numerator == 0:
                term = str(coefficient)
            elif coefficient == one:
                term = power
            elif coefficient == -one:
                term = "-" + power
            else:
                term = str(coefficient) + "*" + power
            if len(pieces) == 0:
                pieces.append(term)
            elif term.startswith("-"):
                pieces.append(" - " + term[1:])
            else:
                pieces.append(" + " + term)
        text = "".join(pieces)
        if self._laurent._precision is not None:
            precision_text = _power_text(
                variable,
                self._laurent._precision,
                self._ramification,
            )
            bigoh = "O(" + precision_text + ")"
            text += (" + " if text else "") + bigoh
        return text if text else "0"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
@runtime.lightweight_math_class
class PuiseuxSeriesRingParent(sage.Parent):
    """Parent for Puiseux series over one of Sage.js's exact base rings."""

    Element = PuiseuxSeriesElement

    def __init__(self, laurent: Any) -> None:
        self._laurent_series_ring = laurent
        self._base = laurent.base_ring()
        self._variable = laurent.variable_name()
        self._default_precision = laurent.default_prec()
        self._generator = None
        self._generators = None
        self._is_sparse = laurent.is_sparse()
        self._is_field = _series_base_is_field(self._base)
        self._kind = "PuiseuxSeriesRing"
        self._name = (
            ("Sparse " if self._is_sparse else "")
            + "Puiseux Series Ring in "
            + self._variable
            + " over "
            + str(self._base)
        )
        runtime.coercion_model.register(self._base, self, self)
        if self._base is not sage.ZZ:
            runtime.coercion_model.register(sage.ZZ, self, self)
        runtime.coercion_model.register(laurent, self, self)

    def base_ring(self) -> Any:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def variable_names(self) -> Any:
        return runtime.math_tuple([self._variable])

    def default_prec(self) -> int:
        return self._default_precision

    def laurent_series_ring(self) -> Any:
        return self._laurent_series_ring

    def is_sparse(self) -> bool:
        return self._is_sparse

    def is_dense(self) -> bool:
        return not self._is_sparse

    def is_field(self, proof: Any = True) -> bool:
        del proof
        return self._is_field

    def change_ring(self, base: Any) -> PuiseuxSeriesRingParent:
        return PuiseuxSeriesRing(
            base,
            self._variable,
            self._default_precision,
            None,
            None,
            self.is_sparse(),
        )

    def base_extend(self, base: Any) -> PuiseuxSeriesRingParent:
        if not _has_coerce_map(base, self._base):
            raise TypeError("no valid base extension defined")
        return self.change_ring(base)

    def fraction_field(self) -> PuiseuxSeriesRingParent:
        if self.is_field():
            return self
        if not _series_base_is_integral_domain(self._base):
            raise ValueError("must be an integral domain")
        return self.change_ring(_series_base_fraction_field(self._base))

    def residue_field(self) -> Any:
        if not self.is_field():
            raise TypeError("the base ring is not a field")
        return self._base

    def uniformizer(self) -> PuiseuxSeriesElement:
        if not self.is_field():
            raise TypeError("the base ring is not a field")
        return self.gen()

    def _normalize_laurent(self, laurent: Any, ramification: int) -> Any:
        ramification = abs(int(ramification))
        if ramification == 0:
            raise ValueError("ramification index must be nonzero")
        common = ramification
        coefficients = _coefficients(laurent)
        zero = self._base(0)
        for index in range(len(coefficients)):
            if coefficients[index] != zero:
                common = _gcd(common, laurent._shift + index)
        if laurent._precision is not None:
            common = _gcd(common, laurent._precision)
        if common <= 1:
            return runtime.math_tuple([laurent, ramification])
        reduced_coefficients = []
        for index in range(0, len(coefficients), common):
            reduced_coefficients.append(coefficients[index])
        polynomial = self._laurent_series_ring._polynomial_ring._from_coefficients(
            reduced_coefficients
        )
        precision = None
        if laurent._precision is not None:
            precision = laurent._precision // common
        reduced = self._laurent_series_ring._from_native(
            polynomial._legacy_polynomial_oracle_input(),
            laurent._shift // common,
            precision,
        )
        return runtime.math_tuple([reduced, ramification // common])

    def _from_laurent(
        self, laurent: Any, ramification: int = 1
    ) -> PuiseuxSeriesElement:
        if laurent._parent is not self._laurent_series_ring:
            laurent = _convert_laurent(self._laurent_series_ring, laurent)
        normalized = self._normalize_laurent(laurent, ramification)
        return PuiseuxSeriesElement(self, normalized[0], normalized[1])

    def __call__(
        self, value: Any = 0, e: int = 1, prec: Any = None
    ) -> PuiseuxSeriesElement:
        if isinstance(value, PuiseuxSeriesElement):
            if value._parent is self:
                answer = value
            else:
                answer = self._from_laurent(
                    _convert_laurent(self._laurent_series_ring, value._laurent),
                    value._ramification,
                )
        elif getattr(value, "_parent", None) is self._base or runtime.is_exact_integer(
            value
        ):
            # Sage ignores an explicit ramification for coefficient elements.
            answer = self._from_laurent(self._laurent_series_ring(value))
        elif _is_series_element(value):
            if int(e) == 0:
                converted = _convert_laurent(self._laurent_series_ring, value)
                answer = PuiseuxSeriesElement(self, converted, 0)
            else:
                answer = self._from_laurent(
                    _convert_laurent(self._laurent_series_ring, value),
                    e,
                )
        else:
            if int(e) == 0:
                # Sage permits this invalid intermediate and reports the zero
                # denominator only when an exponent-dependent observation
                # (such as repr or valuation) divides by the ramification.
                answer = PuiseuxSeriesElement(
                    self,
                    self._laurent_series_ring(value),
                    0,
                )
            else:
                answer = self._from_laurent(self._laurent_series_ring(value), e)
        if prec is not None:
            return answer.add_bigoh(prec)
        return answer

    def gen(self, index: int = 0) -> PuiseuxSeriesElement:
        if index != 0:
            raise IndexError("generator " + str(index) + " not defined")
        if self._generator is None:
            self._generator = self._from_laurent(self._laurent_series_ring.gen())
        return self._generator

    def gens(self) -> Any:
        if self._generators is None:
            self._generators = runtime.math_tuple([self.gen()])
        return self._generators

    def ngens(self) -> int:
        return 1

    def objgen(self) -> Any:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> Any:
        return runtime.math_tuple([self, runtime.math_tuple([self.gen()])])

    def _first_ngens(self, count: int) -> list[PuiseuxSeriesElement]:
        if count != 1:
            raise ValueError("a univariate series ring has exactly one generator")
        return [self.gen()]


_ring_cache = runtime.map()


def PuiseuxSeriesRing(
    base: Any,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
    name: Any = None,
    sparse: bool = False,
) -> PuiseuxSeriesRingParent:
    if (
        variable is not None
        and runtime.jstype(variable) == "object"
        and variable[runtime.kwargs_symbol]
    ):
        if hasattr(variable, "names"):
            names = variable.names
        if hasattr(variable, "name"):
            name = variable.name
        if hasattr(variable, "default_prec"):
            default_prec = variable.default_prec
        if hasattr(variable, "sparse"):
            sparse = variable.sparse
        variable = None
    if name is not None:
        variable = name
    if names is not None:
        variable = names
    if _is_series_parent(base):
        if not base._is_laurent:
            raise TypeError("PuiseuxSeriesRing requires a Laurent series ring")
        laurent = base
    else:
        if variable is None:
            raise TypeError("a Puiseux-series variable name is required")
        laurent = _laurent_series_ring(
            base,
            variable,
            default_prec,
            None,
            sparse,
        )
    parent = _ring_cache.get(laurent)
    if parent is runtime.undefined:
        parent = PuiseuxSeriesRingParent(laurent)
        _ring_cache.set(laurent, parent)
    return parent


runtime.set_class_repr(
    PuiseuxSeriesElement,
    "<class 'sage.rings.puiseux_series_ring_element.PuiseuxSeries'>",
)

PuiseuxSeries = PuiseuxSeriesElement
