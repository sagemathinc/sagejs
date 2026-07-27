# Sage-compatible finite-field parents and elements.
#
# The callable-parent adapter and native FLINT handles live in the low-level
# algebra runtime.  Mathematical behavior belongs here, in ordinary Sage.js
# source, so it remains readable and can eventually track upstream Sage code.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only
#
# globals: AlgebraicExtensionFunctor, BigInt, Element, Object, Parent, QQ
# globals: QuotientFunctor, Rational, Reflect, RegExp, ZZ
# globals: PolynomialRing, ZeroDivisionError, IndexError, ValueError

import sagejs.runtime as runtime


def ρσ_lightweight_math_class(cls):
    # The bootstrap compiler sees this as an ordinary identity decorator.  The
    # converged compiler recognizes it at compile time and omits its generic
    # per-instance identity slot.
    return cls


def ρσ_bigint_fields(*names):
    # Like ρσ_lightweight_math_class, this is an identity decorator fallback
    # for bootstrap compilers which predate the typed-field lowering pass.
    return def(cls):
        return cls


def ρσ_set_class_repr(cls, text):
    Object.defineProperty(cls, '__repr__', {
        'value': def():
            return text
    })


@ρσ_bigint_fields('_value')
@ρσ_lightweight_math_class
class FiniteFieldElement(Element):

    def __init__(self, parent, value):
        if isinstance(value, FiniteFieldElement):
            if value._parent is not parent:
                raise TypeError(
                    'no canonical conversion between distinct finite fields')
            value = value._value

        if isinstance(value, Rational):
            numerator = value._numerator % parent._modulus
            denominator = value._denominator % parent._modulus
            if numerator < 0:
                numerator += parent._modulus
            if denominator < 0:
                denominator += parent._modulus
            residue = numerator * runtime.modular_inverse(
                denominator, parent._modulus)
        else:
            residue = runtime.integer_bigint(value)

        residue %= parent._modulus
        if residue < 0:
            residue += parent._modulus
        self._parent = parent
        self._value = residue
        Object.freeze(self)

    def _add_(self, other: FiniteFieldElement):
        return FiniteFieldElement(
            self._parent, self._value + other._value)

    def _sub_(self, other: FiniteFieldElement):
        return FiniteFieldElement(
            self._parent, self._value - other._value)

    def _mul_(self, other: FiniteFieldElement):
        return FiniteFieldElement(
            self._parent, self._value * other._value)

    def _truediv_(self, other: FiniteFieldElement):
        return ρσ_new_prime_field_element(
            self._parent,
            self._value * runtime.modular_inverse(
                other._value, self._parent._modulus))

    def _eq_(self, other: FiniteFieldElement):
        return self._value is other._value

    def __add__(self, other):
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other):
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other):
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other):
        return runtime.coercion_model.binOp('truediv', self, other)

    def __eq__(self, other):
        return runtime.coercion_model.equals(self, other)

    def __neg__(self):
        return FiniteFieldElement(self._parent, -self._value)

    def __pow__(self, exponent):
        exponent = runtime.integer_bigint(exponent)
        value = self._value
        if exponent < 0:
            value = runtime.modular_inverse(value, self._parent._modulus)
            exponent = -exponent
        return ρσ_new_prime_field_element(
            self._parent,
            runtime.modular_power(value, exponent, self._parent._modulus))

    def lift(self):
        return runtime.normalize_integer(self._value)

    integer_representation = lift

    def is_zero(self):
        return self._value is BigInt(0)

    def is_one(self):
        return self._value is BigInt(1)

    def __repr__(self):
        return self._value.toString()

    __str__ = __repr__
    toString = __repr__


def ρσ_new_prime_field_element(parent, value):
    if isinstance(value, FiniteFieldElement) and value._parent is parent:
        return value
    return FiniteFieldElement(parent, value)


@ρσ_lightweight_math_class
class FiniteFieldExtensionElement(Element):

    def __init__(self, parent, native_value):
        self._parent = parent
        self._native = native_value
        Object.freeze(self)

    def _new(self, native_value):
        return ρσ_new_extension_field_element(self._parent, native_value)

    def _add_(self, other):
        return self._new(
            runtime.flint_backend().fqAdd(self._native, other._native))

    def _sub_(self, other):
        return self._new(
            runtime.flint_backend().fqSub(self._native, other._native))

    def _mul_(self, other):
        return self._new(
            runtime.flint_backend().fqMul(self._native, other._native))

    def _truediv_(self, other):
        if other.is_zero():
            raise ZeroDivisionError('finite field division by zero')
        return self._new(
            runtime.flint_backend().fqDiv(self._native, other._native))

    def _eq_(self, other):
        return runtime.flint_backend().fqEqual(self._native, other._native)

    def __add__(self, other):
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other):
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other):
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other):
        return runtime.coercion_model.binOp('truediv', self, other)

    def __eq__(self, other):
        return runtime.coercion_model.equals(self, other)

    def __neg__(self):
        return self._new(runtime.flint_backend().fqNeg(self._native))

    def __pow__(self, exponent):
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0 and self.is_zero():
            raise ZeroDivisionError('cannot invert zero in a finite field')
        return self._new(
            runtime.flint_backend().fqPow(self._native, exponent))

    def is_zero(self):
        return runtime.flint_backend().fqIsZero(self._native)

    def is_one(self):
        return runtime.flint_backend().fqIsOne(self._native)

    def __repr__(self):
        raw = runtime.flint_backend().fqToString(self._native)
        return raw.replace(RegExp(r'\+', 'g'), ' + ').replace(
            RegExp(r'([^-])-+', 'g'), '$1 - ')

    __str__ = __repr__
    toString = __repr__


def ρσ_new_extension_field_element(parent, native_value):
    return Reflect.construct(
        parent._elementType, [parent, native_value])


class FiniteField_prime_modn(Parent):

    def order(self):
        return runtime.normalize_integer(self._order)

    cardinality = order
    characteristic = order

    def degree(self):
        return 1

    def is_field(self):
        return True

    def is_finite(self):
        return True

    def is_prime_field(self):
        return True

    def zero(self):
        return ρσ_new_prime_field_element(self, BigInt(0))

    def one(self):
        return ρσ_new_prime_field_element(self, BigInt(1))

    def gen(self, index=0):
        index = runtime.integer_bigint(index)
        if index is not BigInt(0):
            raise IndexError('only one generator')
        return ρσ_new_prime_field_element(self, self._generator)

    def _first_ngens(self, count):
        count = runtime.integer_bigint(count)
        if count is not BigInt(1):
            raise ValueError('prime fields have exactly one generator')
        return [self.gen()]

    def gens(self):
        return runtime.math_tuple([self.gen()])

    def variable_name(self):
        return 'x'

    def polynomial(self, variable='x'):
        return PolynomialRing(self, variable).gen()

    def construction(self):
        return runtime.math_tuple([QuotientFunctor, ZZ])

    def __iter__(self):
        value = BigInt(0)
        while value < self._order:
            yield ρσ_new_prime_field_element(self, value)
            value += BigInt(1)

    def prime_subfield(self):
        return self


class FiniteFieldExtensionParent(Parent):

    def order(self):
        return runtime.normalize_integer(self._order)

    cardinality = order

    def characteristic(self):
        return runtime.normalize_integer(self._prime)

    def degree(self):
        return self._degree

    def is_field(self):
        return True

    def is_finite(self):
        return True

    def is_prime_field(self):
        return False

    def zero(self):
        return self(0)

    def one(self):
        return self(1)

    def gen(self, index=0):
        index = runtime.integer_bigint(index)
        if index is not BigInt(0):
            raise IndexError('only one generator')
        return ρσ_new_extension_field_element(
            self, runtime.flint_backend().fqGen(self._nativeContext))

    def _first_ngens(self, count):
        count = runtime.integer_bigint(count)
        if count is not BigInt(1):
            raise ValueError('finite fields have exactly one generator')
        return [self.gen()]

    def gens(self):
        return runtime.math_tuple([self.gen()])

    def variable_name(self):
        return self._variable

    def prime_subfield(self):
        return self._primeSubfield

    def modulus(self):
        return runtime.polynomial_from_coefficients(
            self._primeSubfield, 'x', self._modulusCoefficients)

    def polynomial(self):
        return runtime.polynomial_from_coefficients(
            self._primeSubfield, self._variable,
            self._modulusCoefficients)

    def construction(self):
        return runtime.math_tuple(
            [AlgebraicExtensionFunctor, self._primeSubfield])

    def __iter__(self):
        yield self.zero()
        value = self.gen()
        generator = value
        index = BigInt(1)
        while index < self._order:
            yield value
            value = value._mul_(generator)
            index += BigInt(1)


class FiniteField_givaro(FiniteFieldExtensionParent):
    pass


@ρσ_lightweight_math_class
class FiniteField_givaroElement(FiniteFieldExtensionElement):
    pass


class FiniteField_ntl_gf2e(FiniteFieldExtensionParent):
    pass


@ρσ_lightweight_math_class
class FiniteField_ntl_gf2eElement(FiniteFieldExtensionElement):
    pass


class FiniteField_pari_ffelt(FiniteFieldExtensionParent):
    pass


@ρσ_lightweight_math_class
class FiniteFieldElement_pari_ffelt(FiniteFieldExtensionElement):
    pass


runtime.set_class_repr(
    FiniteFieldElement, "<class 'FiniteFieldElement'>")
runtime.set_class_repr(
    FiniteFieldExtensionElement,
    "<class 'sage.rings.finite_rings.element_givaro." +
    "FiniteField_givaroElement'>")
runtime.set_class_repr(
    FiniteField_prime_modn,
    "<class 'sage.rings.finite_rings.finite_field_prime_modn." +
    "FiniteField_prime_modn_with_category'>")
runtime.set_class_repr(
    FiniteField_givaro,
    "<class 'sage.rings.finite_rings.finite_field_givaro." +
    "FiniteField_givaro_with_category'>")
runtime.set_class_repr(
    FiniteField_givaroElement,
    "<class 'sage.rings.finite_rings.element_givaro." +
    "FiniteField_givaroElement'>")
runtime.set_class_repr(
    FiniteField_ntl_gf2e,
    "<class 'sage.rings.finite_rings.finite_field_ntl_gf2e." +
    "FiniteField_ntl_gf2e_with_category'>")
runtime.set_class_repr(
    FiniteField_ntl_gf2eElement,
    "<class 'sage.rings.finite_rings.element_ntl_gf2e." +
    "FiniteField_ntl_gf2eElement'>")
runtime.set_class_repr(
    FiniteField_pari_ffelt,
    "<class 'sage.rings.finite_rings.finite_field_pari_ffelt." +
    "FiniteField_pari_ffelt_with_category'>")
runtime.set_class_repr(
    FiniteFieldElement_pari_ffelt,
    "<class 'sage.rings.finite_rings.element_pari_ffelt." +
    "FiniteFieldElement_pari_ffelt'>")
