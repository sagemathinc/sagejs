"""Storage-neutral structural calculus for exact dense polynomials.

Coefficients use the ordinary low-to-high convention: index `i` stores the
coefficient of `x^i`, and the zero polynomial is the empty list.  The helpers
do not know about public polynomial parents or physical storage.  That is
deliberate.  In particular, the caller supplies the two operations whose
result parent depends on the coefficient domain:

- `divide_by_integer` for integration; and
- `exact_quotient` for fraction-free determinant steps.

For `ZZ[x]`, integration must first coerce coefficients to `QQ` and use
rational division.  Over `GF(p)`, division by a nonunit integer raises in the
callback exactly when an antiderivative does not exist.  Resultants over `ZZ`
use exact integer division, while fields use field division.  Keeping those
choices at the public-parent boundary prevents this storage helper from
silently inventing a widening or coercion policy.
"""

from __future__ import annotations

from typing import Any, Callable


def _normalize(coefficients: list[Any], zero: Any) -> list[Any]:
    """Return a fresh coefficient list with no trailing zero entries."""
    answer = list(coefficients)
    while answer and answer[-1] == zero:
        answer.pop()
    return answer


def _add(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    length = max(len(left), len(right))
    answer = [zero for _index in range(length)]
    for index in range(length):
        if index < len(left):
            answer[index] += left[index]
        if index < len(right):
            answer[index] += right[index]
    return _normalize(answer, zero)


def _multiply(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    if not left or not right:
        return []
    answer = [zero for _index in range(len(left) + len(right) - 1)]
    for left_index, left_coefficient in enumerate(left):
        if left_coefficient == zero:
            continue
        for right_index, right_coefficient in enumerate(right):
            if right_coefficient != zero:
                answer[left_index + right_index] += left_coefficient * right_coefficient
    return _normalize(answer, zero)


def dense_compose(
    outer: list[Any],
    inner: list[Any],
    zero: Any,
) -> list[Any]:
    """Return `outer(inner(x))` using exact Horner evaluation.

    Both coefficient lists must already belong to a common result domain.  A
    public polynomial implementation is responsible for Sage's coercion and
    parent selection before calling this storage-neutral helper.
    """
    answer: list[Any] = []
    normalized_inner = _normalize(inner, zero)
    for coefficient in reversed(_normalize(outer, zero)):
        answer = _multiply(answer, normalized_inner, zero)
        if coefficient != zero:
            answer = _add(answer, [coefficient], zero)
    return answer


def dense_reverse(
    coefficients: list[Any],
    zero: Any,
    degree: int | None = None,
) -> list[Any]:
    """Reverse coefficients, optionally after truncating or zero-padding.

    With an explicit `degree`, the working list has exactly `degree + 1`
    entries before reversal.  Normalization after reversal means that a zero
    constant term can lower the resulting mathematical degree, as in Sage.
    """
    normalized = _normalize(coefficients, zero)
    if degree is None:
        return _normalize(list(reversed(normalized)), zero)
    if not isinstance(degree, int) or degree < 0:
        raise ValueError(
            "degree argument must be a nonnegative integer, got " + str(degree)
        )
    working = normalized[: degree + 1]
    if len(working) < degree + 1:
        working.extend(zero for _index in range(degree + 1 - len(working)))
    working.reverse()
    return _normalize(working, zero)


def dense_truncate(
    coefficients: list[Any],
    zero: Any,
    precision: int,
) -> list[Any]:
    """Return Sage's dense `f.truncate(precision)` coefficient contract.

    Sage treats every negative precision as lying below the constant term, so
    the result is zero. Nonnegative precision retains the coefficients with
    exponent strictly below `precision`.
    """
    if not isinstance(precision, int):
        raise TypeError("polynomial truncation precision must be an integer")
    normalized = _normalize(coefficients, zero)
    end = max(0, precision)
    return _normalize(normalized[:end], zero)


def dense_shift(
    coefficients: list[Any],
    zero: Any,
    amount: int,
) -> list[Any]:
    """Multiply by `x^amount`, discarding negative exponents."""
    if not isinstance(amount, int):
        raise TypeError("polynomial shift amount must be an integer")
    normalized = _normalize(coefficients, zero)
    if not normalized or amount == 0:
        return normalized
    if amount > 0:
        return [zero for _index in range(amount)] + normalized
    removed = -amount
    if removed >= len(normalized):
        return []
    return normalized[removed:]


def dense_integral(
    coefficients: list[Any],
    zero: Any,
    divide_by_integer: Callable[[Any, int], Any],
) -> list[Any]:
    """Return the zero-constant formal antiderivative.

    `divide_by_integer(coefficient, denominator)` must return a coefficient in
    the result domain.  Zero coefficients deliberately bypass the callback:
    in characteristic `p`, a missing `x^(p-1)` term causes no division by
    zero, while a nonzero such term correctly raises through the callback.
    """
    normalized = _normalize(coefficients, zero)
    if not normalized:
        return []
    answer = [zero]
    for index, coefficient in enumerate(normalized):
        if coefficient == zero:
            answer.append(zero)
        else:
            answer.append(divide_by_integer(coefficient, index + 1))
    return _normalize(answer, zero)


def _checked_exact_quotient(
    numerator: Any,
    denominator: Any,
    exact_quotient: Callable[[Any, Any], Any],
) -> Any:
    quotient = exact_quotient(numerator, denominator)
    if quotient * denominator != numerator:
        raise ArithmeticError("fraction-free determinant quotient was not exact")
    return quotient


def _bareiss_determinant(
    matrix: list[list[Any]],
    zero: Any,
    one: Any,
    exact_quotient: Callable[[Any, Any], Any],
) -> Any:
    """Compute a determinant by fraction-free elimination with pivoting."""
    size = len(matrix)
    if size == 0:
        return one
    if size == 1:
        return matrix[0][0]
    work = [list(row) for row in matrix]
    sign = one
    previous_pivot = one
    for pivot_column in range(size - 1):
        pivot_row = pivot_column
        while pivot_row < size and work[pivot_row][pivot_column] == zero:
            pivot_row += 1
        if pivot_row == size:
            return zero
        if pivot_row != pivot_column:
            work[pivot_column], work[pivot_row] = (
                work[pivot_row],
                work[pivot_column],
            )
            sign = -sign
        pivot = work[pivot_column][pivot_column]
        for row in range(pivot_column + 1, size):
            for column in range(pivot_column + 1, size):
                numerator = (
                    work[row][column] * pivot
                    - work[row][pivot_column] * work[pivot_column][column]
                )
                if pivot_column:
                    numerator = _checked_exact_quotient(
                        numerator,
                        previous_pivot,
                        exact_quotient,
                    )
                work[row][column] = numerator
            work[row][pivot_column] = zero
        previous_pivot = pivot
    return sign * work[-1][-1]


def dense_resultant(
    left: list[Any],
    right: list[Any],
    zero: Any,
    one: Any,
    exact_quotient: Callable[[Any, Any], Any],
) -> Any:
    """Return the Sylvester resultant over an exact integral domain.

    The implementation uses a fraction-free Bareiss determinant.  The caller
    supplies exact division appropriate to its coefficient domain: integer
    exact division for `ZZ`, and field division for `QQ` or `GF(p)`.
    """
    left = _normalize(left, zero)
    right = _normalize(right, zero)
    if not left or not right:
        return zero
    left_degree = len(left) - 1
    right_degree = len(right) - 1
    size = left_degree + right_degree
    if size == 0:
        return one
    left_descending = list(reversed(left))
    right_descending = list(reversed(right))
    sylvester = [[zero for _column in range(size)] for _row in range(size)]
    for row in range(right_degree):
        for index, coefficient in enumerate(left_descending):
            sylvester[row][row + index] = coefficient
    for right_row in range(left_degree):
        row = right_degree + right_row
        for index, coefficient in enumerate(right_descending):
            sylvester[row][right_row + index] = coefficient
    return _bareiss_determinant(sylvester, zero, one, exact_quotient)


def dense_discriminant(
    coefficients: list[Any],
    zero: Any,
    one: Any,
    exact_quotient: Callable[[Any, Any], Any],
) -> Any:
    """Return the exact polynomial discriminant.

    Sage returns its polynomial zero object for the zero polynomial, whereas
    specialized public implementations commonly expose a scalar zero.  This
    storage layer returns the supplied coefficient-domain `zero`; a public
    wrapper that preserves Sage's zero-polynomial parent can handle that one
    object-level distinction without changing the calculation.

    The leading-coefficient exponent uses the actual normalized derivative
    degree.  This matters in positive characteristic, where differentiation
    may remove one or more high terms.
    """
    coefficients = _normalize(coefficients, zero)
    if not coefficients:
        return zero
    degree = len(coefficients) - 1
    if degree == 0:
        return zero
    if degree == 1:
        return one
    derivative = [coefficients[index] * index for index in range(1, len(coefficients))]
    derivative = _normalize(derivative, zero)
    derivative_degree = len(derivative) - 1
    resultant = dense_resultant(
        coefficients,
        derivative,
        zero,
        one,
        exact_quotient,
    )
    if degree % 4 in (2, 3):
        resultant = -resultant
    leading_exponent = degree - derivative_degree - 2
    if leading_exponent == -1:
        return _checked_exact_quotient(
            resultant,
            coefficients[-1],
            exact_quotient,
        )
    return resultant * coefficients[-1] ** leading_exponent
