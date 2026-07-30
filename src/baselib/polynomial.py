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
        return self._new(
            runtime.flint_backend().polyAdd(self._native, other._native))

    def _sub_(self, other: PolynomialElement) -> PolynomialElement:
        return self._new(
            runtime.flint_backend().polySub(self._native, other._native))

    def _mul_(self, other: PolynomialElement) -> PolynomialElement:
        return self._new(
            runtime.flint_backend().polyMul(self._native, other._native))

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __neg__(self) -> PolynomialElement:
        return self._new(runtime.flint_backend().polyNeg(self._native))

    def __pow__(self, exponent: int) -> PolynomialElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError('negative polynomial exponent')
        return self._new(
            runtime.flint_backend().polyPow(self._native, exponent))

    def __floordiv__(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if not isinstance(operands.left, PolynomialElement):
            raise TypeError('polynomial division requires polynomials')
        return PolynomialElement(
            operands.parent,
            runtime.flint_backend().polyDivExact(
                operands.left._native, operands.right._native))

    def _eq_(self, other: PolynomialElement) -> bool:
        return runtime.flint_backend().polyEqual(
            self._native, other._native)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def gcd(self, other: object) -> PolynomialElement:
        operands = runtime.coercion_model.coercePair(self, other)
        if (not isinstance(operands.left, PolynomialElement)
                or operands.parent.base_ring()._kind != 'GF'):
            raise TypeError(
                'polynomial gcd is currently implemented over finite fields')
        return PolynomialElement(
            operands.parent,
            runtime.flint_backend().nmodPolyGcd(
                operands.left._native, operands.right._native))

    def is_irreducible(self) -> bool:
        if self._parent.base_ring()._kind == 'GF':
            return runtime.flint_backend().nmodPolyIsIrreducible(self._native)
        factors = _untyped(self.factor())
        return (
            len(factors) == 1
            and factors[0][1] == 1
            and factors[0][0] * factors.unit() == self
        )

    def factor(self) -> sage.Factorization:
        result = runtime.flint_backend().polyFactor(self._native)
        parent = self._parent

        def make_factor(pair: list[Any]) -> list[Any]:
            return [PolynomialElement(parent, pair[0]), pair[1]]

        factors = result.factors.map(make_factor)
        if parent.base_ring()._kind == 'GF':
            unit = parent.base_ring()(result.unit)
        elif parent.base_ring() is sage.ZZ:
            unit = parent.base_ring()(result.unitNumerator)
        else:
            unit = parent.base_ring()(
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
        if self._parent.base_ring()._kind != 'GF':
            raise TypeError(
                'polynomial roots are currently implemented over ' +
                'finite fields')
        field = self._parent.base_ring()

        def make_root(pair: list[Any]) -> Any:
            root = field(pair[0])
            return runtime.factor_pair(root, pair[1]) if multiplicities else root

        return runtime.flint_backend().nmodPolyRoots(self._native).map(make_root)

    def __repr__(self) -> str:
        raw = runtime.flint_backend().polyToString(
            self._native, self._parent.variable_name())
        raw = raw.replace(runtime.regexp(r'\s+', 'g'), '')
        raw = raw.replace(runtime.regexp(r'\+', 'g'), ' + ').replace(
            runtime.regexp(r'([^-])-+', 'g'), '$1 - ')
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

    def __init__(self, base: sage.Parent, variable: str) -> None:
        self._name = (
            'Univariate Polynomial Ring in ' + variable +
            ' over ' + str(base))
        self._base = base
        self._variable = variable
        self._construction = {
            'kind': 'polynomial',
            'base': base,
            'variable': variable,
        }

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def gen(self) -> PolynomialElement:
        backend = runtime.flint_backend()
        if self._base is sage.ZZ:
            native_value = backend.zzPolyGen()
        elif self._base is sage.QQ:
            native_value = backend.qqPolyGen()
        else:
            native_value = backend.nmodPolyGen(self._base._modulus)
        return PolynomialElement(self, native_value)

    def _first_ngens(self, count: int) -> list[PolynomialElement]:
        if count != 1:
            raise ValueError(
                'a univariate polynomial ring has exactly one generator')
        return [self.gen()]

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
        if (self._base._kind == 'GF'
                and isinstance(value, sage.FiniteFieldElement)
                and value._parent is self._base):
            return PolynomialElement(
                self,
                backend.nmodPolyConstant(
                    value._value, self._base._modulus))
        raise TypeError('unsupported polynomial coefficient parent')

    def _coercePolynomial(self, value: object) -> PolynomialElement:
        if not isinstance(value, PolynomialElement):
            raise TypeError('expected a polynomial')
        if value._parent is self:
            return value
        source = value._parent
        if (source._construction is runtime.undefined
                or source._construction.kind != 'polynomial'
                or source.variable_name() != self.variable_name()):
            raise TypeError('incompatible polynomial rings')
        if source.base_ring() is sage.ZZ and self._base is sage.QQ:
            return PolynomialElement(
                self, runtime.flint_backend().zzPolyToQQ(value._native))
        if source.base_ring() is sage.ZZ and self._base._kind == 'GF':
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


ρσ_polynomial_ring_cache = runtime.map()


def PolynomialRing(
    base: sage.Parent,
    variable: Any = None,
    names: Any = None,
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
        and base._kind != 'GF'
    ):
        raise TypeError(
            'the prototype currently supports polynomial rings over ' +
            'ZZ, QQ, and prime finite fields')
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
    parent = by_variable.get(variable)
    if parent is runtime.undefined:
        parent = PolynomialRingParent(base, variable)
        by_variable.set(variable, parent)
    return parent


# Stable compiler/runtime alias: library modules may legitimately bind a
# Python name called ``PolynomialRing`` (the Magma compatibility module does).
ρσ_polynomial_ring = PolynomialRing


runtime.set_class_repr(
    PolynomialElement, "<class 'PolynomialElement'>")
