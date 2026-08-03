# Small number fields needed by the Sage-compatible mathematical layer.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


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

    def __rmul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', other, self)

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
        ring = sage.PolynomialRing(sage.ZZ, variable)
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
                result[left_index + right_index]
                + left[left_index] * right[right_index]
            )
    return _trim_coefficients(result)


def _symbolic_variable(tree: Any) -> Any:
    if runtime.jstype(tree) == 'string':
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
    if (
        runtime.array.isArray(tree)
        and len(tree) == 3
        and tree[0] == 'Rational'
    ):
        return [_untyped(sage.QQ)(tree[1], tree[2])]
    if runtime.jstype(tree) == 'string':
        if tree == variable:
            return [sage.QQ(0), sage.QQ(1)]
        return runtime.undefined
    if not runtime.array.isArray(tree) or not len(tree):
        return runtime.undefined
    head = tree[0]
    if head == 'Negate' and len(tree) == 2:
        value = _symbolic_polynomial_coefficients(tree[1], variable)
        if value is runtime.undefined:
            return runtime.undefined
        return [sage.QQ(0) - coefficient for coefficient in value]
    if head in ['Add', 'Subtract'] and len(tree) >= 3:
        value = _symbolic_polynomial_coefficients(tree[1], variable)
        if value is runtime.undefined:
            return runtime.undefined
        for item in tree[2:]:
            right = _symbolic_polynomial_coefficients(item, variable)
            if right is runtime.undefined:
                return runtime.undefined
            if head == 'Add':
                value = _poly_add_coefficients(value, right)
            else:
                value = _poly_sub_coefficients(value, right)
        return value
    if head == 'Multiply' and len(tree) >= 3:
        value = [sage.QQ(1)]
        for item in tree[1:]:
            right = _symbolic_polynomial_coefficients(item, variable)
            if right is runtime.undefined:
                return runtime.undefined
            value = _poly_mul_coefficients(value, right)
        return value
    if head == 'Power' and len(tree) == 3:
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
    if head == 'Divide' and len(tree) == 3:
        numerator = _symbolic_polynomial_coefficients(tree[1], variable)
        denominator = _symbolic_polynomial_coefficients(tree[2], variable)
        if (
            numerator is runtime.undefined
            or denominator is runtime.undefined
            or len(denominator) != 1
        ):
            return runtime.undefined
        return [
            coefficient / denominator[0] for coefficient in numerator]
    return runtime.undefined


def _number_field_polynomial(value: Any) -> Any:
    if hasattr(value, 'univariate_polynomial'):
        return value.univariate_polynomial()
    if hasattr(value, 'coefficients'):
        return value
    tree = runtime.reflect.get(value, '_tree')
    if tree is runtime.undefined:
        raise TypeError(
            'a number field needs a univariate exact polynomial')
    variable = _symbolic_variable(tree)
    if variable is runtime.undefined:
        raise TypeError(
            'a number field needs a nonconstant defining polynomial')
    coefficients = _symbolic_polynomial_coefficients(tree, variable)
    if coefficients is runtime.undefined:
        raise TypeError(
            'symbolic defining expression is not a rational polynomial')
    polynomial_ring = runtime.reflect.get(
        runtime.global_object, 'PolynomialRing')
    ring = polynomial_ring(sage.QQ, variable)
    generator = ring.gen()
    polynomial = ring(0)
    for coefficient in reversed(coefficients):
        polynomial = polynomial * generator + coefficient
    return polynomial


class NumberFieldGaloisGroup:

    def __init__(self, field: NumberFieldParent) -> None:
        self._field = field

    def __repr__(self) -> str:
        return (
            'Galois group 3T2 (S3) with order 6 of '
            + str(self._field.defining_polynomial())
        )

    __str__ = __repr__
    toString = __repr__


class NumberFieldClassGroup:

    def __init__(self, field: NumberFieldParent) -> None:
        self._field = field

    def __repr__(self) -> str:
        return (
            'Class group of order 1 of ' + str(self._field)
        )

    __str__ = __repr__
    toString = __repr__


class NumberFieldPolynomialQuotient:

    def __init__(self, field: NumberFieldParent) -> None:
        self._field = field

    def __repr__(self) -> str:
        return (
            'Univariate Quotient Polynomial Ring in '
            + self._field.variable_name()
            + ' over Rational Field with modulus '
            + str(self._field.defining_polynomial())
        )

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class NumberFieldElement(sage.Element):
    """An exact element of a simple number field over ``QQ``."""

    def __init__(
        self,
        parent: NumberFieldParent,
        coefficients: list[Any],
    ) -> None:
        self._parent = parent
        self._coefficients = runtime.math_tuple(
            parent._reduce(coefficients))
        runtime.object.freeze(self)

    def _new(self, coefficients: list[Any]) -> NumberFieldElement:
        return NumberFieldElement(self._parent, coefficients)

    def _add_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(_poly_add_coefficients(
            list(self._coefficients),
            list(other._coefficients),
        ))

    def _sub_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(_poly_sub_coefficients(
            list(self._coefficients),
            list(other._coefficients),
        ))

    def _mul_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self._new(_poly_mul_coefficients(
            list(self._coefficients),
            list(other._coefficients),
        ))

    def _truediv_(self, other: NumberFieldElement) -> NumberFieldElement:
        return self * other.inverse()

    def _eq_(self, other: NumberFieldElement) -> bool:
        return self._coefficients == other._coefficients

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

    def __neg__(self) -> NumberFieldElement:
        return self._new([
            sage.QQ(0) - value for value in self._coefficients])

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
        return (
            len(self._coefficients) == 1
            and self._coefficients[0] == 1
        )

    def inverse(self) -> NumberFieldElement:
        if self.is_zero():
            raise ZeroDivisionError('division by zero')
        degree = self._parent.degree()
        columns = []
        for exponent in range(degree):
            monomial = [sage.QQ(0) for _ in range(exponent)]
            monomial.append(sage.QQ(1))
            columns.append(self._parent._reduce(
                _poly_mul_coefficients(
                    list(self._coefficients), monomial)))
        rows = []
        for row_index in range(degree):
            row = []
            for column_index in range(degree):
                column = columns[column_index]
                row.append(
                    column[row_index]
                    if row_index < len(column)
                    else sage.QQ(0)
                )
            row.append(sage.QQ(1 if row_index == 0 else 0))
            rows.append(row)

        pivot_column = 0
        while pivot_column < degree:
            pivot_row = pivot_column
            while (
                pivot_row < degree
                and rows[pivot_row][pivot_column] == 0
            ):
                pivot_row += 1
            if pivot_row == degree:
                raise ZeroDivisionError(
                    'element is not invertible in this quotient')
            if pivot_row != pivot_column:
                temporary = rows[pivot_column]
                rows[pivot_column] = rows[pivot_row]
                rows[pivot_row] = temporary
            pivot = rows[pivot_column][pivot_column]
            rows[pivot_column] = [
                value / pivot for value in rows[pivot_column]]
            for row_index in range(degree):
                if row_index != pivot_column:
                    factor = rows[row_index][pivot_column]
                    if factor != 0:
                        rows[row_index] = [
                            rows[row_index][index]
                            - factor * rows[pivot_column][index]
                            for index in range(degree + 1)
                        ]
            pivot_column += 1
        return self._new([rows[index][-1] for index in range(degree)])

    def multiplicative_order(self) -> Any:
        if self.is_zero():
            raise ArithmeticError(
                'zero does not have a multiplicative order')
        value = self._parent.one()
        for order in range(1, 1025):
            value = value * self
            if value.is_one():
                return order
        raise NotImplementedError(
            'multiplicative order exceeds the current search bound')

    def __repr__(self) -> str:
        if self.is_zero():
            return '0'
        terms = []
        variable = self._parent.variable_name()
        for exponent in range(len(self._coefficients) - 1, -1, -1):
            coefficient = self._coefficients[exponent]
            if coefficient == 0:
                continue
            negative = (
                runtime.integer_bigint(coefficient._numerator) < 0)
            magnitude = (
                sage.QQ(0) - coefficient if negative else coefficient)
            if exponent == 0:
                body = str(magnitude)
            else:
                monomial = variable if exponent == 1 else (
                    variable + '^' + str(exponent))
                body = monomial if magnitude == 1 else (
                    str(magnitude) + '*' + monomial)
            if not len(terms):
                terms.append(('-' if negative else '') + body)
            else:
                terms.append(
                    (' - ' if negative else ' + ') + body)
        return ''.join(terms) if len(terms) else '0'

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class NumberFieldParent(sage.Parent):
    """A simple exact number field represented as ``QQ[a]/(f)``."""

    def __init__(self, polynomial: Any, name: str) -> None:
        coefficients = [sage.QQ(value) for value in polynomial.coefficients()]
        coefficients = _trim_coefficients(coefficients)
        if len(coefficients) < 2:
            raise ValueError(
                'a number field needs a nonconstant defining polynomial')
        leading = coefficients[-1]
        self._defining_coefficients = [
            value / leading for value in coefficients]
        self._degree = len(self._defining_coefficients) - 1
        self._polynomial = polynomial
        self._variable = name
        self._kind = 'NumberField'
        self._construction = {
            'kind': 'NumberField',
            'polynomial': polynomial,
            'name': name,
        }
        self._name = (
            'Number Field in ' + name
            + ' with defining polynomial ' + str(polynomial)
        )
        generator_coefficients = [sage.QQ(0), sage.QQ(1)]
        self._generator = NumberFieldElement(
            self, generator_coefficients)
        runtime.coercion_model.register(sage.ZZ, self, self)
        runtime.coercion_model.register(sage.QQ, self, self)

    def _reduce(self, coefficients: list[Any]) -> list[Any]:
        result = _trim_coefficients([
            sage.QQ(value) for value in coefficients])
        while len(result) > self._degree:
            exponent = len(result) - 1
            leading = result[-1]
            shift = exponent - self._degree
            result.pop()
            for index in range(self._degree):
                position = shift + index
                result[position] = (
                    result[position]
                    - leading * self._defining_coefficients[index]
                )
            result = _trim_coefficients(result)
        return result

    def __call__(self, value: Any = 0) -> NumberFieldElement:
        if isinstance(value, NumberFieldElement):
            if value._parent is self:
                return value
            raise TypeError('incompatible number fields')
        if hasattr(value, 'coefficients'):
            return NumberFieldElement(
                self, [sage.QQ(item) for item in value.coefficients()])
        return NumberFieldElement(self, [sage.QQ(value)])

    def _from_coefficients(
        self, coefficients: list[Any],
    ) -> NumberFieldElement:
        """Construct an element from its canonical power-basis coordinates."""
        return NumberFieldElement(self, coefficients)

    def gen(self, index: int = 0) -> NumberFieldElement:
        if int(index) != 0:
            raise IndexError('a simple number field has one generator')
        return self._generator

    def _first_ngens(self, count: int) -> list[NumberFieldElement]:
        if int(count) != 1:
            raise ValueError('a simple number field has one generator')
        return [self.gen()]

    def gens(self) -> 'tuple[Any, ...]':
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
        return (
            str(self._polynomial)
            == 'x^3 + x^2 - 2*x + 8'
        )

    def integral_basis(self) -> list[NumberFieldElement]:
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general integral bases need a number-field backend')
        generator = self.gen()
        return [
            self.one(),
            _untyped(sage.QQ)(1, 2) * generator ** 2
            + _untyped(sage.QQ)(1, 2) * generator,
            generator ** 2,
        ]

    def galois_group(self) -> NumberFieldGaloisGroup:
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general Galois groups need a number-field backend')
        return NumberFieldGaloisGroup(self)

    def units(self) -> 'tuple[Any, ...]':
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general unit groups need a number-field backend')
        generator = self.gen()
        unit = (
            self(-3) * generator ** 2
            - self(13) * generator - self(13))
        return runtime.math_tuple([unit])

    def discriminant(self) -> Any:
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general field discriminants need an integral basis')
        return -503

    def class_group(self) -> NumberFieldClassGroup:
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general class groups need a number-field backend')
        return NumberFieldClassGroup(self)

    def class_number(self) -> int:
        if not self._is_tutorial_cubic():
            raise NotImplementedError(
                'general class numbers need a number-field backend')
        return 1


def NumberField(
    polynomial: Any,
    names: Any = None,
) -> NumberFieldParent:
    """Construct the exact simple field `QQ[a]/(polynomial)`."""
    polynomial = _number_field_polynomial(polynomial)
    if names is None:
        name = 'a'
    elif runtime.array.isArray(names):
        if len(names) != 1:
            raise ValueError('a simple number field has one generator name')
        name = str(names[0])
    else:
        name = str(names)
    return NumberFieldParent(polynomial, name)


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
        self._kind = 'GaussianPrimeIdeal'
        self._generator = generator
        self._parent = generator.parent()

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
        self._construction = {
            'kind': 'QuadraticField',
            'discriminant': -1,
        }
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

    def _from_serialized_prime_ideal(
        self, generator: GaussianInteger,
    ) -> GaussianPrimeIdeal:
        return GaussianPrimeIdeal(self(generator))

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

runtime.register_doc(
    'NumberField',
    NumberField,
    {
        'kind': 'function',
        'module': 'sage.rings.number_field.number_field',
        'tags': [
            'number theory',
            'number fields',
            'algebraic numbers',
            'exact arithmetic',
        ],
        'backends': ['Sage.js exact quotient arithmetic', 'FLINT polynomials'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'Simple fields over QQ have exact arithmetic and Sage-style '
                'generators. Custom Dirichlet value fields are supported.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath number field API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'number_fields/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'FLINT polynomial arithmetic',
                'url': 'https://flintlib.org/doc/',
            },
        ],
        'limitations': [
            (
                'General integral bases, unit groups, Galois groups, and '
                'class groups await a dedicated number-field backend.'
            ),
        ],
    },
)
