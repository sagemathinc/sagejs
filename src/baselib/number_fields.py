# Small number fields needed by the Sage-compatible mathematical layer.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _algebraic_from_tree(field: AlgebraicFieldParent, tree: Any) -> Any:
    if runtime.is_exact_integer(tree):
        return field(tree)
    if runtime.jstype(tree) == 'number':
        if runtime.number.isSafeInteger(tree):
            return field(tree)
        raise TypeError(
            'inexact numbers do not canonically define algebraic numbers')
    if runtime.jstype(tree) == 'string':
        if tree == 'ImaginaryUnit':
            return field._from_native(
                runtime.flint_backend().qqbarI())
        raise TypeError(
            'symbolic variables are not algebraic numbers')
    if not runtime.array.isArray(tree) or len(tree) == 0:
        raise TypeError('unsupported symbolic algebraic expression')

    head = tree[0]
    if head == 'Rational' and len(tree) == 3:
        return field(runtime.rational_class(tree[1], tree[2]))
    if head == 'Negate' and len(tree) == 2:
        return -_algebraic_from_tree(field, tree[1])
    if head == 'Add' and len(tree) >= 2:
        result = field(0)
        for argument in tree[1:]:
            result = result + _algebraic_from_tree(field, argument)
        return result
    if head == 'Subtract' and len(tree) == 3:
        return (
            _algebraic_from_tree(field, tree[1])
            - _algebraic_from_tree(field, tree[2])
        )
    if head == 'Multiply' and len(tree) >= 2:
        result = field(1)
        for argument in tree[1:]:
            result = result * _algebraic_from_tree(field, argument)
        return result
    if head == 'Divide' and len(tree) == 3:
        return (
            _algebraic_from_tree(field, tree[1])
            / _algebraic_from_tree(field, tree[2])
        )
    if head == 'Sqrt' and len(tree) == 2:
        return _algebraic_from_tree(field, tree[1]).sqrt()
    if head == 'Power' and len(tree) == 3:
        exponent = tree[2]
        if (
            runtime.array.isArray(exponent)
            and len(exponent) == 3
            and exponent[0] == 'Rational'
        ):
            return (
                _algebraic_from_tree(field, tree[1])
                ** runtime.rational_class(
                    exponent[1], exponent[2])
            )
        if runtime.is_exact_integer(exponent):
            return (
                _algebraic_from_tree(field, tree[1])
                ** runtime.normalize_integer(exponent)
            )
    raise TypeError(
        'unsupported symbolic algebraic expression: ' + str(tree))


@runtime.lightweight_math_class
class AlgebraicNumberElement(sage.Element):
    """An exact real or complex algebraic number backed by FLINT qqbar."""

    _supports_exact_rational_powers = True

    def __init__(
        self,
        parent: AlgebraicFieldParent,
        native_value: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> AlgebraicNumberElement:
        if (
            self._parent._kind == 'AA'
            and not runtime.flint_backend().qqbarIsReal(native_value)
        ):
            return QQbar._from_native(native_value)
        return self._parent._from_native(native_value)

    def _add_(
        self, other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarAdd(
            self._native, other._native))

    def _sub_(
        self, other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarSub(
            self._native, other._native))

    def _mul_(
        self, other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarMul(
            self._native, other._native))

    def _truediv_(
        self, other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarDiv(
            self._native, other._native))

    def _eq_(self, other: AlgebraicNumberElement) -> bool:
        return runtime.flint_backend().qqbarEqual(
            self._native, other._native)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __neg__(self) -> AlgebraicNumberElement:
        return self._new(
            runtime.flint_backend().qqbarNeg(self._native))

    def __pow__(self, exponent: Any) -> AlgebraicNumberElement:
        if isinstance(exponent, sage.Rational):
            return self._new(
                runtime.flint_backend().qqbarPowRational(
                    self._native,
                    exponent._numerator,
                    exponent._denominator,
                )
            )
        return self._new(runtime.flint_backend().qqbarPow(
            self._native, runtime.integer_bigint(exponent)))

    def _compare(self, other: Any) -> int:
        operands = runtime.coercion_model.coercePair(self, other)
        if getattr(operands.parent, '_kind', None) == 'QQBAR':
            if (
                not runtime.flint_backend().qqbarIsReal(
                    operands.left._native)
                or not runtime.flint_backend().qqbarIsReal(
                    operands.right._native)
            ):
                raise TypeError(
                    'complex algebraic numbers are not ordered')
        return runtime.flint_backend().qqbarCompareReal(
            operands.left._native, operands.right._native)

    def __lt__(self, other: Any) -> bool:
        return self._compare(other) < 0

    def __le__(self, other: Any) -> bool:
        return self._compare(other) <= 0

    def __gt__(self, other: Any) -> bool:
        return self._compare(other) > 0

    def __ge__(self, other: Any) -> bool:
        return self._compare(other) >= 0

    def sqrt(self) -> AlgebraicNumberElement:
        return self._new(
            runtime.flint_backend().qqbarSqrt(self._native))

    def is_real(self) -> bool:
        return runtime.flint_backend().qqbarIsReal(self._native)

    def is_zero(self) -> bool:
        return self == 0

    def is_one(self) -> bool:
        return self == 1

    def real(self) -> AlgebraicNumberElement:
        return AA._from_native(
            runtime.flint_backend().qqbarReal(self._native))

    def imag(self) -> AlgebraicNumberElement:
        return AA._from_native(
            runtime.flint_backend().qqbarImag(self._native))

    def conjugate(self) -> AlgebraicNumberElement:
        return self._new(
            runtime.flint_backend().qqbarConjugate(self._native))

    conj = conjugate

    def abs(self) -> AlgebraicNumberElement:
        return AA._from_native(
            runtime.flint_backend().qqbarAbs(self._native))

    def __abs__(self) -> AlgebraicNumberElement:
        return self.abs()

    def degree(self) -> int:
        return runtime.flint_backend().qqbarDegree(self._native)

    def minpoly(self, variable: str = 'x') -> Any:
        polynomial_ring = runtime.reflect.get(
            runtime.global_object, 'PolynomialRing')
        ring = polynomial_ring(sage.ZZ, variable)
        coefficients = (
            runtime.flint_backend().qqbarMinpolyCoefficients(
                self._native)
        )
        generator = ring.gen()
        result = ring(0)
        for coefficient in reversed(coefficients):
            result = result * generator + ring(coefficient)
        return result

    minimal_polynomial = minpoly

    def n(
        self,
        prec: int = 53,
        digits: Any = runtime.undefined,
    ) -> Any:
        if digits is not runtime.undefined:
            prec = max(
                2,
                int(runtime.math.ceil(
                    runtime.number(digits) * 3.321928094887363
                )) + 1,
            )
        complex_field = runtime.reflect.get(
            runtime.global_object, 'ComplexField')
        approximation = complex_field(prec)._fromNative(
            runtime.flint_backend().qqbarApprox(
                self._native, prec))
        return approximation.real() if self.is_real() else approximation

    numerical_approx = n

    def __float__(self) -> float:
        if not self.is_real():
            raise TypeError(
                'cannot convert a complex algebraic number to float')
        return float(self.n())

    def __repr__(self) -> str:
        text = runtime.flint_backend().qqbarToString(
            self._native, 16)
        if runtime.flint_backend().qqbarIsRational(self._native):
            return text
        if '.' not in text:
            return text
        return text + '?'

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class AlgebraicFieldParent(sage.Parent):
    """The Sage algebraic real field or algebraic closure of QQ."""

    def __init__(self, real_only: bool) -> None:
        self._real_only = real_only
        if real_only:
            self._name = 'Algebraic Real Field'
            self._kind = 'AA'
        else:
            self._name = 'Algebraic Field'
            self._kind = 'QQBAR'
        self._construction = runtime.undefined

    def _from_native(self, native_value: Any) -> AlgebraicNumberElement:
        if (
            self._real_only
            and not runtime.flint_backend().qqbarIsReal(native_value)
        ):
            raise ValueError(
                'cannot coerce a non-real algebraic number to AA')
        return AlgebraicNumberElement(self, native_value)

    def __call__(self, value: Any = 0) -> AlgebraicNumberElement:
        if isinstance(value, AlgebraicNumberElement):
            if value._parent is self:
                return value
            return self._from_native(value._native)
        if isinstance(value, sage.Rational):
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(
                    value._numerator, value._denominator))
        if runtime.is_exact_integer(value):
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(
                    runtime.integer_bigint(value), runtime.bigint(1)))
        tree = runtime.reflect.get(value, '_tree')
        if tree is not runtime.undefined:
            result = _algebraic_from_tree(QQbar, tree)
            return self._from_native(result._native)
        raise TypeError(
            'unable to convert value to ' + str(self))

    def __contains__(self, value: object) -> bool:
        try:
            self(value)
            return True
        except Exception:
            return False


AA = AlgebraicFieldParent(True)
QQbar = AlgebraicFieldParent(False)

runtime.coercion_model.register(sage.ZZ, AA, AA)
runtime.coercion_model.register(sage.QQ, AA, AA)
runtime.coercion_model.register(sage.ZZ, QQbar, QQbar)
runtime.coercion_model.register(sage.QQ, QQbar, QQbar)
runtime.coercion_model.register(AA, QQbar, QQbar)


@runtime.lightweight_math_class
class GaussianInteger(sage.Element):
    """An element ``a + b*i`` of the Gaussian integers."""

    def __init__(
        self,
        parent: QuadraticField_class,
        real: Any,
        imag: Any,
    ) -> None:
        self._parent = parent
        self._real = runtime.normalize_integer(
            runtime.integer_bigint(real))
        self._imag = runtime.normalize_integer(
            runtime.integer_bigint(imag))
        runtime.object.freeze(self)

    def __getitem__(self, index: int) -> Any:
        if index == 0:
            return self._real
        if index == 1:
            return self._imag
        raise IndexError('Gaussian integer index out of range')

    def __neg__(self) -> GaussianInteger:
        return GaussianInteger(
            self._parent, -self._real, -self._imag)

    def _mul_(self, other: GaussianInteger) -> GaussianInteger:
        return GaussianInteger(
            self._parent,
            self._real * other._real - self._imag * other._imag,
            self._real * other._imag + self._imag * other._real,
        )

    def _eq_(self, other: GaussianInteger) -> bool:
        return (
            self._real == other._real
            and self._imag == other._imag
        )

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp(
            'mul', self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __repr__(self) -> str:
        if self._imag == 0:
            return str(self._real)
        if self._real == 0:
            return str(self._imag) + '*i'
        sign = '+' if self._imag > 0 else '-'
        return (
            str(self._real) + ' ' + sign + ' ' +
            str(abs(self._imag)) + '*i'
        )

    __str__ = __repr__
    toString = __repr__


class GaussianPrimeIdeal:
    """The principal prime ideal represented by one Gaussian prime."""

    def __init__(self, generator: GaussianInteger) -> None:
        self._generator = generator

    def gens_reduced(self) -> tuple[GaussianInteger]:
        return runtime.math_tuple([self._generator])


@runtime.callable_instance_class
class QuadraticField_class(sage.Parent):
    """The Gaussian quadratic field used by the RH plotting corpus."""

    def __init__(self, discriminant: Any) -> None:
        if discriminant != -1:
            raise NotImplementedError(
                'only QuadraticField(-1) is implemented')
        self._name = 'Number Field in i with defining polynomial x^2 + 1'
        self._kind = 'QuadraticField'
        self._discriminant = -1
        self._generator = GaussianInteger(self, 0, 1)

    def __call__(
        self,
        real: Any = 0,
        imag: Any = 0,
    ) -> GaussianInteger:
        if isinstance(real, GaussianInteger):
            return real
        return GaussianInteger(self, real, imag)

    def gen(self) -> GaussianInteger:
        return self._generator

    def _first_ngens(self, count: int) -> list[GaussianInteger]:
        if count != 1:
            raise ValueError(
                'this quadratic field has exactly one generator')
        return [self.gen()]

    def primes_of_bounded_norm(
        self, bound: Any,
    ) -> list[GaussianPrimeIdeal]:
        limit = runtime.integer_bigint(bound)
        if limit <= 1:
            return []
        coordinate_bound = int(runtime.math.sqrt(runtime.number(limit)))
        generators = []

        # Inert rational primes p == 3 (mod 4) remain Gaussian primes and
        # have ideal norm p^2.
        candidate = runtime.bigint(3)
        while candidate * candidate <= limit:
            if (
                candidate % 4 == 3
                and runtime.flint_backend().isPrime(candidate)
            ):
                generators.append(
                    GaussianInteger(self, candidate, 0))
            candidate += 2

        # Split and ramified primes are represented by every first-quadrant
        # solution a^2+b^2=p.  Ordered pairs give the two conjugate ideals.
        for real in range(1, coordinate_bound + 1):
            for imag in range(1, coordinate_bound + 1):
                norm = real * real + imag * imag
                if norm > limit:
                    break
                if runtime.flint_backend().isPrime(
                    runtime.bigint(norm)
                ):
                    generators.append(
                        GaussianInteger(self, real, imag))
        return [
            GaussianPrimeIdeal(generator)
            for generator in generators
        ]


def QuadraticField(
    discriminant: Any,
    names: Any = None,
) -> QuadraticField_class:
    return QuadraticField_class(discriminant)


runtime.set_class_repr(
    AlgebraicNumberElement,
    "<class 'sage.rings.qqbar.AlgebraicNumber'>",
)
runtime.set_class_repr(
    GaussianInteger,
    "<class 'sage.rings.number_field.number_field_element."
    "NumberFieldElement_gaussian'>",
)
