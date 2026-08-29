"""Portable exact roots for generated-resource finite extension fields.

This implementation is deliberately lazy: ordinary Sage.js startup must not
parse the splitting machinery merely because polynomial arithmetic is part of
the eager mathematical bootstrap.
"""

from typing import Any

import sagejs.runtime as runtime


def _trim(values: list[Any]) -> list[Any]:
    """Remove trailing zero coefficients from a mutable coefficient list."""
    while len(values) != 0 and values[-1] == 0:
        values.pop()
    return values


def _quo_rem(
    dividend: list[Any], divisor: list[Any], zero: Any
) -> tuple[list[Any], list[Any]]:
    """Return dense quotient and remainder over a field."""
    remainder = list(dividend)
    quotient_length = max(0, len(dividend) - len(divisor) + 1)
    quotient = [zero for _index in range(quotient_length)]
    divisor_degree = len(divisor) - 1
    divisor_leading = divisor[-1]
    for shift in range(quotient_length - 1, -1, -1):
        factor = remainder[divisor_degree + shift] / divisor_leading
        quotient[shift] = factor
        if factor != zero:
            for index in range(divisor_degree + 1):
                remainder[index + shift] -= factor * divisor[index]
    return _trim(quotient), _trim(remainder)


def _add(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Add two low-to-high dense polynomials over an arbitrary field."""
    length = max(len(left), len(right))
    answer = [zero for _index in range(length)]
    for index in range(length):
        left_value = left[index] if index < len(left) else zero
        right_value = right[index] if index < len(right) else zero
        answer[index] = left_value + right_value
    return _trim(answer)


def _subtract(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Subtract two low-to-high dense polynomials over an arbitrary field."""
    length = max(len(left), len(right))
    answer = [zero for _index in range(length)]
    for index in range(length):
        left_value = left[index] if index < len(left) else zero
        right_value = right[index] if index < len(right) else zero
        answer[index] = left_value - right_value
    return _trim(answer)


def _multiply_mod(
    left: list[Any],
    right: list[Any],
    modulus: list[Any],
    zero: Any,
) -> list[Any]:
    """Multiply dense field polynomials and reduce modulo `modulus`."""
    if len(left) == 0 or len(right) == 0:
        return []
    product = [zero for _index in range(len(left) + len(right) - 1)]
    for left_index in range(len(left)):
        if left[left_index] == zero:
            continue
        for right_index in range(len(right)):
            if right[right_index] != zero:
                product[left_index + right_index] += (
                    left[left_index] * right[right_index]
                )
    return _quo_rem(product, modulus, zero)[1]


def _power_mod(
    value: list[Any],
    exponent: int,
    modulus: list[Any],
    zero: Any,
    one: Any,
) -> list[Any]:
    """Exponentiate a dense field polynomial modulo `modulus`."""
    exponent = runtime.integer_bigint(exponent)
    answer = [one]
    power = _quo_rem(value, modulus, zero)[1]
    while exponent:
        if exponent % 2:
            answer = _multiply_mod(answer, power, modulus, zero)
        exponent //= 2
        if exponent:
            power = _multiply_mod(power, power, modulus, zero)
    return answer


def _monic_gcd(left: list[Any], right: list[Any], zero: Any) -> list[Any]:
    """Return the monic Euclidean GCD of dense field polynomials."""
    left = _trim(list(left))
    right = _trim(list(right))
    while len(right) != 0:
        left, right = right, _quo_rem(left, right, zero)[1]
    if len(left) == 0:
        return []
    leading = left[-1]
    return [coefficient / leading for coefficient in left]


def _element_from_index(field: Any, index: int) -> Any:
    """Return the canonical power-basis element with integer index `index`."""
    prime = int(field.characteristic())
    coordinates = []
    remaining = int(index)
    for _coordinate in range(field.degree()):
        coordinates.append(remaining % prime)
        remaining //= prime
    return field._from_power_basis_coordinates(coordinates)


def generated_extension_field_polynomial_roots(
    polynomial: Any,
) -> list[list[Any]]:
    """Return exact roots of a generated-resource `GF(p^n)` polynomial.

    The implementation first extracts the product of the distinct linear
    factors as `gcd(f, X^q-X)`. It then uses deterministic equal-degree
    splitting: quadratic characters in odd characteristic and the absolute
    trace pairing in characteristic two. This is the ordinary-Python/Wasm
    counterpart of the legacy Node FLINT root routine.
    """
    if polynomial.is_zero():
        raise ArithmeticError("factorization of 0 is not defined")
    parent = polynomial.parent()
    field = parent.base_ring()
    zero = field(0)
    one = field(1)
    coefficients = _trim(polynomial.coefficients())
    if len(coefficients) <= 1:
        return []

    x_coefficients = [zero, one]
    field_order = int(field.order())
    linear_part = _monic_gcd(
        coefficients,
        _subtract(
            _power_mod(
                x_coefficients,
                field_order,
                coefficients,
                zero,
                one,
            ),
            x_coefficients,
            zero,
        ),
        zero,
    )
    if len(linear_part) <= 1:
        return []

    factors = []
    pending = [linear_part]
    characteristic = int(field.characteristic())
    while len(pending) != 0:
        factor = pending.pop()
        degree = len(factor) - 1
        if degree == 1:
            factors.append(factor)
            continue

        split = []
        for candidate_index in range(field_order):
            candidate_value = _element_from_index(field, candidate_index)
            if characteristic == 2:
                if candidate_value == zero:
                    continue
                candidate = [zero, candidate_value]
                trace = []
                power = candidate
                for _index in range(field.degree()):
                    trace = _add(trace, power, zero)
                    power = _multiply_mod(power, power, factor, zero)
                split = _monic_gcd(factor, trace, zero)
            else:
                candidate = [candidate_value, one]
                character = _power_mod(
                    candidate,
                    (field_order - 1) // 2,
                    factor,
                    zero,
                    one,
                )
                split = _monic_gcd(factor, _subtract(character, [one], zero), zero)
            if 1 < len(split) < len(factor):
                break
        if not (1 < len(split) < len(factor)):
            raise RuntimeError("finite-field linear factors did not split")
        quotient, remainder = _quo_rem(factor, split, zero)
        if len(remainder) != 0:
            raise ArithmeticError("finite-field root split was not exact")
        pending.append(split)
        pending.append(quotient)

    roots = []
    for factor in factors:
        root = -factor[0] / factor[1]
        divisor = [-root, one]
        remaining = list(coefficients)
        multiplicity = 0
        while len(remaining) > 1:
            quotient, remainder = _quo_rem(remaining, divisor, zero)
            if len(remainder) != 0:
                break
            multiplicity += 1
            remaining = quotient
        roots.append([root, runtime.number(multiplicity)])

    ordered_roots = []
    for pair in roots:
        coordinates = pair[0]._power_basis_coordinates()
        position = len(ordered_roots)
        while position != 0:
            previous_coordinates = ordered_roots[position - 1][
                0
            ]._power_basis_coordinates()
            if previous_coordinates <= coordinates:
                break
            position -= 1
        ordered_roots.insert(position, pair)
    return ordered_roots


__all__ = ["generated_extension_field_polynomial_roots"]
