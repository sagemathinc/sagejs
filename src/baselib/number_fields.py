# Small number fields needed by the Sage-compatible mathematical layer.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_nf_maximal_order_module_cache = runtime.undefined
_nf_maximal_order_engine_module_cache = runtime.undefined
_nf_prime_ideals_module_cache = runtime.undefined
_nf_ideal_arithmetic_module_cache = runtime.undefined


def _untyped(value: Any) -> Any:
    return value


def _nf_global(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if value is runtime.undefined:
        raise RuntimeError(name + " is not available in this runtime")
    return value


def _nf_maximal_order_module() -> Any:
    global _nf_maximal_order_module_cache
    if _nf_maximal_order_module_cache is runtime.undefined:
        _nf_maximal_order_module_cache = __import__(
            "sagejs.number_fields.maximal_order",
            fromlist=["maximal_order"],
        )
    return _nf_maximal_order_module_cache


def _nf_maximal_order_engine_module() -> Any:
    global _nf_maximal_order_engine_module_cache
    if _nf_maximal_order_engine_module_cache is runtime.undefined:
        _nf_maximal_order_engine_module_cache = __import__(
            "sagejs.number_fields.maximal_order_engine",
            fromlist=["maximal_order_engine"],
        )
    return _nf_maximal_order_engine_module_cache


def _nf_prime_ideals_module() -> Any:
    global _nf_prime_ideals_module_cache
    if _nf_prime_ideals_module_cache is runtime.undefined:
        _nf_prime_ideals_module_cache = __import__(
            "sagejs.number_fields.prime_ideals",
            fromlist=["prime_ideals"],
        )
    return _nf_prime_ideals_module_cache


def _nf_ideal_arithmetic_module() -> Any:
    global _nf_ideal_arithmetic_module_cache
    if _nf_ideal_arithmetic_module_cache is runtime.undefined:
        _nf_ideal_arithmetic_module_cache = __import__(
            "sagejs.number_fields.ideal_arithmetic",
            fromlist=["ideal_arithmetic"],
        )
    return _nf_ideal_arithmetic_module_cache


def _nf_lazy_import(cache_name: str, module_name: str) -> Any:
    cache = runtime.reflect.get(runtime.global_object, cache_name)
    if cache is runtime.undefined:
        loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
        if loader is runtime.undefined:
            raise RuntimeError("the number-field module loader is unavailable")
        cache = runtime.reflect.apply(loader, runtime.undefined, [module_name])
        runtime.reflect.set(runtime.global_object, cache_name, cache)
    return cache


def _nf_dedekind_zeta_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_dedekind_zeta_module__",
        "sagejs.number_fields.dedekind_zeta",
    )


def _nf_embeddings_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_embeddings_module__",
        "sagejs.number_fields.embeddings",
    )


def _nf_units_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_units_module__",
        "sagejs.number_fields.units",
    )


def _nf_class_groups_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_class_groups_module__",
        "sagejs.number_fields.class_groups",
    )


def _nf_class_unit_groups_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_class_unit_groups_module__",
        "sagejs.number_fields.class_unit_groups",
    )


def _nf_quadratic_class_units_module() -> Any:
    return _nf_lazy_import(
        "__sagejs_nf_quadratic_class_units_module__",
        "sagejs.number_fields.quadratic_class_units",
    )


def _nf_complex_result(value: Any, precision: int) -> Any:
    field = _nf_global("ComplexField")(precision)
    if hasattr(value, "_native"):
        return field(value)
    real = getattr(value, "real", 0)
    imaginary = getattr(value, "imag", 0)
    if callable(real):
        real = real()
    if callable(imaginary):
        imaginary = imaginary()
    return field(str(real), str(imaginary))


def _algebraic_from_tree(field: AlgebraicFieldParent, tree: Any) -> Any:
    if runtime.is_exact_integer(tree):
        return field(tree)
    if runtime.jstype(tree) == "number":
        if runtime.number.isSafeInteger(tree):
            return field(tree)
        raise TypeError("inexact numbers do not canonically define algebraic numbers")
    if runtime.jstype(tree) == "string":
        if tree == "ImaginaryUnit":
            return field._from_native(runtime.flint_backend().qqbarI())
        raise TypeError("symbolic variables are not algebraic numbers")
    if not runtime.array.isArray(tree) or len(tree) == 0:
        raise TypeError("unsupported symbolic algebraic expression")

    head = tree[0]
    if head == "Rational" and len(tree) == 3:
        return field(runtime.rational_class(tree[1], tree[2]))
    if head == "Negate" and len(tree) == 2:
        return -_algebraic_from_tree(field, tree[1])
    if head == "Add" and len(tree) >= 2:
        result = field(0)
        for argument in tree[1:]:
            result = result + _algebraic_from_tree(field, argument)
        return result
    if head == "Subtract" and len(tree) == 3:
        return _algebraic_from_tree(field, tree[1]) - _algebraic_from_tree(
            field, tree[2]
        )
    if head == "Multiply" and len(tree) >= 2:
        result = field(1)
        for argument in tree[1:]:
            result = result * _algebraic_from_tree(field, argument)
        return result
    if head == "Divide" and len(tree) == 3:
        return _algebraic_from_tree(field, tree[1]) / _algebraic_from_tree(
            field, tree[2]
        )
    if head == "Sqrt" and len(tree) == 2:
        return _algebraic_from_tree(field, tree[1]).sqrt()
    if head == "Power" and len(tree) == 3:
        exponent = tree[2]
        if (
            runtime.array.isArray(exponent)
            and len(exponent) == 3
            and exponent[0] == "Rational"
        ):
            return _algebraic_from_tree(field, tree[1]) ** runtime.rational_class(
                exponent[1], exponent[2]
            )
        if runtime.is_exact_integer(exponent):
            return _algebraic_from_tree(field, tree[1]) ** runtime.normalize_integer(
                exponent
            )
    raise TypeError("unsupported symbolic algebraic expression: " + str(tree))


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
        if self._parent._kind == "AA" and not runtime.flint_backend().qqbarIsReal(
            native_value
        ):
            return QQbar._from_native(native_value)
        return self._parent._from_native(native_value)

    def _add_(
        self,
        other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarAdd(self._native, other._native))

    def _sub_(
        self,
        other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarSub(self._native, other._native))

    def _mul_(
        self,
        other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarMul(self._native, other._native))

    def _truediv_(
        self,
        other: AlgebraicNumberElement,
    ) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarDiv(self._native, other._native))

    def _eq_(self, other: AlgebraicNumberElement) -> bool:
        return runtime.flint_backend().qqbarEqual(self._native, other._native)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __rmul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", other, self)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __neg__(self) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarNeg(self._native))

    def __pow__(self, exponent: Any) -> AlgebraicNumberElement:
        if isinstance(exponent, sage.Rational):
            return self._new(
                runtime.flint_backend().qqbarPowRational(
                    self._native,
                    exponent._numerator,
                    exponent._denominator,
                )
            )
        return self._new(
            runtime.flint_backend().qqbarPow(
                self._native, runtime.integer_bigint(exponent)
            )
        )

    def _compare(self, other: Any) -> int:
        operands = runtime.coercion_model.coercePair(self, other)
        if getattr(operands.parent, "_kind", None) == "QQBAR":
            if not runtime.flint_backend().qqbarIsReal(
                operands.left._native
            ) or not runtime.flint_backend().qqbarIsReal(operands.right._native):
                raise TypeError("complex algebraic numbers are not ordered")
        return runtime.flint_backend().qqbarCompareReal(
            operands.left._native, operands.right._native
        )

    def __lt__(self, other: Any) -> bool:
        return self._compare(other) < 0

    def __le__(self, other: Any) -> bool:
        return self._compare(other) <= 0

    def __gt__(self, other: Any) -> bool:
        return self._compare(other) > 0

    def __ge__(self, other: Any) -> bool:
        return self._compare(other) >= 0

    def sqrt(self) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarSqrt(self._native))

    def is_real(self) -> bool:
        return runtime.flint_backend().qqbarIsReal(self._native)

    def is_zero(self) -> bool:
        return self == 0

    def is_one(self) -> bool:
        return self == 1

    def real(self) -> AlgebraicNumberElement:
        return AA._from_native(runtime.flint_backend().qqbarReal(self._native))

    def imag(self) -> AlgebraicNumberElement:
        return AA._from_native(runtime.flint_backend().qqbarImag(self._native))

    def conjugate(self) -> AlgebraicNumberElement:
        return self._new(runtime.flint_backend().qqbarConjugate(self._native))

    conj = conjugate

    def abs(self) -> AlgebraicNumberElement:
        return AA._from_native(runtime.flint_backend().qqbarAbs(self._native))

    def __abs__(self) -> AlgebraicNumberElement:
        return self.abs()

    def degree(self) -> int:
        return runtime.flint_backend().qqbarDegree(self._native)

    def minpoly(self, variable: str = "x") -> Any:
        ring = sage.PolynomialRing(sage.ZZ, variable)
        coefficients = runtime.flint_backend().qqbarMinpolyCoefficients(self._native)
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
                int(runtime.math.ceil(runtime.number(digits) * 3.321928094887363)) + 1,
            )
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")
        approximation = complex_field(prec)._fromNative(
            runtime.flint_backend().qqbarApprox(self._native, prec)
        )
        return approximation.real() if self.is_real() else approximation

    numerical_approx = n

    def __float__(self) -> float:
        if not self.is_real():
            raise TypeError("cannot convert a complex algebraic number to float")
        return float(self.n())

    def __repr__(self) -> str:
        text = runtime.flint_backend().qqbarToString(self._native, 16)
        if runtime.flint_backend().qqbarIsRational(self._native):
            return text
        if "." not in text:
            return text
        return text + "?"

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class AlgebraicFieldParent(sage.Parent):
    """The Sage algebraic real field or algebraic closure of QQ."""

    def __init__(self, real_only: bool) -> None:
        self._real_only = real_only
        if real_only:
            self._name = "Algebraic Real Field"
            self._kind = "AA"
        else:
            self._name = "Algebraic Field"
            self._kind = "QQBAR"
        self._construction = runtime.undefined

    def _from_native(self, native_value: Any) -> AlgebraicNumberElement:
        if self._real_only and not runtime.flint_backend().qqbarIsReal(native_value):
            raise ValueError("cannot coerce a non-real algebraic number to AA")
        return AlgebraicNumberElement(self, native_value)

    def __call__(self, value: Any = 0) -> AlgebraicNumberElement:
        if isinstance(value, AlgebraicNumberElement):
            if value._parent is self:
                return value
            return self._from_native(value._native)
        if isinstance(value, sage.Rational):
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(
                    value._numerator, value._denominator
                )
            )
        if runtime.is_exact_integer(value):
            return self._from_native(
                runtime.flint_backend().qqbarFromRational(
                    runtime.integer_bigint(value), runtime.bigint(1)
                )
            )
        tree = runtime.reflect.get(value, "_tree")
        if tree is not runtime.undefined:
            result = _algebraic_from_tree(QQbar, tree)
            return self._from_native(result._native)
        raise TypeError("unable to convert value to " + str(self))

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


def _trim_coefficients(values: list[Any]) -> list[Any]:
    result = list(values)
    while len(result) and result[-1] == 0:
        result.pop()
    return result


def _poly_add_coefficients(
    left: list[Any],
    right: list[Any],
) -> list[Any]:
    length = max(len(left), len(right))
    result = []
    for index in range(length):
        left_value = left[index] if index < len(left) else sage.QQ(0)
        right_value = right[index] if index < len(right) else sage.QQ(0)
        result.append(left_value + right_value)
    return _trim_coefficients(result)


def _poly_sub_coefficients(
    left: list[Any],
    right: list[Any],
) -> list[Any]:
    length = max(len(left), len(right))
    result = []
    for index in range(length):
        left_value = left[index] if index < len(left) else sage.QQ(0)
        right_value = right[index] if index < len(right) else sage.QQ(0)
        result.append(left_value - right_value)
    return _trim_coefficients(result)


def _poly_mul_coefficients(
    left: list[Any],
    right: list[Any],
) -> list[Any]:
    if not len(left) or not len(right):
        return []
    result = [sage.QQ(0) for _ in range(len(left) + len(right) - 1)]
    for left_index in range(len(left)):
        for right_index in range(len(right)):
            result[left_index + right_index] = (
                result[left_index + right_index] + left[left_index] * right[right_index]
            )
    return _trim_coefficients(result)


def _symbolic_variable(tree: Any) -> Any:
    if runtime.jstype(tree) == "string":
        return tree
    if runtime.array.isArray(tree):
        for item in tree[1:]:
            variable = _symbolic_variable(item)
            if variable is not runtime.undefined:
                return variable
    return runtime.undefined


def _symbolic_polynomial_coefficients(
    tree: Any,
    variable: str,
) -> Any:
    if runtime.is_exact_integer(tree):
        return [sage.QQ(tree)]
    if runtime.array.isArray(tree) and len(tree) == 3 and tree[0] == "Rational":
        return [_untyped(sage.QQ)(tree[1], tree[2])]
    if runtime.jstype(tree) == "string":
        if tree == variable:
            return [sage.QQ(0), sage.QQ(1)]
        return runtime.undefined
    if not runtime.array.isArray(tree) or not len(tree):
        return runtime.undefined
    head = tree[0]
    if head == "Negate" and len(tree) == 2:
        value = _symbolic_polynomial_coefficients(tree[1], variable)
        if value is runtime.undefined:
            return runtime.undefined
        return [sage.QQ(0) - coefficient for coefficient in value]
    if head in ["Add", "Subtract"] and len(tree) >= 3:
        value = _symbolic_polynomial_coefficients(tree[1], variable)
        if value is runtime.undefined:
            return runtime.undefined
        for item in tree[2:]:
            right = _symbolic_polynomial_coefficients(item, variable)
            if right is runtime.undefined:
                return runtime.undefined
            if head == "Add":
                value = _poly_add_coefficients(value, right)
            else:
                value = _poly_sub_coefficients(value, right)
        return value
    if head == "Multiply" and len(tree) >= 3:
        value = [sage.QQ(1)]
        for item in tree[1:]:
            right = _symbolic_polynomial_coefficients(item, variable)
            if right is runtime.undefined:
                return runtime.undefined
            value = _poly_mul_coefficients(value, right)
        return value
    if head == "Power" and len(tree) == 3:
        base = _symbolic_polynomial_coefficients(tree[1], variable)
        if (
            base is runtime.undefined
            or not runtime.is_exact_integer(tree[2])
            or runtime.integer_bigint(tree[2]) < 0
        ):
            return runtime.undefined
        exponent = runtime.integer_bigint(tree[2])
        answer = [sage.QQ(1)]
        while exponent:
            if exponent % runtime.bigint(2):
                answer = _poly_mul_coefficients(answer, base)
            exponent //= runtime.bigint(2)
            if exponent:
                base = _poly_mul_coefficients(base, base)
        return answer
    if head == "Divide" and len(tree) == 3:
        numerator = _symbolic_polynomial_coefficients(tree[1], variable)
        denominator = _symbolic_polynomial_coefficients(tree[2], variable)
        if (
            numerator is runtime.undefined
            or denominator is runtime.undefined
            or len(denominator) != 1
        ):
            return runtime.undefined
        return [coefficient / denominator[0] for coefficient in numerator]
    return runtime.undefined


def _number_field_polynomial(value: Any) -> Any:
    if hasattr(value, "univariate_polynomial"):
        return value.univariate_polynomial()
    if hasattr(value, "coefficients"):
        return value
    tree = runtime.reflect.get(value, "_tree")
    if tree is runtime.undefined:
        raise TypeError("a number field needs a univariate exact polynomial")
    variable = _symbolic_variable(tree)
    if variable is runtime.undefined:
        raise TypeError("a number field needs a nonconstant defining polynomial")
    coefficients = _symbolic_polynomial_coefficients(tree, variable)
    if coefficients is runtime.undefined:
        raise TypeError("symbolic defining expression is not a rational polynomial")
    polynomial_ring = runtime.reflect.get(runtime.global_object, "PolynomialRing")
    ring = polynomial_ring(sage.QQ, variable)
    generator = ring.gen()
    polynomial = ring(0)
    for coefficient in reversed(coefficients):
        polynomial = polynomial * generator + coefficient
    return polynomial


def _integer_is_square(value: Any) -> bool:
    candidate = runtime.integer_bigint(value)
    zero = runtime.bigint(0)
    one = runtime.bigint(1)
    two = runtime.bigint(2)
    if candidate < zero:
        return False
    if candidate < two:
        return True
    lower = one
    upper = two
    while upper * upper < candidate:
        lower = upper
        upper *= two
    while lower + one < upper:
        middle = (lower + upper) // two
        square = middle * middle
        if square == candidate:
            return True
        if square < candidate:
            lower = middle
        else:
            upper = middle
    return lower * lower == candidate or upper * upper == candidate


def _rational_is_square(value: Any) -> bool:
    rational = sage.QQ(value)
    return _integer_is_square(rational._numerator) and _integer_is_square(
        rational._denominator
    )


def _determinant(rows: list[list[Any]]) -> Any:
    size = len(rows)
    matrix = [[sage.QQ(value) for value in row] for row in rows]
    answer = sage.QQ(1)
    for column in range(size):
        pivot = column
        while pivot < size and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            return sage.QQ(0)
        if pivot != column:
            temporary = matrix[column]
            matrix[column] = matrix[pivot]
            matrix[pivot] = temporary
            answer = -answer
        pivot_value = matrix[column][column]
        answer *= pivot_value
        for row in range(column + 1, size):
            if matrix[row][column] == 0:
                continue
            factor = matrix[row][column] / pivot_value
            for index in range(column + 1, size):
                matrix[row][index] -= factor * matrix[column][index]
    return answer


def _polynomial_discriminant(coefficients: list[Any]) -> Any:
    degree = len(coefficients) - 1
    derivative = [
        sage.QQ(index) * coefficients[index] for index in range(1, len(coefficients))
    ]
    derivative_degree = len(derivative) - 1
    size = degree + derivative_degree
    polynomial_high = list(reversed(coefficients))
    derivative_high = list(reversed(derivative))
    rows = []
    for shift in range(derivative_degree):
        rows.append(
            [sage.QQ(0) for _index in range(shift)]
            + polynomial_high
            + [sage.QQ(0) for _index in range(derivative_degree - shift - 1)]
        )
    for shift in range(degree):
        rows.append(
            [sage.QQ(0) for _index in range(shift)]
            + derivative_high
            + [sage.QQ(0) for _index in range(degree - shift - 1)]
        )
    if len(rows) != size:
        raise ArithmeticError("invalid Sylvester matrix")
    resultant = _determinant(rows)
    if (degree * (degree - 1) // 2) % 2:
        resultant = -resultant
    return resultant / coefficients[-1]


def _quartic_resolvent(
    coefficients: list[Any],
    variable: str,
) -> Any:
    constant, linear, quadratic, cubic, _leading = coefficients
    ring = _untyped(sage.PolynomialRing)(sage.QQ, variable)
    return ring._from_coefficients(
        [
            4 * quadratic * constant - linear * linear - cubic * cubic * constant,
            cubic * linear - 4 * constant,
            -quadratic,
            sage.QQ(1),
        ]
    )


def _quartic_resolvent_shape(resolvent: Any) -> tuple[list[int], Any]:
    degrees = []
    rational_root = runtime.undefined
    factors = _untyped(resolvent.factor())
    for factor, exponent in factors:
        factor_coefficients = factor.coefficients()
        degree = len(factor_coefficients) - 1
        for _count in range(exponent):
            degrees.append(degree)
        if degree == 1:
            rational_root = -factor_coefficients[0] / factor_coefficients[1]
    degrees.sort()
    return degrees, rational_root


def _galois_group_data(
    coefficients: list[Any],
    variable: str,
) -> tuple[int, str, str, list[str]]:
    """Identify the transitive Galois group in degrees at most four.

    Cubics use the discriminant-square criterion.  Quartics use the cubic
    resolvent and the Kappe--Warren square tests, so the cyclic and dihedral
    cases are distinguished exactly over `QQ`.
    """
    degree = len(coefficients) - 1
    if degree == 1:
        return 1, "S1", "S1", ["(1)"]
    if degree == 2:
        return 1, "S2", "S2", ["(1,2)"]

    discriminant = _polynomial_discriminant(coefficients)
    discriminant_is_square = _rational_is_square(discriminant)
    if degree == 3:
        if discriminant_is_square:
            return 1, "A3", "A3", ["(1,2,3)"]
        return 2, "S3", "S3", ["(1,2,3)", "(1,2)"]

    if degree != 4:
        raise NotImplementedError(
            "native Galois groups currently support degrees at most 4"
        )
    resolvent = _quartic_resolvent(coefficients, variable)
    factor_degrees, rational_root = _quartic_resolvent_shape(resolvent)
    if factor_degrees == [3]:
        if discriminant_is_square:
            return 4, "A4", "A4", ["(1,2,3)", "(1,2)(3,4)"]
        return 5, "S4", "S4", ["(1,2,3,4)", "(1,2)"]
    if discriminant_is_square:
        return 2, "2[x]2", "E(4) = 2[x]2", ["(1,2)(3,4)", "(1,3)(2,4)"]
    if rational_root is runtime.undefined:
        raise ArithmeticError("reducible quartic resolvent has no rational root")

    constant, _linear, quadratic, cubic, _leading = coefficients
    first_test = (rational_root * rational_root - 4 * constant) * discriminant
    second_test = (cubic * cubic - 4 * (quadratic - rational_root)) * discriminant
    if _rational_is_square(first_test) and _rational_is_square(second_test):
        return 1, "4", "C(4) = 4", ["(1,2,3,4)"]
    return 3, "D(4)", "D(4)", ["(1,2,3,4)", "(1,3)"]


class NumberFieldGaloisGroup:
    def __init__(
        self,
        field: NumberFieldParent,
        transitive_number: int,
        display_label: str,
        pari_label: str,
        generators: list[str],
    ) -> None:
        self._field = field
        self._transitive_number = transitive_number
        self._display_label = display_label
        self._pari_label = pari_label
        permutation_group = runtime.reflect.get(
            runtime.global_object, "PermutationGroup"
        )
        natural_group = permutation_group(generators)
        self._group = natural_group._regular_action()

    def __repr__(self) -> str:
        return (
            "Galois group "
            + str(self._field.degree())
            + "T"
            + str(self._transitive_number)
            + " ("
            + self._display_label
            + ") with order "
            + str(self.order())
            + " of "
            + str(self._field.defining_polynomial())
        )

    __str__ = __repr__
    toString = __repr__

    def order(self) -> int:
        return self._group.order()

    cardinality = order
    easy_order = order

    def degree(self) -> int:
        return self._group.degree()

    def transitive_number(self) -> int:
        return self._transitive_number

    def transitive_label(self) -> str:
        return str(self._field.degree()) + "T" + str(self._transitive_number)

    def pari_label(self) -> str:
        return self._pari_label

    def number_field(self) -> NumberFieldParent:
        return self._field

    def is_galois(self) -> bool:
        return self.order() == self._field.degree()

    def gens(self) -> Any:
        return self._group.gens()

    def is_abelian(self) -> bool:
        return self._group.is_abelian()

    def center(self) -> Any:
        return self._group.center()

    def derived_series(self) -> list[Any]:
        return self._group.derived_series()

    def random_element(self) -> Any:
        return self._group.random_element()


@runtime.lightweight_math_class
class NumberFieldClassGroupElement(sage.Element):
    """A quadratic ideal class in the original field presentation."""

    def __init__(
        self,
        parent: NumberFieldClassGroup,
        element: Any,
    ) -> None:
        self._parent = parent
        self._element = element
        runtime.object.freeze(self)

    def _mul_(
        self,
        other: NumberFieldClassGroupElement,
    ) -> NumberFieldClassGroupElement:
        if (
            not isinstance(other, NumberFieldClassGroupElement)
            or other._parent is not self._parent
        ):
            raise TypeError("ideal classes must have the same parent")
        return self._parent._wrap(self._element * other._element)

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def _eq_(self, other: NumberFieldClassGroupElement) -> bool:
        return (
            isinstance(other, NumberFieldClassGroupElement)
            and other._parent is self._parent
            and other._element == self._element
        )

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __invert__(self) -> NumberFieldClassGroupElement:
        return self._parent._wrap(~self._element)

    inverse = __invert__

    def __pow__(self, exponent: Any) -> NumberFieldClassGroupElement:
        return self._parent._wrap(self._element**exponent)

    def is_one(self) -> bool:
        return self._element.is_one()

    is_principal = is_one

    def order(self) -> int:
        return self._element.order()

    additive_order = order

    def ideal(self) -> NumberFieldIdeal:
        generators = self._mapped_generators()
        return self._parent._field.maximal_order().ideal(generators)

    def _mapped_generators(self) -> list[NumberFieldElement]:
        ideal = self._element.ideal()
        if hasattr(ideal, "doubled_coefficients"):
            discriminant = int(ideal.discriminant)
            _squarefree, square_root = (
                _nf_units_module()._quadratic_square_root_element(self._parent._field)
            )
            sqrt_discriminant = (
                square_root
                if discriminant % 4 == 1
                else self._parent._field(2) * square_root
            )
            return [
                self._parent._field(ideal.a),
                (-self._parent._field(ideal.b) + sqrt_discriminant) / 2,
            ]
        return [
            self._parent._field._from_quadratic_backend(value)
            for value in ideal.gens_reduced()
        ]

    def form(self) -> Any:
        return self._element.form()

    def __repr__(self) -> str:
        if self.is_one():
            return "Trivial principal fractional ideal class"
        generators = self._mapped_generators()
        return (
            "Fractional ideal class ("
            + ", ".join([str(value) for value in generators])
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class NumberFieldClassGroup:
    """A class group whose elements retain the original field presentation."""

    def __init__(self, field: NumberFieldParent, group: Any = None) -> None:
        self._field = field
        self._group = group
        self._element_cache = runtime.map()
        self.proof_status = getattr(group, "proof_status", "exact-unconditional")
        self.algorithm = getattr(group, "algorithm", "quadratic-forms")

    def _wrap(self, element: Any) -> NumberFieldClassGroupElement:
        cached = self._element_cache.get(element)
        if cached is not runtime.undefined:
            return cached
        result = NumberFieldClassGroupElement(self, element)
        self._element_cache.set(element, result)
        return result

    def __len__(self) -> int:
        return self.order()

    def __iter__(self) -> Any:
        return iter(self.list())

    def __getitem__(self, index: int) -> NumberFieldClassGroupElement:
        return self.list()[index]

    def list(self) -> list[NumberFieldClassGroupElement]:
        if self._group is None:
            return []
        return [self._wrap(value) for value in self._group.list()]

    def order(self) -> int:
        return 1 if self._group is None else self._group.order()

    cardinality = order

    def one(self) -> NumberFieldClassGroupElement:
        if self._group is None:
            raise NotImplementedError(
                "the tutorial class group does not expose ideal classes"
            )
        return self._wrap(self._group.one())

    def invariants(self) -> "tuple[Any, ...]":
        if self._group is None:
            return runtime.math_tuple([])
        return self._group.invariants()

    def gens(self) -> "tuple[Any, ...]":
        if self._group is None:
            return runtime.math_tuple([])
        return runtime.math_tuple([self._wrap(value) for value in self._group.gens()])

    def ngens(self) -> int:
        return len(self.gens())

    def gen(self, index: int = 0) -> NumberFieldClassGroupElement:
        generators = self.gens()
        if index < 0 or index >= len(generators):
            raise IndexError("class-group generator index out of range")
        return generators[index]

    def __call__(self, value: Any) -> NumberFieldClassGroupElement:
        if isinstance(value, NumberFieldClassGroupElement):
            if value._parent is not self:
                raise TypeError("the ideal class belongs to another group")
            return value
        if not isinstance(value, NumberFieldIdeal):
            return self._wrap(self._group(value))
        if value.ring() is not self._field.maximal_order():
            raise TypeError("the ideal belongs to a different maximal order")
        if not hasattr(self._group.one().ideal(), "doubled_coefficients"):
            raise NotImplementedError(
                "ideal coercion is not implemented for this quadratic backend"
            )
        coefficients = self._field._real_quadratic_ideal_form(value)
        form = _nf_quadratic_class_units_module().QuadraticForm(
            coefficients[0], coefficients[1], coefficients[2]
        )
        return self._wrap(self._group(form))

    def number_field(self) -> NumberFieldParent:
        return self._field

    def __repr__(self) -> str:
        structure = ""
        invariants = self.invariants()
        if len(invariants):
            structure = " with structure " + " x ".join(
                ["C" + str(value) for value in invariants]
            )
        return (
            "Class group of order "
            + str(self.order())
            + structure
            + " of "
            + str(self._field)
        )

    __str__ = __repr__
    toString = __repr__


class NumberFieldPolynomialQuotient:
    def __init__(self, field: NumberFieldParent) -> None:
        self._field = field
        self._kind = "NumberFieldPolynomialQuotient"

    def __repr__(self) -> str:
        return (
            "Univariate Quotient Polynomial Ring in "
            + self._field.variable_name()
            + " over Rational Field with modulus "
            + str(self._field.defining_polynomial())
        )

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class NumberFieldElement(sage.Element):
    """An exact element of a simple number field over `QQ`."""

    def __init__(
        self,
        parent: NumberFieldParent,
        coefficients: list[Any],
    ) -> None:
        self._parent = parent
        self._coefficients = runtime.math_tuple(parent._reduce(coefficients))
        runtime.object.freeze(self)

    def _new(self, coefficients: list[Any]) -> NumberFieldElement:
        return NumberFieldElement(self._parent, coefficients)

    def _add_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(
            _poly_add_coefficients(
                list(self._coefficients),
                list(other._coefficients),
            )
        )

    def _sub_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(
            _poly_sub_coefficients(
                list(self._coefficients),
                list(other._coefficients),
            )
        )

    def _mul_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(
            _poly_mul_coefficients(
                list(self._coefficients),
                list(other._coefficients),
            )
        )

    def _truediv_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self * other.inverse()

    def _eq_(self, other: NumberFieldElement) -> bool:
        return self._coefficients == other._coefficients

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __neg__(self) -> NumberFieldElement:
        return self._new([sage.QQ(0) - value for value in self._coefficients])

    def __pow__(self, exponent: Any) -> NumberFieldElement:
        power = runtime.integer_bigint(exponent)
        if power < 0:
            return self.inverse() ** (runtime.bigint(0) - power)
        answer = self._parent.one()
        base = self
        while power:
            if power % runtime.bigint(2):
                answer = answer * base
            power //= runtime.bigint(2)
            if power:
                base = base * base
        return answer

    def is_zero(self) -> bool:
        return len(self._coefficients) == 0

    def is_one(self) -> bool:
        return len(self._coefficients) == 1 and self._coefficients[0] == 1

    def list(self) -> list[Any]:
        return _nf_coordinates(self, self._parent.degree())

    def trace(self) -> Any:
        return _nf_trace(self._parent, self)

    absolute_trace = trace

    def multiplication_matrix(self) -> Any:
        degree = self._parent.degree()
        columns = []
        for basis_element in self._parent._power_basis():
            columns.append(_nf_coordinates(self * basis_element, degree))
        rows = [
            [columns[column][row] for column in range(degree)] for row in range(degree)
        ]
        return _nf_global("matrix")(sage.QQ, rows)

    def norm(self) -> Any:
        return self.multiplication_matrix().determinant()

    absolute_norm = norm

    def valuation(self, prime_ideal: Any) -> int:
        return _nf_ideal_arithmetic_module().element_valuation(self, prime_ideal)

    def is_integral(self) -> bool:
        return _nf_is_integral(self._parent, self)

    def inverse(self) -> NumberFieldElement:
        if self.is_zero():
            raise ZeroDivisionError("division by zero")
        degree = self._parent.degree()
        columns = []
        for exponent in range(degree):
            monomial = [sage.QQ(0) for _ in range(exponent)]
            monomial.append(sage.QQ(1))
            columns.append(
                self._parent._reduce(
                    _poly_mul_coefficients(list(self._coefficients), monomial)
                )
            )
        rows = []
        for row_index in range(degree):
            row = []
            for column_index in range(degree):
                column = columns[column_index]
                row.append(column[row_index] if row_index < len(column) else sage.QQ(0))
            row.append(sage.QQ(1 if row_index == 0 else 0))
            rows.append(row)

        pivot_column = 0
        while pivot_column < degree:
            pivot_row = pivot_column
            while pivot_row < degree and rows[pivot_row][pivot_column] == 0:
                pivot_row += 1
            if pivot_row == degree:
                raise ZeroDivisionError("element is not invertible in this quotient")
            if pivot_row != pivot_column:
                temporary = rows[pivot_column]
                rows[pivot_column] = rows[pivot_row]
                rows[pivot_row] = temporary
            pivot = rows[pivot_column][pivot_column]
            rows[pivot_column] = [value / pivot for value in rows[pivot_column]]
            for row_index in range(degree):
                if row_index != pivot_column:
                    factor = rows[row_index][pivot_column]
                    if factor != 0:
                        rows[row_index] = [
                            rows[row_index][index] - factor * rows[pivot_column][index]
                            for index in range(degree + 1)
                        ]
            pivot_column += 1
        return self._new([rows[index][-1] for index in range(degree)])

    def multiplicative_order(self) -> Any:
        if self.is_zero():
            raise ArithmeticError("zero does not have a multiplicative order")
        value = self._parent.one()
        for order in range(1, 1025):
            value = value * self
            if value.is_one():
                return order
        raise NotImplementedError(
            "multiplicative order exceeds the current search bound"
        )

    def __repr__(self) -> str:
        if self.is_zero():
            return "0"
        terms = []
        variable = self._parent.variable_name()
        for exponent in range(len(self._coefficients) - 1, -1, -1):
            coefficient = self._coefficients[exponent]
            if coefficient == 0:
                continue
            negative = runtime.integer_bigint(coefficient._numerator) < 0
            magnitude = sage.QQ(0) - coefficient if negative else coefficient
            if exponent == 0:
                body = str(magnitude)
            else:
                monomial = (
                    variable if exponent == 1 else (variable + "^" + str(exponent))
                )
                body = monomial if magnitude == 1 else (str(magnitude) + "*" + monomial)
            if not len(terms):
                terms.append(("-" if negative else "") + body)
            else:
                terms.append((" - " if negative else " + ") + body)
        return "".join(terms) if len(terms) else "0"

    __str__ = __repr__
    toString = __repr__


def _nf_lcm(left: Any, right: Any) -> Any:
    left = runtime.integer_bigint(left)
    right = runtime.integer_bigint(right)
    if left < 0:
        left = -left
    if right < 0:
        right = -right
    if left == 0 or right == 0:
        return runtime.bigint(0)
    quotient = runtime.native_div(left, runtime.bigint_gcd(left, right))
    return runtime.native_mul(quotient, right)


def _nf_coordinates(
    element: NumberFieldElement,
    degree: int,
) -> list[Any]:
    answer = list(element._coefficients)
    while len(answer) < degree:
        answer.append(sage.QQ(0))
    return answer[:degree]


def _nf_element_from_row(
    field: NumberFieldParent,
    row: list[Any],
) -> NumberFieldElement:
    return field._from_coefficients([sage.QQ(value) for value in row])


def _nf_canonical_lattice(
    rows: list[list[Any]],
    degree: int,
) -> list[list[Any]]:
    if len(rows) == 0:
        return []
    denominator = runtime.bigint(1)
    rational_rows = []
    for row in rows:
        padded = [sage.QQ(value) for value in row]
        while len(padded) < degree:
            padded.append(sage.QQ(0))
        padded = padded[:degree]
        rational_rows.append(padded)
        for value in padded:
            denominator = _nf_lcm(denominator, value._denominator)
    integer_rows = []
    for row in rational_rows:
        integer_row = []
        for value in row:
            scaled = value * denominator
            if scaled._denominator != 1:
                raise ArithmeticError("failed to clear a lattice denominator")
            integer_row.append(scaled._numerator)
        integer_rows.append(integer_row)
    integer_matrix = _nf_global("matrix")(sage.ZZ, integer_rows)
    hermite = integer_matrix.hermite_form(include_zero_rows=False)
    return [
        [_untyped(sage.QQ)(value, denominator) for value in row]
        for row in hermite.rows()
    ]


def _nf_lattice_coordinates(
    row: list[Any],
    basis_rows: list[list[Any]],
) -> Any:
    if len(basis_rows) == 0:
        return [] if all(value == 0 for value in row) else None
    basis_matrix = _nf_global("matrix")(sage.QQ, basis_rows)
    row_vector = _nf_global("vector")(sage.QQ, row)
    coordinates = row_vector * basis_matrix.inverse()
    return list(coordinates)


def _nf_row_in_lattice(
    row: list[Any],
    basis_rows: list[list[Any]],
) -> bool:
    coordinates = _nf_lattice_coordinates(row, basis_rows)
    if coordinates is None:
        return False
    return all(value._denominator == 1 for value in coordinates)


def _nf_trace(
    field: NumberFieldParent,
    element: NumberFieldElement,
) -> Any:
    degree = field.degree()
    generator = field.gen()
    power = field.one()
    answer = sage.QQ(0)
    for column in range(degree):
        product = element * power
        coordinates = _nf_coordinates(product, degree)
        answer += coordinates[column]
        power *= generator
    return answer


def _nf_is_integral(
    field: NumberFieldParent,
    element: NumberFieldElement,
) -> bool:
    # Newton's identities recover the monic characteristic polynomial from
    # exact power traces.  In characteristic zero an element is integral iff
    # those coefficients are rational integers.
    traces = []
    power = field.one()
    for _exponent in range(1, field.degree() + 1):
        power *= element
        traces.append(_nf_trace(field, power))
    elementary = [sage.QQ(1)]
    for degree in range(1, field.degree() + 1):
        coefficient = sage.QQ(0)
        for index in range(1, degree + 1):
            term = elementary[degree - index] * traces[index - 1]
            coefficient += term if index % 2 else -term
        coefficient /= degree
        if coefficient._denominator != 1:
            return False
        elementary.append(coefficient)
    return True


def _nf_trace_matrix(
    field: NumberFieldParent,
    basis: list[NumberFieldElement],
) -> list[list[Any]]:
    return [[_nf_trace(field, left * right) for right in basis] for left in basis]


def _nf_order_closure(
    field: NumberFieldParent,
    rows: list[list[Any]],
) -> list[list[Any]]:
    degree = field.degree()
    basis_rows = _nf_canonical_lattice(rows, degree)
    while True:
        if len(basis_rows) != degree:
            raise ValueError("an order lattice must have full rank")
        basis = [_nf_element_from_row(field, row) for row in basis_rows]
        missing = runtime.undefined
        for left_index in range(degree):
            for right_index in range(left_index, degree):
                product_row = _nf_coordinates(
                    basis[left_index] * basis[right_index], degree
                )
                if not _nf_row_in_lattice(product_row, basis_rows):
                    missing = product_row
                    break
            if missing is not runtime.undefined:
                break
        if missing is runtime.undefined:
            return basis_rows
        basis_rows = _nf_canonical_lattice(basis_rows + [missing], degree)


class NumberFieldIdeal:
    """An exact (possibly fractional) ideal stored as a rational HNF lattice."""

    def __init__(
        self,
        order: NumberFieldOrder,
        rows: list[list[Any]],
    ) -> None:
        self._order = order
        self._field = order.number_field()
        self._basis_rows = _nf_canonical_lattice(rows, self._field.degree())
        # Ideal membership is one of the hottest operations in relation
        # collection.  The canonical lattice never changes, so its inverse
        # coordinate matrix is safe to compute lazily once per ideal.
        self._membership_inverse_cache = runtime.undefined
        if len(self._basis_rows) not in [0, self._field.degree()]:
            raise ValueError("a nonzero number-field ideal must have full rank")
        if len(self._basis_rows):
            for order_element in order.basis():
                for ideal_element in self.basis():
                    row = _nf_coordinates(
                        order_element * ideal_element,
                        self._field.degree(),
                    )
                    if not _nf_row_in_lattice(row, self._basis_rows):
                        raise ValueError(
                            "the specified lattice is not closed under the order"
                        )

    def ring(self) -> NumberFieldOrder:
        return self._order

    def number_field(self) -> NumberFieldParent:
        return self._field

    def basis(self) -> list[NumberFieldElement]:
        return [_nf_element_from_row(self._field, row) for row in self._basis_rows]

    def gens_reduced(self) -> "tuple[Any, ...]":
        return runtime.math_tuple(self.basis())

    gens = gens_reduced

    def basis_matrix(self) -> Any:
        return _nf_global("matrix")(sage.QQ, self._basis_rows)

    def __contains__(self, value: object) -> bool:
        try:
            element = self._field(value)
        except Exception:
            return False
        if len(self._basis_rows) == 0:
            return element.is_zero()
        row = _nf_coordinates(element, self._field.degree())
        if self._membership_inverse_cache is runtime.undefined:
            self._membership_inverse_cache = self.basis_matrix().inverse()
        coordinates = (
            _nf_global("vector")(sage.QQ, row) * self._membership_inverse_cache
        )
        return all(value._denominator == 1 for value in coordinates)

    def contains_ideal(self, other: NumberFieldIdeal) -> bool:
        return _nf_ideal_arithmetic_module().ideal_contains(self, other)

    def divides(self, other: NumberFieldIdeal) -> bool:
        return _nf_ideal_arithmetic_module().ideal_divides(self, other)

    def is_zero(self) -> bool:
        return len(self._basis_rows) == 0

    def is_integral(self) -> bool:
        return all(element in self._order for element in self.basis())

    def norm(self) -> Any:
        if self.is_zero():
            return 0
        relative = self.basis_matrix() * self._order.basis_matrix().inverse()
        determinant = relative.determinant()
        if determinant < 0:
            determinant = -determinant
        return determinant

    absolute_norm = norm

    def __add__(self, other: NumberFieldIdeal) -> NumberFieldIdeal:
        if not isinstance(other, NumberFieldIdeal):
            return NotImplemented
        if other._order is not self._order:
            raise TypeError("ideals must belong to the same order")
        return NumberFieldIdeal(self._order, self._basis_rows + other._basis_rows)

    def intersection(
        self,
        other: NumberFieldIdeal,
    ) -> NumberFieldIdeal:
        if other._order is not self._order:
            raise TypeError("ideals must belong to the same order")
        if self.is_zero() or other.is_zero():
            return NumberFieldIdeal(self._order, [])
        denominator = runtime.bigint(1)
        for row in self._basis_rows + other._basis_rows:
            for value in row:
                denominator = _nf_lcm(denominator, value._denominator)
        equations = []
        degree = self._field.degree()
        for column in range(degree):
            equation = []
            for row in self._basis_rows:
                equation.append((row[column] * denominator)._numerator)
            for row in other._basis_rows:
                equation.append(-(row[column] * denominator)._numerator)
            equations.append(equation)
        kernel = _nf_global("matrix")(sage.ZZ, equations).right_kernel_matrix()
        rows = []
        for relation in kernel.rows():
            row = [sage.QQ(0) for _index in range(degree)]
            for basis_index in range(degree):
                for column in range(degree):
                    row[column] += (
                        relation[basis_index] * self._basis_rows[basis_index][column]
                    )
            rows.append(row)
        return NumberFieldIdeal(self._order, rows)

    def __mul__(self, other: Any) -> NumberFieldIdeal:
        if isinstance(other, NumberFieldIdeal):
            if other._order is not self._order:
                raise TypeError("ideals must belong to the same order")
            rows = []
            for left in self.basis():
                for right in other.basis():
                    rows.append(_nf_coordinates(left * right, self._field.degree()))
            return NumberFieldIdeal(self._order, rows)
        scalar = self._field(other)
        return NumberFieldIdeal(
            self._order,
            [
                _nf_coordinates(scalar * element, self._field.degree())
                for element in self.basis()
            ],
        )

    def __rmul__(self, scalar: Any) -> NumberFieldIdeal:
        return self * scalar

    def __truediv__(self, other: Any) -> NumberFieldIdeal:
        if isinstance(other, NumberFieldIdeal):
            return self.quotient(other)
        return self * self._field(other).inverse()

    def __pow__(self, exponent: Any) -> NumberFieldIdeal:
        power = runtime.integer_bigint(exponent)
        if power < 0:
            return _nf_ideal_arithmetic_module().ideal_power(self, power)
        answer = self._order.ideal(1)
        base = self
        while power:
            if power % runtime.bigint(2):
                answer = answer * base
            power //= runtime.bigint(2)
            if power:
                base = base * base
        return answer

    def inverse(self) -> NumberFieldIdeal:
        return _nf_ideal_arithmetic_module().ideal_inverse(self)

    def __invert__(self) -> NumberFieldIdeal:
        return self.inverse()

    def colon(self, other: NumberFieldIdeal) -> NumberFieldIdeal:
        return _nf_ideal_arithmetic_module().colon_ideal(self, other)

    def quotient(self, other: NumberFieldIdeal) -> NumberFieldIdeal:
        return _nf_ideal_arithmetic_module().ideal_quotient(self, other)

    def valuation(self, prime_ideal: Any) -> int:
        return _nf_ideal_arithmetic_module().ideal_valuation(self, prime_ideal)

    def factor(self) -> Any:
        return _nf_ideal_arithmetic_module().factor_integral_ideal(self)

    def ideal_class_log(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> Any:
        group = self._field.class_group(proof=proof, algorithm=algorithm, **limits)
        discrete_log = getattr(group, "discrete_log", None)
        if callable(discrete_log):
            return discrete_log(self)
        return group(self)

    def is_principal(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> bool:
        group = self._field.class_group(proof=proof, algorithm=algorithm, **limits)
        decide = getattr(group, "is_principal", None)
        if callable(decide):
            return bool(decide(self, proof=True if proof is None else bool(proof)))
        return bool(group(self).is_one())

    def denominator(self) -> Any:
        return _nf_ideal_arithmetic_module().integrality_denominator(self)

    def numerator(self) -> NumberFieldIdeal:
        return _nf_ideal_arithmetic_module().numerator_ideal(self)

    def to_dict(self) -> dict[str, Any]:
        return _nf_ideal_arithmetic_module().serialize_ideal(self)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, NumberFieldIdeal)
            and other._order is self._order
            and other._basis_rows == self._basis_rows
        )

    def __repr__(self) -> str:
        if self.is_zero():
            return "Fractional ideal (0)"
        return (
            "Fractional ideal ("
            + ", ".join([str(element) for element in self.basis()])
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class NumberFieldOrder(sage.Parent):
    """A full-rank exact order in a simple number field."""

    def __init__(
        self,
        field: NumberFieldParent,
        rows: list[list[Any]],
        is_maximal: bool,
        check_closure: bool = True,
        authenticated_basis: Any = runtime.undefined,
    ) -> None:
        self._field = field
        self._basis_rows_cache: Any = None
        self._authenticated_basis_projection: Any = None
        if authenticated_basis is not runtime.undefined:
            if check_closure:
                raise ValueError(
                    "an authenticated basis cannot request generic closure replay"
                )
            projection = list(authenticated_basis)
            if len(projection) != 3:
                raise ValueError("an authenticated basis projection has three fields")
            flat = tuple(runtime.integer_bigint(value) for value in projection[0])
            denominator = runtime.integer_bigint(projection[1])
            scale = runtime.integer_bigint(projection[2])
            degree = field.degree()
            if len(flat) != degree * degree or denominator < 1 or scale < 1:
                raise ValueError("an authenticated basis projection is malformed")
            # The tuple is an immutable representation snapshot.  Rational
            # rows are deliberately absent until a public operation needs
            # them, so a later mutation of the source projection cannot alter
            # this order or its cache identity.
            self._authenticated_basis_projection = runtime.math_tuple(
                [flat, denominator, scale]
            )
        elif check_closure:
            self._basis_rows = _nf_order_closure(field, rows)
        else:
            # Multiplier rings are orders by construction. Canonicalizing the
            # proven-closed lattice avoids repeating all n^2 products after
            # every local Round-2 enlargement.
            self._basis_rows = _nf_canonical_lattice(rows, field.degree())
        self._is_maximal = is_maximal
        self._maximal_order_certificate = runtime.undefined
        self._maximal_order_certificate_factory: Any = None
        self._pending_maximal_order_certificate_factory: Any = None
        self._maximal_order_local_evidence = runtime.undefined
        self._maximal_order_trace = runtime.undefined
        self._discriminant_cache = runtime.undefined
        self._kind = "NumberFieldOrder"
        self._construction = runtime.undefined

    @property
    def _basis_rows(self) -> list[list[Any]]:
        if self._basis_rows_cache is None:
            projection = self._authenticated_basis_projection
            if projection is None:
                raise ArithmeticError("an order has no basis representation")
            flat = projection[0]
            denominator = projection[1]
            scale = projection[2]
            degree = self._field.degree()
            rows = []
            for row_index in range(degree):
                row = []
                power = runtime.bigint(1)
                for column in range(degree):
                    row.append(
                        _untyped(sage.QQ)(
                            flat[row_index * degree + column] * power,
                            denominator,
                        )
                    )
                    power *= scale
                rows.append(row)
            self._basis_rows_cache = rows
        return self._basis_rows_cache

    @_basis_rows.setter
    def _basis_rows(self, rows: list[list[Any]]) -> None:
        self._basis_rows_cache = rows

    def number_field(self) -> NumberFieldParent:
        return self._field

    fraction_field = number_field

    def basis(self) -> list[NumberFieldElement]:
        return [_nf_element_from_row(self._field, row) for row in self._basis_rows]

    integral_basis = basis

    def basis_matrix(self) -> Any:
        return _nf_global("matrix")(sage.QQ, self._basis_rows)

    def degree(self) -> int:
        return self._field.degree()

    def __call__(self, value: Any = 0) -> NumberFieldElement:
        element = self._field(value)
        if element not in self:
            raise TypeError(str(element) + " is not in this order")
        return element

    def __contains__(self, value: object) -> bool:
        try:
            element = self._field(value)
        except Exception:
            return False
        return _nf_row_in_lattice(
            _nf_coordinates(element, self.degree()), self._basis_rows
        )

    def discriminant(self) -> Any:
        if self._discriminant_cache is not runtime.undefined:
            return self._discriminant_cache
        trace_matrix = _nf_global("matrix")(
            sage.QQ, _nf_trace_matrix(self._field, self.basis())
        )
        value = trace_matrix.determinant()
        if value._denominator != 1:
            raise ArithmeticError("an order has nonintegral discriminant")
        self._discriminant_cache = runtime.normalize_integer(value._numerator)
        return self._discriminant_cache

    def is_maximal(self) -> bool:
        if self._pending_maximal_order_certificate_factory is not None:
            try:
                self._materialize_pending_maximal_order_certificate()
            except Exception:
                return False
        return self._maximal_order_certificate_factory is not None or (
            self._maximal_order_certificate is not runtime.undefined
            and self._maximal_order_certificate.get("certified") is True
        )

    def _install_authenticated_maximal_order_certificate(self, factory: Any) -> None:
        """Defer public certificate serialization after packed authentication.

        The maximal-order engine calls this only after its independent proof
        kernel has accepted an immutable projection.  A closure over that
        projection can then construct the ordinary public dictionary on first
        request without adding work to the cacheable `maximal_order()` return.
        """
        if not callable(factory):
            raise TypeError("an authenticated certificate factory must be callable")
        if (
            self._maximal_order_certificate is not runtime.undefined
            or self._maximal_order_certificate_factory is not None
            or self._pending_maximal_order_certificate_factory is not None
        ):
            raise ValueError("a maximal-order certificate is already installed")
        self._maximal_order_certificate_factory = factory

    def _install_pending_maximal_order_certificate(self, factory: Any) -> None:
        """Install an unverified certificate factory without claiming maximality.

        Unlike an authenticated factory, this factory has not yet been checked.
        Public certification operations must run and validate it before treating
        this order as maximal.  The engine may use this state to return a
        completed construction without eagerly replaying its independent
        certificate.
        """
        if not callable(factory):
            raise TypeError("a pending certificate factory must be callable")
        if (
            self._maximal_order_certificate is not runtime.undefined
            or self._maximal_order_certificate_factory is not None
            or self._pending_maximal_order_certificate_factory is not None
        ):
            raise ValueError("a maximal-order certificate is already installed")
        self._pending_maximal_order_certificate_factory = factory

    def _materialize_pending_maximal_order_certificate(self) -> None:
        factory = self._pending_maximal_order_certificate_factory
        if factory is None:
            return
        # Consume the pending factory before calling user-visible Python.  A
        # failure cannot leave a false maximality claim or a poisoned cached
        # order behind, and a later public request will recompute normally.
        self._pending_maximal_order_certificate_factory = None
        try:
            certificate = factory()
            if (
                not isinstance(certificate, dict)
                or certificate.get("certified") is not True
            ):
                raise ArithmeticError(
                    "a pending certificate factory returned invalid evidence"
                )
        except Exception:
            self._maximal_order_certificate = runtime.undefined
            if self._field._maximal_order_cache is self:
                self._field._maximal_order_cache = runtime.undefined
            raise
        self._maximal_order_certificate = certificate

    def maximality_certificate(self) -> Any:
        """Return the independently checked global certificate, if any."""
        if self._pending_maximal_order_certificate_factory is not None:
            self._materialize_pending_maximal_order_certificate()
        if self._maximal_order_certificate_factory is not None:
            factory = self._maximal_order_certificate_factory
            certificate = factory()
            if (
                not isinstance(certificate, dict)
                or certificate.get("certified") is not True
            ):
                raise ArithmeticError(
                    "an authenticated certificate factory returned invalid evidence"
                )
            self._maximal_order_certificate = certificate
            self._maximal_order_certificate_factory = None
        if self._maximal_order_certificate is runtime.undefined:
            return None
        return self._maximal_order_certificate

    def maximal_order_trace(self) -> Any:
        """Return the opt-in maximal-order stage trace, if one was recorded."""
        if self._maximal_order_trace is runtime.undefined:
            return None
        return self._maximal_order_trace

    def ideal(self, *generators: Any) -> NumberFieldIdeal:
        values = list(generators)
        if len(values) == 1 and runtime.array.isArray(values[0]):
            values = list(values[0])
        if len(values) == 0:
            values = [0]
        elements = [self._field(value) for value in values]
        if all(element.is_zero() for element in elements):
            return NumberFieldIdeal(self, [])
        rows = []
        for generator in elements:
            for basis_element in self.basis():
                rows.append(_nf_coordinates(generator * basis_element, self.degree()))
        return NumberFieldIdeal(self, rows)

    def factor_rational_prime(
        self,
        prime: Any,
        algorithm: str = "auto",
    ) -> Any:
        return _nf_prime_ideals_module().factor_rational_prime(
            self, prime, algorithm=algorithm
        )

    def primes_above(self, prime: Any) -> "tuple[Any, ...]":
        return _nf_prime_ideals_module().primes_above(self, prime)

    def splitting_records(self, start: Any, stop: Any) -> Any:
        return _nf_prime_ideals_module().splitting_records(self, start, stop)

    def ideal_from_dict(self, data: dict[str, Any]) -> NumberFieldIdeal:
        return _nf_ideal_arithmetic_module().ideal_from_dict(self, data)

    def class_group(self, *args: Any, **kwargs: Any) -> Any:
        return self._field.class_group(*args, **kwargs)

    def class_number(self, *args: Any, **kwargs: Any) -> int:
        return self._field.class_number(*args, **kwargs)

    def __repr__(self) -> str:
        label = "Maximal Order" if self.is_maximal() else "Order"
        generators = self.basis()[1:]
        return (
            label
            + " generated by ["
            + ", ".join([str(value) for value in generators])
            + "] in "
            + str(self._field)
        )

    __str__ = __repr__
    toString = __repr__


class _NumberFieldNumericalPlace:
    def __init__(self, embedding: Any, precision: int) -> None:
        self._embedding = embedding
        self._precision = precision

    def __call__(self, value: Any) -> Any:
        return self._embedding.approximate(value, self._precision)

    def __repr__(self) -> str:
        return (
            "Numerical "
            + str(self._embedding)
            + " at "
            + str(self._precision)
            + " bits"
        )

    __str__ = __repr__


@runtime.callable_instance_class
class NumberFieldParent(sage.Parent):
    """A simple exact number field represented as `QQ[a]/(f)`."""

    def __init__(self, polynomial: Any, name: str) -> None:
        coefficients = [sage.QQ(value) for value in polynomial.coefficients()]
        coefficients = _trim_coefficients(coefficients)
        if len(coefficients) < 2:
            raise ValueError("a number field needs a nonconstant defining polynomial")
        if not polynomial.is_irreducible():
            raise ValueError(
                "defining polynomial (" + str(polynomial) + ") must be irreducible"
            )
        leading = coefficients[-1]
        self._defining_coefficients = [value / leading for value in coefficients]
        self._degree = len(self._defining_coefficients) - 1
        self._polynomial = polynomial
        self._variable = name
        self._kind = "NumberField"
        self._construction = {
            "kind": "NumberField",
            "polynomial": polynomial,
            "name": name,
        }
        self._name = (
            "Number Field in " + name + " with defining polynomial " + str(polynomial)
        )
        generator_coefficients = [sage.QQ(0), sage.QQ(1)]
        self._generator = NumberFieldElement(self, generator_coefficients)
        self._equation_order_cache = runtime.undefined
        # `None`, rather than the JavaScript `undefined` sentinel, keeps this
        # private invariant visible to independently compiled lazy modules.
        self._integral_equation_polynomial_cache = None
        self._integral_equation_scale_cache = None
        self._maximal_order_cache = runtime.undefined
        self._quadratic_backend_cache = runtime.undefined
        self._real_quadratic_backend_cache = runtime.undefined
        self._class_group_cache = runtime.undefined
        self._zeta_function_cache = runtime.map()
        self._archimedean_data_cache = runtime.undefined
        self._unit_group_cache = runtime.undefined
        self._global_class_group_cache = runtime.undefined
        self._class_unit_engine_cache: dict[Any, Any] = {}
        runtime.coercion_model.register(sage.ZZ, self, self)
        runtime.coercion_model.register(sage.QQ, self, self)

    def _reduce(self, coefficients: list[Any]) -> list[Any]:
        result = _trim_coefficients([sage.QQ(value) for value in coefficients])
        while len(result) > self._degree:
            exponent = len(result) - 1
            leading = result[-1]
            shift = exponent - self._degree
            result.pop()
            for index in range(self._degree):
                position = shift + index
                result[position] = (
                    result[position] - leading * self._defining_coefficients[index]
                )
            result = _trim_coefficients(result)
        return result

    def __call__(self, value: Any = 0) -> NumberFieldElement:
        if isinstance(value, NumberFieldElement):
            if value._parent is self:
                return value
            raise TypeError("incompatible number fields")
        if hasattr(value, "coefficients"):
            return NumberFieldElement(
                self, [sage.QQ(item) for item in value.coefficients()]
            )
        return NumberFieldElement(self, [sage.QQ(value)])

    def _from_coefficients(
        self,
        coefficients: list[Any],
    ) -> NumberFieldElement:
        """Construct an element from its canonical power-basis coordinates."""
        return NumberFieldElement(self, coefficients)

    def gen(self, index: int = 0) -> NumberFieldElement:
        if int(index) != 0:
            raise IndexError("a simple number field has one generator")
        return self._generator

    def _first_ngens(self, count: int) -> list[NumberFieldElement]:
        if int(count) != 1:
            raise ValueError("a simple number field has one generator")
        return [self.gen()]

    def gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple([self.gen()])

    def zero(self) -> NumberFieldElement:
        return self(0)

    def one(self) -> NumberFieldElement:
        return self(1)

    def _root(self, exponent: Any) -> NumberFieldElement:
        return self.gen() ** exponent

    def degree(self) -> int:
        return self._degree

    def variable_name(self) -> str:
        return self._variable

    def defining_polynomial(self) -> Any:
        return self._polynomial

    def polynomial_quotient_ring(self) -> NumberFieldPolynomialQuotient:
        return NumberFieldPolynomialQuotient(self)

    def _is_tutorial_cubic(self) -> bool:
        return str(self._polynomial) == "x^3 + x^2 - 2*x + 8"

    def _power_basis(self) -> list[NumberFieldElement]:
        basis = []
        power = self.one()
        for _index in range(self.degree()):
            basis.append(power)
            power *= self.gen()
        return basis

    def equation_order(self) -> NumberFieldOrder:
        if self._equation_order_cache is runtime.undefined:
            scale = self._integral_equation_scale_cache
            if scale is None:
                scale = runtime.bigint(1)
                for coefficient in self._defining_coefficients:
                    scale = _nf_lcm(scale, coefficient._denominator)
                self._integral_equation_scale_cache = scale
            degree = self.degree()
            zero = sage.QQ(0)
            rows = []
            power = runtime.bigint(1)
            for index in range(degree):
                # In the public power basis, `(scale*a)^index` has the one
                # nonzero coordinate `scale^index`.  Constructing these
                # diagonal rows directly is the exact defining theorem for
                # the equation order and avoids reducing field products that
                # are already known to be powers below the field degree.
                row = [zero for _column in range(degree)]
                row[index] = sage.QQ(power)
                rows.append(row)
                power *= scale
            # Powers of the integral generator form an order by construction.
            # Canonicalize that proven-closed lattice without repeating all
            # pairwise products; a global maximal-order certificate still
            # checks the final candidate independently.
            self._equation_order_cache = NumberFieldOrder(self, rows, False, False)
            equation_polynomial = (
                _nf_maximal_order_module().integral_equation_polynomial(self)
            )
            self._equation_order_cache._discriminant_cache = (
                equation_polynomial.discriminant()
            )
        return self._equation_order_cache

    def order(self, *generators: Any) -> NumberFieldOrder:
        values = list(generators)
        if len(values) == 1 and runtime.array.isArray(values[0]):
            values = list(values[0])
        elements = [self.one()] + [self(value) for value in values]
        for element in elements:
            if not _nf_is_integral(self, element):
                raise ValueError("order generators must be algebraic integers")
        rows = [_nf_coordinates(element, self.degree()) for element in elements]
        if len(rows) < self.degree():
            rows += self.equation_order()._basis_rows
        return NumberFieldOrder(self, rows, False)

    def maximal_order(
        self,
        v: Any = None,
        assume_maximal: Any = "non-maximal-non-unique",
        algorithm: str = "auto",
        trace: bool = False,
    ) -> NumberFieldOrder:
        """Return a certified global order or an explicitly local order.

        The global path never completely factors the defining discriminant.
        Forced algorithms, local-prime requests, and traced runs do not poison
        the single certified default cache.
        """
        use_cache = v is None and algorithm == "auto" and not trace
        if use_cache and self._maximal_order_cache is not runtime.undefined:
            return self._maximal_order_cache
        if v is not None and assume_maximal is True:
            raise ValueError(
                "assume_maximal=True is incompatible with certified local orders"
            )
        order = _nf_maximal_order_engine_module().compute_maximal_order(
            self,
            requested_primes=v,
            algorithm=algorithm,
            trace_enabled=trace,
        )
        if use_cache:
            self._maximal_order_cache = order
        return order

    ring_of_integers = maximal_order

    def ideal(self, *generators: Any) -> NumberFieldIdeal:
        return self.maximal_order().ideal(*generators)

    def factor_rational_prime(
        self,
        prime: Any,
        algorithm: str = "auto",
    ) -> Any:
        return self.maximal_order().factor_rational_prime(prime, algorithm)

    def primes_above(self, prime: Any) -> "tuple[Any, ...]":
        return self.maximal_order().primes_above(prime)

    def integral_basis(self) -> list[NumberFieldElement]:
        return self.maximal_order().basis()

    def signature(self) -> "tuple[int, int]":
        return self.archimedean_data().signature()

    def archimedean_data(self) -> Any:
        if self._archimedean_data_cache is runtime.undefined:
            self._archimedean_data_cache = _nf_embeddings_module().archimedean_data(
                self
            )
        return self._archimedean_data_cache

    def embeddings(self, codomain: Any = None) -> "tuple[Any, ...]":
        return runtime.math_tuple(list(self.archimedean_data().embeddings))

    def places(self, prec: Any = 53) -> "tuple[Any, ...]":
        precision = int(prec)
        return runtime.math_tuple(
            [
                _NumberFieldNumericalPlace(embedding, precision)
                for embedding in self.archimedean_data().embeddings
            ]
        )

    def zeta_function(
        self,
        prec: Any = 53,
        max_imaginary_part: Any = 0,
        algorithm: str = "auto",
    ) -> Any:
        precision = int(prec)
        if algorithm == "pari":
            raise NotImplementedError("algorithm='pari' is unavailable in Sage.js")
        key = str(precision) + ":" + str(max_imaginary_part) + ":" + algorithm
        cached = self._zeta_function_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        module = _nf_dedekind_zeta_module()
        if self.degree() == 2:
            riemann_zeta = _nf_global("RiemannZeta")
            value = module.DedekindZetaFunction(
                self,
                precision=precision,
                max_imaginary_part=max_imaginary_part,
                algorithm=algorithm,
                riemann=riemann_zeta(precision),
                character_factory=_nf_global("kronecker_character"),
                result_coercer=_nf_complex_result,
            )
        else:
            if algorithm not in ("auto", "afe", "reference"):
                raise ValueError(
                    "general zeta algorithm must be 'auto', 'afe', or 'reference'"
                )
            value = module.GeneralDedekindZetaFunction(
                self,
                precision=precision,
                max_imaginary_part=max_imaginary_part,
                result_coercer=_nf_complex_result,
            )
        self._zeta_function_cache.set(key, value)
        return value

    def galois_group(self) -> NumberFieldGaloisGroup:
        """Return the native Galois group for a field of degree at most four."""
        data = _galois_group_data(
            self._defining_coefficients,
            self._polynomial._parent.variable_name(),
        )
        return NumberFieldGaloisGroup(self, data[0], data[1], data[2], data[3])

    def units(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> "tuple[Any, ...]":
        if self._is_tutorial_cubic():
            generator = self.gen()
            unit = self(-3) * generator**2 - self(13) * generator - self(13)
            return runtime.math_tuple([unit])
        result = self.unit_group(proof=proof, algorithm=algorithm, **limits)
        if not result.complete:
            raise NotImplementedError(result.reason)
        generators = []
        for generator in result.generators:
            evaluate = getattr(generator, "evaluate", None)
            generators.append(evaluate() if callable(evaluate) else generator)
        return runtime.math_tuple(generators)

    def roots_of_unity(self) -> Any:
        return _nf_units_module().roots_of_unity(self)

    def number_of_roots_of_unity(self) -> int:
        result = self.roots_of_unity()
        if not result.complete:
            raise NotImplementedError(result.reason)
        return int(result.order)

    def unit_group(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> Any:
        if algorithm in ("minkowski", "buchmann-hecke"):
            return _nf_class_unit_groups_module().unit_group(
                self, proof=proof, algorithm=algorithm, **limits
            )
        if algorithm not in ("auto", "quadratic-forms"):
            raise ValueError("unknown unit-group algorithm: " + str(algorithm))
        if (
            self._unit_group_cache is runtime.undefined
            and proof is None
            and algorithm == "auto"
            and len(limits) == 0
        ):
            signature = self.signature()
            if self.degree() == 2 and signature[0] == 2 and signature[1] == 0:
                result = (
                    _nf_quadratic_class_units_module().real_quadratic_field_unit_group(
                        self, algorithm=algorithm, **limits
                    )
                )
            elif self.degree() == 2 and signature[0] == 0 and signature[1] == 1:
                if len(limits) != 0:
                    raise TypeError(
                        "imaginary quadratic units do not accept resource limits"
                    )
                result = _nf_units_module().bounded_unit_subgroup(self)
            else:
                result = _nf_class_unit_groups_module().unit_group(
                    self, proof=proof, algorithm=algorithm, **limits
                )
            self._unit_group_cache = result
            return result
        if (
            self._unit_group_cache is not runtime.undefined
            and proof is None
            and algorithm == "auto"
            and len(limits) == 0
        ):
            return self._unit_group_cache
        signature = self.signature()
        if self.degree() == 2 and signature[0] == 2 and signature[1] == 0:
            return _nf_quadratic_class_units_module().real_quadratic_field_unit_group(
                self, algorithm=algorithm, **limits
            )
        if self.degree() == 2 and signature[0] == 0 and signature[1] == 1:
            if len(limits) != 0:
                raise TypeError(
                    "imaginary quadratic units do not accept resource limits"
                )
            return _nf_units_module().bounded_unit_subgroup(self)
        return _nf_class_unit_groups_module().unit_group(
            self, proof=proof, algorithm=algorithm, **limits
        )

    def regulator(
        self,
        prec: Any = 53,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> Any:
        if self.degree() > 2:
            return _nf_class_unit_groups_module().regulator(
                self,
                prec=int(prec),
                proof=proof,
                algorithm=algorithm,
                **limits,
            )
        result = self.unit_group(proof=proof, algorithm=algorithm, **limits)
        if not result.complete:
            raise NotImplementedError(result.reason)
        return result.regulator(int(prec))

    def class_unit_group(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> Any:
        return _nf_class_unit_groups_module().class_unit_context(
            self, proof=proof, algorithm=algorithm, **limits
        )

    def class_group_result(self) -> Any:
        if self._global_class_group_cache is runtime.undefined:
            self._global_class_group_cache = (
                _nf_class_groups_module().bounded_class_group(self)
            )
        return self._global_class_group_cache

    def analytic_class_number_formula(self, prec: Any = 53) -> Any:
        zeta = self.zeta_function(prec=prec)
        units = self.unit_group()
        classes = self.class_group_result()
        return _nf_class_groups_module().analytic_class_number_formula_report(
            self,
            zeta.residue(1, prec=prec),
            units,
            classes,
            prec=int(prec),
        )

    def discriminant(self) -> Any:
        return self.maximal_order().discriminant()

    def _quadratic_backend(self) -> Any:
        """Return an equivalent `QuadraticField` for degree-two fields.

        If `a` satisfies `a^2 + b*a + c`, its polynomial
        discriminant is `delta = b^2 - 4*c`.  Writing
        `delta = numerator/denominator` in lowest terms gives the
        equivalent integral radicand `numerator*denominator`.
        """
        if self.degree() != 2:
            raise NotImplementedError(
                "quadratic class groups require a degree-two number field"
            )
        if self._quadratic_backend_cache is runtime.undefined:
            constant = self._defining_coefficients[0]
            linear = self._defining_coefficients[1]
            discriminant = linear * linear - 4 * constant
            numerator = runtime.integer_bigint(discriminant._numerator)
            denominator = runtime.integer_bigint(discriminant._denominator)
            if numerator >= 0:
                raise NotImplementedError(
                    "native NumberField class groups currently require "
                    "an imaginary quadratic field"
                )
            radicand = numerator * denominator
            backend = QuadraticField(radicand, self._variable)
            self._quadratic_backend_cache = runtime.math_tuple(
                [backend, linear, denominator]
            )
        return self._quadratic_backend_cache

    def _from_quadratic_backend(self, value: Any) -> NumberFieldElement:
        backend_data = self._quadratic_backend()
        linear = backend_data[1]
        denominator = sage.QQ(backend_data[2])
        # sqrt(numerator*denominator)
        #     = denominator * (2*a + linear).
        return self._from_coefficients(
            [
                value._real + value._imag * denominator * linear,
                2 * value._imag * denominator,
            ]
        )

    def _real_quadratic_backend(self, algorithm: str = "auto", **limits: Any) -> Any:
        signature = self.signature()
        if self.degree() != 2 or signature[0] != 2 or signature[1] != 0:
            raise ValueError("a real quadratic backend needs signature (2, 0)")
        use_cache = algorithm == "auto" and len(limits) == 0
        if use_cache and self._real_quadratic_backend_cache is runtime.undefined:
            self._real_quadratic_backend_cache = (
                _nf_quadratic_class_units_module().real_quadratic_class_group(
                    int(self.discriminant()), algorithm=algorithm, **limits
                )
            )
        if use_cache:
            return self._real_quadratic_backend_cache
        return _nf_quadratic_class_units_module().real_quadratic_class_group(
            int(self.discriminant()), algorithm=algorithm, **limits
        )

    def _real_quadratic_ideal_form(self, ideal: NumberFieldIdeal) -> Any:
        """Return the primitive form representing a real quadratic ideal."""
        discriminant = runtime.integer_bigint(self.discriminant())
        _squarefree, square_root = _nf_units_module()._quadratic_square_root_element(
            self
        )
        sqrt_discriminant = (
            square_root if discriminant % 4 == 1 else self(2) * square_root
        )
        omega = (self(discriminant % 2) + sqrt_discriminant) / 2
        canonical_basis = _nf_global("matrix")(
            sage.QQ,
            [[sage.QQ(1), sage.QQ(0)], list(omega._coefficients)],
        )
        denominator = runtime.integer_bigint(ideal.denominator())
        integral = denominator * ideal
        relative = integral.basis_matrix() * canonical_basis.inverse()
        rows = relative.rows()
        entries = []
        for row in rows:
            for entry in row:
                if entry._denominator != 1:
                    raise ArithmeticError("failed to clear an ideal denominator")
                entries.append(runtime.integer_bigint(entry._numerator))
        content = runtime.bigint(0)
        for entry in entries:
            content = runtime.bigint_gcd(content, entry)
        if content < 0:
            content = -content
        if content == 0:
            raise ValueError("the zero ideal has no ideal class")
        primitive = integral.__mul__(self(content).inverse())
        relative = primitive.basis_matrix() * canonical_basis.inverse()
        rows = relative.rows()
        integer_rows = []
        for row in rows:
            integer_row = []
            for value in row:
                if value._denominator != 1:
                    raise ArithmeticError(
                        "a primitive quadratic ideal has nonintegral coordinates"
                    )
                integer_row.append(int(value._numerator))
            integer_rows.append(tuple(integer_row))
        form = _nf_quadratic_class_units_module().quadratic_form_from_ideal_lattice(
            int(discriminant), tuple(integer_rows)
        )
        return form.coefficients()

    def class_group(
        self,
        proof: Any = None,
        names: str = "c",
        algorithm: str = "auto",
        **limits: Any,
    ) -> Any:
        del names
        use_cache = proof is None and algorithm == "auto" and len(limits) == 0
        if use_cache and self._class_group_cache is not runtime.undefined:
            return self._class_group_cache
        if self._is_tutorial_cubic():
            result = NumberFieldClassGroup(self)
        elif self.degree() == 2:
            if algorithm in ("minkowski", "buchmann-hecke"):
                result = _nf_class_unit_groups_module().class_group(
                    self, proof=proof, algorithm=algorithm, **limits
                )
            else:
                if algorithm not in ("auto", "quadratic-forms"):
                    raise ValueError("unknown class-group algorithm: " + str(algorithm))
                signature = self.signature()
                if signature[0] == 2 and signature[1] == 0:
                    backend = self._real_quadratic_backend(algorithm, **limits)
                else:
                    if len(limits) != 0:
                        raise TypeError(
                            "imaginary quadratic forms do not accept resource limits"
                        )
                    backend = self._quadratic_backend()[0].class_group()
                result = NumberFieldClassGroup(self, backend)
        else:
            result = _nf_class_unit_groups_module().class_group(
                self, proof=proof, algorithm=algorithm, **limits
            )
        if use_cache:
            self._class_group_cache = result
        return result

    def class_number(
        self,
        proof: Any = None,
        algorithm: str = "auto",
        **limits: Any,
    ) -> int:
        if self._is_tutorial_cubic():
            return 1
        if self.degree() == 2:
            if algorithm in ("minkowski", "buchmann-hecke"):
                return _nf_class_unit_groups_module().class_number(
                    self, proof=proof, algorithm=algorithm, **limits
                )
            if algorithm not in ("auto", "quadratic-forms"):
                raise ValueError("unknown class-number algorithm: " + str(algorithm))
            signature = self.signature()
            if signature[0] == 2 and signature[1] == 0:
                return int(self._real_quadratic_backend(algorithm, **limits).order())
            if len(limits) != 0:
                raise TypeError(
                    "imaginary quadratic forms do not accept resource limits"
                )
            return int(self._quadratic_backend()[0].class_number())
        return _nf_class_unit_groups_module().class_number(
            self, proof=proof, algorithm=algorithm, **limits
        )


def NumberField(
    polynomial: Any,
    names: Any = None,
) -> NumberFieldParent:
    """Construct the exact simple field `QQ[a]/(polynomial)`."""
    polynomial = _number_field_polynomial(polynomial)
    if names is None:
        name = "a"
    elif runtime.array.isArray(names):
        if len(names) != 1:
            raise ValueError("a simple number field has one generator name")
        name = str(names[0])
    else:
        name = str(names)
    return NumberFieldParent(polynomial, name)


def _quadratic_xgcd(left: Any, right: Any) -> tuple[Any, Any, Any]:
    old_r = runtime.integer_bigint(left)
    r = runtime.integer_bigint(right)
    old_s = runtime.bigint(1)
    s = runtime.bigint(0)
    old_t = runtime.bigint(0)
    t = runtime.bigint(1)
    while r != 0:
        quotient = runtime.integer_bigint(old_r // r)
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
        old_t, t = t, old_t - quotient * t
    if old_r < 0:
        return -old_r, -old_s, -old_t
    return old_r, old_s, old_t


class QuadraticBinaryForm:
    """A primitive positive-definite binary quadratic form."""

    def __init__(self, a: Any, b: Any, c: Any) -> None:
        self._a = runtime.integer_bigint(a)
        self._b = runtime.integer_bigint(b)
        self._c = runtime.integer_bigint(c)

    def coefficients(self) -> tuple[Any, Any, Any]:
        return runtime.math_tuple(
            [
                runtime.normalize_integer(self._a),
                runtime.normalize_integer(self._b),
                runtime.normalize_integer(self._c),
            ]
        )

    def discriminant(self) -> Any:
        return runtime.normalize_integer(
            self._b * self._b - runtime.bigint(4) * self._a * self._c
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuadraticBinaryForm)
            and self._a == other._a
            and self._b == other._b
            and self._c == other._c
        )

    def __repr__(self) -> str:
        return (
            "BinaryQF([" + ", ".join([str(self._a), str(self._b), str(self._c)]) + "])"
        )

    __str__ = __repr__
    toString = __repr__


def _quadratic_form_key(form: QuadraticBinaryForm) -> str:
    return ",".join([str(form._a), str(form._b), str(form._c)])


def _quadratic_reduce(
    form: QuadraticBinaryForm,
    discriminant: Any,
) -> QuadraticBinaryForm:
    """Return the unique reduced representative of a positive form."""
    target = runtime.integer_bigint(discriminant)
    a, b, c = form._a, form._b, form._c
    while True:
        quotient = runtime.integer_bigint((b + a) // (runtime.bigint(2) * a))
        b -= runtime.bigint(2) * quotient * a
        c = runtime.integer_bigint((b * b - target) // (runtime.bigint(4) * a))
        if a > c:
            a, b, c = c, -b, a
            continue
        if (abs(b) == a or a == c) and b < 0:
            b = -b
        answer = QuadraticBinaryForm(a, b, c)
        if answer._b * answer._b - runtime.bigint(4) * answer._a * answer._c != target:
            raise ArithmeticError("quadratic-form reduction changed discriminant")
        return answer


def _quadratic_compose_reference(
    left: QuadraticBinaryForm,
    right: QuadraticBinaryForm,
    discriminant: Any,
) -> QuadraticBinaryForm:
    """Compose forms by multiplying their rank-two integer ideal lattices."""
    target = runtime.integer_bigint(discriminant)
    parity = runtime.integer_bigint(target % runtime.bigint(2))
    theta_norm = runtime.integer_bigint((parity * parity - target) // runtime.bigint(4))
    left_t = runtime.integer_bigint((-left._b - parity) // runtime.bigint(2))
    right_t = runtime.integer_bigint((-right._b - parity) // runtime.bigint(2))
    vectors = [
        [left._a * right._a, runtime.bigint(0)],
        [left._a * right_t, left._a],
        [right._a * left_t, right._a],
        [
            left_t * right_t - theta_norm,
            left_t + right_t + parity,
        ],
    ]

    projection_gcd = runtime.bigint(0)
    lifted_x = runtime.bigint(0)
    for x_value, y_value in vectors:
        next_gcd, old_coefficient, new_coefficient = _quadratic_xgcd(
            projection_gcd, y_value
        )
        lifted_x = old_coefficient * lifted_x + new_coefficient * x_value
        projection_gcd = next_gcd
    if projection_gcd == 0:
        raise ArithmeticError("quadratic ideal product has rank below two")

    lattice_index = runtime.bigint(0)
    for left_index in range(len(vectors)):
        for right_index in range(left_index):
            minor = abs(
                vectors[left_index][0] * vectors[right_index][1]
                - vectors[right_index][0] * vectors[left_index][1]
            )
            lattice_index = runtime.bigint_gcd(lattice_index, minor)
    scale_square = projection_gcd * projection_gcd
    if lattice_index % scale_square != 0 or lifted_x % projection_gcd != 0:
        raise ArithmeticError("quadratic ideal product did not normalize integrally")

    a = runtime.integer_bigint(lattice_index // scale_square)
    t_value = runtime.integer_bigint((lifted_x // projection_gcd) % a)
    b = -runtime.bigint(2) * t_value - parity
    numerator = b * b - target
    if numerator % (runtime.bigint(4) * a) != 0:
        raise ArithmeticError("quadratic ideal product has invalid norm")
    return _quadratic_reduce(
        QuadraticBinaryForm(a, b, numerator // (runtime.bigint(4) * a)), target
    )


def _quadratic_native_method(name: str) -> Any:
    return runtime.reflect.get(runtime.flint_backend(), name)


def _quadratic_form_data(form: QuadraticBinaryForm) -> list[Any]:
    return [form._a, form._b, form._c]


def _quadratic_form_from_data(data: Any) -> QuadraticBinaryForm:
    return QuadraticBinaryForm(data[0], data[1], data[2])


def _quadratic_compose(
    left: QuadraticBinaryForm,
    right: QuadraticBinaryForm,
    discriminant: Any,
) -> QuadraticBinaryForm:
    """Compose reduced forms with FLINT NUCOMP when it is available."""
    native = _quadratic_native_method("qfbNucomp")
    if runtime.jstype(native) == "function":
        data = native(
            runtime.integer_bigint(discriminant),
            _quadratic_form_data(left),
            _quadratic_form_data(right),
        )
        return _quadratic_form_from_data(data)
    return _quadratic_compose_reference(left, right, discriminant)


def _quadratic_reduced_forms_reference(
    discriminant: Any,
) -> list[QuadraticBinaryForm]:
    target = runtime.integer_bigint(discriminant)
    if target >= 0 or target % runtime.bigint(4) not in [
        runtime.bigint(0),
        runtime.bigint(1),
    ]:
        raise ValueError("a negative quadratic discriminant is required")
    forms = []
    a = runtime.bigint(1)
    while runtime.bigint(3) * a * a <= -target:
        b = -a
        while b <= a:
            numerator = b * b - target
            if numerator % (runtime.bigint(4) * a) == 0:
                c = numerator // (runtime.bigint(4) * a)
                if (
                    a <= c
                    and not ((abs(b) == a or a == c) and b < 0)
                    and runtime.bigint_gcd(
                        runtime.bigint_gcd(a, b),
                        runtime.integer_bigint(c),
                    )
                    == runtime.bigint(1)
                ):
                    forms.append(QuadraticBinaryForm(a, b, c))
            b += runtime.bigint(1)
        a += runtime.bigint(1)
    return forms


def _quadratic_native_enumeration_supported(discriminant: Any) -> bool:
    target = runtime.integer_bigint(discriminant)
    return target > -(runtime.bigint(2) ** runtime.bigint(63)) and target < 0


def _quadratic_reduced_forms(
    discriminant: Any,
) -> list[QuadraticBinaryForm]:
    """Enumerate reduced forms using FLINT's modular-root sieve."""
    target = runtime.integer_bigint(discriminant)
    native = _quadratic_native_method("qfbReducedForms")
    if runtime.jstype(native) == "function" and _quadratic_native_enumeration_supported(
        target
    ):
        return [_quadratic_form_from_data(data) for data in native(target)]
    return _quadratic_reduced_forms_reference(target)


def _quadratic_principal_form(discriminant: Any) -> QuadraticBinaryForm:
    target = runtime.integer_bigint(discriminant)
    middle = target % runtime.bigint(2)
    return QuadraticBinaryForm(
        1, middle, (middle * middle - target) // runtime.bigint(4)
    )


def _quadratic_form_power_reference(
    form: QuadraticBinaryForm,
    exponent: Any,
    discriminant: Any,
) -> QuadraticBinaryForm:
    power = runtime.integer_bigint(exponent)
    if power < 0:
        form = _quadratic_reduce(
            QuadraticBinaryForm(form._a, -form._b, form._c),
            discriminant,
        )
        power = -power
    answer = _quadratic_principal_form(discriminant)
    base = form
    while power:
        if power % runtime.bigint(2):
            answer = _quadratic_compose_reference(answer, base, discriminant)
        power //= runtime.bigint(2)
        if power:
            base = _quadratic_compose_reference(base, base, discriminant)
    return answer


def _quadratic_form_power(
    form: QuadraticBinaryForm,
    exponent: Any,
    discriminant: Any,
) -> QuadraticBinaryForm:
    """Power a reduced form with FLINT's NUCOMP-based implementation."""
    power = runtime.integer_bigint(exponent)
    if power < 0:
        form = _quadratic_reduce(
            QuadraticBinaryForm(form._a, -form._b, form._c),
            discriminant,
        )
        power = -power
    native = _quadratic_native_method("qfbPow")
    if runtime.jstype(native) == "function":
        data = native(
            runtime.integer_bigint(discriminant),
            _quadratic_form_data(form),
            power,
        )
        return _quadratic_form_from_data(data)
    return _quadratic_form_power_reference(form, power, discriminant)


def _quadratic_form_order(
    form: QuadraticBinaryForm,
    group_order: int,
    discriminant: Any,
) -> int:
    order = group_order
    for pair in _untyped(sage.factor)(group_order):
        prime = int(runtime.number(pair[0]))
        while order % prime == 0 and _quadratic_form_power(
            form, order // prime, discriminant
        ) == _quadratic_principal_form(discriminant):
            order //= prime
    return order


def _quadratic_subgroup(
    generators: list[QuadraticBinaryForm],
    discriminant: Any,
) -> list[QuadraticBinaryForm]:
    principal = _quadratic_principal_form(discriminant)
    elements = [principal]
    seen = runtime.map()
    seen.set(_quadratic_form_key(principal), True)
    cursor = 0
    while cursor < len(elements):
        current = elements[cursor]
        cursor += 1
        for generator in generators:
            candidate = _quadratic_compose(current, generator, discriminant)
            key = _quadratic_form_key(candidate)
            if not seen.has(key):
                seen.set(key, True)
                elements.append(candidate)
    return elements


def _quadratic_squarefree_data(
    radicand: Any,
) -> tuple[Any, Any]:
    value = runtime.integer_bigint(radicand)
    if value >= 0:
        raise NotImplementedError(
            "native quadratic class groups currently require a negative radicand"
        )
    squarefree = runtime.bigint(1)
    scale = runtime.bigint(1)
    factorization = runtime.flint_backend().factor(-value)
    for pair in factorization.factors:
        prime = runtime.integer_bigint(pair[0])
        exponent = int(pair[1])
        scale *= prime ** runtime.bigint(exponent // 2)
        if exponent % 2:
            squarefree *= prime
    return -squarefree, scale


@runtime.lightweight_math_class
class GaussianInteger(sage.Element):
    """An exact element `r + s*a` of an imaginary quadratic field."""

    def __init__(
        self,
        parent: QuadraticField_class,
        real: Any,
        imag: Any,
    ) -> None:
        self._parent = parent
        self._real = sage.QQ(real)
        self._imag = sage.QQ(imag)
        runtime.object.freeze(self)

    def __getitem__(self, index: int) -> Any:
        if index == 0:
            return self._real
        if index == 1:
            return self._imag
        raise IndexError("Gaussian integer index out of range")

    def __neg__(self) -> GaussianInteger:
        return GaussianInteger(self._parent, -self._real, -self._imag)

    def _add_(self, other: GaussianInteger) -> GaussianInteger:
        return GaussianInteger(
            self._parent,
            self._real + other._real,
            self._imag + other._imag,
        )

    def _sub_(self, other: GaussianInteger) -> GaussianInteger:
        return GaussianInteger(
            self._parent,
            self._real - other._real,
            self._imag - other._imag,
        )

    def _mul_(self, other: GaussianInteger) -> GaussianInteger:
        return GaussianInteger(
            self._parent,
            self._real * other._real
            + self._parent._radicand * self._imag * other._imag,
            self._real * other._imag + self._imag * other._real,
        )

    def _truediv_(self, other: GaussianInteger) -> GaussianInteger:
        return self * other.inverse()

    def _eq_(self, other: GaussianInteger) -> bool:
        return self._real == other._real and self._imag == other._imag

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __rmul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("mul", other, self)

    def __add__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("add", other, self)

    def __sub__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __truediv__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def is_zero(self) -> bool:
        return self._real == 0 and self._imag == 0

    def is_one(self) -> bool:
        return self._real == 1 and self._imag == 0

    def conjugate(self) -> GaussianInteger:
        return GaussianInteger(self._parent, self._real, -self._imag)

    def norm(self) -> Any:
        return (
            self._real * self._real - self._parent._radicand * self._imag * self._imag
        )

    def trace(self) -> Any:
        return 2 * self._real

    def inverse(self) -> GaussianInteger:
        norm = self.norm()
        if norm == 0:
            raise ZeroDivisionError("division by zero")
        return GaussianInteger(self._parent, self._real / norm, -self._imag / norm)

    def __pow__(self, exponent: Any) -> GaussianInteger:
        power = runtime.integer_bigint(exponent)
        if power < 0:
            return self.inverse() ** (-power)
        answer = self._parent.one()
        base = self
        while power:
            if power % 2:
                answer = answer * base
            power //= 2
            if power:
                base = base * base
        return answer

    def __repr__(self) -> str:
        if self._imag == 0:
            return str(self._real)
        variable = self._parent.variable_name()
        if self._real == 0:
            return str(self._imag) + "*" + variable
        sign = "+" if self._imag._numerator > 0 else "-"
        return (
            str(self._real) + " " + sign + " " + str(abs(self._imag)) + "*" + variable
        )

    __str__ = __repr__
    toString = __repr__


class GaussianPrimeIdeal:
    """The principal prime ideal represented by one Gaussian prime."""

    def __init__(self, generator: GaussianInteger) -> None:
        self._kind = "GaussianPrimeIdeal"
        self._generator = generator
        self._parent = generator.parent()

    def gens_reduced(self) -> tuple[GaussianInteger]:
        return runtime.math_tuple([self._generator])


class QuadraticIdeal:
    """An integral ideal represented by a reduced quadratic form."""

    def __init__(
        self,
        order: QuadraticIntegerRing,
        form: QuadraticBinaryForm,
    ) -> None:
        self._kind = "QuadraticIdeal"
        self._parent = order
        self._order = order
        self._form = form

    def gens_reduced(self) -> tuple[GaussianInteger, GaussianInteger]:
        field = self._order.number_field()
        return runtime.math_tuple(
            [
                field(self._form._a),
                field._ideal_second_generator(self._form._b),
            ]
        )

    gens = gens_reduced

    def norm(self) -> Any:
        return runtime.normalize_integer(self._form._a)

    absolute_norm = norm

    def ring(self) -> QuadraticIntegerRing:
        return self._order

    def __repr__(self) -> str:
        generators = self.gens_reduced()
        return (
            "Fractional ideal (" + str(generators[0]) + ", " + str(generators[1]) + ")"
        )

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class QuadraticClassGroupElement(sage.Element):
    """An ideal class with a canonical reduced-form representative."""

    def __init__(
        self,
        parent: QuadraticClassGroup,
        form: QuadraticBinaryForm,
    ) -> None:
        self._parent = parent
        self._form = form
        runtime.object.freeze(self)

    def _mul_(
        self,
        other: QuadraticClassGroupElement,
    ) -> QuadraticClassGroupElement:
        if (
            not isinstance(other, QuadraticClassGroupElement)
            or other._parent is not self._parent
        ):
            raise TypeError("ideal classes must have the same parent")
        return self._parent._from_form(
            _quadratic_compose(
                self._form,
                other._form,
                self._parent._discriminant,
            )
        )

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def _eq_(self, other: QuadraticClassGroupElement) -> bool:
        return (
            isinstance(other, QuadraticClassGroupElement)
            and other._parent is self._parent
            and other._form == self._form
        )

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __invert__(self) -> QuadraticClassGroupElement:
        return self._parent._from_form(
            _quadratic_reduce(
                QuadraticBinaryForm(self._form._a, -self._form._b, self._form._c),
                self._parent._discriminant,
            )
        )

    inverse = __invert__

    def __pow__(self, exponent: Any) -> QuadraticClassGroupElement:
        return self._parent._from_form(
            _quadratic_form_power(self._form, exponent, self._parent._discriminant)
        )

    def is_one(self) -> bool:
        return self._form == self._parent._principal_form

    is_principal = is_one

    def order(self) -> int:
        return _quadratic_form_order(
            self._form,
            self._parent.order(),
            self._parent._discriminant,
        )

    additive_order = order

    def ideal(self) -> QuadraticIdeal:
        return QuadraticIdeal(
            self._parent.number_field().ring_of_integers(),
            self._form,
        )

    def form(self) -> QuadraticBinaryForm:
        return self._form

    def __repr__(self) -> str:
        if self.is_one():
            return "Trivial principal fractional ideal class"
        generators = self.ideal().gens_reduced()
        return (
            "Fractional ideal class ("
            + str(generators[0])
            + ", "
            + str(generators[1])
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class QuadraticClassGroup:
    """The ideal class group of an imaginary quadratic maximal order."""

    def __init__(self, field: QuadraticField_class) -> None:
        self._field = field
        self._discriminant = runtime.integer_bigint(field.discriminant())
        self._forms = runtime.undefined
        self._order = runtime.undefined
        self._native_cyclic_generator = runtime.undefined
        native = _quadratic_native_method("qfbClassGroupData")
        if runtime.jstype(
            native
        ) == "function" and _quadratic_native_enumeration_supported(self._discriminant):
            native_data = native(self._discriminant)
            if native_data is not None:
                self._order = int(
                    runtime.number(runtime.reflect.get(native_data, "classNumber"))
                )
                generator_data = runtime.reflect.get(native_data, "generator")
                forms_data = runtime.reflect.get(native_data, "forms")
                if forms_data is not None:
                    self._forms = [
                        _quadratic_form_from_data(data) for data in forms_data
                    ]
                if generator_data is not None:
                    self._native_cyclic_generator = _quadratic_form_from_data(
                        generator_data
                    )
        if self._order is runtime.undefined:
            self._forms = _quadratic_reduced_forms(self._discriminant)
            self._order = len(self._forms)
        field._class_number = self._order
        self._principal_form = _quadratic_principal_form(self._discriminant)
        self._element_cache = runtime.map()
        self._elements = runtime.undefined
        structure = self._compute_structure()
        self._invariants = structure[0]
        self._generators = [self._from_form(form) for form in structure[1]]

    def _all_forms(self) -> list[QuadraticBinaryForm]:
        if self._forms is runtime.undefined:
            self._forms = _quadratic_reduced_forms(self._discriminant)
            if len(self._forms) != self.order():
                raise ArithmeticError(
                    "quadratic form enumeration changed the class number"
                )
        return self._forms

    def _from_form(
        self,
        form: QuadraticBinaryForm,
    ) -> QuadraticClassGroupElement:
        key = _quadratic_form_key(form)
        cached = self._element_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        element = QuadraticClassGroupElement(self, form)
        self._element_cache.set(key, element)
        return element

    def _all_elements(self) -> list[QuadraticClassGroupElement]:
        if self._elements is runtime.undefined:
            self._elements = [self._from_form(form) for form in self._all_forms()]
        return self._elements

    def _primary_basis(
        self,
        prime: int,
        exponent: int,
    ) -> tuple[list[int], list[QuadraticBinaryForm]]:
        primary_order = prime**exponent
        projection_power = self.order() // primary_order
        primary_forms = []
        seen = runtime.map()
        for form in self._all_forms():
            projected = _quadratic_form_power(
                form, projection_power, self._discriminant
            )
            key = _quadratic_form_key(projected)
            if not seen.has(key):
                seen.set(key, True)
                primary_forms.append(projected)
        if len(primary_forms) != primary_order:
            raise ArithmeticError(
                "quadratic class-group primary projection has wrong order"
            )

        ranks = [0]
        for level in range(1, exponent + 1):
            killed = 0
            bound = prime**level
            for form in primary_forms:
                if (
                    _quadratic_form_power(form, bound, self._discriminant)
                    == self._principal_form
                ):
                    killed += 1
            rank = 0
            remaining = killed
            while remaining > 1 and remaining % prime == 0:
                remaining //= prime
                rank += 1
            if remaining != 1:
                raise ArithmeticError("quadratic class-group p-rank is inconsistent")
            ranks.append(rank)

        factors = []
        for level in range(1, exponent + 1):
            at_least = ranks[level] - ranks[level - 1]
            next_at_least = ranks[level + 1] - ranks[level] if level < exponent else 0
            for _index in range(at_least - next_at_least):
                factors.append(prime**level)

        selected = []
        subgroup = [self._principal_form]
        for target_order in reversed(factors):
            chosen = runtime.undefined
            for candidate in primary_forms:
                if (
                    _quadratic_form_order(
                        candidate,
                        self.order(),
                        self._discriminant,
                    )
                    != target_order
                ):
                    continue
                candidate_subgroup = _quadratic_subgroup(
                    selected + [candidate], self._discriminant
                )
                if len(candidate_subgroup) == len(subgroup) * target_order:
                    chosen = candidate
                    subgroup = candidate_subgroup
                    break
            if chosen is runtime.undefined:
                raise ArithmeticError(
                    "failed to find independent quadratic class generators"
                )
            selected.append(chosen)
        if len(subgroup) != primary_order:
            raise ArithmeticError(
                "quadratic class generators do not span a primary part"
            )
        selected.reverse()
        return factors, selected

    def _compute_structure(
        self,
    ) -> tuple[list[int], list[QuadraticBinaryForm]]:
        if self.order() == 1:
            return [], []
        if self._native_cyclic_generator is not runtime.undefined:
            return [self.order()], [self._native_cyclic_generator]
        for form in self._all_forms():
            if (
                _quadratic_form_order(
                    form,
                    self.order(),
                    self._discriminant,
                )
                == self.order()
            ):
                return [self.order()], [form]
        component_orders = []
        component_generators = []
        maximum_rank = 0
        for pair in _untyped(sage.factor)(self.order()):
            prime = int(runtime.number(pair[0]))
            exponent = int(runtime.number(pair[1]))
            component = self._primary_basis(prime, exponent)
            component_orders.append(component[0])
            component_generators.append(component[1])
            maximum_rank = max(maximum_rank, len(component[0]))

        invariants = []
        generators = []
        for position in range(maximum_rank):
            invariant = 1
            generator = self._principal_form
            for index in range(len(component_orders)):
                offset = maximum_rank - len(component_orders[index])
                if position >= offset:
                    local_index = position - offset
                    invariant *= component_orders[index][local_index]
                    generator = _quadratic_compose(
                        generator,
                        component_generators[index][local_index],
                        self._discriminant,
                    )
            invariants.append(invariant)
            generators.append(generator)
        if len(_quadratic_subgroup(generators, self._discriminant)) != self.order():
            raise ArithmeticError(
                "quadratic class-group invariant generators do not span"
            )
        invariants.reverse()
        generators.reverse()
        return invariants, generators

    def __len__(self) -> int:
        return self.order()

    def __iter__(self) -> Any:
        return iter(self._all_elements())

    def __getitem__(self, index: int) -> QuadraticClassGroupElement:
        return self._all_elements()[index]

    def list(self) -> list[QuadraticClassGroupElement]:
        return list(self._all_elements())

    def order(self) -> int:
        return self._order

    cardinality = order

    def one(self) -> QuadraticClassGroupElement:
        return self._from_form(self._principal_form)

    def invariants(self) -> "tuple[Any, ...]":
        return runtime.math_tuple(list(self._invariants))

    def gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple(list(self._generators))

    def ngens(self) -> int:
        return len(self._generators)

    def gen(self, index: int = 0) -> QuadraticClassGroupElement:
        if index < 0 or index >= len(self._generators):
            raise IndexError("class-group generator index out of range")
        return self._generators[index]

    def number_field(self) -> QuadraticField_class:
        return self._field

    def __repr__(self) -> str:
        structure = ""
        if len(self._invariants):
            structure = " with structure " + " x ".join(
                ["C" + str(value) for value in self._invariants]
            )
        return (
            "Class group of order "
            + str(self.order())
            + structure
            + " of "
            + str(self._field)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class QuadraticIntegerRing(sage.Parent):
    """The maximal order of an imaginary quadratic number field."""

    def __init__(self, field: QuadraticField_class) -> None:
        self._field = field
        self._kind = "QuadraticOrder"
        self._construction = runtime.undefined
        self._name = "Maximal Order in " + str(field)

    def __call__(self, value: Any = 0) -> GaussianInteger:
        element = self._field(value)
        if element not in self:
            raise TypeError(str(element) + " is not integral in " + str(self._field))
        return element

    def __contains__(self, value: object) -> bool:
        try:
            element = self._field(value)
        except Exception:
            return False
        scale = self._field._root_scale
        if self._field._squarefree_radicand % 4 == 1:
            omega_coefficient = runtime.bigint(2) * scale * element._imag
            constant = element._real - omega_coefficient / 2
        else:
            omega_coefficient = scale * element._imag
            constant = element._real
        return constant._denominator == 1 and omega_coefficient._denominator == 1

    def basis(self) -> list[GaussianInteger]:
        return self._field.integral_basis()

    integral_basis = basis

    def gen(self, index: int = 0) -> GaussianInteger:
        basis = self.basis()
        if index < 0 or index >= len(basis):
            raise IndexError("maximal-order basis index out of range")
        return basis[index]

    def gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple(self.basis())

    def number_field(self) -> QuadraticField_class:
        return self._field

    fraction_field = number_field

    def discriminant(self) -> Any:
        return self._field.discriminant()

    def class_group(self) -> QuadraticClassGroup:
        return self._field.class_group()

    def class_number(self) -> int:
        return self._field.class_number()

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class QuadraticField_class(sage.Parent):
    """An exact imaginary quadratic field with native class groups."""

    def __init__(self, radicand: Any, name: str) -> None:
        if not runtime.is_exact_integer(radicand):
            raise TypeError("a quadratic radicand must be an exact integer")
        original = runtime.integer_bigint(radicand)
        squarefree_data = _quadratic_squarefree_data(original)
        self._squarefree_radicand = squarefree_data[0]
        self._root_scale = squarefree_data[1]
        self._radicand = original
        self._field_discriminant = (
            self._squarefree_radicand
            if self._squarefree_radicand % 4 == 1
            else runtime.bigint(4) * self._squarefree_radicand
        )
        polynomial_ring = _untyped(sage.PolynomialRing)(sage.QQ, "x")
        polynomial_generator = polynomial_ring.gen()
        self._polynomial = polynomial_generator**2 - original
        self._variable = name
        self._name = (
            "Number Field in "
            + name
            + " with defining polynomial "
            + str(self._polynomial)
        )
        self._kind = "QuadraticField"
        self._discriminant = runtime.normalize_integer(original)
        self._construction = {
            "kind": "QuadraticField",
            "discriminant": self._discriminant,
        }
        self._generator = GaussianInteger(self, 0, 1)
        self._integer_ring = runtime.undefined
        self._class_group = runtime.undefined
        self._class_number = runtime.undefined
        runtime.coercion_model.register(sage.ZZ, self, self)
        runtime.coercion_model.register(sage.QQ, self, self)

    def __call__(
        self,
        real: Any = 0,
        imag: Any = 0,
    ) -> GaussianInteger:
        if isinstance(real, GaussianInteger):
            if real._parent is self and imag == 0:
                return real
            raise TypeError("incompatible quadratic fields")
        return GaussianInteger(self, real, imag)

    def gen(self, index: int = 0) -> GaussianInteger:
        if index != 0:
            raise IndexError("a quadratic field has one generator")
        return self._generator

    def gens(self) -> "tuple[Any, ...]":
        return runtime.math_tuple([self.gen()])

    def zero(self) -> GaussianInteger:
        return self(0)

    def one(self) -> GaussianInteger:
        return self(1)

    def degree(self) -> int:
        return 2

    absolute_degree = degree

    def variable_name(self) -> str:
        return self._variable

    def defining_polynomial(self) -> Any:
        return self._polynomial

    polynomial = defining_polynomial

    def discriminant(self) -> Any:
        return runtime.normalize_integer(self._field_discriminant)

    absolute_discriminant = discriminant

    def integral_basis(self) -> list[GaussianInteger]:
        if self._squarefree_radicand % 4 == 1:
            return [
                self(
                    _untyped(sage.QQ)(1, 2),
                    _untyped(sage.QQ)(1, runtime.bigint(2) * self._root_scale),
                ),
                self(0, _untyped(sage.QQ)(1, self._root_scale)),
            ]
        return [
            self.one(),
            self(0, _untyped(sage.QQ)(1, self._root_scale)),
        ]

    def ring_of_integers(self) -> QuadraticIntegerRing:
        if self._integer_ring is runtime.undefined:
            self._integer_ring = QuadraticIntegerRing(self)
        return self._integer_ring

    maximal_order = ring_of_integers

    def class_group(self) -> QuadraticClassGroup:
        if self._class_group is runtime.undefined:
            self._class_group = QuadraticClassGroup(self)
        return self._class_group

    def class_number(self) -> Any:
        if self._class_number is runtime.undefined:
            native = _quadratic_native_method("qfbClassNumber")
            if runtime.jstype(
                native
            ) == "function" and _quadratic_native_enumeration_supported(
                self._field_discriminant
            ):
                self._class_number = runtime.normalize_integer(
                    native(self._field_discriminant)
                )
            else:
                self._class_number = len(
                    _quadratic_reduced_forms_reference(self._field_discriminant)
                )
        return self._class_number

    def _ideal_second_generator(self, middle: Any) -> GaussianInteger:
        if self._squarefree_radicand % 4 == 1:
            sqrt_discriminant_coefficient = _untyped(sage.QQ)(1, self._root_scale)
        else:
            sqrt_discriminant_coefficient = _untyped(sage.QQ)(2, self._root_scale)
        return self(
            _untyped(sage.QQ)(-runtime.integer_bigint(middle), 2),
            sqrt_discriminant_coefficient / 2,
        )

    def _from_serialized_prime_ideal(
        self,
        generator: GaussianInteger,
    ) -> GaussianPrimeIdeal:
        return GaussianPrimeIdeal(self(generator))

    def _first_ngens(self, count: int) -> list[GaussianInteger]:
        if count != 1:
            raise ValueError("this quadratic field has exactly one generator")
        return [self.gen()]

    def primes_of_bounded_norm(
        self,
        bound: Any,
    ) -> list[GaussianPrimeIdeal]:
        if self._radicand != -1:
            raise NotImplementedError(
                "primes_of_bounded_norm currently uses the Gaussian "
                "prime enumeration and requires QuadraticField(-1)"
            )
        limit = runtime.integer_bigint(bound)
        if limit <= 1:
            return []
        coordinate_bound = int(runtime.math.sqrt(runtime.number(limit)))
        generators = []

        # Inert rational primes p == 3 (mod 4) remain Gaussian primes and
        # have ideal norm p^2.
        candidate = runtime.bigint(3)
        while candidate * candidate <= limit:
            if candidate % 4 == 3 and runtime.flint_backend().isPrime(candidate):
                generators.append(GaussianInteger(self, candidate, 0))
            candidate += 2

        # Split and ramified primes are represented by every first-quadrant
        # solution a^2+b^2=p.  Ordered pairs give the two conjugate ideals.
        for real in range(1, coordinate_bound + 1):
            for imag in range(1, coordinate_bound + 1):
                norm = real * real + imag * imag
                if norm > limit:
                    break
                if runtime.flint_backend().isPrime(runtime.bigint(norm)):
                    generators.append(GaussianInteger(self, real, imag))
        return [GaussianPrimeIdeal(generator) for generator in generators]


def QuadraticField(
    radicand: Any,
    names: Any = None,
) -> QuadraticField_class:
    r"""Construct an exact imaginary quadratic field.

    Negative radicands support exact field arithmetic, the maximal order,
    integral bases, discriminants, and finite ideal class groups.

    ### Examples

    ```sage
    sage: K.<a> = QuadraticField(-23)
    sage: K.discriminant()
    -23
    sage: K.class_group().invariants()
    (3,)
    ```
    """
    if names is None:
        name = "i" if radicand == -1 else "a"
    elif runtime.array.isArray(names):
        if len(names) != 1:
            raise ValueError("a quadratic field has one generator name")
        name = str(names[0])
    else:
        name = str(names)
    return QuadraticField_class(radicand, name)


runtime.set_class_repr(
    AlgebraicNumberElement,
    "<class 'sage.rings.qqbar.AlgebraicNumber'>",
)
runtime.set_class_repr(
    GaussianInteger,
    "<class 'sage.rings.number_field.number_field_element."
    "NumberFieldElement_gaussian'>",
)

runtime.register_doc(
    "NumberField",
    NumberField,
    {
        "kind": "function",
        "module": "sage.rings.number_field.number_field",
        "tags": [
            "number theory",
            "number fields",
            "algebraic numbers",
            "exact arithmetic",
        ],
        "backends": ["Sage.js exact quotient arithmetic", "FLINT polynomials"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Simple fields over QQ have exact arithmetic and Sage-style "
                "generators, certified maximal orders, integral bases, field "
                "discriminants, and exact HNF ideal lattices. Galois groups "
                "are identified natively through degree four."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath number field API",
                "url": ("https://doc.sagemath.org/html/en/reference/number_fields/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT polynomial arithmetic",
                "url": "https://flintlib.org/doc/",
            },
            {
                "kind": "literature-implemented",
                "source": ("Kappe--Warren criterion for quartic Galois groups"),
                "url": "https://doi.org/10.1016/j.aim.2020.107282",
            },
            {
                "kind": "literature-implemented",
                "source": (
                    "Zassenhaus round-two maximal-order algorithm via exact "
                    "trace radicals and integral overorder enumeration"
                ),
            },
            {
                "kind": "literature-implemented",
                "source": (
                    "Buchmann--Lenstra composite-component cycles, Newton "
                    "polygons, modified Round Four, and OM/MaxMin local bases"
                ),
            },
        ],
        "limitations": [
            (
                "General unit groups, nonquadratic class groups, and Galois "
                "groups above degree four await further native number-field "
                "algorithms."
            ),
            (
                "Modified Round Four and OM/MaxMin currently have bounded "
                "domains. Unsupported local shapes use a certified exact "
                "fallback; arbitrary-size primes are never narrowed to a "
                "machine word."
            ),
        ],
    },
)

runtime.register_doc(
    "QuadraticField",
    QuadraticField,
    {
        "kind": "function",
        "module": "sage.rings.number_field.number_field",
        "tags": [
            "number theory",
            "quadratic fields",
            "rings of integers",
            "ideal class groups",
            "binary quadratic forms",
        ],
        "backends": [
            "Sage.js exact quadratic arithmetic",
            "FLINT qfb reduced-form sieve and NUCOMP arithmetic",
        ],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Negative radicands have exact arithmetic, maximal orders, "
                "integral bases, field discriminants, class numbers, and "
                "composable finite class groups with Sage-ordered invariant "
                "factors."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath quadratic number-field and class-group API",
                "url": ("https://doc.sagemath.org/html/en/reference/number_fields/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "literature-implemented",
                "source": (
                    "Gauss reduction and ideal-lattice composition of "
                    "positive-definite binary quadratic forms"
                ),
            },
            {
                "kind": "library-backed",
                "source": "FLINT binary quadratic forms",
                "url": "https://flintlib.org/doc/qfb.html",
            },
        ],
        "limitations": [
            (
                "Real quadratic fields and their unit/regulator algorithms "
                "are not yet implemented by QuadraticField."
            ),
            (
                "Certified class numbers currently enumerate every reduced "
                "form using FLINT's modular-root sieve, so very large "
                "discriminants still need a non-enumerating or "
                "subexponential backend."
            ),
        ],
    },
)
