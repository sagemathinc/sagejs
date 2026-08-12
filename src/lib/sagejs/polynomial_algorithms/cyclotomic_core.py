"""Exact dense polynomial helpers for cyclotomic coefficient fields.

The public polynomial parent is responsible for owning coefficient objects and
for selecting a mature factorization backend.  This module contains the small,
host-independent algorithms around that boundary.  Coefficients are stored
low-to-high and may be any exact field elements supporting ordinary Python
arithmetic and equality.

Keeping this layer independent of FLINT object handles makes it both a portable
fallback and a differential oracle for future resource-backed acceleration.
"""

from __future__ import annotations

from typing import Any, Callable


_SERIALIZATION_SCHEMA = "sagejs.cyclotomic-polynomial/v1"


def dense_normalize(coefficients: list[Any], zero: Any) -> list[Any]:
    """Return a fresh low-to-high list without trailing zero coefficients."""
    answer = list(coefficients)
    while answer and answer[-1] == zero:
        answer.pop()
    return answer


def dense_construct(
    coefficients: list[Any],
    coerce: Callable[[Any], Any],
) -> list[Any]:
    """Coerce and normalize a dense polynomial coefficient list."""
    zero = coerce(0)
    return dense_normalize([coerce(value) for value in coefficients], zero)


def dense_add(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Add two low-to-high dense polynomials."""
    length = max(len(left), len(right))
    answer = [zero for _index in range(length)]
    for index in range(length):
        if index < len(left):
            answer[index] += left[index]
        if index < len(right):
            answer[index] += right[index]
    return dense_normalize(answer, zero)


def dense_subtract(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Subtract two low-to-high dense polynomials."""
    length = max(len(left), len(right))
    answer = [zero for _index in range(length)]
    for index in range(length):
        if index < len(left):
            answer[index] += left[index]
        if index < len(right):
            answer[index] -= right[index]
    return dense_normalize(answer, zero)


def dense_multiply(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Multiply two low-to-high dense polynomials."""
    if not left or not right:
        return []
    answer = [zero for _index in range(len(left) + len(right) - 1)]
    for left_index, left_coefficient in enumerate(left):
        if left_coefficient == zero:
            continue
        for right_index, right_coefficient in enumerate(right):
            if right_coefficient != zero:
                answer[left_index + right_index] += left_coefficient * right_coefficient
    return dense_normalize(answer, zero)


def dense_derivative(coefficients: list[Any], zero: Any) -> list[Any]:
    """Return the formal derivative of a low-to-high dense polynomial."""
    if len(coefficients) <= 1:
        return []
    return dense_normalize(
        [coefficients[index] * index for index in range(1, len(coefficients))],
        zero,
    )


def dense_evaluate(coefficients: list[Any], value: Any, zero: Any) -> Any:
    """Evaluate a dense polynomial by Horner's rule."""
    answer = zero
    for coefficient in reversed(coefficients):
        answer = answer * value + coefficient
    return answer


def dense_divrem(
    dividend: list[Any],
    divisor: list[Any],
    zero: Any,
) -> tuple[list[Any], list[Any]]:
    """Return quotient and remainder over an exact coefficient field."""
    divisor = dense_normalize(divisor, zero)
    if not divisor:
        raise ZeroDivisionError("division by zero polynomial")
    remainder = dense_normalize(dividend, zero)
    if len(remainder) < len(divisor):
        return [], remainder
    quotient = [zero for _index in range(len(remainder) - len(divisor) + 1)]
    divisor_degree = len(divisor) - 1
    divisor_leading = divisor[-1]
    for shift in range(len(quotient) - 1, -1, -1):
        factor = remainder[divisor_degree + shift] / divisor_leading
        quotient[shift] = factor
        if factor != zero:
            for index in range(divisor_degree + 1):
                remainder[index + shift] -= factor * divisor[index]
    return dense_normalize(quotient, zero), dense_normalize(remainder, zero)


def dense_monic(coefficients: list[Any], zero: Any) -> list[Any]:
    """Normalize a nonzero field polynomial to have leading coefficient one."""
    coefficients = dense_normalize(coefficients, zero)
    if not coefficients:
        return []
    leading = coefficients[-1]
    return [coefficient / leading for coefficient in coefficients]


def dense_gcd(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Return the monic Euclidean GCD over an exact coefficient field."""
    left = dense_normalize(left, zero)
    right = dense_normalize(right, zero)
    while right:
        _quotient, remainder = dense_divrem(left, right, zero)
        left, right = right, remainder
    return dense_monic(left, zero)


def dense_xgcd(
    left: list[Any],
    right: list[Any],
    zero: Any,
    one: Any,
) -> tuple[list[Any], list[Any], list[Any]]:
    """Return monic `(g, s, t)` with `s*left + t*right == g`."""
    old_remainder = dense_normalize(left, zero)
    remainder = dense_normalize(right, zero)
    old_left = [one]
    left_coefficient: list[Any] = []
    old_right: list[Any] = []
    right_coefficient = [one]
    while remainder:
        quotient, next_remainder = dense_divrem(old_remainder, remainder, zero)
        old_remainder, remainder = remainder, next_remainder
        old_left, left_coefficient = (
            left_coefficient,
            dense_subtract(
                old_left,
                dense_multiply(quotient, left_coefficient, zero),
                zero,
            ),
        )
        old_right, right_coefficient = (
            right_coefficient,
            dense_subtract(
                old_right,
                dense_multiply(quotient, right_coefficient, zero),
                zero,
            ),
        )
    if not old_remainder:
        return [], [], []
    leading = old_remainder[-1]
    return (
        [coefficient / leading for coefficient in old_remainder],
        [coefficient / leading for coefficient in old_left],
        [coefficient / leading for coefficient in old_right],
    )


def _dense_linear_root(coefficients: list[Any], zero: Any) -> Any:
    if len(coefficients) != 2 or coefficients[1] == zero:
        raise ValueError("a root requires a nonconstant linear factor")
    return -coefficients[0] / coefficients[1]


def dense_roots_from_factorization(
    factors: list[tuple[list[Any], int]],
    zero: Any,
) -> list[tuple[Any, int]]:
    """Extract roots from a complete split factorization.

    Factoring over a number field is intentionally delegated to a mature
    library.  This helper turns its exact low-to-high linear factors into the
    public root contract and fails if the supplied factorization is not split.
    Repeated equal linear factors are combined without requiring coefficients
    to be hashable.
    """
    roots: list[tuple[Any, int]] = []
    for factor, multiplicity in factors:
        if not isinstance(multiplicity, int) or multiplicity <= 0:
            raise ValueError("factor multiplicity must be a positive integer")
        normalized = dense_normalize(factor, zero)
        root = _dense_linear_root(normalized, zero)
        found = -1
        for index, (known_root, _known_multiplicity) in enumerate(roots):
            if root == known_root:
                found = index
                break
        if found < 0:
            roots.append((root, multiplicity))
        else:
            roots[found] = (root, roots[found][1] + multiplicity)
    return roots


def dense_roots_in_candidates(
    coefficients: list[Any],
    candidates: list[Any],
    zero: Any,
    one: Any,
) -> list[tuple[Any, int]]:
    """Find exact roots and multiplicities among explicit field candidates."""
    remaining = dense_normalize(coefficients, zero)
    answer: list[tuple[Any, int]] = []
    for candidate in candidates:
        if any(candidate == root for root, _multiplicity in answer):
            continue
        multiplicity = 0
        while len(remaining) > 1 and dense_evaluate(remaining, candidate, zero) == zero:
            quotient, remainder = dense_divrem(
                remaining,
                [-candidate, one],
                zero,
            )
            if remainder:
                break
            remaining = quotient
            multiplicity += 1
        if multiplicity:
            answer.append((candidate, multiplicity))
    return answer


def dense_format(
    coefficients: list[Any],
    variable: str,
    zero: Any,
    one: Any,
) -> str:
    """Format a dense polynomial using Sage's exact generic-field convention."""
    if not isinstance(variable, str) or not variable:
        raise ValueError("polynomial variable must be a nonempty string")
    coefficients = dense_normalize(coefficients, zero)
    if not coefficients:
        return "0"
    terms: list[str] = []
    for exponent in range(len(coefficients) - 1, -1, -1):
        coefficient = coefficients[exponent]
        if coefficient == zero:
            continue
        original_text = str(coefficient)
        has_monomial = exponent != 0
        internal_sum = " + " in original_text or " - " in original_text[1:]
        negative = original_text.startswith("-") and (
            not has_monomial or not internal_sum
        )
        if not has_monomial:
            text = original_text[1:] if negative else original_text
            if not terms:
                terms.append(("-" if negative else "") + text)
            elif negative:
                terms.append(" - " + text)
            else:
                terms.append(" + " + text)
            continue
        magnitude = -coefficient if negative else coefficient
        monomial = variable if exponent == 1 else variable + "^" + str(exponent)
        if magnitude == one:
            text = monomial
        else:
            coefficient_text = str(magnitude)
            if " + " in coefficient_text or " - " in coefficient_text:
                coefficient_text = "(" + coefficient_text + ")"
            text = coefficient_text + "*" + monomial
        if not terms:
            terms.append(("-" if negative else "") + text)
        elif negative:
            terms.append(" - " + text)
        else:
            terms.append(" + " + text)
    return "".join(terms) if terms else "0"


def dense_serialization_payload(
    order: int,
    variable: str,
    coefficients: list[Any],
    zero: Any,
    encode_coefficient: Callable[[Any], list[Any]],
) -> dict[str, Any]:
    """Encode exact power-basis coordinates without foreign resource state."""
    if not isinstance(order, int) or order <= 0:
        raise ValueError("cyclotomic order must be a positive integer")
    if not isinstance(variable, str) or not variable:
        raise ValueError("polynomial variable must be a nonempty string")
    normalized = dense_normalize(coefficients, zero)
    return {
        "schema": _SERIALIZATION_SCHEMA,
        "order": order,
        "variable": variable,
        "coefficients": [list(encode_coefficient(value)) for value in normalized],
    }


def dense_deserialize_payload(
    payload: dict[str, Any],
    expected_order: int,
    expected_variable: str,
    zero: Any,
    decode_coefficient: Callable[[list[Any]], Any],
) -> list[Any]:
    """Decode and validate a dense cyclotomic polynomial payload."""
    if payload.get("schema") != _SERIALIZATION_SCHEMA:
        raise ValueError("unknown cyclotomic polynomial serialization schema")
    if payload.get("order") != expected_order:
        raise ValueError("serialized cyclotomic polynomial order differs")
    if payload.get("variable") != expected_variable:
        raise ValueError("serialized cyclotomic polynomial variable differs")
    encoded = payload.get("coefficients")
    if not isinstance(encoded, list):
        raise TypeError("serialized coefficients must be a list")
    coefficients: list[Any] = []
    for coordinates in encoded:
        if not isinstance(coordinates, list):
            raise TypeError("serialized coefficient coordinates must be lists")
        coefficients.append(decode_coefficient(coordinates))
    return dense_normalize(coefficients, zero)
