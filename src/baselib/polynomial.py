# Univariate polynomial parents and elements backed by FLINT.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


def ρσ_callable_instance_class(cls: type[Any]) -> type[Any]:
    # Identity fallback for bootstrap compilers which predate callable-instance
    # lowering. The converged compiler consumes this decorator.
    return cls


@runtime.callable_instance_class
@runtime.lightweight_math_class
class PolynomialElement(sage.Element):

    def __init__(
        self, parent: PolynomialRingParent, native_value: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> PolynomialElement:
        return PolynomialElement(self._parent, native_value)

    def _add_(self, other: PolynomialElement) -> PolynomialElement:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return self._new(
                runtime.flint_backend().fqPolyAdd(
                    self._native, other._native))
        return self._new(
            runtime.flint_backend().polyAdd(self._native, other._native))

    def _sub_(self, other: PolynomialElement) -> PolynomialElement:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return self._new(
                runtime.flint_backend().fqPolySub(
                    self._native, other._native))
        return self._new(
            runtime.flint_backend().polySub(self._native, other._native))

    def _mul_(self, other: PolynomialElement) -> PolynomialElement:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return self._new(
                runtime.flint_backend().fqPolyMul(
                    self._native, other._native))
        return self._new(
            runtime.flint_backend().polyMul(self._native, other._native))

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def _truediv_(
        self, other: PolynomialElement,
    ) -> RationalFunctionElement:
        return self._parent.fraction_field()(self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __neg__(self) -> PolynomialElement:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return self._new(
                runtime.flint_backend().fqPolyNeg(self._native))
        return self._new(runtime.flint_backend().polyNeg(self._native))

    def __pow__(self, exponent: int) -> PolynomialElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError('negative polynomial exponent')
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return self._new(
                runtime.flint_backend().fqPolyPow(
                    self._native, exponent))
        return self._new(
            runtime.flint_backend().polyPow(self._native, exponent))

    def __floordiv__(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(operands.left, PolynomialElement):
            raise TypeError('polynomial division requires polynomials')
        if operands.parent.base_ring()._kind == 'GF_EXTENSION':
            native_value = runtime.flint_backend().fqPolyDivExact(
                operands.left._native, operands.right._native)
        else:
            native_value = runtime.flint_backend().polyDivExact(
                operands.left._native, operands.right._native)
        return PolynomialElement(operands.parent, native_value)

    def _eq_(self, other: PolynomialElement) -> bool:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return runtime.flint_backend().fqPolyEqual(
                self._native, other._native)
        return runtime.flint_backend().polyEqual(
            self._native, other._native)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def gcd(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if (
            not isinstance(operands.left, PolynomialElement)
            or operands.parent.base_ring()._kind
                not in ['GF', 'GF_EXTENSION']
        ):
            raise TypeError(
                'polynomial gcd is currently implemented over finite fields')
        if operands.parent.base_ring()._kind == 'GF_EXTENSION':
            native_value = runtime.flint_backend().fqPolyGcd(
                operands.left._native, operands.right._native)
        else:
            native_value = runtime.flint_backend().nmodPolyGcd(
                operands.left._native, operands.right._native)
        return PolynomialElement(
            operands.parent, native_value)

    def is_irreducible(self) -> bool:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            return runtime.flint_backend().fqPolyIsIrreducible(
                self._native)
        if self._parent.base_ring()._kind == 'GF':
            return runtime.flint_backend().nmodPolyIsIrreducible(self._native)
        factors = _untyped(self.factor())
        return (
            len(factors) == 1
            and factors[0][1] == 1
            and factors[0][0] * factors.unit() == self
        )

    def factor(self) -> sage.Factorization:
        if self._parent.base_ring()._kind == 'ZMOD':
            raise NotImplementedError(
                'polynomial factorization over Zmod is not implemented')
        parent = self._parent
        base = parent.base_ring()
        if base._kind == 'GF_EXTENSION':
            result = runtime.flint_backend().fqPolyFactor(self._native)
        else:
            result = runtime.flint_backend().polyFactor(self._native)

        def make_factor(pair: list[Any]) -> list[Any]:
            return [PolynomialElement(parent, pair[0]), pair[1]]

        factors = result.factors.map(make_factor)
        if base._kind == 'GF_EXTENSION':
            unit = base._from_native(result.unit)
        elif base._kind == 'GF':
            unit = base(result.unit)
        elif base is sage.ZZ:
            unit = base(result.unitNumerator)
        else:
            unit = base(
                result.unitNumerator, result.unitDenominator)
        return sage.Factorization(
            factors, unit, False, True, False)

    def divisors(self) -> list[PolynomialElement]:
        answer = [self._parent(1)]
        factors = _untyped(self.factor())
        for factor_value, exponent in factors:
            previous = answer
            answer = []
            power = self._parent(1)
            for _ in range(exponent + 1):
                for divisor in previous:
                    answer.append(divisor * power)
                power = power * factor_value
        return answer

    def roots(self, multiplicities: bool = True) -> list[Any]:
        if (
            self._parent.base_ring()._kind
            not in ['GF', 'GF_EXTENSION']
        ):
            raise TypeError(
                'polynomial roots are currently implemented over ' +
                'finite fields')
        field = self._parent.base_ring()
        if field._kind == 'GF_EXTENSION':
            raw_roots = runtime.flint_backend().fqPolyRoots(self._native)
        else:
            raw_roots = runtime.flint_backend().nmodPolyRoots(self._native)

        def make_root(pair: list[Any]) -> Any:
            if field._kind == 'GF_EXTENSION':
                root = field._from_native(pair[0])
            else:
                root = field(pair[0])
            return runtime.factor_pair(root, pair[1]) if multiplicities else root

        return raw_roots.map(make_root)

    def coefficients(self) -> list[Any]:
        base = self._parent.base_ring()
        if base._kind == 'GF_EXTENSION':
            raw = runtime.flint_backend().fqPolyCoefficients(self._native)
        else:
            raw = runtime.flint_backend().polyCoefficients(self._native)
        answer = []
        for coefficient in raw:
            if base is sage.ZZ:
                answer.append(runtime.normalize_integer(coefficient))
            elif base is sage.QQ:
                answer.append(base(
                    runtime.reflect.get(coefficient, 'numerator'),
                    runtime.reflect.get(coefficient, 'denominator'),
                ))
            elif base._kind == 'GF_EXTENSION':
                answer.append(base._from_native(coefficient))
            else:
                answer.append(base(coefficient))
        return answer

    def __call__(self, value: Any) -> Any:
        coefficients = self.coefficients()
        if (
            hasattr(value, 'nrows')
            and hasattr(value, 'ncols')
            and value.is_square()
        ):
            answer = value.parent().zero()
            identity = value.parent().one()
            for coefficient in reversed(coefficients):
                answer = answer * value + coefficient * identity
            return answer
        answer = self._parent.base_ring()(0)
        for coefficient in reversed(coefficients):
            answer = answer * value + coefficient
        return answer

    def __repr__(self) -> str:
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            raw = runtime.flint_backend().fqPolyToString(
                self._native, self._parent.variable_name())
        else:
            raw = runtime.flint_backend().polyToString(
                self._native, self._parent.variable_name())
        raw = raw.replace(runtime.regexp(r'\s+', 'g'), '')
        raw = raw.replace(runtime.regexp(r'\+', 'g'), ' + ').replace(
            runtime.regexp(r'([^-])-+', 'g'), '$1 - ')
        if self._parent.base_ring()._kind == 'GF_EXTENSION':
            raw = raw.replace(
                runtime.regexp(r'\+ \(([^()]*)\)$'),
                '+ $1',
            )
        return raw.replace(
            runtime.regexp(r'(^|[+-] )1\*', 'g'), '$1')

    __str__ = __repr__
    toString = __repr__

    def _factorization_repr(self) -> str:
        value = self.__repr__()
        return ('(' + value + ')'
                if ' + ' in value or ' - ' in value
                else value)


@runtime.callable_instance_class
class PolynomialRingParent(sage.Parent):

    def __init__(
        self,
        base: sage.Parent,
        variable: str,
        sparse: bool = False,
    ) -> None:
        self._name = (
            ('Sparse ' if sparse else '') +
            'Univariate Polynomial Ring in ' + variable +
            ' over ' + str(base))
        self._base = base
        self._variable = variable
        self._sparse = sparse
        self._construction = {
            'kind': 'polynomial',
            'base': base,
            'variable': variable,
            'sparse': sparse,
        }
        self._fraction_field = runtime.undefined

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def _from_native(self, native_value: Any) -> PolynomialElement:
        return PolynomialElement(self, native_value)

    def gen(self) -> PolynomialElement:
        backend = runtime.flint_backend()
        if self._base is sage.ZZ:
            native_value = backend.zzPolyGen()
        elif self._base is sage.QQ:
            native_value = backend.qqPolyGen()
        elif self._base._kind == 'ZMOD':
            native_value = backend.zmodPolyGen(
                self._base._modulus)
        elif self._base._kind == 'GF_EXTENSION':
            native_value = backend.fqPolyGen(
                runtime.reflect.get(self._base, '_nativeContext'))
        else:
            native_value = backend.nmodPolyGen(self._base._modulus)
        return PolynomialElement(self, native_value)

    def objgen(self) -> tuple[Any, PolynomialElement]:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> tuple[Any, Any]:
        return runtime.math_tuple([
            self,
            runtime.math_tuple([self.gen()]),
        ])

    def gens(self) -> Any:
        return runtime.math_tuple([self.gen()])

    def fraction_field(self) -> RationalFunctionFieldParent:
        if self._fraction_field is runtime.undefined:
            self._fraction_field = RationalFunctionFieldParent(self)
        return self._fraction_field

    def _first_ngens(self, count: int) -> list[PolynomialElement]:
        if count != 1:
            raise ValueError(
                'a univariate polynomial ring has exactly one generator')
        return [self.gen()]

    def __contains__(self, value: object) -> bool:
        return (
            isinstance(value, PolynomialElement)
            and value._parent is self
        )

    def cyclotomic_polynomial(self, degree: Any) -> PolynomialElement:
        if not runtime.is_exact_integer(degree):
            raise TypeError('cyclotomic polynomial degree must be an integer')
        n = int(degree)
        if n < 1:
            raise ValueError('cyclotomic polynomial degree must be positive')
        generator = self.gen()
        answer = generator ** n - 1
        for divisor in sage.divisors(n):
            if divisor < n:
                answer = answer // self.cyclotomic_polynomial(divisor)
        return answer

    def _constant(self, value: Any) -> PolynomialElement:
        backend = runtime.flint_backend()
        if self._base is sage.ZZ:
            return PolynomialElement(
                self, backend.zzPolyConstant(runtime.integer_bigint(value)))
        if self._base is sage.QQ and isinstance(value, sage.Rational):
            return PolynomialElement(
                self,
                backend.qqPolyConstant(
                    value._numerator, value._denominator))
        if (self._base._kind in ['GF', 'ZMOD']
                and isinstance(value, sage.FiniteFieldElement)
                and value._parent is self._base):
            if self._base._kind == 'ZMOD':
                return PolynomialElement(
                    self,
                    backend.zmodPolyConstant(
                        value._value, self._base._modulus))
            return PolynomialElement(
                self,
                backend.nmodPolyConstant(
                    value._value, self._base._modulus))
        if (
            self._base._kind == 'GF_EXTENSION'
            and isinstance(value, sage.Element)
            and runtime.reflect.get(value, '_parent') is self._base
            and runtime.reflect.has(value, '_native')
        ):
            return PolynomialElement(
                self,
                backend.fqPolyConstant(
                    runtime.reflect.get(self._base, '_nativeContext'),
                    runtime.reflect.get(value, '_native'),
                ))
        raise TypeError('unsupported polynomial coefficient parent')

    def _coercePolynomial(self, value: object) -> PolynomialElement:
        if not isinstance(value, PolynomialElement):
            raise TypeError('expected a polynomial')
        if value._parent is self:
            return value
        source = value._parent
        if (
            source._construction is runtime.undefined
            or source._construction.kind != 'polynomial'
        ):
            raise TypeError('incompatible polynomial rings')
        if source.base_ring() is self._base:
            result = self(0)
            generator = self.gen()
            for coefficient in reversed(value.coefficients()):
                result = result._mul_(generator)._add_(
                    self(coefficient))
            return result
        if source.variable_name() != self.variable_name():
            raise TypeError('incompatible polynomial rings')
        if source.base_ring() is sage.ZZ and self._base is sage.QQ:
            return PolynomialElement(
                self, runtime.flint_backend().zzPolyToQQ(value._native))
        if (
            source.base_ring() is sage.ZZ
            and self._base._kind in ['GF', 'GF_EXTENSION', 'ZMOD']
        ):
            if self._base._kind == 'GF_EXTENSION':
                result = self(0)
                generator = self.gen()
                coefficients = value.coefficients()
                index = len(coefficients) - 1
                while index >= 0:
                    result = result._mul_(generator)._add_(
                        self(self._base(coefficients[index])))
                    index -= 1
                return result
            if self._base._kind == 'ZMOD':
                return PolynomialElement(
                    self,
                    runtime.flint_backend().zzPolyToZmod(
                        value._native, self._base._modulus))
            return PolynomialElement(
                self,
                runtime.flint_backend().zzPolyToNmod(
                    value._native, self._base._modulus))
        raise TypeError(
            'unsupported polynomial coefficient coercion from ' +
            str(source.base_ring()) + ' to ' + str(self._base))

    def __call__(self, value: Any = 0) -> PolynomialElement:
        if isinstance(value, PolynomialElement):
            return self._coercePolynomial(value)
        plan = runtime.coercion_model.resolveParents(
            runtime.coercion_model.parentOf(value), self._base)
        if plan.parent is not self._base:
            raise TypeError('coefficient does not canonically coerce')
        return self._constant(plan.leftMap(value))


@runtime.callable_instance_class
class RationalFunctionFieldParent(sage.Parent):

    def __init__(self, polynomial_ring: PolynomialRingParent) -> None:
        self._polynomial_ring = polynomial_ring
        self._name = 'Fraction Field of ' + str(polynomial_ring)
        self._construction = {
            'kind': 'fraction_field',
            'base': polynomial_ring,
        }

    def __call__(
        self,
        numerator: Any = 0,
        denominator: Any = 1,
    ) -> RationalFunctionElement:
        if (
            isinstance(numerator, RationalFunctionElement)
            and numerator._parent is self
            and denominator == 1
        ):
            return numerator
        ring = self._polynomial_ring
        return RationalFunctionElement(
            self, ring(numerator), ring(denominator))

    def gen(self) -> RationalFunctionElement:
        return self(self._polynomial_ring.gen())


@runtime.lightweight_math_class
class RationalFunctionElement(sage.Element):

    def __init__(
        self,
        parent: RationalFunctionFieldParent,
        numerator: PolynomialElement,
        denominator: PolynomialElement,
    ) -> None:
        if denominator == 0:
            raise ZeroDivisionError('rational function denominator is zero')
        self._parent = parent
        self._numerator = numerator
        self._denominator = denominator
        runtime.object.freeze(self)

    def _add_(
        self, right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator
            + right._numerator * self._denominator,
            self._denominator * right._denominator,
        )

    def _sub_(
        self, right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator
            - right._numerator * self._denominator,
            self._denominator * right._denominator,
        )

    def _mul_(
        self, right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._numerator,
            self._denominator * right._denominator,
        )

    def _truediv_(
        self, right: RationalFunctionElement,
    ) -> RationalFunctionElement:
        return self._parent(
            self._numerator * right._denominator,
            self._denominator * right._numerator,
        )

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __neg__(self) -> RationalFunctionElement:
        return self._parent(-self._numerator, self._denominator)

    def __eq__(self, other: object) -> bool:
        try:
            right = self._parent(other)
        except Exception:
            return False
        return (
            self._numerator * right._denominator
            == right._numerator * self._denominator
        )

    def numerator(self) -> PolynomialElement:
        return self._numerator

    def denominator(self) -> PolynomialElement:
        return self._denominator

    def __repr__(self) -> str:
        return (
            self._numerator._factorization_repr()
            + '/'
            + self._denominator._factorization_repr()
        )

    __str__ = __repr__
    toString = __repr__


ρσ_polynomial_ring_cache = runtime.map()


def PolynomialRing(
    base: sage.Parent,
    variable: Any = None,
    names: Any = None,
    sparse: bool = False,
    implementation: Any = None,
) -> PolynomialRingParent:
    if (variable is not None and runtime.jstype(variable) == 'object'
            and variable[runtime.kwargs_symbol]):
        names = variable.names
        variable = None
    if names is not None:
        variable = names
    if isinstance(variable, list):
        if len(variable) != 1:
            raise TypeError(
                'multivariate polynomial rings are not implemented yet')
        variable = variable[0]
    if (
        base is not sage.ZZ
        and base is not sage.QQ
        and base._kind not in ['GF', 'GF_EXTENSION', 'ZMOD']
    ):
        raise TypeError(
            'the prototype currently supports polynomial rings over ' +
            'ZZ, QQ, finite fields, and Zmod')
    if (
        not isinstance(variable, str)
        or not runtime.regexp(
            r'^[A-Za-z_][A-Za-z0-9_]*$'
        ).test(variable)
    ):
        raise TypeError(
            'the polynomial variable must be a valid identifier')

    by_variable = ρσ_polynomial_ring_cache.get(base)
    if by_variable is runtime.undefined:
        by_variable = runtime.map()
        ρσ_polynomial_ring_cache.set(base, by_variable)
    cache_key = variable + ('|sparse' if sparse else '|dense')
    parent = by_variable.get(cache_key)
    if parent is runtime.undefined:
        parent = PolynomialRingParent(base, variable, sparse)
        by_variable.set(cache_key, parent)
    return parent


def objgen(parent: Any) -> Any:
    return parent.objgen()


def objgens(parent: Any) -> Any:
    return parent.objgens()


def gen(parent: Any, index: int = 0) -> Any:
    if index == 0:
        return parent.gen()
    return parent.gen(index)


def polygen(base: sage.Parent, name: str = 'x') -> Any:
    return PolynomialRing(base, name).gen()


def chebyshev_U(degree: Any, value: Any) -> Any:
    degree = int(degree)
    if degree < 0:
        raise ValueError('Chebyshev degree must be nonnegative')
    if degree == 0:
        return 1
    previous = 1
    current = 2 * value
    for _index in range(1, degree):
        next_value = 2 * value * current - previous
        previous = current
        current = next_value
    return current


# Stable compiler/runtime alias: library modules may legitimately bind a
# Python name called ``PolynomialRing`` (the Magma compatibility module does).
ρσ_polynomial_ring = PolynomialRing


runtime.set_class_repr(
    PolynomialElement, "<class 'PolynomialElement'>")
runtime.set_class_repr(
    RationalFunctionElement,
    "<class 'sage.rings.fraction_field_element.FractionFieldElement'>",
)
