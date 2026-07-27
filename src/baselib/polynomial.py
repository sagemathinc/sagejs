# Univariate polynomial parents and elements backed by FLINT.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only
#
# globals: Array, BigInt, Map, Object, RegExp
# globals: Element, Parent, Factorization, FiniteFieldElement, Rational
# globals: QQ, ZZ

import sagejs.runtime as runtime


def ρσ_callable_instance_class(cls):
    # Identity fallback for bootstrap compilers which predate callable-instance
    # lowering. The converged compiler consumes this decorator.
    return cls


@ρσ_lightweight_math_class
class PolynomialElement(Element):

    def __init__(self, parent, native_value):
        self._parent = parent
        self._native = native_value
        Object.freeze(self)

    def _new(self, native_value):
        return PolynomialElement(self._parent, native_value)

    def _add_(self, other):
        return self._new(
            runtime.flint_backend().polyAdd(self._native, other._native))

    def _sub_(self, other):
        return self._new(
            runtime.flint_backend().polySub(self._native, other._native))

    def _mul_(self, other):
        return self._new(
            runtime.flint_backend().polyMul(self._native, other._native))

    def __add__(self, other):
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other):
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other):
        return runtime.coercion_model.binOp('mul', self, other)

    def __neg__(self):
        return self._new(runtime.flint_backend().polyNeg(self._native))

    def __pow__(self, exponent):
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            raise ValueError('negative polynomial exponent')
        return self._new(
            runtime.flint_backend().polyPow(self._native, exponent))

    def _eq_(self, other):
        return runtime.flint_backend().polyEqual(
            self._native, other._native)

    def __eq__(self, other):
        return runtime.coercion_model.equals(self, other)

    def gcd(self, other):
        operands = runtime.coercion_model.coercePair(self, other)
        if (not isinstance(operands.left, PolynomialElement)
                or operands.parent.base_ring()._kind is not 'GF'):
            raise TypeError(
                'polynomial gcd is currently implemented over finite fields')
        return PolynomialElement(
            operands.parent,
            runtime.flint_backend().nmodPolyGcd(
                operands.left._native, operands.right._native))

    def is_irreducible(self):
        if self._parent.base_ring()._kind is not 'GF':
            raise TypeError(
                'irreducibility testing is currently implemented ' +
                'over finite fields')
        return runtime.flint_backend().nmodPolyIsIrreducible(self._native)

    def factor(self):
        if self._parent.base_ring()._kind is not 'GF':
            raise TypeError(
                'polynomial factorization is currently implemented ' +
                'over finite fields')
        result = runtime.flint_backend().nmodPolyFactor(self._native)
        parent = self._parent

        def make_factor(pair):
            return [PolynomialElement(parent, pair[0]), pair[1]]

        factors = result.factors.map(make_factor)
        return Factorization(
            factors, parent.base_ring()(result.unit), False, True, False)

    def roots(self, multiplicities=True):
        if self._parent.base_ring()._kind is not 'GF':
            raise TypeError(
                'polynomial roots are currently implemented over ' +
                'finite fields')
        field = self._parent.base_ring()

        def make_root(pair):
            root = field(pair[0])
            return runtime.factor_pair(root, pair[1]) if multiplicities else root

        return runtime.flint_backend().nmodPolyRoots(self._native).map(make_root)

    def __repr__(self):
        raw = runtime.flint_backend().polyToString(
            self._native, self._parent.variable_name())
        return raw.replace(RegExp(r'\+', 'g'), ' + ').replace(
            RegExp(r'([^-])-+', 'g'), '$1 - ')

    __str__ = __repr__
    toString = __repr__

    def _factorization_repr(self):
        value = self.__repr__()
        return ('(' + value + ')'
                if value.includes(' + ') or value.includes(' - ')
                else value)


@ρσ_callable_instance_class
class PolynomialRingParent(Parent):

    def __init__(self, base, variable):
        self._name = (
            'Univariate Polynomial Ring in ' + variable + ' over ' + base)
        self._base = base
        self._variable = variable
        self._construction = {
            'kind': 'polynomial',
            'base': base,
            'variable': variable,
        }

    def base_ring(self):
        return self._base

    def variable_name(self):
        return self._variable

    def gen(self):
        backend = runtime.flint_backend()
        if self._base is ZZ:
            native_value = backend.zzPolyGen()
        elif self._base is QQ:
            native_value = backend.qqPolyGen()
        else:
            native_value = backend.nmodPolyGen(self._base._modulus)
        return PolynomialElement(self, native_value)

    def _first_ngens(self, count):
        if count is not 1:
            raise ValueError(
                'a univariate polynomial ring has exactly one generator')
        return [self.gen()]

    def _constant(self, value):
        backend = runtime.flint_backend()
        if self._base is ZZ:
            return PolynomialElement(
                self, backend.zzPolyConstant(runtime.integer_bigint(value)))
        if self._base is QQ and isinstance(value, Rational):
            return PolynomialElement(
                self,
                backend.qqPolyConstant(
                    value._numerator, value._denominator))
        if (self._base._kind is 'GF'
                and isinstance(value, FiniteFieldElement)
                and value._parent is self._base):
            return PolynomialElement(
                self,
                backend.nmodPolyConstant(
                    value._value, self._base._modulus))
        raise TypeError('unsupported polynomial coefficient parent')

    def _coercePolynomial(self, value):
        if not isinstance(value, PolynomialElement):
            raise TypeError('expected a polynomial')
        if value._parent is self:
            return value
        source = value._parent
        if (source._construction is undefined
                or source._construction.kind is not 'polynomial'
                or source.variable_name() is not self.variable_name()):
            raise TypeError('incompatible polynomial rings')
        if source.base_ring() is ZZ and self._base is QQ:
            return PolynomialElement(
                self, runtime.flint_backend().zzPolyToQQ(value._native))
        if source.base_ring() is ZZ and self._base._kind is 'GF':
            return PolynomialElement(
                self,
                runtime.flint_backend().zzPolyToNmod(
                    value._native, self._base._modulus))
        raise TypeError(
            'unsupported polynomial coefficient coercion from ' +
            source.base_ring() + ' to ' + self._base)

    def __call__(self, value):
        if isinstance(value, PolynomialElement):
            return self._coercePolynomial(value)
        plan = runtime.coercion_model.resolveParents(
            runtime.coercion_model.parentOf(value), self._base)
        if plan.parent is not self._base:
            raise TypeError('coefficient does not canonically coerce')
        return self._constant(plan.leftMap(value))


ρσ_polynomial_ring_cache = Map()


def PolynomialRing(base, variable=None, names=None):
    if (variable is not None and jstype(variable) is 'object'
            and variable[runtime.kwargs_symbol]):
        names = variable.names
        variable = None
    if names is not None:
        variable = names
    if Array.isArray(variable):
        if variable.length is not 1:
            raise TypeError(
                'multivariate polynomial rings are not implemented yet')
        variable = variable[0]
    if base is not ZZ and base is not QQ and base._kind is not 'GF':
        raise TypeError(
            'the prototype currently supports polynomial rings over ' +
            'ZZ, QQ, and prime finite fields')
    if (jstype(variable) is not 'string'
            or not RegExp(r'^[A-Za-z_][A-Za-z0-9_]*$').test(variable)):
        raise TypeError(
            'the polynomial variable must be a valid identifier')

    by_variable = ρσ_polynomial_ring_cache.get(base)
    if by_variable is undefined:
        by_variable = Map()
        ρσ_polynomial_ring_cache.set(base, by_variable)
    parent = by_variable.get(variable)
    if parent is undefined:
        parent = PolynomialRingParent(base, variable)
        by_variable.set(variable, parent)
    return parent


runtime.set_class_repr(
    PolynomialElement, "<class 'PolynomialElement'>")
