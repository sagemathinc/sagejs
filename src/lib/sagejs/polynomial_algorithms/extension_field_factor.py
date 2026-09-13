"""Portable exact factorization over generated-resource finite fields.

The public polynomial parent stores `GF(p^n)` coefficients in generated
FLINT resources on both Node and WebAssembly.  This module deliberately works
through the public coefficient representation, providing a host-independent
oracle for algorithms that are not part of the generated resource ABI.
"""

from typing import Any

from sagejs.polynomial_algorithms.extension_field_roots import (
    _add,
    _element_from_index,
    _monic_gcd,
    _multiply_mod,
    _power_mod,
    _quo_rem,
    _subtract,
    _trim,
)


def _is_one(value: list[Any], one: Any) -> bool:
    return len(value) == 1 and value[0] == one


def _derivative(value: list[Any], field: Any, zero: Any) -> list[Any]:
    characteristic = int(field.characteristic())
    return _trim(
        [field(index % characteristic) * value[index] for index in range(1, len(value))]
    )


def _monic(value: list[Any]) -> tuple[list[Any], Any]:
    leading = value[-1]
    return [coefficient / leading for coefficient in value], leading


def _pth_root(value: list[Any], field: Any, zero: Any) -> list[Any]:
    characteristic = int(field.characteristic())
    inverse_frobenius_exponent = int(field.order()) // characteristic
    answer = []
    for index in range(0, len(value), characteristic):
        coefficient = value[index]
        answer.append(coefficient**inverse_frobenius_exponent)
    return _trim(answer)


def _squarefree_parts(
    value: list[Any], field: Any, zero: Any, one: Any
) -> list[tuple[list[Any], int]]:
    """Return monic squarefree factors paired with their multiplicities."""
    derivative = _derivative(value, field, zero)
    if len(derivative) == 0:
        root = _pth_root(value, field, zero)
        characteristic = int(field.characteristic())
        return [
            (factor, multiplicity * characteristic)
            for factor, multiplicity in _squarefree_parts(root, field, zero, one)
        ]

    repeated = _monic_gcd(value, derivative, zero)
    remaining, remainder = _quo_rem(value, repeated, zero)
    if len(remainder) != 0:
        raise ArithmeticError("finite-field squarefree division was not exact")
    multiplicity = 1
    answer = []
    while not _is_one(remaining, one):
        overlap = _monic_gcd(remaining, repeated, zero)
        factor, remainder = _quo_rem(remaining, overlap, zero)
        if len(remainder) != 0:
            raise ArithmeticError("finite-field squarefree split was not exact")
        if not _is_one(factor, one):
            answer.append((factor, multiplicity))
        remaining = overlap
        repeated, remainder = _quo_rem(repeated, overlap, zero)
        if len(remainder) != 0:
            raise ArithmeticError("finite-field repeated split was not exact")
        multiplicity += 1

    if not _is_one(repeated, one):
        characteristic = int(field.characteristic())
        root = _pth_root(repeated, field, zero)
        answer.extend(
            (factor, count * characteristic)
            for factor, count in _squarefree_parts(root, field, zero, one)
        )
    return answer


def _candidate_polynomial(field: Any, index: int, degree: int, zero: Any) -> list[Any]:
    field_order = int(field.order())
    coefficients = []
    remaining = index
    for _position in range(degree):
        coefficients.append(_element_from_index(field, remaining % field_order))
        remaining //= field_order
    return _trim(coefficients if len(coefficients) != 0 else [zero])


def _equal_degree_factors(
    value: list[Any], factor_degree: int, field: Any, zero: Any, one: Any
) -> list[list[Any]]:
    degree = len(value) - 1
    if degree == factor_degree:
        return [value]
    field_order = int(field.order())
    characteristic = int(field.characteristic())
    candidate_index = 1
    while True:
        candidate = _candidate_polynomial(field, candidate_index, degree, zero)
        candidate_index += 1
        if characteristic == 2:
            trace = []
            power = candidate
            for _index in range(int(field.degree()) * factor_degree):
                trace = _add(trace, power, zero)
                power = _multiply_mod(power, power, value, zero)
            split = _monic_gcd(value, trace, zero)
        else:
            character = _power_mod(
                candidate,
                (field_order**factor_degree - 1) // 2,
                value,
                zero,
                one,
            )
            split = _monic_gcd(value, _subtract(character, [one], zero), zero)
        if 1 < len(split) < len(value):
            quotient, remainder = _quo_rem(value, split, zero)
            if len(remainder) != 0:
                raise ArithmeticError("finite-field equal-degree split was not exact")
            return _equal_degree_factors(
                split, factor_degree, field, zero, one
            ) + _equal_degree_factors(quotient, factor_degree, field, zero, one)


def _irreducible_factors(
    value: list[Any], field: Any, zero: Any, one: Any
) -> list[list[Any]]:
    """Factor a monic squarefree polynomial into monic irreducibles."""
    remaining = value
    x_value = [zero, one]
    frobenius = x_value
    factor_degree = 1
    answer = []
    while 2 * factor_degree <= len(remaining) - 1:
        frobenius = _power_mod(frobenius, int(field.order()), remaining, zero, one)
        part = _monic_gcd(remaining, _subtract(frobenius, x_value, zero), zero)
        if not _is_one(part, one):
            answer.extend(_equal_degree_factors(part, factor_degree, field, zero, one))
            remaining, remainder = _quo_rem(remaining, part, zero)
            if len(remainder) != 0:
                raise ArithmeticError("finite-field degree split was not exact")
            if _is_one(remaining, one):
                break
            frobenius = _quo_rem(frobenius, remaining, zero)[1]
        factor_degree += 1
    if not _is_one(remaining, one):
        answer.append(remaining)
    return answer


def generated_extension_field_polynomial_factor(
    polynomial: Any,
) -> tuple[list[list[Any]], Any]:
    """Return `(factors, unit)` for a polynomial over `GF(p^n)`.

    Each factor record is `[coefficient_list, multiplicity]`.  The dense
    lists are low-to-high and factors are monic.
    """
    if polynomial.is_zero():
        raise ArithmeticError("factorization of 0 is not defined")
    field = polynomial.parent().base_ring()
    zero = field(0)
    one = field(1)
    coefficients = _trim(polynomial.coefficients())
    if len(coefficients) == 1:
        return [], coefficients[0]
    monic, unit = _monic(coefficients)
    records = []
    for squarefree, multiplicity in _squarefree_parts(monic, field, zero, one):
        for factor in _irreducible_factors(squarefree, field, zero, one):
            records.append([factor, multiplicity])
    return records, unit


__all__ = ["generated_extension_field_polynomial_factor"]
