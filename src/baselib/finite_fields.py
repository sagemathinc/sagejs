# Sage-compatible finite-field parents and elements.
#
# The callable-parent adapter and native FLINT handles live in the low-level
# algebra runtime.  Mathematical behavior belongs here, in ordinary Sage.js
# source, so it remains readable and can eventually track upstream Sage code.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def ρσ_lightweight_math_class(cls: type[Any]) -> type[Any]:
    # The bootstrap compiler sees this as an ordinary identity decorator.  The
    # converged compiler recognizes it at compile time and omits its generic
    # per-instance identity slot.
    return cls


def ρσ_bigint_fields(
    *names: str,
) -> Callable[[type[Any]], type[Any]]:
    # Like ρσ_lightweight_math_class, this is an identity decorator fallback
    # for bootstrap compilers which predate the typed-field lowering pass.
    def decorator(cls: type[Any]) -> type[Any]:
        return cls

    return decorator


def ρσ_set_class_repr(cls: type[Any], text: str) -> None:
    def class_repr() -> str:
        return text

    runtime.object.defineProperty(
        cls, '__repr__', {'value': class_repr})


@runtime.bigint_fields('_value')
@runtime.lightweight_math_class
class FiniteFieldElement(sage.Element):

    def __init__(self, parent: Any, value: Any) -> None:
        if isinstance(value, FiniteFieldElement):
            if value._parent is not parent:
                raise TypeError(
                    'no canonical conversion between distinct finite fields')
            value = value._value

        if isinstance(value, sage.Rational):
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
        runtime.object.freeze(self)

    def _add_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return FiniteFieldElement(
            self._parent, self._value + other._value)

    def _sub_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return FiniteFieldElement(
            self._parent, self._value - other._value)

    def _mul_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return FiniteFieldElement(
            self._parent, self._value * other._value)

    def _truediv_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return ρσ_new_prime_field_element(
            self._parent,
            self._value * runtime.modular_inverse(
                other._value, self._parent._modulus))

    def _eq_(self, other: FiniteFieldElement) -> bool:
        return self._value == other._value

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

    def __neg__(self) -> FiniteFieldElement:
        return FiniteFieldElement(self._parent, -self._value)

    def __pow__(self, exponent: int) -> FiniteFieldElement:
        exponent = runtime.integer_bigint(exponent)
        value = self._value
        if exponent < 0:
            value = runtime.modular_inverse(value, self._parent._modulus)
            exponent = -exponent
        return ρσ_new_prime_field_element(
            self._parent,
            runtime.modular_power(value, exponent, self._parent._modulus))

    def lift(self) -> int:
        return runtime.normalize_integer(self._value)

    integer_representation = lift

    def is_zero(self) -> bool:
        return self._value == runtime.bigint(0)

    def is_one(self) -> bool:
        return self._value == runtime.bigint(1)

    def __repr__(self) -> str:
        return str(self._value)

    __str__ = __repr__
    toString = __repr__


def ρσ_new_prime_field_element(
    parent: Any, value: Any,
) -> FiniteFieldElement:
    if isinstance(value, FiniteFieldElement) and value._parent is parent:
        return value
    return FiniteFieldElement(parent, value)


@runtime.lightweight_math_class
class FiniteFieldExtensionElement(sage.Element):

    def __init__(self, parent: Any, native_value: Any) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> FiniteFieldExtensionElement:
        return ρσ_new_extension_field_element(self._parent, native_value)

    def _add_(
        self, other: FiniteFieldExtensionElement,
    ) -> FiniteFieldExtensionElement:
        return self._new(
            runtime.flint_backend().fqAdd(self._native, other._native))

    def _sub_(
        self, other: FiniteFieldExtensionElement,
    ) -> FiniteFieldExtensionElement:
        return self._new(
            runtime.flint_backend().fqSub(self._native, other._native))

    def _mul_(
        self, other: FiniteFieldExtensionElement,
    ) -> FiniteFieldExtensionElement:
        return self._new(
            runtime.flint_backend().fqMul(self._native, other._native))

    def _truediv_(
        self, other: FiniteFieldExtensionElement,
    ) -> FiniteFieldExtensionElement:
        if other.is_zero():
            raise sage.ZeroDivisionError('finite field division by zero')
        return self._new(
            runtime.flint_backend().fqDiv(self._native, other._native))

    def _eq_(self, other: FiniteFieldExtensionElement) -> bool:
        return runtime.flint_backend().fqEqual(self._native, other._native)

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

    def __neg__(self) -> FiniteFieldExtensionElement:
        return self._new(runtime.flint_backend().fqNeg(self._native))

    def __pow__(
        self, exponent: int,
    ) -> FiniteFieldExtensionElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0 and self.is_zero():
            raise sage.ZeroDivisionError(
                'cannot invert zero in a finite field')
        return self._new(
            runtime.flint_backend().fqPow(self._native, exponent))

    def is_zero(self) -> bool:
        return runtime.flint_backend().fqIsZero(self._native)

    def is_one(self) -> bool:
        return runtime.flint_backend().fqIsOne(self._native)

    def __repr__(self) -> str:
        raw = runtime.flint_backend().fqToString(self._native)
        return raw.replace(runtime.regexp(r'\+', 'g'), ' + ').replace(
            runtime.regexp(r'([^-])-+', 'g'), '$1 - ')

    __str__ = __repr__
    toString = __repr__


def ρσ_new_extension_field_element(
    parent: Any, native_value: Any,
) -> FiniteFieldExtensionElement:
    return runtime.reflect.construct(
        parent._elementType, [parent, native_value])


class FiniteField_prime_modn(sage.Parent):
    # GF() creates these callable parent objects in the low-level runtime, then
    # installs these immutable fields before exposing the object.
    _order = runtime.undefined
    _generator = runtime.undefined

    def order(self) -> int:
        return runtime.normalize_integer(self._order)

    cardinality = order
    characteristic = order

    def degree(self) -> int:
        return 1

    def is_field(self) -> bool:
        return True

    def is_finite(self) -> bool:
        return True

    def is_prime_field(self) -> bool:
        return True

    def zero(self) -> FiniteFieldElement:
        return ρσ_new_prime_field_element(self, runtime.bigint(0))

    def one(self) -> FiniteFieldElement:
        return ρσ_new_prime_field_element(self, runtime.bigint(1))

    def gen(self, index: int = 0) -> FiniteFieldElement:
        index = runtime.integer_bigint(index)
        if index != runtime.bigint(0):
            raise IndexError('only one generator')
        return ρσ_new_prime_field_element(self, self._generator)

    def _first_ngens(self, count: int) -> list[FiniteFieldElement]:
        count = runtime.integer_bigint(count)
        if count != runtime.bigint(1):
            raise ValueError('prime fields have exactly one generator')
        return [self.gen()]

    def gens(self) -> 'tuple[Any, ...]':
        return runtime.math_tuple([self.gen()])

    def variable_name(self) -> str:
        return 'x'

    def polynomial(self, variable: str = 'x') -> Any:
        return sage.PolynomialRing(self, variable).gen()

    def construction(self) -> 'tuple[Any, ...]':
        return runtime.math_tuple([sage.QuotientFunctor, sage.ZZ])

    def __iter__(self) -> Iterator[FiniteFieldElement]:
        value = runtime.bigint(0)
        while value < self._order:
            yield ρσ_new_prime_field_element(self, value)
            value += runtime.bigint(1)

    def prime_subfield(self) -> FiniteField_prime_modn:
        return self


class FiniteFieldExtensionParent(sage.Parent):
    # The low-level finite-field factory initializes these native-backed
    # fields before an extension parent becomes observable.
    _order = runtime.undefined
    _prime = runtime.undefined
    _degree = runtime.undefined
    _nativeContext = runtime.undefined
    _variable = runtime.undefined
    _primeSubfield = runtime.undefined
    _modulusCoefficients = runtime.undefined

    def order(self) -> int:
        return runtime.normalize_integer(self._order)

    cardinality = order

    def characteristic(self) -> int:
        return runtime.normalize_integer(self._prime)

    def degree(self) -> int:
        return self._degree

    def is_field(self) -> bool:
        return True

    def is_finite(self) -> bool:
        return True

    def is_prime_field(self) -> bool:
        return False

    def zero(self) -> FiniteFieldExtensionElement:
        return self(0)

    def one(self) -> FiniteFieldExtensionElement:
        return self(1)

    def gen(self, index: int = 0) -> FiniteFieldExtensionElement:
        index = runtime.integer_bigint(index)
        if index != runtime.bigint(0):
            raise IndexError('only one generator')
        return ρσ_new_extension_field_element(
            self, runtime.flint_backend().fqGen(self._nativeContext))

    def _first_ngens(
        self, count: int,
    ) -> list[FiniteFieldExtensionElement]:
        count = runtime.integer_bigint(count)
        if count != runtime.bigint(1):
            raise ValueError('finite fields have exactly one generator')
        return [self.gen()]

    def gens(self) -> 'tuple[Any, ...]':
        return runtime.math_tuple([self.gen()])

    def variable_name(self) -> str:
        return self._variable

    def prime_subfield(self) -> FiniteField_prime_modn:
        return self._primeSubfield

    def modulus(self) -> Any:
        return runtime.polynomial_from_coefficients(
            self._primeSubfield, 'x', self._modulusCoefficients)

    def polynomial(self) -> Any:
        return runtime.polynomial_from_coefficients(
            self._primeSubfield, self._variable,
            self._modulusCoefficients)

    def construction(self) -> 'tuple[Any, ...]':
        return runtime.math_tuple(
            [sage.AlgebraicExtensionFunctor, self._primeSubfield])

    def __iter__(self) -> Iterator[FiniteFieldExtensionElement]:
        yield self.zero()
        value = self.gen()
        generator = value
        index = runtime.bigint(1)
        while index < self._order:
            yield value
            value = value._mul_(generator)
            index += runtime.bigint(1)


class FiniteField_givaro(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
class FiniteField_givaroElement(FiniteFieldExtensionElement):
    pass


class FiniteField_ntl_gf2e(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
class FiniteField_ntl_gf2eElement(FiniteFieldExtensionElement):
    pass


class FiniteField_pari_ffelt(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
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
