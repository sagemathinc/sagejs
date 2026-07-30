# Sage-compatible finite-field and residue-ring parents and elements.
#
# Native FLINT handles remain behind ``sagejs.runtime``. Parents, elements,
# factories, caches, and coercion maps live together here in ordinary Python.
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
            numerator = runtime.native_mod(
                value._numerator, parent._modulus)
            denominator = runtime.native_mod(
                value._denominator, parent._modulus)
            if numerator < 0:
                numerator = runtime.native_add(
                    numerator, parent._modulus)
            if denominator < 0:
                denominator = runtime.native_add(
                    denominator, parent._modulus)
            residue = runtime.native_mul(
                numerator,
                runtime.modular_inverse(
                    denominator, parent._modulus),
            )
        else:
            residue = runtime.integer_bigint(value)

        residue = runtime.native_mod(residue, parent._modulus)
        if residue < 0:
            residue = runtime.native_add(
                residue, parent._modulus)
        self._parent = parent
        self._value = residue
        runtime.object.freeze(self)

    def _new_reduced(self, value: int) -> FiniteFieldElement:
        answer = runtime.object.create(
            _finite_field_element_prototype)
        answer._parent = self._parent
        answer._value = value
        runtime.object.freeze(answer)
        return answer

    def _add_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        value = runtime.native_add(self._value, other._value)
        if value >= self._parent._modulus:
            value = runtime.native_sub(
                value, self._parent._modulus)
        return self._new_reduced(value)

    def _sub_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        value = runtime.native_sub(self._value, other._value)
        if value < 0:
            value = runtime.native_add(
                value, self._parent._modulus)
        return self._new_reduced(value)

    def _mul_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return self._new_reduced(
            runtime.native_mod(
                runtime.native_mul(self._value, other._value),
                self._parent._modulus,
            ),
        )

    def _truediv_(
        self, other: FiniteFieldElement,
    ) -> FiniteFieldElement:
        return self._new_reduced(
            runtime.native_mod(
                runtime.native_mul(
                    self._value,
                    runtime.modular_inverse(
                        other._value, self._parent._modulus),
                ),
                self._parent._modulus,
            ),
        )

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
        if self._value == runtime.bigint(0):
            return self
        return self._new_reduced(
            runtime.native_sub(
                self._parent._modulus, self._value),
        )

    def __pow__(self, exponent: int) -> FiniteFieldElement:
        exponent = runtime.integer_bigint(exponent)
        value = self._value
        if exponent < 0:
            value = runtime.modular_inverse(value, self._parent._modulus)
            exponent = -exponent
        return self._new_reduced(
            runtime.modular_power(value, exponent, self._parent._modulus))

    def lift(self) -> int:
        return runtime.normalize_integer(self._value)

    integer_representation = lift

    def is_zero(self) -> bool:
        return self._value == runtime.bigint(0)

    def is_one(self) -> bool:
        return self._value == runtime.bigint(1)

    def is_unit(self) -> bool:
        return runtime.bigint_gcd(
            self._value, self._parent._modulus
        ) == runtime.bigint(1)

    def inverse_of_unit(self) -> FiniteFieldElement:
        if not self.is_unit():
            raise ArithmeticError('element is not a unit')
        return self._new_reduced(
            runtime.modular_inverse(
                self._value, self._parent._modulus),
        )

    def __invert__(self) -> FiniteFieldElement:
        return self.inverse_of_unit()

    def __repr__(self) -> str:
        return str(self._value)

    __str__ = __repr__
    toString = __repr__


_finite_field_element_prototype = runtime.reflect.get(
    FiniteFieldElement, 'prototype')


def _new_prime_field_element(
    parent: Any, value: Any,
) -> FiniteFieldElement:
    if isinstance(value, FiniteFieldElement) and value._parent is parent:
        return value
    return FiniteFieldElement(parent, value)


@runtime.bigint_fields('_value')
@runtime.lightweight_math_class
class IntegerModElement(FiniteFieldElement):

    def _new_reduced(self, value: int) -> IntegerModElement:
        answer = runtime.object.create(
            _integer_mod_element_prototype)
        answer._parent = self._parent
        answer._value = value
        runtime.object.freeze(answer)
        return answer

    def _add_(
        self, other: FiniteFieldElement,
    ) -> IntegerModElement:
        value = runtime.native_add(self._value, other._value)
        if value >= self._parent._modulus:
            value = runtime.native_sub(
                value, self._parent._modulus)
        return self._new_reduced(value)

    def _sub_(
        self, other: FiniteFieldElement,
    ) -> IntegerModElement:
        value = runtime.native_sub(self._value, other._value)
        if value < 0:
            value = runtime.native_add(
                value, self._parent._modulus)
        return self._new_reduced(value)

    def _mul_(
        self, other: FiniteFieldElement,
    ) -> IntegerModElement:
        return self._new_reduced(
            runtime.native_mod(
                runtime.native_mul(self._value, other._value),
                self._parent._modulus,
            ),
        )

    def _truediv_(
        self, other: FiniteFieldElement,
    ) -> IntegerModElement:
        return self._new_reduced(
            runtime.native_mod(
                runtime.native_mul(
                    self._value,
                    runtime.modular_inverse(
                        other._value, self._parent._modulus),
                ),
                self._parent._modulus,
            ),
        )

    def __neg__(self) -> IntegerModElement:
        if self._value == runtime.bigint(0):
            return self
        return self._new_reduced(
            runtime.native_sub(
                self._parent._modulus, self._value),
        )

    def __pow__(self, exponent: int) -> IntegerModElement:
        exponent = runtime.integer_bigint(exponent)
        value = self._value
        if exponent < 0:
            value = runtime.modular_inverse(
                value, self._parent._modulus)
            exponent = -exponent
        return self._new_reduced(
            runtime.modular_power(
                value, exponent, self._parent._modulus),
        )

    def inverse_of_unit(self) -> IntegerModElement:
        if not self.is_unit():
            raise ArithmeticError('element is not a unit')
        return self._new_reduced(
            runtime.modular_inverse(
                self._value, self._parent._modulus),
        )


_integer_mod_element_prototype = runtime.reflect.get(
    IntegerModElement, 'prototype')


@runtime.lightweight_math_class
class FiniteFieldExtensionElement(sage.Element):

    def __init__(self, parent: Any, native_value: Any) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> FiniteFieldExtensionElement:
        return _new_extension_field_element(self._parent, native_value)

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


def _new_extension_field_element(
    parent: Any, native_value: Any,
) -> FiniteFieldExtensionElement:
    return runtime.reflect.construct(
        parent._elementType, [parent, native_value])


@runtime.callable_instance_class
class FiniteField_prime_modn(sage.Parent):

    def __init__(self, order: int, generator: int) -> None:
        self._name = (
            'Finite Field of size ' + runtime.string(order))
        self._kind = 'GF'
        self._elementType = FiniteFieldElement
        self._modulus = order
        self._order = order
        self._generator = generator

    def __call__(self, value: Any = 0) -> FiniteFieldElement:
        return _new_prime_field_element(self, value)

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
        return _new_prime_field_element(self, runtime.bigint(0))

    def one(self) -> FiniteFieldElement:
        return _new_prime_field_element(self, runtime.bigint(1))

    def gen(self, index: int = 0) -> FiniteFieldElement:
        index = runtime.integer_bigint(index)
        if index != runtime.bigint(0):
            raise IndexError('only one generator')
        return _new_prime_field_element(self, self._generator)

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
            yield _new_prime_field_element(self, value)
            value += runtime.bigint(1)

    def prime_subfield(self) -> FiniteField_prime_modn:
        return self


@runtime.callable_instance_class
class IntegerModRing(sage.Parent):

    def __init__(self, order: int) -> None:
        self._name = (
            'Ring of integers modulo ' + runtime.string(order))
        self._kind = 'ZMOD'
        self._elementType = IntegerModElement
        self._modulus = order
        self._order = order

    def __call__(self, value: Any = 0) -> IntegerModElement:
        if (
            isinstance(value, IntegerModElement)
            and value._parent is self
        ):
            return value
        return IntegerModElement(self, value)

    def order(self) -> int:
        return runtime.normalize_integer(self._order)

    cardinality = order
    characteristic = order

    def is_field(self, proof: Any = True) -> bool:
        return runtime.flint_backend().isPrime(self._order)

    def is_integral_domain(self, proof: Any = True) -> bool:
        return self.is_field(proof)

    def is_finite(self) -> bool:
        return True

    def is_prime_field(self) -> bool:
        return False

    def zero(self) -> IntegerModElement:
        return IntegerModElement(self, runtime.bigint(0))

    def one(self) -> IntegerModElement:
        return IntegerModElement(self, runtime.bigint(1))

    def __iter__(self) -> Iterator[IntegerModElement]:
        value = runtime.bigint(0)
        while value < self._order:
            yield IntegerModElement(self, value)
            value += runtime.bigint(1)


class FiniteFieldExtensionParent(sage.Parent):

    def __init__(
        self,
        order: int,
        prime: int,
        degree: int,
        variable: str,
        native_context: Any,
        modulus_coefficients: list[Any],
        prime_subfield: FiniteField_prime_modn,
        element_type: type[FiniteFieldExtensionElement],
    ) -> None:
        self._name = (
            'Finite Field in ' + variable + ' of size '
            + runtime.string(prime) + '^' + runtime.string(degree)
        )
        self._kind = 'GF_EXTENSION'
        self._elementType = element_type
        self._nativeContext = native_context
        runtime.object.freeze(modulus_coefficients)
        self._modulusCoefficients = modulus_coefficients
        self._primeSubfield = prime_subfield
        self._order = order
        self._prime = prime
        self._degree = degree
        self._variable = variable

    def __call__(
        self, value: Any = 0,
    ) -> FiniteFieldExtensionElement:
        if isinstance(value, FiniteFieldExtensionElement):
            if value._parent is not self:
                raise TypeError(
                    'cannot convert between incompatible finite fields')
            return value
        if isinstance(value, FiniteFieldElement):
            if value._parent is not self._primeSubfield:
                raise TypeError(
                    'finite-field characteristics do not match')
            value = value.lift()
        if isinstance(value, sage.Rational):
            numerator = self(value._numerator)
            denominator = self(value._denominator)
            return numerator._truediv_(denominator)
        value = runtime.integer_bigint(value)
        return _new_extension_field_element(
            self,
            runtime.flint_backend().fqFromBigInt(
                self._nativeContext, value),
        )

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
        return _new_extension_field_element(
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
        return _polynomial_from_coefficients(
            self._primeSubfield, 'x', self._modulusCoefficients)

    def polynomial(self) -> Any:
        return _polynomial_from_coefficients(
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


@runtime.callable_instance_class
class FiniteField_givaro(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
class FiniteField_givaroElement(FiniteFieldExtensionElement):
    pass


@runtime.callable_instance_class
class FiniteField_ntl_gf2e(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
class FiniteField_ntl_gf2eElement(FiniteFieldExtensionElement):
    pass


@runtime.callable_instance_class
class FiniteField_pari_ffelt(FiniteFieldExtensionParent):
    pass


@runtime.lightweight_math_class
class FiniteFieldElement_pari_ffelt(FiniteFieldExtensionElement):
    pass


def _polynomial_from_coefficients(
    base: Any,
    variable: str,
    coefficients: list[Any],
) -> Any:
    ring = sage.PolynomialRing(base, variable)
    generator = ring.gen()
    result = ring(0)
    index = len(coefficients) - 1
    while index >= 0:
        result = result._mul_(generator)._add_(
            ring(base(coefficients[index])))
        index -= 1
    return result


def _finite_field_name(
    name: Any,
    names: Any,
    degree: int,
) -> str:
    variable = names if names is not runtime.undefined and names is not None \
        else name
    if isinstance(variable, list):
        if len(variable) != 1:
            raise TypeError(
                'a finite-field extension needs exactly one generator name')
        variable = variable[0]
    if variable is runtime.undefined or variable is None:
        variable = 'z' + runtime.string(degree)
    if (
        not isinstance(variable, str)
        or not runtime.regexp(
            r'^[A-Za-z_][A-Za-z0-9_]*$'
        ).test(variable)
    ):
        raise TypeError(
            'the finite-field generator must be a valid identifier')
    return variable


def _field_coercion(field: Any) -> Callable[[Any], Any]:
    def convert(value: Any) -> Any:
        return field(value)

    return convert


_prime_fields = runtime.map()
_extension_fields = runtime.map()
_residue_rings = runtime.map()


def _make_extension_field(
    order: int,
    prime: int,
    degree: int,
    name: Any,
    names: Any,
    modulus: Any,
) -> FiniteFieldExtensionParent:
    if modulus is not runtime.undefined and modulus is not None:
        raise NotImplementedError(
            'explicit extension-field moduli are not implemented yet')
    variable = _finite_field_name(name, names, degree)
    key = runtime.string(order) + '|' + variable
    field = _extension_fields.get(key)
    if field is not runtime.undefined:
        return field

    backend = runtime.flint_backend()
    context = runtime.undefined
    missing_conway = False
    try:
        context = backend.fqContext(prime, degree, variable)
    except Exception as error:
        message = getattr(error, 'message', '')
        if (
            runtime.jstype(message) == 'string'
            and runtime.regexp('Conway polynomial').test(message)
        ):
            missing_conway = True
        else:
            raise
    if missing_conway:
        raise NotImplementedError(
            'Sage-compatible pseudo-Conway polynomials are not ' +
            'implemented for this finite field')

    modulus_coefficients = backend.fqContextModulus(context)
    prime_field = GF(prime)
    if order < runtime.bigint(65536):
        parent_type = FiniteField_givaro
        element_type = FiniteField_givaroElement
    elif prime == runtime.bigint(2):
        parent_type = FiniteField_ntl_gf2e
        element_type = FiniteField_ntl_gf2eElement
    else:
        parent_type = FiniteField_pari_ffelt
        element_type = FiniteFieldElement_pari_ffelt

    field = parent_type(
        order,
        prime,
        degree,
        variable,
        context,
        modulus_coefficients,
        prime_field,
        element_type,
    )
    _extension_fields.set(key, field)
    conversion = _field_coercion(field)
    runtime.coercion_model.register(sage.ZZ, field, conversion)
    runtime.coercion_model.register(prime_field, field, conversion)
    return field


def GF(
    order: Any,
    name: Any = runtime.undefined,
    modulus: Any = runtime.undefined,
    names: Any = runtime.undefined,
) -> Any:
    order = runtime.integer_bigint(order)
    if order < runtime.bigint(2):
        raise ValueError(
            'the order of a finite field must be at least 2')
    primitive = modulus == 'primitive'
    if (
        modulus is not runtime.undefined
        and modulus is not None
        and not primitive
    ):
        raise NotImplementedError(
            'explicit finite-field moduli are not implemented yet')

    key = runtime.string(order)
    if primitive:
        key = key + '|primitive'
    field = _prime_fields.get(key)
    if field is not runtime.undefined:
        return field

    backend = runtime.flint_backend()
    if not backend.isPrime(order):
        decomposition = backend.factor(order)
        if len(decomposition.factors) != 1:
            raise ValueError(
                'the order of a finite field must be a prime power')
        prime_power = decomposition.factors[0]
        if prime_power[1] < 2:
            raise ValueError(
                'the order of a finite field must be a prime power')
        return _make_extension_field(
            order,
            prime_power[0],
            prime_power[1],
            name,
            names,
            modulus,
        )

    generator = runtime.bigint(1)
    if primitive:
        generator = backend.wordPrimitiveRootPrime(order)
    field = FiniteField_prime_modn(order, generator)
    _prime_fields.set(key, field)
    runtime.coercion_model.register(
        sage.ZZ, field, _field_coercion(field))
    return field


FiniteField = GF


def Zmod(order: Any) -> IntegerModRing:
    order = runtime.integer_bigint(order)
    if order < runtime.bigint(2):
        raise ValueError(
            'the modulus must be at least 2')
    key = runtime.string(order)
    ring = _residue_rings.get(key)
    if ring is not runtime.undefined:
        return ring
    ring = IntegerModRing(order)
    _residue_rings.set(key, ring)
    runtime.coercion_model.register(
        sage.ZZ, ring, _field_coercion(ring))
    return ring


Integers = Zmod


runtime.set_class_repr(
    FiniteFieldElement, "<class 'FiniteFieldElement'>")
runtime.set_class_repr(
    IntegerModElement,
    "<class 'sage.rings.finite_rings.integer_mod.IntegerMod_int64'>")
runtime.set_class_repr(
    FiniteFieldExtensionElement,
    "<class 'sage.rings.finite_rings.element_givaro." +
    "FiniteField_givaroElement'>")
runtime.set_class_repr(
    FiniteField_prime_modn,
    "<class 'sage.rings.finite_rings.finite_field_prime_modn." +
    "FiniteField_prime_modn_with_category'>")
runtime.set_class_repr(
    IntegerModRing,
    "<class 'sage.rings.finite_rings.integer_mod_ring." +
    "IntegerModRing_generic_with_category'>")
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
