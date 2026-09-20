# Copyright (C) Sage.js contributors.
# License: GPL-3.0-only

"""Certified, answer-free preparation for the experimental Rust class core.

This module is a narrow serialization boundary, not a class-group algorithm.
It converts a public Sage.js number field into the exact cubic data consumed by
the Rust qualification engine.  No relations, units, class numbers, retry
schedules, or expected answers cross this boundary.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import sagejs as sage

_SCHEMA = "sagejs.rust-class-group.neutral-input/v1"
_SMALL_PRIMES = (
    2,
    3,
    5,
    7,
    11,
    13,
    17,
    19,
    23,
    29,
    31,
    37,
    41,
    43,
    47,
    53,
    59,
    61,
    67,
    71,
    73,
    79,
    83,
    89,
    97,
)


def _maximal_order_module() -> Any:
    return __import__(
        "sagejs.number_fields.maximal_order",
        fromlist=["maximal_order"],
    )


def _integer_prime_divisors(value: int) -> list[int]:
    if value < 1:
        raise ValueError("an equation-order index must be positive")
    if value == 1:
        return []
    answer = []
    for prime, _exponent in sage.factor(value):
        answer.append(int(prime))
    product = 1
    remaining = value
    for prime in answer:
        product *= prime
        while remaining % prime == 0:
            remaining //= prime
    if remaining != 1 or product < 2:
        raise ArithmeticError("failed to certify equation-order index support")
    return answer


def _irreducibility_prime(polynomial: Any) -> int:
    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    variable = polynomial._parent.variable_name()
    for prime in _SMALL_PRIMES:
        residue_ring = sage.PolynomialRing(finite_fields.GF(prime), variable)
        if residue_ring(polynomial).is_irreducible():
            return prime
    raise NotImplementedError(
        "no irreducibility witness was found among the first 25 rational primes"
    )


def _determinant_3(matrix: list[list[int]]) -> int:
    return (
        matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
    )


def _multiply_3(left: list[list[int]], right: list[list[int]]) -> list[list[int]]:
    return [
        [
            sum(left[row][middle] * right[middle][column] for middle in range(3))
            for column in range(3)
        ]
        for row in range(3)
    ]


def _inverse_unimodular_3(matrix: list[list[int]]) -> list[list[int]]:
    determinant = _determinant_3(matrix)
    if determinant not in (-1, 1):
        raise ArithmeticError("an integral basis change must be unimodular")
    answer = []
    for row in range(3):
        inverse_row = []
        for column in range(3):
            minor_rows = [index for index in range(3) if index != column]
            minor_columns = [index for index in range(3) if index != row]
            cofactor = (
                matrix[minor_rows[0]][minor_columns[0]]
                * matrix[minor_rows[1]][minor_columns[1]]
                - matrix[minor_rows[0]][minor_columns[1]]
                * matrix[minor_rows[1]][minor_columns[0]]
            )
            if (row + column) % 2 != 0:
                cofactor = -cofactor
            inverse_row.append(cofactor // determinant)
        answer.append(inverse_row)
    return answer


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_remainder = abs(left)
    remainder = abs(right)
    old_left_coefficient = 1
    left_coefficient = 0
    old_right_coefficient = 0
    right_coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_left_coefficient, left_coefficient = (
            left_coefficient,
            old_left_coefficient - quotient * left_coefficient,
        )
        old_right_coefficient, right_coefficient = (
            right_coefficient,
            old_right_coefficient - quotient * right_coefficient,
        )
    if left < 0:
        old_left_coefficient = -old_left_coefficient
    if right < 0:
        old_right_coefficient = -old_right_coefficient
    return old_remainder, old_left_coefficient, old_right_coefficient


def _unit_first_change(
    numerator: list[list[int]], denominator: int
) -> tuple[list[list[int]], list[list[int]]]:
    determinant = _determinant_3(numerator)
    cofactors = [
        numerator[1][1] * numerator[2][2] - numerator[1][2] * numerator[2][1],
        numerator[0][2] * numerator[2][1] - numerator[0][1] * numerator[2][2],
        numerator[0][1] * numerator[1][2] - numerator[0][2] * numerator[1][1],
    ]
    scaled = [denominator * value for value in cofactors]
    if determinant == 0 or any(value % determinant != 0 for value in scaled):
        raise ArithmeticError("one is not integral in the certified order basis")
    unit_coordinates = [value // determinant for value in scaled]

    current = list(unit_coordinates)
    right_change = [
        [1 if row == column else 0 for column in range(3)] for row in range(3)
    ]
    for column in (1, 2):
        divisor, first, second = _extended_gcd(current[0], current[column])
        if divisor == 0:
            continue
        step = [[1 if row == other else 0 for other in range(3)] for row in range(3)]
        step[0][0] = first
        step[0][column] = -(current[column] // divisor)
        step[column][0] = second
        step[column][column] = current[0] // divisor
        current = [
            sum(current[index] * step[index][target] for index in range(3))
            for target in range(3)
        ]
        right_change = _multiply_3(right_change, step)
    if current[0] == -1:
        for row in range(3):
            right_change[row][0] = -right_change[row][0]
        current[0] = 1
    if current != [1, 0, 0]:
        raise ArithmeticError("the certified order does not contain one primitively")
    left_change = _inverse_unimodular_3(right_change)
    if left_change[0] != unit_coordinates:
        raise ArithmeticError("failed to place one first in the integral basis")
    return left_change, right_change


def _integral_basis_projection(
    order: Any, scale: int
) -> tuple[list[list[int]], int, list[list[int]], list[list[int]]]:
    """Express a unit-first certified basis in the integral generator."""
    rational_rows = []
    denominator = 1
    for row in order._basis_rows:
        transformed = []
        power = sage.ZZ(1)
        for value in row:
            coordinate = value / power
            transformed.append(coordinate)
            denominator = _positive_lcm(denominator, int(coordinate._denominator))
            power *= scale
        rational_rows.append(transformed)
    numerator = []
    for row in rational_rows:
        numerator_row = []
        for value in row:
            scaled = value * denominator
            if scaled._denominator != 1:
                raise ArithmeticError("failed to project the integral basis exactly")
            numerator_row.append(int(scaled._numerator))
        numerator.append(numerator_row)
    left_change, right_change = _unit_first_change(numerator, denominator)
    return (
        _multiply_3(left_change, numerator),
        int(denominator),
        left_change,
        right_change,
    )


def _transform_multiplication_table(
    table: Any,
    left_change: list[list[int]],
    right_change: list[list[int]],
) -> list[list[list[int]]]:
    answer = []
    for left in range(3):
        left_products = []
        for right in range(3):
            old_coordinates = [0, 0, 0]
            for old_left in range(3):
                for old_right in range(3):
                    coefficient = (
                        left_change[left][old_left] * left_change[right][old_right]
                    )
                    for coordinate in range(3):
                        old_coordinates[coordinate] += coefficient * int(
                            table[old_left][old_right][coordinate]
                        )
            new_coordinates = [
                sum(
                    old_coordinates[coordinate] * right_change[coordinate][target]
                    for coordinate in range(3)
                )
                for target in range(3)
            ]
            left_products.append(new_coordinates)
        answer.append(left_products)
    return answer


def _exact_integer(value: Any) -> dict[str, str]:
    return {"numerator": str(int(value)), "denominator": "1"}


def _positive_lcm(left: int, right: int) -> int:
    if left < 1 or right < 1:
        raise ValueError("LCM operands must be positive")
    a = left
    b = right
    while b != 0:
        a, b = b, a % b
    return (left // a) * right


def prepare_cubic_for_rust(
    field: Any,
    *,
    proof: str = "conditional-grh",
    precision_bits: int = 192,
) -> dict[str, Any]:
    """Return a certified neutral cubic input for the Rust qualification core.

    The returned dictionary is JSON-serializable and contains no class-group
    answers.  Sage.js certifies the maximal order before any basis is exported;
    the Rust consumer independently replays the polynomial, basis, table,
    discriminant, signature, equation-order index support, and irreducibility
    witness before starting relation collection.
    """
    if field.degree() != 3:
        raise NotImplementedError(
            "the Rust qualification boundary currently needs degree 3"
        )
    if proof != "conditional-grh":
        raise NotImplementedError(
            "the Rust qualification boundary currently needs proof='conditional-grh'"
        )
    if precision_bits < 64:
        raise ValueError("precision_bits must be at least 64")

    maximal = _maximal_order_module()
    polynomial = maximal.integral_equation_polynomial(field)
    coefficients = list(polynomial.list())
    if len(coefficients) != 4 or coefficients[-1] != 1:
        raise ValueError("the integral equation polynomial must be monic cubic")
    scale = int(field._integral_equation_scale_cache)
    order = field.maximal_order()
    if not order.is_maximal():
        raise ArithmeticError("Sage.js did not certify the exported maximal order")
    # Materialize and retain the public proof authority before serializing its
    # consequences.  The dictionary itself remains internal to Sage.js.
    certificate = order.maximality_certificate()
    if certificate.get("certified") is not True:
        raise ArithmeticError("the maximal-order certificate did not replay")

    basis_rows, basis_denominator, left_change, right_change = (
        _integral_basis_projection(order, scale)
    )
    basis_numerators = [value for row in basis_rows for value in row]
    table = _transform_multiplication_table(
        maximal._nf_order_multiplication_table_frozen(order),
        left_change,
        right_change,
    )
    multiplication_table = [
        [[_exact_integer(value) for value in product] for product in left]
        for left in table
    ]
    index = int(maximal.equation_order_index(order))
    signature = field.signature()
    preparation_payload = {
        "basisNumeratorsRowMajor": [str(value) for value in basis_numerators],
        "basisDenominator": str(basis_denominator),
        "discriminant": str(int(order.discriminant())),
        "signature": {
            "realPlaces": int(signature[0]),
            "complexPairs": int(signature[1]),
        },
        "multiplicationTable": multiplication_table,
        "irreducibilityPrime": _irreducibility_prime(polynomial),
        "indexPrimes": [str(prime) for prime in _integer_prime_divisors(index)],
    }
    canonical = json.dumps(
        {
            "polynomial": [str(int(value)) for value in coefficients],
            "preparation": preparation_payload,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    source_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    preparation_payload.update(
        {
            "kind": "neutral-prepared-field",
            "authority": "sagejs-certified-preparation",
            "maximalOrderCertified": True,
            "sourceSha256": source_sha256,
        }
    )
    return {
        "schema": _SCHEMA,
        "inputId": "sha256:" + source_sha256,
        "fieldId": "sagejs-cubic-" + source_sha256[:16],
        "field": {
            "variable": polynomial._parent.variable_name(),
            "coefficientsAscending": [str(int(value)) for value in coefficients],
            "degree": 3,
            "monic": True,
            "irreducible": True,
        },
        "preparation": preparation_payload,
        "request": {
            "proof": proof,
            "output": "class-and-unit-group",
            "mapPolicy": "construct-eagerly",
            "unitPolicy": "compact-complete",
            "limits": {
                "wallMilliseconds": "60000",
                "memoryBytes": "1073741824",
                "relationCandidates": "5000000",
                "precisionBits": precision_bits,
                "continuationPasses": 16,
            },
        },
        "randomness": {"algorithm": "pari-compatible-seed-one", "seed": "1"},
        "containsOracleAnswers": False,
    }


__all__ = ["prepare_cubic_for_rust"]
