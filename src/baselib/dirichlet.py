# Sage-compatible Dirichlet groups and characters backed by FLINT.
#
# FLINT owns the finite abelian group decomposition and character arithmetic.
# This module supplies Sage's parent/element surface and exact cyclotomic
# presentation.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


def _euler_phi(value: int) -> int:
    result = value
    for prime, _exponent in sage.factor(value):
        prime_value = runtime.number(prime)
        result = result // prime_value * (prime_value - 1)
    return result


def _native_field(value: Any, name: str) -> Any:
    return runtime.reflect.get(value, name)


def _analytic_precision(precision: Any) -> int:
    precision = runtime.normalize_integer(precision)
    if (
        runtime.jstype(precision) != "number"
        or not runtime.number.isSafeInteger(precision)
        or precision < 2
    ):
        raise ValueError("precision must be at least 2 bits")
    return precision


def _complex_from_native(
    native_value: Any,
    precision: Any,
) -> Any:
    complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")
    return complex_field(precision)._fromNative(native_value)


def _qqbar_from_native(native_value: Any) -> Any:
    algebraic_field = runtime.reflect.get(runtime.global_object, "QQbar")
    return algebraic_field._from_native(native_value)


def _format_cyclotomic_polynomial(
    coefficients: list[Any],
    variable: str,
) -> str:
    terms = []
    index = len(coefficients) - 1
    while index >= 0:
        raw_coefficient = coefficients[index]
        if isinstance(raw_coefficient, (list, tuple)):
            coefficient = sage.QQ(raw_coefficient[0]) / sage.QQ(raw_coefficient[1])
        else:
            coefficient = sage.QQ(raw_coefficient)
        if coefficient != 0:
            absolute = -coefficient if coefficient < 0 else coefficient
            if index == 0:
                body = str(absolute)
            else:
                power = variable if index == 1 else variable + "^" + str(index)
                body = power if absolute == 1 else str(absolute) + "*" + power
            if len(terms) == 0:
                terms.append(("-" if coefficient < 0 else "") + body)
            else:
                terms.append((" - " if coefficient < 0 else " + ") + body)
        index -= 1
    return "".join(terms) if len(terms) else "0"


@runtime.lightweight_math_class
class CyclotomicElement(sage.Element):
    """An exact element of a FLINT-backed cyclotomic field."""

    def __init__(
        self,
        parent: CyclotomicFieldParent,
        exponent: Any = None,
        native_value: Any = None,
    ) -> None:
        self._parent = parent
        self._exponent = exponent
        if native_value is not None:
            self._native = native_value
        elif exponent is None:
            self._native = runtime.flint_backend().qqbarFromRational(
                runtime.bigint(0), runtime.bigint(1)
            )
        else:
            normalized = runtime.integer_bigint(exponent) % parent._order
            self._exponent = runtime.normalize_integer(normalized)
            self._native = runtime.flint_backend().qqbarRootOfUnity(
                runtime.integer_bigint(normalized), parent._order
            )
        runtime.object.freeze(self)

    def _new_root(self, exponent: Any) -> CyclotomicElement:
        return self._parent._root(exponent)

    def _new(self, native_value: Any) -> CyclotomicElement:
        return self._parent._from_native(native_value)

    def _add_(
        self,
        other: CyclotomicElement,
    ) -> CyclotomicElement:
        if self.is_zero():
            return other
        if other.is_zero():
            return self
        return self._new(runtime.flint_backend().qqbarAdd(self._native, other._native))

    def _sub_(
        self,
        other: CyclotomicElement,
    ) -> CyclotomicElement:
        if other.is_zero():
            return self
        if self._eq_(other):
            return self._parent.zero()
        return self._new(runtime.flint_backend().qqbarSub(self._native, other._native))

    def _mul_(
        self,
        other: CyclotomicElement,
    ) -> CyclotomicElement:
        if self._exponent is not None and other._exponent is not None:
            return self._new_root(
                runtime.integer_bigint(self._exponent)
                + runtime.integer_bigint(other._exponent)
            )
        if self.is_zero() or other.is_zero():
            return self._parent.zero()
        return self._new(runtime.flint_backend().qqbarMul(self._native, other._native))

    def _truediv_(
        self,
        other: CyclotomicElement,
    ) -> CyclotomicElement:
        if self._exponent is not None and other._exponent is not None:
            return self._new_root(
                runtime.integer_bigint(self._exponent)
                - runtime.integer_bigint(other._exponent)
            )
        if other.is_zero():
            raise ZeroDivisionError("division by zero")
        if self.is_zero():
            return self
        return self._new(runtime.flint_backend().qqbarDiv(self._native, other._native))

    def _eq_(self, other: CyclotomicElement) -> bool:
        return runtime.flint_backend().qqbarEqual(self._native, other._native)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", other, self)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __rsub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", other, self)

    def __mul__(self, other: object) -> Any:
        if isinstance(other, CyclotomicElement):
            if other._parent is not self._parent:
                raise TypeError("incompatible cyclotomic fields")
            return self._mul_(other)
        return runtime.coercion_model.binOp("mul", self, other)

    def __rmul__(self, other: object) -> Any:
        return self * other

    def __truediv__(self, other: object) -> Any:
        if isinstance(other, CyclotomicElement):
            if other._parent is not self._parent:
                raise TypeError("incompatible cyclotomic fields")
            return self._truediv_(other)
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, CyclotomicElement):
            return self._eq_(other)
        try:
            return self._eq_(self._parent(other))
        except Exception:
            return False

    def __neg__(self) -> CyclotomicElement:
        if self._exponent is not None and self._parent._order % runtime.bigint(2) == 0:
            return self._new_root(
                runtime.integer_bigint(self._exponent)
                + self._parent._order // runtime.bigint(2)
            )
        return self._new(runtime.flint_backend().qqbarNeg(self._native))

    def __pow__(self, exponent: Any) -> CyclotomicElement:
        exponent = runtime.integer_bigint(exponent)
        if self._exponent is not None:
            return self._new_root(runtime.integer_bigint(self._exponent) * exponent)
        if self.is_zero():
            if exponent < 0:
                raise ZeroDivisionError("zero cannot be raised to a negative power")
            if exponent == 0:
                return self._parent.one()
            return self
        return self._new(runtime.flint_backend().qqbarPow(self._native, exponent))

    def is_zero(self) -> bool:
        return runtime.flint_backend().qqbarEqual(
            self._native, self._parent.zero()._native
        )

    def is_one(self) -> bool:
        return runtime.flint_backend().qqbarEqual(
            self._native, self._parent.one()._native
        )

    def multiplicative_order(self) -> Any:
        if self.is_zero():
            raise ArithmeticError("zero does not have a multiplicative order")
        if self._exponent is None:
            raise ArithmeticError(
                "multiplicative order is only available for roots of unity"
            )
        exponent = runtime.integer_bigint(self._exponent)
        if exponent == 0:
            return 1
        return runtime.normalize_integer(
            self._parent._order // runtime.bigint_gcd(self._parent._order, exponent)
        )

    def n(
        self,
        prec: int = 53,
        digits: Any = runtime.undefined,
    ) -> Any:
        algebraic_field = runtime.reflect.get(runtime.global_object, "QQbar")
        return algebraic_field._from_native(self._native).n(prec, digits)

    numerical_approx = n

    def minpoly(self, variable: str = "x") -> Any:
        ring = sage.PolynomialRing(sage.ZZ, variable)
        coefficients = runtime.flint_backend().qqbarMinpolyCoefficients(self._native)
        generator = ring.gen()
        result = ring(0)
        for coefficient in reversed(coefficients):
            result = result * generator + ring(coefficient)
        return result

    minimal_polynomial = minpoly

    def __repr__(self) -> str:
        coefficients = runtime.flint_backend().cyclotomicElementCoefficients(
            self._native,
            self._parent._order,
        )
        return _format_cyclotomic_polynomial(coefficients, self._parent._variable)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class CyclotomicFieldParent(sage.Parent):
    """The exact roots needed as values of Dirichlet characters."""

    def __init__(self, order: Any) -> None:
        order = runtime.integer_bigint(order)
        if order <= 0:
            raise ValueError("cyclotomic order must be positive")
        self._order = order
        self._degree = runtime.integer_bigint(_euler_phi(runtime.number(order)))
        self._variable = "zeta" + str(order)
        self._kind = "CyclotomicField"
        self._construction = {
            "kind": "CyclotomicField",
            "order": runtime.normalize_integer(order),
        }
        self._name = (
            "Cyclotomic Field of order "
            + str(order)
            + " and degree "
            + str(self._degree)
        )
        self._roots = runtime.map()
        self._zero = CyclotomicElement(self, None)
        runtime.coercion_model.register(sage.ZZ, self, self)
        runtime.coercion_model.register(sage.QQ, self, self)

    def _from_native(self, native_value: Any) -> CyclotomicElement:
        return CyclotomicElement(self, None, native_value=native_value)

    def _root(self, exponent: Any) -> CyclotomicElement:
        exponent = runtime.normalize_integer(
            runtime.integer_bigint(exponent) % self._order
        )
        cached = self._roots.get(exponent)
        if cached is runtime.undefined:
            cached = CyclotomicElement(self, exponent)
            self._roots.set(exponent, cached)
        return cached

    def __call__(self, value: Any = 0) -> CyclotomicElement:
        if isinstance(value, CyclotomicElement):
            if value._parent is self:
                return value
            return self._from_native(value._native)
        if hasattr(value, "_native"):
            return self._from_native(runtime.reflect.get(value, "_native"))
        if isinstance(value, sage.Rational):
            if value._denominator == 1:
                integer = value._numerator
                if integer == 0:
                    return self.zero()
                if integer == 1:
                    return self.one()
                if integer == -1 and self._order % runtime.bigint(2) == 0:
                    return self._root(self._order // runtime.bigint(2))
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(
                    value._numerator, value._denominator
                )
            )
        if runtime.is_exact_integer(value):
            integer = runtime.integer_bigint(value)
            if integer == 0:
                return self.zero()
            if integer == 1:
                return self.one()
            if integer == -1 and self._order % runtime.bigint(2) == 0:
                return self._root(self._order // runtime.bigint(2))
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(integer, runtime.bigint(1))
            )
        raise TypeError("unable to coerce value into " + str(self))

    def _from_coefficients(
        self,
        coefficients: list[Any],
    ) -> CyclotomicElement:
        """Construct from power-basis coefficients in the cyclotomic generator."""
        result = self.zero()
        generator = self.gen()
        for exponent, coefficient in enumerate(coefficients):
            rational = sage.QQ(coefficient)
            if rational != 0:
                result += self(rational) * generator**exponent
        return result

    def _serialization_coefficients(
        self,
        value: CyclotomicElement,
    ) -> list[Any]:
        """Return canonical rational power-basis coordinates for storage."""
        pairs = runtime.flint_backend().cyclotomicElementCoefficients(
            value._native, self._order
        )
        return [_untyped(sage.QQ)(pair[0], pair[1]) for pair in pairs]

    def gen(self, index: int = 0) -> CyclotomicElement:
        if runtime.integer_bigint(index) != 0:
            raise IndexError("only one cyclotomic generator")
        return self._root(1)

    def _first_ngens(self, count: int) -> list[CyclotomicElement]:
        if runtime.integer_bigint(count) != 1:
            raise ValueError("cyclotomic fields have exactly one generator")
        return [self.gen()]

    def gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple([self.gen()])

    def zero(self) -> CyclotomicElement:
        return self._zero

    def one(self) -> CyclotomicElement:
        return self._root(0)

    def degree(self) -> Any:
        return runtime.normalize_integer(self._degree)

    def zeta_order(self) -> Any:
        return runtime.normalize_integer(self._order)


_cyclotomic_fields = runtime.map()


def CyclotomicField(order: Any) -> CyclotomicFieldParent:
    normalized = runtime.normalize_integer(runtime.integer_bigint(order))
    field = _cyclotomic_fields.get(normalized)
    if field is runtime.undefined:
        field = CyclotomicFieldParent(normalized)
        _cyclotomic_fields.set(normalized, field)
    return field


@runtime.lightweight_math_class
class DirichletCharacter(sage.Element):
    """A Dirichlet character represented by Sage's mixed-radix index."""

    def __init__(
        self,
        parent: DirichletGroup_class,
        index: Any,
    ) -> None:
        index = runtime.integer_bigint(index)
        if index < 0 or index >= parent._size:
            raise IndexError("Dirichlet character index out of range")
        self._parent = parent
        self._index = index
        self._data = runtime.undefined
        self._values_cache = runtime.undefined
        self._bernoulli_cache = runtime.map()

    def _native_data(self) -> Any:
        if self._data is runtime.undefined:
            self._data = runtime.flint_backend().dirichletCharacterData(
                self._parent._native, self._index
            )
        return self._data

    def _logs(self) -> list[int]:
        index = self._index
        answer = []
        for order in self._parent._orders:
            order_integer = runtime.integer_bigint(order)
            answer.append(runtime.normalize_integer(index % order_integer))
            index //= order_integer
        return answer

    def __call__(self, value: Any) -> Any:
        residue = runtime.integer_bigint(value) % self._parent._modulus
        exponent = runtime.flint_backend().dirichletCharacterExponent(
            self._parent._native,
            self._index,
            runtime.integer_bigint(residue),
        )
        if exponent is None:
            return self._parent._zero()
        scaled = (
            runtime.integer_bigint(exponent)
            * self._parent._value_order
            // self._parent._native_exponent
        )
        return self._parent._root(scaled)

    def _mul_(
        self,
        other: DirichletCharacter,
    ) -> DirichletCharacter:
        left = self._logs()
        right = other._logs()
        result = []
        index = 0
        while index < len(left):
            order = runtime.integer_bigint(self._parent._orders[index])
            result.append(
                runtime.normalize_integer(
                    (
                        runtime.integer_bigint(left[index])
                        + runtime.integer_bigint(right[index])
                    )
                    % order
                )
            )
            index += 1
        return self._parent._from_logs(result)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __pow__(self, exponent: Any) -> DirichletCharacter:
        exponent = runtime.integer_bigint(exponent)
        result = []
        logs = self._logs()
        index = 0
        while index < len(logs):
            order = runtime.integer_bigint(self._parent._orders[index])
            result.append(
                runtime.normalize_integer(
                    runtime.integer_bigint(logs[index]) * exponent % order
                )
            )
            index += 1
        return self._parent._from_logs(result)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, DirichletCharacter)
            and other._parent is self._parent
            and other._index == self._index
        )

    def values(self) -> list[Any]:
        if self._values_cache is not runtime.undefined:
            return self._values_cache
        raw_values = runtime.flint_backend().dirichletCharacterExponents(
            self._parent._native, self._index
        )
        result = []
        for exponent in raw_values:
            if exponent is None:
                result.append(self._parent._zero())
            else:
                scaled = (
                    runtime.integer_bigint(exponent)
                    * self._parent._value_order
                    // self._parent._native_exponent
                )
                result.append(self._parent._root(scaled))
        self._values_cache = result
        return result

    def modulus(self) -> Any:
        return self._parent.modulus()

    def conductor(self) -> Any:
        return runtime.normalize_integer(
            _native_field(self._native_data(), "conductor")
        )

    def order(self) -> Any:
        return runtime.normalize_integer(_native_field(self._native_data(), "order"))

    def _minimal_base_ring(self) -> Any:
        value_order = self.order()
        if value_order % 2 == 1:
            value_order *= 2
        return CyclotomicField(value_order)

    def is_primitive(self) -> bool:
        return bool(_native_field(self._native_data(), "primitive"))

    def is_principal(self) -> bool:
        return bool(_native_field(self._native_data(), "principal"))

    is_trivial = is_principal

    def is_real(self) -> bool:
        return bool(_native_field(self._native_data(), "real"))

    def is_even(self) -> bool:
        return bool(_native_field(self._native_data(), "even"))

    def is_odd(self) -> bool:
        return not self.is_even()

    def conrey_number(self) -> Any:
        return runtime.normalize_integer(
            _native_field(self._native_data(), "conreyNumber")
        )

    def gauss_sum(self, a: Any = 1) -> Any:
        """Return the exact Gauss sum in Sage.js's algebraic closure."""
        additive_factor = runtime.integer_bigint(a) % self._parent._modulus
        return _qqbar_from_native(
            runtime.flint_backend().dirichletGaussSumExact(
                self._parent._native,
                self._index,
                runtime.integer_bigint(additive_factor),
            )
        )

    def gauss_sum_numerical(
        self,
        prec: int = 53,
        a: Any = 1,
    ) -> Any:
        """Return a FLINT/Arb approximation to the Gauss sum."""
        precision = _analytic_precision(prec)
        additive_factor = runtime.integer_bigint(a) % self._parent._modulus
        return _complex_from_native(
            runtime.flint_backend().dirichletGaussSum(
                self._parent._native,
                self._index,
                runtime.integer_bigint(additive_factor),
                precision,
            ),
            precision,
        )

    def jacobi_sum(
        self,
        char: DirichletCharacter,
        check: bool = True,
    ) -> Any:
        """Return the exact Jacobi sum in Sage.js's algebraic closure."""
        if not isinstance(char, DirichletCharacter) or char._parent is not self._parent:
            raise TypeError("characters must belong to the same Dirichlet group")
        if check and self.modulus() != char.modulus():
            raise ValueError("characters must have the same modulus")
        return _qqbar_from_native(
            runtime.flint_backend().dirichletJacobiSumExact(
                self._parent._native,
                self._index,
                char._index,
            )
        )

    def jacobi_sum_numerical(
        self,
        char: DirichletCharacter,
        prec: int = 53,
    ) -> Any:
        """Return a FLINT/Arb approximation to the Jacobi sum."""
        if not isinstance(char, DirichletCharacter) or char._parent is not self._parent:
            raise TypeError("characters must belong to the same Dirichlet group")
        precision = _analytic_precision(prec)
        return _complex_from_native(
            runtime.flint_backend().dirichletJacobiSum(
                self._parent._native,
                self._index,
                char._index,
                precision,
            ),
            precision,
        )

    def root_number(self, prec: int = 53) -> Any:
        """Return the root number of this primitive character."""
        if not self.is_primitive():
            raise ValueError("root number requires a primitive character")
        precision = _analytic_precision(prec)
        return _complex_from_native(
            runtime.flint_backend().dirichletRootNumber(
                self._parent._native,
                self._index,
                precision,
            ),
            precision,
        )

    def lfunction(
        self,
        prec: int = 53,
        algorithm: str = "flint",
    ) -> DirichletLFunction:
        """Return the FLINT/Arb analytic Dirichlet L-function."""
        if algorithm == "pari":
            raise NotImplementedError(
                "algorithm='pari' is unavailable; use algorithm='flint'"
            )
        if algorithm not in ("flint", "arb"):
            raise ValueError("algorithm must be 'flint', 'arb', or 'pari'")
        return DirichletLFunction(self, _analytic_precision(prec))

    def bernoulli(
        self,
        k: Any,
        algorithm: str = "recurrence",
        cache: bool = True,
        **opts: Any,
    ) -> Any:
        """Return the exact generalized Bernoulli number `B_(k,chi)`."""
        index = runtime.normalize_integer(k)
        if (
            runtime.jstype(index) != "number"
            or not runtime.number.isSafeInteger(index)
            or index < 0
        ):
            raise ValueError("Bernoulli index must be nonnegative")
        if algorithm not in ("recurrence", "definition", "flint"):
            raise ValueError("unsupported generalized Bernoulli algorithm")
        cached = self._bernoulli_cache.get(index)
        if cache and cached is not runtime.undefined:
            return cached
        result = _qqbar_from_native(
            runtime.flint_backend().dirichletBernoulli(
                self._parent._native,
                self._index,
                index,
            )
        )
        if cache:
            self._bernoulli_cache.set(index, result)
        return result

    def galois_orbit(self) -> list[DirichletCharacter]:
        result = []
        seen = runtime.map()
        exponent = runtime.bigint(0)
        while exponent < self._parent._value_order:
            if runtime.bigint_gcd(
                exponent, self._parent._value_order
            ) == runtime.bigint(1):
                character = self**exponent
                if not seen.has(character._index):
                    seen.set(character._index, True)
                    result.append(character)
            exponent += runtime.bigint(1)
        return _sort_dirichlet_characters(result)

    def _sort_key(self) -> list[float]:
        key = []
        two_pi = 2.0 * runtime.math.PI
        for generator in self._parent._unit_generators:
            value = self(generator)
            if value.is_zero():
                key.extend([-2.0, 0.0])
            else:
                angle = (
                    two_pi
                    * runtime.number(value._exponent)
                    / runtime.number(value._parent._order)
                )
                real = runtime.math.round(runtime.math.cos(angle) * 1.0e12) / 1.0e12
                imag = runtime.math.round(runtime.math.sin(angle) * 1.0e12) / 1.0e12
                key.extend([real, imag])
        return key

    def __repr__(self) -> str:
        text = (
            "Dirichlet character modulo "
            + str(self.modulus())
            + " of conductor "
            + str(self.conductor())
        )
        mappings = []
        for generator in self._parent._unit_generators:
            mappings.append(str(generator) + " |--> " + str(self(generator)))
        if len(mappings):
            text += " mapping " + ", ".join(mappings)
        return text

    __str__ = __repr__
    toString = __repr__


def _dirichlet_raise_nonfinite() -> None:
    raise ValueError("Dirichlet L-function point must be finite")


def _dirichlet_complex_argument(field: Any, value: Any) -> Any:
    """Coerce exact, numeric, or constant symbolic complex values."""

    try:
        return field(value)
    except Exception:
        evaluator_factory = getattr(value, "_plot_complex_callable", None)
        if evaluator_factory is None:
            raise
        evaluator = evaluator_factory([])
        evaluated = runtime.reflect.apply(evaluator, runtime.undefined, [])
        real_part = runtime.reflect.get(evaluated, "real")
        imaginary_part = runtime.reflect.get(evaluated, "imag")
        if (
            runtime.jstype(real_part) != "number"
            or runtime.jstype(imaginary_part) != "number"
            or not runtime.number.isFinite(real_part)
            or not runtime.number.isFinite(imaginary_part)
        ):
            _dirichlet_raise_nonfinite()
        return field(real_part, imaginary_part)


@runtime.callable_instance_class
class DirichletLFunction:
    """An arbitrary-precision Dirichlet L-function backed by FLINT/Arb."""

    def __init__(
        self,
        character: DirichletCharacter,
        precision: int = 53,
    ) -> None:
        self._character = character
        self._precision = _analytic_precision(precision)

    def _value(self, s: Any, derivative: Any) -> Any:
        derivative = runtime.normalize_integer(derivative)
        if (
            runtime.jstype(derivative) != "number"
            or not runtime.number.isSafeInteger(derivative)
            or derivative < 0
        ):
            raise ValueError("derivative order must be nonnegative")
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            self._precision
        )
        argument = _dirichlet_complex_argument(complex_field, s)
        return complex_field._fromNative(
            runtime.flint_backend().dirichletLValue(
                self._character._parent._native,
                self._character._index,
                argument._native,
                derivative,
                self._precision,
            )
        )

    def __call__(self, s: Any) -> Any:
        return self._value(s, 0)

    def derivative(self, s: Any, D: Any = 1) -> Any:
        return self._value(s, D)

    def values(
        self,
        points: Any,
        derivative: Any = 0,
        prec: Any = None,
    ) -> list[Any]:
        """Evaluate one derivative at a nonempty batch of complex points."""

        if not runtime.array.isArray(points) or len(points) == 0:
            raise ValueError("points must be a nonempty list")
        derivative = runtime.normalize_integer(derivative)
        if (
            runtime.jstype(derivative) != "number"
            or not runtime.number.isSafeInteger(derivative)
            or derivative < 0
        ):
            raise ValueError("derivative order must be nonnegative")
        precision = self._precision if prec is None else _analytic_precision(prec)
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            precision
        )
        native_points = []
        for point in points:
            if runtime.array.isArray(point) and len(point) == 2:
                coerced = complex_field(point[0], point[1])
            else:
                coerced = _dirichlet_complex_argument(complex_field, point)
            native_points.append(coerced._native)
        native_values = runtime.flint_backend().dirichletLValues(
            self._character._parent._native,
            self._character._index,
            native_points,
            derivative,
            precision,
        )
        return [complex_field._fromNative(value) for value in native_values]

    def character(self) -> DirichletCharacter:
        return self._character

    def precision(self) -> int:
        return self._precision

    prec = precision

    def root_number(self) -> Any:
        return self._character.root_number(self._precision)

    def __repr__(self) -> str:
        return "FLINT L-function associated to " + str(self._character)

    __str__ = __repr__
    toString = __repr__


def _float_key_less(left: list[float], right: list[float]) -> bool:
    index = 0
    while index < len(left) and index < len(right):
        if left[index] < right[index]:
            return True
        if left[index] > right[index]:
            return False
        index += 1
    return len(left) < len(right)


def _sort_dirichlet_characters(
    characters: list[DirichletCharacter],
) -> list[DirichletCharacter]:
    result = []
    for character in characters:
        key = character._sort_key()
        position = 0
        while position < len(result) and not _float_key_less(
            key, result[position]._sort_key()
        ):
            position += 1
        result.insert(position, character)
    return result


@runtime.callable_instance_class
class DirichletGroup_class(sage.Parent):
    """The group of Dirichlet characters modulo a positive integer."""

    def __init__(
        self,
        modulus: Any,
        value_field: Any = None,
        value_order: Any = None,
        value_generator: Any = None,
        describe_generator: bool = False,
    ) -> None:
        modulus = runtime.integer_bigint(modulus)
        if modulus <= 0:
            raise ValueError("Dirichlet modulus must be positive")
        self._native = runtime.flint_backend().dirichletGroup(modulus)
        data = runtime.flint_backend().dirichletGroupData(self._native)
        self._kind = "DirichletGroup"
        self._construction = {
            "kind": "DirichletGroup",
            "modulus": runtime.normalize_integer(modulus),
        }
        self._modulus = modulus
        self._size = runtime.integer_bigint(_native_field(data, "size"))
        self._native_exponent = runtime.integer_bigint(_native_field(data, "exponent"))
        self._orders = [
            runtime.normalize_integer(value) for value in _native_field(data, "orders")
        ]
        self._unit_generators = [
            runtime.normalize_integer(value)
            for value in _native_field(data, "generators")
        ]
        if value_order is None:
            value_order = self._native_exponent
        self._value_order = runtime.integer_bigint(value_order)
        if self._value_order % self._native_exponent != runtime.bigint(0):
            raise ValueError(
                "the value-field root order must be divisible "
                "by the Dirichlet group exponent"
            )
        if value_field is None:
            value_field = CyclotomicField(self._value_order)
        if value_generator is None:
            value_generator = value_field.gen()
        if not hasattr(value_field, "zero") or not hasattr(value_field, "one"):
            raise TypeError("a Dirichlet value field must provide zero and one")
        self._value_field = value_field
        self._value_generator = value_generator
        if describe_generator:
            self._name = (
                "Group of Dirichlet characters modulo "
                + str(modulus)
                + " with values in the group of order "
                + str(self._value_order)
                + " generated by "
                + str(value_generator)
                + " in "
                + str(value_field)
            )
        else:
            self._name = (
                "Group of Dirichlet characters modulo "
                + str(modulus)
                + " with values in "
                + str(value_field)
            )

    def _zero(self) -> Any:
        return self._value_field.zero()

    def _root(self, exponent: Any) -> Any:
        return self._value_generator**exponent

    def _from_logs(self, logs: list[Any]) -> DirichletCharacter:
        if len(logs) != len(self._orders):
            raise ValueError("wrong number of character components")
        index = runtime.bigint(0)
        multiplier = runtime.bigint(1)
        position = 0
        while position < len(logs):
            order = runtime.integer_bigint(self._orders[position])
            value = runtime.integer_bigint(logs[position])
            if value < 0 or value >= order:
                raise ValueError("Dirichlet character component out of range")
            index += multiplier * value
            multiplier *= order
            position += 1
        return DirichletCharacter(self, index)

    def __call__(self, value: Any = 1) -> DirichletCharacter:
        if isinstance(value, DirichletCharacter):
            if value._parent is self:
                return value
            raise TypeError("incompatible Dirichlet groups")
        if runtime.integer_bigint(value) == 1:
            return DirichletCharacter(self, 0)
        raise NotImplementedError(
            "constructing a character from a value vector is not yet implemented"
        )

    def __len__(self) -> int:
        return int(self._size)

    def __iter__(self) -> Iterator[DirichletCharacter]:
        index = runtime.bigint(0)
        while index < self._size:
            yield DirichletCharacter(self, index)
            index += runtime.bigint(1)

    def __getitem__(self, index: Any) -> DirichletCharacter:
        index = runtime.integer_bigint(index)
        if index < 0:
            index += self._size
        return DirichletCharacter(self, index)

    def list(self) -> list[DirichletCharacter]:
        return list(self)

    def order(self) -> Any:
        return runtime.normalize_integer(self._size)

    cardinality = order

    def modulus(self) -> Any:
        return runtime.normalize_integer(self._modulus)

    def unit_gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple(list(self._unit_generators))

    def gens(self) -> "tuple[Any, ...]":
        result = []
        multiplier = runtime.bigint(1)
        for order in self._orders:
            result.append(DirichletCharacter(self, multiplier))
            multiplier *= runtime.integer_bigint(order)
        return runtime.math_tuple(result)

    def gen(self, index: int = 0) -> DirichletCharacter:
        generators = self.gens()
        index = int(index)
        if index < 0 or index >= len(generators):
            raise IndexError("Dirichlet generator index out of range")
        return generators[index]

    def _first_ngens(
        self,
        count: int,
    ) -> list[DirichletCharacter]:
        count = int(count)
        generators = list(self.gens())
        if count > len(generators):
            raise ValueError("too many Dirichlet generators requested")
        return generators[:count]

    def zeta(self) -> Any:
        return self._value_generator

    def zeta_order(self) -> Any:
        return runtime.normalize_integer(self._value_order)

    def base_ring(self) -> Any:
        return self._value_field

    def galois_orbits(self) -> list[list[DirichletCharacter]]:
        characters = _sort_dirichlet_characters(self.list())
        seen = runtime.map()
        result = []
        for character in characters:
            if seen.has(character._index):
                continue
            orbit = character.galois_orbit()
            for conjugate in orbit:
                seen.set(conjugate._index, True)
            result.append(orbit)
        return result

    def decomposition(self) -> list[DirichletGroup_class]:
        result = []
        for prime, exponent in sage.factor(self.modulus()):
            prime_power = runtime.integer_bigint(prime) ** runtime.integer_bigint(
                exponent
            )
            result.append(
                DirichletGroup_class(
                    prime_power,
                    self._value_field,
                    self._value_order,
                )
            )
        return result


_dirichlet_groups = runtime.map()


def DirichletGroup(
    modulus: Any,
    base_ring: Any = None,
    zeta: Any = None,
) -> DirichletGroup_class:
    r"""
    Return the group of Dirichlet characters modulo `modulus`.

    Characters are exact, iterable, multiplicative, and valued in a
    cyclotomic field.  FLINT supplies the unit-group decomposition and native
    character arithmetic.

    ### Examples

    ```sage
    sage: G = DirichletGroup(20)
    sage: G.order(), G.modulus()
    (8, 20)
    sage: eps = G.gen(0)
    sage: eps(3) * eps(7) == eps(21)
    True
    ```

    A custom exact value field may be supplied, optionally together with a
    root of unity whose order is divisible by the exponent of the character
    group.
    """
    modulus = runtime.normalize_integer(runtime.integer_bigint(modulus))
    if base_ring is not None or zeta is not None:
        describe_generator = zeta is not None
        if base_ring is None:
            base_ring = runtime.coercion_model.parentOf(zeta)
        if zeta is None:
            zeta = base_ring.gen()
        if not hasattr(zeta, "multiplicative_order"):
            raise TypeError("the custom Dirichlet generator must have finite order")
        value_order = zeta.multiplicative_order()
        return DirichletGroup_class(
            modulus,
            base_ring,
            value_order,
            zeta,
            describe_generator,
        )
    group = _dirichlet_groups.get(modulus)
    if group is runtime.undefined:
        group = DirichletGroup_class(modulus)
        _dirichlet_groups.set(modulus, group)
    return group


runtime.set_class_repr(
    CyclotomicElement,
    "<class 'sage.rings.number_field.number_field_element."
    "NumberFieldElement_absolute'>",
)
runtime.set_class_repr(
    DirichletCharacter,
    "<class 'sage.modular.dirichlet.DirichletCharacter'>",
)

runtime.register_doc(
    "DirichletGroup",
    DirichletGroup,
    {
        "kind": "function",
        "module": "sage.modular.dirichlet",
        "tags": [
            "number theory",
            "Dirichlet characters",
            "finite abelian groups",
            "modular forms",
        ],
        "backends": ["FLINT", "Sage.js native helpers"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Standard groups, generators, evaluation, parity, conductors, "
                "Galois orbits, decomposition, and exact custom value fields "
                "with a supplied root of unity are supported."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath Dirichlet character API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "modfrm/sage/modular/dirichlet.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT Dirichlet characters",
                "url": "https://flintlib.org/doc/dirichlet.html",
            },
            {
                "kind": "sagejs-original",
                "source": ("Sage.js parent/element and exact cyclotomic integration"),
            },
        ],
        "references": [
            {
                "id": "flint-dirichlet",
                "type": "software",
                "title": "FLINT Dirichlet characters",
                "authors": ["The FLINT contributors"],
                "url": "https://flintlib.org/doc/dirichlet.html",
            },
        ],
        "implementation": {
            "algorithm": (
                "FLINT unit-group decomposition and character evaluation "
                "with Sage.js exact cyclotomic values"
            ),
        },
        "limitations": [
            (
                "Analytic sums currently return values in QQbar rather than "
                "coercing them back into a custom value field."
            ),
        ],
    },
)
