# A deliberately small mathematical parent and coercion kernel.
#
# The semantics are adapted from SageMath's parent/coercion model, but this is
# a new, explicit implementation for the JavaScript runtime. Binary arithmetic
# resolves both operands to a common parent instead of relying on reflected
# Python operators.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable

import sagejs.runtime as runtime


def is_exact_integer(value: object) -> bool:
    return (
        runtime.jstype(value) == 'bigint'
        or (
            runtime.jstype(value) == 'number'
            and runtime.number.isSafeInteger(value)
        )
    )


def normalize_integer(value: Any) -> Any:
    if not is_exact_integer(value):
        raise TypeError('expected an exact integer')
    if runtime.jstype(value) == 'number':
        return value
    if (
        value <= runtime.bigint(runtime.number.MAX_SAFE_INTEGER)
        and value >= runtime.bigint(runtime.number.MIN_SAFE_INTEGER)
    ):
        return runtime.number(value)
    return value


def integer_bigint(value: object) -> int:
    if not is_exact_integer(value):
        raise TypeError('expected an exact integer')
    return runtime.bigint(value)


def new_map() -> Any:
    return runtime.reflect.construct(runtime.map_class, [])


def string_primitive(value: object) -> str:
    return runtime.reflect.apply(
        runtime.string_class, runtime.undefined, [value])


def string_find(value: str, needle: str) -> int:
    return runtime.reflect.apply(
        runtime.string_class.prototype.indexOf,
        value,
        [needle],
    )


def bigint_gcd(left: int, right: int) -> int:
    if left < 0:
        left = -left
    if right < 0:
        right = -right
    while right != 0:
        left, right = right, runtime.native_mod(left, right)
    return left


class Parent:

    def __init__(self, name: str) -> None:
        self._name = name
        self._construction = runtime.undefined
        self._kind = runtime.undefined

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__

    def __getitem__(self, variable: str) -> Any:
        return runtime.polynomial_ring(self, variable)


class Element:

    def __init__(self, parent: Parent) -> None:
        self._parent = parent

    def parent(self) -> Parent:
        return self._parent


@runtime.callable_instance_class
class IntegerRing(Parent):

    def __call__(self, value: object) -> Any:
        return normalize_integer(value)


@runtime.callable_instance_class
class RationalField(Parent):

    def __call__(
        self,
        numerator: Any,
        denominator: Any = runtime.undefined,
    ) -> Any:
        if (
            denominator is runtime.undefined
            and runtime.jstype(numerator) == 'object'
            and hasattr(numerator, '_parent')
            and numerator._parent is self
        ):
            return numerator
        return runtime.rational_class(numerator, denominator)


ZZ = IntegerRing('Integer Ring')
ZZ._kind = 'ZZ'
QQ = RationalField('Rational Field')
QQ._kind = 'QQ'


def _identity(value: Any) -> Any:
    return value


def _add(left: Any, right: Any) -> Any:
    return left._add_(right)


def _sub(left: Any, right: Any) -> Any:
    return left._sub_(right)


def _mul(left: Any, right: Any) -> Any:
    return left._mul_(right)


def _truediv(left: Any, right: Any) -> Any:
    return left._truediv_(right)


class CoercionPlan:

    def __init__(
        self,
        parent: Parent,
        left_map: Callable[[Any], Any],
        right_map: Callable[[Any], Any],
    ) -> None:
        self.parent = parent
        self.leftMap = left_map
        self.rightMap = right_map


class CoercedPair:

    def __init__(
        self, parent: Parent, left: Any, right: Any,
    ) -> None:
        self.parent = parent
        self.left = left
        self.right = right


class CoercionModel:

    def __init__(self) -> None:
        self._maps = new_map()
        self._planCache = new_map()
        self._operations = new_map()
        self._operations.set('add', _add)
        self._operations.set('sub', _sub)
        self._operations.set('mul', _mul)
        self._operations.set('truediv', _truediv)

    def register(
        self,
        source: Parent,
        target: Parent,
        conversion: Callable[[Any], Any],
    ) -> None:
        targets = self._maps.get(source)
        if targets is runtime.undefined:
            targets = new_map()
            self._maps.set(source, targets)
        targets.set(target, conversion)
        self._planCache.clear()

    def _map(self, source: Parent, target: Parent) -> Any:
        targets = self._maps.get(source)
        if targets is runtime.undefined:
            return runtime.undefined
        return targets.get(target)

    def _cache(
        self,
        left: Parent,
        right: Parent,
        plan: CoercionPlan,
    ) -> CoercionPlan:
        rights = self._planCache.get(left)
        if rights is runtime.undefined:
            rights = new_map()
            self._planCache.set(left, rights)
        rights.set(right, plan)
        return plan

    def resolveParents(
        self, left: Parent, right: Parent,
    ) -> CoercionPlan:
        rights = self._planCache.get(left)
        if (
            rights is not runtime.undefined
            and rights.has(right)
        ):
            return rights.get(right)

        if left is right:
            return self._cache(
                left, right,
                CoercionPlan(left, _identity, _identity),
            )

        left_to_right = self._map(left, right)
        right_to_left = self._map(right, left)
        if (
            left_to_right is not runtime.undefined
            and right_to_left is runtime.undefined
        ):
            return self._cache(
                left, right,
                CoercionPlan(right, left_to_right, _identity),
            )
        if (
            right_to_left is not runtime.undefined
            and left_to_right is runtime.undefined
        ):
            return self._cache(
                left, right,
                CoercionPlan(left, _identity, right_to_left),
            )

        left_targets = self._maps.get(left)
        right_targets = self._maps.get(right)
        if (
            left_targets is not runtime.undefined
            and right_targets is not runtime.undefined
        ):
            common = []
            for target in left_targets.keys():
                if right_targets.has(target):
                    common.append(target)
            if common:
                target = common[0]
                second = None
                target_precision = getattr(target, '_precision', -1)
                second_precision = -1
                for candidate in common[1:]:
                    precision = getattr(candidate, '_precision', -1)
                    if precision > target_precision:
                        second = target
                        second_precision = target_precision
                        target = candidate
                        target_precision = precision
                    elif precision > second_precision:
                        second = candidate
                        second_precision = precision
                if (
                    second is None
                    or (
                        target._kind == second._kind
                        and target_precision != second_precision
                    )
                ):
                    return self._cache(
                        left, right,
                        CoercionPlan(
                            target,
                            left_targets.get(target),
                            right_targets.get(target),
                        ),
                    )

        left_construction = left._construction
        right_construction = right._construction
        if (
            left_construction is not runtime.undefined
            and left_construction['kind'] == 'polynomial'
        ):
            if (
                right_construction is not runtime.undefined
                and right_construction['kind'] == 'polynomial'
            ):
                if (
                    left_construction['variable']
                    != right_construction['variable']
                ):
                    raise TypeError(
                        'no canonical coercion between polynomial rings in '
                        + left_construction['variable'] + ' and '
                        + right_construction['variable']
                    )
                base_plan = self.resolveParents(
                    left_construction['base'],
                    right_construction['base'],
                )
                polynomial_parent = runtime.polynomial_ring(
                    base_plan.parent,
                    left_construction['variable'],
                )

                def coerce_left_polynomial(value: Any) -> Any:
                    return polynomial_parent._coercePolynomial(value)

                def coerce_right_polynomial(value: Any) -> Any:
                    return polynomial_parent._coercePolynomial(value)

                return self._cache(
                    left, right,
                    CoercionPlan(
                        polynomial_parent,
                        coerce_left_polynomial,
                        coerce_right_polynomial,
                    ),
                )

            base_plan = self.resolveParents(
                left_construction['base'], right)
            polynomial_parent = runtime.polynomial_ring(
                base_plan.parent,
                left_construction['variable'],
            )

            def coerce_left_polynomial(value: Any) -> Any:
                return polynomial_parent._coercePolynomial(value)

            def coerce_right_constant(value: Any) -> Any:
                return polynomial_parent._constant(
                    base_plan.rightMap(value))

            return self._cache(
                left, right,
                CoercionPlan(
                    polynomial_parent,
                    coerce_left_polynomial,
                    coerce_right_constant,
                ),
            )

        if (
            right_construction is not runtime.undefined
            and right_construction['kind'] == 'polynomial'
        ):
            base_plan = self.resolveParents(
                left, right_construction['base'])
            polynomial_parent = runtime.polynomial_ring(
                base_plan.parent,
                right_construction['variable'],
            )

            def coerce_left_constant(value: Any) -> Any:
                return polynomial_parent._constant(
                    base_plan.leftMap(value))

            def coerce_right_polynomial(value: Any) -> Any:
                return polynomial_parent._coercePolynomial(value)

            return self._cache(
                left, right,
                CoercionPlan(
                    polynomial_parent,
                    coerce_left_constant,
                    coerce_right_polynomial,
                ),
            )

        if (
            left_to_right is not runtime.undefined
            and right_to_left is not runtime.undefined
        ):
            raise TypeError(
                'ambiguous canonical coercion between '
                + str(left) + ' and ' + str(right)
            )
        raise TypeError(
            'no canonical coercion between '
            + str(left) + ' and ' + str(right)
        )

    def parentOf(self, value: Any) -> Parent:
        if is_exact_integer(value):
            return ZZ
        if runtime.jstype(value) == 'number':
            return runtime.reflect.get(runtime.global_object, 'RDF')
        if (
            value is not None
            and runtime.jstype(value) in ('object', 'function')
            and runtime.reflect.get(
                value, '_parent') is not runtime.undefined
        ):
            return value._parent
        raise TypeError('value has no mathematical parent')

    def coercePair(self, left: Any, right: Any) -> CoercedPair:
        plan = self.resolveParents(
            self.parentOf(left), self.parentOf(right))
        return CoercedPair(
            plan.parent,
            plan.leftMap(left),
            plan.rightMap(right),
        )

    def _apply(
        self,
        operator: str,
        left: Any,
        right: Any,
        parent: Parent,
    ) -> Any:
        if parent._kind == 'RDF':
            if operator == 'add':
                return runtime.native_add(left, right)
            if operator == 'sub':
                return runtime.native_sub(left, right)
            if operator == 'mul':
                return runtime.native_mul(left, right)
            if operator == 'truediv':
                return runtime.native_div(left, right)
        operation = self._operations.get(operator)
        if operation is runtime.undefined:
            raise TypeError(
                'operation ' + operator
                + ' is not defined in ' + str(parent)
            )
        return operation(left, right)

    def binOp(
        self, operator: str, left: Any, right: Any,
    ) -> Any:
        left_parent = runtime.undefined
        right_parent = runtime.undefined
        if (
            left is not None
            and runtime.jstype(left) == 'object'
        ):
            left_parent = runtime.reflect.get(
                left, '_parent')
        if (
            right is not None
            and runtime.jstype(right) == 'object'
        ):
            right_parent = runtime.reflect.get(
                right, '_parent')
        if (
            left_parent is not runtime.undefined
            and left_parent is right_parent
        ):
            return self._apply(
                operator, left, right, left_parent)
        operands = self.coercePair(left, right)
        return self._apply(
            operator,
            operands.left,
            operands.right,
            operands.parent,
        )

    def equals(self, left: Any, right: Any) -> bool:
        try:
            left_parent = runtime.undefined
            right_parent = runtime.undefined
            if (
                left is not None
                and runtime.jstype(left) == 'object'
            ):
                left_parent = runtime.reflect.get(
                    left, '_parent')
            if (
                right is not None
                and runtime.jstype(right) == 'object'
            ):
                right_parent = runtime.reflect.get(
                    right, '_parent')
            if (
                left_parent is not runtime.undefined
                and left_parent is right_parent
            ):
                method = runtime.reflect.get(left, '_eq_')
                if runtime.jstype(method) == 'function':
                    return method.call(left, right)
                return left is right
            operands = self.coercePair(left, right)
            method = runtime.reflect.get(
                operands.left, '_eq_')
            if runtime.jstype(method) == 'function':
                return method.call(
                    operands.left, operands.right)
            return operands.left is operands.right
        except Exception:
            return False


coercion_model = CoercionModel()


def _integer_to_rational(value: Any) -> Any:
    return runtime.rational_class(value, runtime.bigint(1))


coercion_model.register(ZZ, QQ, _integer_to_rational)


def modular_inverse(value: int, modulus: int) -> int:
    value = runtime.bigint(value)
    modulus = runtime.bigint(modulus)
    old_remainder = value
    remainder = modulus
    old_coefficient = runtime.bigint(1)
    coefficient = runtime.bigint(0)
    while remainder != 0:
        quotient = runtime.bigint_divexact(
            old_remainder, remainder)
        next_remainder = (
            old_remainder - quotient * remainder)
        next_coefficient = (
            old_coefficient - quotient * coefficient)
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    if old_remainder != 1:
        raise runtime.zero_division_error(
            'inverse of Mod(0, ' + str(modulus)
            + ') does not exist'
        )
    old_coefficient = runtime.native_mod(old_coefficient, modulus)
    if old_coefficient < 0:
        return runtime.native_add(old_coefficient, modulus)
    return old_coefficient


def modular_power(
    value: int, exponent: int, modulus: int,
) -> int:
    value = runtime.bigint(value)
    exponent = runtime.bigint(exponent)
    modulus = runtime.bigint(modulus)
    result = runtime.bigint(1)
    while exponent > 0:
        if runtime.native_bitand(exponent, runtime.bigint(1)):
            result = runtime.native_mod(
                runtime.native_mul(result, value), modulus)
        exponent = runtime.native_rshift(exponent, runtime.bigint(1))
        if exponent != 0:
            value = runtime.native_mod(
                runtime.native_mul(value, value), modulus)
    return result


def _freeze_tuple(
    values: list[Any],
    tuple_repr: Any,
    extra_properties: Any = None,
) -> Any:
    def tuple_add(other: Any) -> Any:
        if not runtime.array.isArray(other):
            if isinstance(other, runtime.tuple_builtin):
                other = other._tuple_values
            else:
                raise TypeError('can only concatenate tuple to tuple')
        elif not runtime.object.isFrozen(other):
            raise TypeError('can only concatenate tuple to tuple')
        combined = runtime.reflect.apply(
            runtime.array.prototype.concat, values, [other])
        return math_tuple(combined)

    def tuple_mul(other: Any) -> Any:
        count = int(other)
        answer = runtime.list_constructor()
        for _repeat in range(max(0, count)):
            for value in values:
                answer.append(value)
        return math_tuple(answer)

    def tuple_eq(other: Any) -> bool:
        if runtime.array.isArray(other):
            if not runtime.object.isFrozen(other):
                return False
            other_values = other
        elif isinstance(other, runtime.tuple_builtin):
            other_values = other._tuple_values
        else:
            return False
        if len(values) != len(other_values):
            return False
        for index in range(len(values)):
            if not runtime.equals(values[index], other_values[index]):
                return False
        return True

    def tuple_append(_value: Any) -> None:
        raise AttributeError(
            "'tuple' object has no attribute 'append'")

    properties = {
        '__add__': {'value': tuple_add},
        '__iadd__': {'value': tuple_add},
        '__eq__': {'value': tuple_eq},
        '__mul__': {'value': tuple_mul},
        '__rmul__': {'value': tuple_mul},
        '__repr__': {'value': tuple_repr},
        '__str__': {'value': tuple_repr},
        'append': {'value': tuple_append},
        'toString': {'value': tuple_repr},
    }
    if extra_properties is not None:
        runtime.object.assign(properties, extra_properties)
    runtime.object.defineProperties(values, properties)
    runtime.object.freeze(values)
    return values


def math_tuple(values: list[Any]) -> Any:
    # Tuple literals with two or more entries historically arrive as a raw
    # JavaScript array, whereas one-entry literals arrive as a decorated
    # Python list.  Normalize both representations before freezing.
    values = runtime.list_constructor(values)

    def tuple_repr() -> str:
        entries = [runtime.repr(value) for value in values]
        suffix = ',' if len(values) == 1 else ''
        entries_text = runtime.reflect.apply(
            runtime.array.prototype.join,
            entries,
            [', '],
        )
        return '(' + entries_text + suffix + ')'

    return _freeze_tuple(values, tuple_repr)


def named_tuple(
    values: list[Any],
    type_name: str,
    field_names: list[str],
) -> Any:
    """Construct an immutable tuple with named fields."""
    values = runtime.list_constructor(values)
    names = runtime.list_constructor(field_names)

    def tuple_repr() -> str:
        entries = []
        for index in range(len(names)):
            entries.append(
                names[index] + '=' + runtime.repr(values[index]))
        entries_text = runtime.reflect.apply(
            runtime.array.prototype.join,
            entries,
            [', '],
        )
        return type_name + '(' + entries_text + ')'

    def asdict() -> Any:
        answer = dict()
        for index in range(len(names)):
            answer.__setitem__(names[index], values[index])
        return answer

    properties = {
        '_fields': {'value': math_tuple(names)},
        '_asdict': {'value': asdict},
    }

    def make_field_getter(position: int) -> Any:
        def field_getter() -> Any:
            return values[position]

        return field_getter

    def immutable_field(_value: Any) -> None:
        raise AttributeError("can't set attribute")

    for index in range(len(names)):
        properties[names[index]] = {
            'enumerable': True,
            'get': make_field_getter(index),
            'set': immutable_field,
        }
    return _freeze_tuple(values, tuple_repr, properties)


class _ConstructionFunctor:

    def __init__(self, name: str) -> None:
        self._name = name

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__


QuotientFunctor = _ConstructionFunctor('QuotientFunctor')
runtime.object.freeze(QuotientFunctor)
AlgebraicExtensionFunctor = _ConstructionFunctor(
    'AlgebraicExtensionFunctor')
runtime.object.freeze(AlgebraicExtensionFunctor)


def is_math_element(value: Any) -> bool:
    return (
        value is not None
        and runtime.jstype(value) in ('object', 'function')
        and runtime.reflect.has(value, '_parent')
    )


def parent_of(value: Any) -> Parent:
    return coercion_model.parentOf(value)


_flint_state = {'backend': None}


def flint_backend() -> Any:
    if _flint_state['backend'] is None:
        _flint_state['backend'] = runtime.require_module(
            '@sagemath/sagejs-flint')
    return _flint_state['backend']


# Stable generated-runtime names used by the compiler and by older baselib
# modules which have not yet moved to ``sagejs.runtime``.
ρσ_is_exact_integer = is_exact_integer
ρσ_normalize_integer = normalize_integer
ρσ_integer_bigint = integer_bigint
ρσ_new_map = new_map
ρσ_string_primitive = string_primitive
ρσ_string_find = string_find
ρσ_bigint_gcd = bigint_gcd
ρσ_coercion_model = coercion_model
ρσ_modular_inverse = modular_inverse
ρσ_modular_power = modular_power
ρσ_math_tuple = math_tuple
ρσ_named_tuple = named_tuple
ρσ_is_math_element = is_math_element
ρσ_parent = parent_of
ρσ_flint_backend = flint_backend

parent = parent_of


runtime.set_class_repr(Parent, "<class 'Parent'>")
runtime.set_class_repr(Element, "<class 'Element'>")
