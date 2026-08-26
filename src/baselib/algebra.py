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


def _untyped(value: Any) -> Any:
    return value


def is_exact_integer(value: object) -> bool:
    return runtime.jstype(value) == "bigint" or (
        runtime.jstype(value) == "number" and runtime.number.isSafeInteger(value)
    )


def normalize_integer(value: Any) -> Any:
    value_type = runtime.jstype(value)
    if value_type == "number":
        if not runtime.number.isSafeInteger(value):
            raise TypeError("expected an exact integer")
        return value
    if value_type != "bigint":
        raise TypeError("expected an exact integer")
    if value <= runtime.bigint(
        runtime.number.MAX_SAFE_INTEGER
    ) and value >= runtime.bigint(runtime.number.MIN_SAFE_INTEGER):
        return runtime.number(value)
    return value


def integer_bigint(value: object) -> int:
    value_type = runtime.jstype(value)
    if value_type == "number":
        if not runtime.number.isSafeInteger(value):
            raise TypeError("expected an exact integer")
    elif value_type != "bigint":
        raise TypeError("expected an exact integer")
    return runtime.bigint(value)


def new_map() -> Any:
    return runtime.reflect.construct(runtime.map_class, [])


def string_primitive(value: object) -> str:
    return runtime.reflect.apply(runtime.string_class, runtime.undefined, [value])


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

    def _repr_option(self, key: str) -> bool:
        """Return parent metadata used when composing element representations."""
        if key == "element_is_atomic":
            return bool(getattr(self, "_element_is_atomic", False))
        if key in ["ascii_art", "element_ascii_art"]:
            return False
        raise ValueError("unknown representation option: " + key)

    def __getitem__(self, variable: Any) -> Any:
        if (
            isinstance(variable, (list, tuple))
            and len(variable) == 1
            and isinstance(variable[0], str)
        ):
            power_series_ring = runtime.reflect.get(
                runtime.global_object, "PowerSeriesRing"
            )
            if power_series_ring is not runtime.undefined:
                return power_series_ring(self, variable[0])
        return runtime.polynomial_ring(self, variable)

    def category(self) -> Category:
        kind = getattr(self, "_kind", None)
        if kind == "ZZ":
            return _integer_ring_category
        if kind in [
            "QQ",
            "GF",
            "GF_EXTENSION",
            "RDF",
            "CDF",
            "RealField",
            "ComplexField",
            "AA",
            "QQBAR",
        ]:
            return Fields()
        return Rings()


class Ring(Parent):
    """Base class for ring parents in the lightweight Sage.js hierarchy."""


class Field(Ring):
    """Base class for field parents in the lightweight Sage.js hierarchy."""


@runtime.lightweight_math_class
class Element:
    def __init__(self, parent: Parent) -> None:
        self._parent = parent

    def parent(self) -> Parent:
        return self._parent

    def __bool__(self) -> bool:
        """
        Report whether the element differs from the zero of its parent.

        Sage decides an element's truth by whether it is zero, so an element
        that prints as zero must not be true.  Without this an `if` on a ring
        element takes the branch for a nonzero value whatever it holds.
        """
        checker = getattr(self, "is_zero", None)
        if callable(checker):
            return not checker()
        try:
            answer = self == 0
        except Exception:
            return True
        if answer is True or answer is False:
            return not answer
        return True


class RingElement(Element):
    """Base class for elements represented by ring parents."""


@runtime.callable_instance_class
class IntegerRing(Ring):
    def __init__(self, name: str = "Integer Ring") -> None:
        Parent.__init__(self, name)
        self._kind = "ZZ"
        self._element_is_atomic = True

    def __call__(self, value: object) -> Any:
        candidate = _untyped(value)
        if (
            getattr(candidate, "_parent", None) is QQ
            and hasattr(candidate, "_numerator")
            and hasattr(candidate, "_denominator")
        ):
            if candidate._denominator != 1:
                raise TypeError("not an integer")
            value = candidate._numerator
        if not is_exact_integer(value) and hasattr(value, "lift"):
            lift = _untyped(value).lift
            if callable(lift):
                value = lift()
        return normalize_integer(value)


@runtime.callable_instance_class
class RationalField(Field):
    def __init__(self, name: str = "Rational Field") -> None:
        Parent.__init__(self, name)
        self._kind = "QQ"
        self._element_is_atomic = True

    def __call__(
        self,
        numerator: Any,
        denominator: Any = runtime.undefined,
    ) -> Any:
        if (
            denominator is runtime.undefined
            and runtime.jstype(numerator) == "object"
            and hasattr(numerator, "_parent")
            and numerator._parent is self
        ):
            return numerator
        return runtime.rational_class(numerator, denominator)

    def __contains__(self, value: object) -> bool:
        return (
            getattr(value, "_parent", None) is self
            or runtime.is_exact_integer(value)
            or isinstance(value, float)
            or getattr(
                getattr(value, "_parent", None),
                "_kind",
                None,
            )
            in ["RDF", "RealField"]
        )

    def zeta_function(
        self,
        prec: Any = 53,
        max_imaginary_part: Any = 0,
        algorithm: str = "auto",
    ) -> Any:
        if algorithm == "pari":
            raise NotImplementedError("algorithm='pari' is unavailable in Sage.js")
        if algorithm not in ("auto", "flint", "arb"):
            raise ValueError("Riemann zeta algorithm must be 'auto' or 'flint'")
        constructor = runtime.reflect.get(runtime.global_object, "RiemannZeta")
        if constructor is runtime.undefined:
            raise RuntimeError("the Riemann zeta evaluator is unavailable")
        return constructor(prec)


ZZ = IntegerRing("Integer Ring")
ZZ._kind = "ZZ"
QQ = RationalField("Rational Field")
QQ._kind = "QQ"


class Category:
    def __init__(
        self,
        name: str,
        accepted_kinds: list[str],
        is_field_category: bool = False,
    ) -> None:
        self._name = name
        self._accepted_kinds = accepted_kinds
        self._is_field_category = is_field_category

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__

    def __contains__(self, value: Any) -> bool:
        kind = getattr(value, "_kind", None)
        if kind in self._accepted_kinds:
            return True
        if self._is_field_category:
            return isinstance(value, Field)
        return isinstance(value, Ring)

    def is_subcategory(self, other: Any) -> bool:
        if self is other:
            return True
        if self._is_field_category and other is _rings_category:
            return True
        if self is _integer_ring_category and other is _rings_category:
            return True
        return False


_field_kinds = [
    "QQ",
    "GF",
    "GF_EXTENSION",
    "RDF",
    "CDF",
    "RealField",
    "ComplexField",
    "AA",
    "QQBAR",
]
_ring_kinds = [
    "QQ",
    "GF",
    "GF_EXTENSION",
    "RDF",
    "CDF",
    "RealField",
    "ComplexField",
    "AA",
    "QQBAR",
    "ZZ",
    "ZMOD",
    "POLYNOMIAL",
    "MULTIVARIATE_POLYNOMIAL",
    "POWER_SERIES",
]
_rings_category = Category("Category of rings", _ring_kinds)
_fields_category = Category("Category of fields", _field_kinds, True)
_integer_ring_category = Category(
    "Join of Category of Dedekind domains\n"
    "    and Category of euclidean domains\n"
    "    and Category of noetherian rings\n"
    "    and Category of infinite enumerated sets\n"
    "    and Category of metric spaces",
    ["ZZ"],
)


def Rings() -> Category:
    return _rings_category


def Fields() -> Category:
    return _fields_category


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
        self,
        parent: Parent,
        left: Any,
        right: Any,
    ) -> None:
        self.parent = parent
        self.left = left
        self.right = right


class CoercionModel:
    def __init__(self) -> None:
        self._maps = new_map()
        self._planCache = new_map()
        self._operations = new_map()
        self._operations.set("add", _add)
        self._operations.set("sub", _sub)
        self._operations.set("mul", _mul)
        self._operations.set("truediv", _truediv)

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
        self,
        left: Parent,
        right: Parent,
    ) -> CoercionPlan:
        rights = self._planCache.get(left)
        if rights is not runtime.undefined and rights.has(right):
            return rights.get(right)

        if left is right:
            return self._cache(
                left,
                right,
                CoercionPlan(left, _identity, _identity),
            )

        left_to_right = self._map(left, right)
        right_to_left = self._map(right, left)
        if (
            left_to_right is not runtime.undefined
            and right_to_left is runtime.undefined
        ):
            return self._cache(
                left,
                right,
                CoercionPlan(right, left_to_right, _identity),
            )
        if (
            right_to_left is not runtime.undefined
            and left_to_right is runtime.undefined
        ):
            return self._cache(
                left,
                right,
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
                target_precision = getattr(target, "_precision", -1)
                second_precision = -1
                for candidate in common[1:]:
                    precision = getattr(candidate, "_precision", -1)
                    if precision > target_precision:
                        second = target
                        second_precision = target_precision
                        target = candidate
                        target_precision = precision
                    elif precision > second_precision:
                        second = candidate
                        second_precision = precision
                if second is None or (
                    target._kind == second._kind
                    and target_precision != second_precision
                ):
                    return self._cache(
                        left,
                        right,
                        CoercionPlan(
                            target,
                            left_targets.get(target),
                            right_targets.get(target),
                        ),
                    )

        left_construction = left._construction
        right_construction = right._construction
        series_kinds = ["power_series", "laurent_series"]
        if (
            left_construction is not runtime.undefined
            and left_construction["kind"] in series_kinds
        ):
            if (
                right_construction is not runtime.undefined
                and right_construction["kind"] in series_kinds
            ):
                if (
                    left_construction["base"] is not right_construction["base"]
                    or left_construction["variable"] != right_construction["variable"]
                ):
                    raise TypeError("no canonical coercion between these series rings")
                target = left
                if right_construction["kind"] == "laurent_series":
                    target = right

                def coerce_left_series(value: Any) -> Any:
                    return _untyped(target)(value)

                def coerce_right_series(value: Any) -> Any:
                    return _untyped(target)(value)

                return self._cache(
                    left,
                    right,
                    CoercionPlan(
                        target,
                        coerce_left_series,
                        coerce_right_series,
                    ),
                )
            base_plan = self.resolveParents(left_construction["base"], right)
            if base_plan.parent is not left_construction["base"]:
                raise TypeError(
                    "constant does not canonically coerce to series base ring"
                )

            def coerce_left_series(value: Any) -> Any:
                return _untyped(left)(value)

            def coerce_right_series_constant(value: Any) -> Any:
                return _untyped(left)(base_plan.rightMap(value))

            return self._cache(
                left,
                right,
                CoercionPlan(
                    left,
                    coerce_left_series,
                    coerce_right_series_constant,
                ),
            )
        if (
            right_construction is not runtime.undefined
            and right_construction["kind"] in series_kinds
        ):
            base_plan = self.resolveParents(left, right_construction["base"])
            if base_plan.parent is not right_construction["base"]:
                raise TypeError(
                    "constant does not canonically coerce to series base ring"
                )

            def coerce_left_series_constant(value: Any) -> Any:
                return _untyped(right)(base_plan.leftMap(value))

            def coerce_right_series(value: Any) -> Any:
                return _untyped(right)(value)

            return self._cache(
                left,
                right,
                CoercionPlan(
                    right,
                    coerce_left_series_constant,
                    coerce_right_series,
                ),
            )
        if (
            left_construction is not runtime.undefined
            and left_construction["kind"] == "fraction_field"
        ):

            def coerce_right_fraction(value: Any) -> Any:
                return _untyped(left)(value)

            return self._cache(
                left,
                right,
                CoercionPlan(left, _identity, coerce_right_fraction),
            )
        if (
            right_construction is not runtime.undefined
            and right_construction["kind"] == "fraction_field"
        ):

            def coerce_left_fraction(value: Any) -> Any:
                return _untyped(right)(value)

            return self._cache(
                left,
                right,
                CoercionPlan(right, coerce_left_fraction, _identity),
            )
        if (
            left_construction is not runtime.undefined
            and left_construction["kind"] == "multivariate_polynomial"
        ):
            if (
                right_construction is not runtime.undefined
                and right_construction["kind"] == "multivariate_polynomial"
            ):
                if left is not right:
                    raise TypeError(
                        "no canonical coercion between these "
                        + "multivariate polynomial rings"
                    )
                return self._cache(
                    left,
                    right,
                    CoercionPlan(left, _identity, _identity),
                )

            def coerce_left_mpolynomial(value: Any) -> Any:
                return _untyped(left)._coercePolynomial(value)

            def coerce_right_mconstant(value: Any) -> Any:
                return _untyped(left)._constant(value)

            return self._cache(
                left,
                right,
                CoercionPlan(
                    left,
                    coerce_left_mpolynomial,
                    coerce_right_mconstant,
                ),
            )
        if (
            right_construction is not runtime.undefined
            and right_construction["kind"] == "multivariate_polynomial"
        ):

            def coerce_left_mconstant(value: Any) -> Any:
                return _untyped(right)._constant(value)

            def coerce_right_mpolynomial(value: Any) -> Any:
                return _untyped(right)._coercePolynomial(value)

            return self._cache(
                left,
                right,
                CoercionPlan(
                    right,
                    coerce_left_mconstant,
                    coerce_right_mpolynomial,
                ),
            )
        if (
            left_construction is not runtime.undefined
            and left_construction["kind"] == "polynomial"
        ):
            if (
                right_construction is not runtime.undefined
                and right_construction["kind"] == "polynomial"
            ):
                if left_construction["variable"] != right_construction["variable"]:
                    raise TypeError(
                        "no canonical coercion between polynomial rings in "
                        + left_construction["variable"]
                        + " and "
                        + right_construction["variable"]
                    )
                base_plan = self.resolveParents(
                    left_construction["base"],
                    right_construction["base"],
                )
                polynomial_parent = runtime.polynomial_ring(
                    base_plan.parent,
                    left_construction["variable"],
                )

                def coerce_left_polynomial(value: Any) -> Any:
                    return polynomial_parent._coercePolynomial(value)

                def coerce_right_polynomial(value: Any) -> Any:
                    return polynomial_parent._coercePolynomial(value)

                return self._cache(
                    left,
                    right,
                    CoercionPlan(
                        polynomial_parent,
                        coerce_left_polynomial,
                        coerce_right_polynomial,
                    ),
                )

            base_plan = self.resolveParents(left_construction["base"], right)
            polynomial_parent = runtime.polynomial_ring(
                base_plan.parent,
                left_construction["variable"],
            )

            def coerce_left_polynomial(value: Any) -> Any:
                return polynomial_parent._coercePolynomial(value)

            def coerce_right_constant(value: Any) -> Any:
                return polynomial_parent._constant(base_plan.rightMap(value))

            return self._cache(
                left,
                right,
                CoercionPlan(
                    polynomial_parent,
                    coerce_left_polynomial,
                    coerce_right_constant,
                ),
            )

        if (
            right_construction is not runtime.undefined
            and right_construction["kind"] == "polynomial"
        ):
            base_plan = self.resolveParents(left, right_construction["base"])
            polynomial_parent = runtime.polynomial_ring(
                base_plan.parent,
                right_construction["variable"],
            )

            def coerce_left_constant(value: Any) -> Any:
                return polynomial_parent._constant(base_plan.leftMap(value))

            def coerce_right_polynomial(value: Any) -> Any:
                return polynomial_parent._coercePolynomial(value)

            return self._cache(
                left,
                right,
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
                "ambiguous canonical coercion between "
                + str(left)
                + " and "
                + str(right)
            )
        raise TypeError(
            "no canonical coercion between " + str(left) + " and " + str(right)
        )

    def parentOf(self, value: Any) -> Parent:
        if is_exact_integer(value):
            return ZZ
        if isinstance(value, float):
            return runtime.reflect.get(runtime.global_object, "RDF")
        if (
            value is not None
            and runtime.jstype(value) in ("object", "function")
            and runtime.reflect.get(value, "_parent") is not runtime.undefined
        ):
            return value._parent
        raise TypeError("value has no mathematical parent")

    def coercePair(self, left: Any, right: Any) -> CoercedPair:
        plan = self.resolveParents(self.parentOf(left), self.parentOf(right))
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
        if runtime.strict_equal(parent._kind, "RDF"):
            if runtime.strict_equal(operator, "add"):
                return runtime.native_add(left, right)
            if runtime.strict_equal(operator, "sub"):
                return runtime.native_sub(left, right)
            if runtime.strict_equal(operator, "mul"):
                return runtime.native_mul(left, right)
            if runtime.strict_equal(operator, "truediv"):
                return runtime.native_div(left, right)
        operation = self._operations.get(operator)
        if operation is runtime.undefined:
            raise TypeError(
                "operation " + operator + " is not defined in " + str(parent)
            )
        return operation(left, right)

    def binOp(
        self,
        operator: str,
        left: Any,
        right: Any,
    ) -> Any:
        left_parent = runtime.undefined
        right_parent = runtime.undefined
        if left is not None and runtime.jstype(left) == "object":
            left_parent = runtime.reflect.get(left, "_parent")
        if right is not None and runtime.jstype(right) == "object":
            right_parent = runtime.reflect.get(right, "_parent")

        # Prime fields, extension fields, and residue rings are closed scalar
        # parents.  Same-parent operands need neither structured-action
        # probing nor a general coercion-plan lookup.
        if (
            left is not None
            and right is not None
            and left_parent is not runtime.undefined
            and left_parent is right_parent
        ):
            parent_kind = runtime.reflect.get(left_parent, "_kind")
            if (
                runtime.strict_equal(parent_kind, "GF")
                or runtime.strict_equal(parent_kind, "GF_EXTENSION")
                or runtime.strict_equal(parent_kind, "ZMOD")
            ):
                if runtime.strict_equal(operator, "add"):
                    return left._add_(right)
                if runtime.strict_equal(operator, "sub"):
                    return left._sub_(right)
                if runtime.strict_equal(operator, "mul"):
                    return left._mul_(right)
                if runtime.strict_equal(operator, "truediv"):
                    return left._truediv_(right)

        # Structured parents such as rectangular matrix spaces and vector
        # spaces are not closed under every operation: a 2x3 matrix times a
        # 3x4 matrix lives in a third parent. Let those elements describe the
        # action before applying the common-parent arithmetic model.
        left_action = runtime.undefined
        right_action = runtime.undefined
        if left is not None and runtime.jstype(left) == "object":
            left_action = runtime.reflect.get(left, "_sage_binop_")
        if runtime.jstype(left_action) == "function":
            return runtime.reflect.apply(left_action, left, [operator, right, False])
        if right is not None and runtime.jstype(right) == "object":
            right_action = runtime.reflect.get(right, "_sage_binop_")
        if runtime.jstype(right_action) == "function":
            return runtime.reflect.apply(right_action, right, [operator, left, True])

        if left_parent is not runtime.undefined and left_parent is right_parent:
            return self._apply(operator, left, right, left_parent)
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
            if left is not None and runtime.jstype(left) == "object":
                left_parent = runtime.reflect.get(left, "_parent")
            if right is not None and runtime.jstype(right) == "object":
                right_parent = runtime.reflect.get(right, "_parent")
            if left_parent is not runtime.undefined and left_parent is right_parent:
                method = runtime.reflect.get(left, "_eq_")
                if runtime.jstype(method) == "function":
                    return method.call(left, right)
                return left is right
            operands = self.coercePair(left, right)
            method = runtime.reflect.get(operands.left, "_eq_")
            if runtime.jstype(method) == "function":
                return method.call(operands.left, operands.right)
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
        quotient = runtime.bigint_divexact(old_remainder, remainder)
        next_remainder = old_remainder - quotient * remainder
        next_coefficient = old_coefficient - quotient * coefficient
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    if old_remainder != 1:
        raise runtime.zero_division_error(
            "inverse of Mod(0, " + str(modulus) + ") does not exist"
        )
    old_coefficient = runtime.native_mod(old_coefficient, modulus)
    if old_coefficient < 0:
        return runtime.native_add(old_coefficient, modulus)
    return old_coefficient


def modular_power(
    value: int,
    exponent: int,
    modulus: int,
) -> int:
    value = runtime.bigint(value)
    exponent = runtime.bigint(exponent)
    modulus = runtime.bigint(modulus)
    result = runtime.bigint(1)
    while exponent > 0:
        if runtime.native_bitand(exponent, runtime.bigint(1)):
            result = runtime.native_mod(runtime.native_mul(result, value), modulus)
        exponent = runtime.native_rshift(exponent, runtime.bigint(1))
        if exponent != 0:
            value = runtime.native_mod(runtime.native_mul(value, value), modulus)
    return result


@runtime.native_method
def _tuple_add(self: Any, other: Any) -> Any:
    if not runtime.array.isArray(other):
        if isinstance(other, runtime.tuple_builtin):
            other = other._tuple_values
        else:
            raise TypeError("can only concatenate tuple to tuple")
    elif not runtime.object.isFrozen(other):
        raise TypeError("can only concatenate tuple to tuple")
    combined = runtime.reflect.apply(runtime.array.prototype.concat, self, [other])
    return math_tuple(combined)


@runtime.native_method
def _tuple_mul(self: Any, other: Any) -> Any:
    if not runtime.is_exact_integer(other) and hasattr(other, "__rmul__"):
        return other.__rmul__(math_tuple(self))
    count = int(other)
    answer = runtime.list_constructor()
    for _repeat in range(max(0, count)):
        for value in self:
            answer.append(value)
    return math_tuple(answer)


@runtime.native_method
def _tuple_eq(self: Any, other: Any) -> bool:
    if runtime.array.isArray(other):
        if not runtime.object.isFrozen(other):
            return False
        other_values = other
    elif isinstance(other, runtime.tuple_builtin):
        other_values = other._tuple_values
    else:
        return False
    if len(self) != len(other_values):
        return False
    for index in range(len(self)):
        if not runtime.equals(self[index], other_values[index]):
            return False
    return True


@runtime.native_method
def _tuple_repr(self: Any) -> str:
    entries = [runtime.repr(value) for value in self]
    suffix = "," if len(self) == 1 else ""
    entries_text = runtime.reflect.apply(
        runtime.array.prototype.join,
        entries,
        [", "],
    )
    return "(" + entries_text + suffix + ")"


@runtime.native_method
def _tuple_append(self: Any, _value: Any) -> None:
    raise AttributeError("'tuple' object has no attribute 'append'")


@runtime.native_method
def _tuple_slice(self: Any, *slice_args: Any) -> Any:
    """Return a tuple when optimized subscripting delegates to JS `slice`."""
    values = runtime.reflect.apply(runtime.array.prototype.slice, self, slice_args)
    return math_tuple(values)


@runtime.native_method
def _tuple_index(
    self: Any,
    value: Any,
    start: int = 0,
    stop: Any = None,
) -> int:
    length = len(self)
    start = int(start)
    stop = length if stop is None else int(stop)
    if start < 0:
        start = max(0, length + start)
    if stop < 0:
        stop = max(0, length + stop)
    stop = min(length, stop)
    for index in range(start, stop):
        if runtime.equals(self[index], value):
            return index
    raise ValueError("tuple.index(x): x not in tuple")


_tuple_array_prototype_cache = runtime.undefined


def _tuple_array_prototype(
    seed_values: Any = runtime.undefined,
) -> Any:
    global _tuple_array_prototype_cache
    if _tuple_array_prototype_cache is runtime.undefined:
        decorated = (
            seed_values
            if runtime.array.isArray(seed_values)
            else runtime.list_constructor()
        )
        prototype = runtime.object.create(runtime.object.getPrototypeOf(decorated))
        properties = {
            "__add__": {"value": _tuple_add},
            "__iadd__": {"value": _tuple_add},
            "__eq__": {"value": _tuple_eq},
            "__mul__": {"value": _tuple_mul},
            "__rmul__": {"value": _tuple_mul},
            "__repr__": {"value": _tuple_repr},
            "__str__": {"value": _tuple_repr},
            "append": {"value": _tuple_append},
            "index": {"value": _tuple_index},
            "slice": {"value": _tuple_slice},
            "toString": {"value": _tuple_repr},
        }
        runtime.object.defineProperties(prototype, properties)
        _tuple_array_prototype_cache = prototype
    return _tuple_array_prototype_cache


def _freeze_tuple(
    values: list[Any],
    tuple_repr: Any = None,
    extra_properties: Any = None,
) -> Any:
    prototype = _tuple_array_prototype_cache
    if prototype is runtime.undefined:
        prototype = _tuple_array_prototype(values)
    if tuple_repr is not None or extra_properties is not None:
        properties = {
            "__repr__": {"value": tuple_repr},
            "__str__": {"value": tuple_repr},
            "toString": {"value": tuple_repr},
        }
        if extra_properties is not None:
            runtime.object.assign(properties, extra_properties)
        runtime.object.defineProperties(values, properties)
    return runtime.native_freeze_tuple(values, prototype)


def math_tuple(values: list[Any]) -> Any:
    # Compiler tuple literals and internal callers provide fresh arrays.
    # Reuse them so hot tuple construction does not copy and decorate a list
    # before replacing that decoration with immutable tuple behavior.
    if not runtime.array.isArray(values):
        values = runtime.list_constructor(values)
    prototype = _tuple_array_prototype_cache
    if prototype is runtime.undefined:
        prototype = _tuple_array_prototype(values)
    return runtime.native_freeze_tuple(values, prototype)


def _install_type_tuple_metadata() -> None:
    """Upgrade bootstrap type metadata to ordinary Python tuples.

    `builtins` must create `type.__bases__` and `type.__mro__` before
    the tuple runtime is initialized.  Once this module has installed tuple
    behavior, replace those bootstrap arrays with canonical tuples.
    """
    bases = math_tuple([object])
    mro = math_tuple([type, object])
    runtime.reflect.set(type, "__bases__", bases)
    runtime.reflect.set(type, "__mro__", mro)
    runtime.reflect.set(runtime.reflect.get(type, "prototype"), "__bases__", bases)


_install_type_tuple_metadata()


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
            entries.append(names[index] + "=" + runtime.repr(values[index]))
        entries_text = runtime.reflect.apply(
            runtime.array.prototype.join,
            entries,
            [", "],
        )
        return type_name + "(" + entries_text + ")"

    def asdict() -> Any:
        answer = dict()
        for index in range(len(names)):
            answer.__setitem__(names[index], values[index])
        return answer

    properties = {
        "_fields": {"value": math_tuple(names)},
        "_asdict": {"value": asdict},
    }

    def make_field_getter(position: int) -> Any:
        def field_getter() -> Any:
            return values[position]

        return field_getter

    def immutable_field(_value: Any) -> None:
        raise AttributeError("can't set attribute")

    for index in range(len(names)):
        properties[names[index]] = {
            "enumerable": True,
            "get": make_field_getter(index),
            "set": immutable_field,
        }
    return _freeze_tuple(values, tuple_repr, properties)


class _ConstructionFunctor:
    def __init__(self, name: str) -> None:
        self._name = name

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__


QuotientFunctor = _ConstructionFunctor("QuotientFunctor")
runtime.object.freeze(QuotientFunctor)
AlgebraicExtensionFunctor = _ConstructionFunctor("AlgebraicExtensionFunctor")
runtime.object.freeze(AlgebraicExtensionFunctor)


def is_math_element(value: Any) -> bool:
    value_type = runtime.jstype(value)
    return (
        value is not None
        and (
            runtime.strict_equal(value_type, "object")
            or runtime.strict_equal(value_type, "function")
        )
        and runtime.reflect.has(value, "_parent")
    )


def parent_of(value: Any) -> Parent:
    return coercion_model.parentOf(value)


_flint_state = {"backend": None}


def flint_backend() -> Any:
    if _flint_state["backend"] is None:
        _flint_state["backend"] = runtime.require_module("@sagemath/sagejs-flint")
    return _flint_state["backend"]


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
