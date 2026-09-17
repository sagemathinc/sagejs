"""Exact cyclic order-18 witness for the row-18 mixed cubic."""

from __future__ import annotations

from fractions import Fraction
from math import gcd
from typing import Any

from .generator_order_witness import (
    _pari_exact_cubic_column_hnf,
    _pari_exact_cubic_ideal_multiply,
)
from .panel1_c3_class_witness import _multiply, _power
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


SCHEMA = "sagejs.pari-class-group/row18-cyclic-class-witness-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/mixed-cubic-presentation-v1"
FIELD_ID = "3.1.1005907102200.3"
ORDER = 18


class Row18ClassWitnessFailure(ValueError):
    """The source-derived cyclic class witness failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row18ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row18ClassWitnessFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row18ClassWitnessFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _solve(matrix: list[int], right: list[int], dimension: int) -> list[Fraction]:
    augmented = [
        [Fraction(matrix[column * dimension + row]) for column in range(dimension)]
        + [Fraction(right[row])]
        for row in range(dimension)
    ]
    for column in range(dimension):
        pivot = column
        while pivot < dimension and augmented[pivot][column] == 0:
            pivot += 1
        if pivot == dimension:
            raise Row18ClassWitnessFailure("presentation is singular")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(dimension):
            if row == column:
                continue
            multiplier = augmented[row][column]
            if multiplier:
                augmented[row] = [
                    augmented[row][at] - multiplier * augmented[column][at]
                    for at in range(dimension + 1)
                ]
    return [augmented[row][-1] for row in range(dimension)]


def _lcm(left: int, right: int) -> int:
    return abs(left * right) // gcd(left, right)


def _ideal_product(left: list[int], right: list[int], table: list[int]) -> list[int]:
    output = [0] * 9
    if _pari_exact_cubic_ideal_multiply(left, right, table, [0] * 27, [0] * 27, output):
        raise Row18ClassWitnessFailure("exact ideal multiplication failed")
    return output


def compose_row18_cyclic_class_witness(
    owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Select and prove one source factor of exact order 18."""
    if (
        owner.get("schema") != PRESENTATION_SCHEMA
        or owner.get("field", {}).get("id") != FIELD_ID
    ):
        raise Row18ClassWitnessFailure("wrong row-18 presentation owner")
    dimensions = owner.get("dimensions", {})
    rows = int(dimensions.get("factorBaseSize", 0))
    columns = int(dimensions.get("relationCount", 0))
    if (rows, columns) != (41, 50):
        raise Row18ClassWitnessFailure("wrong row-18 presentation dimensions")
    presentation = _integers(
        owner.get("presentation", {}).get("matrix"), rows * rows, "presentation"
    )
    chosen = -1
    inverse_column: list[Fraction] = []
    coordinate_orders: list[int] = []
    for source in range(rows):
        solution = _solve(
            presentation, [int(row == source) for row in range(rows)], rows
        )
        order = 1
        for value in solution:
            order = _lcm(order, value.denominator)
        coordinate_orders.append(order)
        if chosen < 0 and order == ORDER:
            chosen = source
            inverse_column = solution
    if chosen < 0:
        raise Row18ClassWitnessFailure(
            "presentation has no factor coordinate of order 18"
        )
    presentation_coefficients = [int(ORDER * value) for value in inverse_column]
    target = [ORDER if row == chosen else 0 for row in range(rows)]
    if [
        sum(
            presentation[column * rows + row] * presentation_coefficients[column]
            for column in range(rows)
        )
        for row in range(rows)
    ] != target:
        raise Row18ClassWitnessFailure("order-18 presentation relation failed")
    for divisor in (1, 2, 3, 6, 9):
        if all((divisor * value).denominator == 1 for value in inverse_column):
            raise Row18ClassWitnessFailure("generator has a proper-divisor order")

    relation_map = _integers(
        owner.get("presentation", {}).get("relationToPresentation"),
        columns * rows,
        "relation map",
    )
    raw_coefficients = [
        sum(
            relation_map[column * columns + source] * presentation_coefficients[column]
            for column in range(rows)
        )
        for source in range(columns)
    ]
    relations = _integers(
        owner.get("relations", {}).get("matrix"), rows * columns, "relations"
    )
    if [
        sum(
            relations[column * rows + row] * raw_coefficients[column]
            for column in range(columns)
        )
        for row in range(rows)
    ] != target:
        raise Row18ClassWitnessFailure("raw order relation failed")
    table = _integers(owner.get("field", {}).get("multiplicationTensor"), 27, "tensor")
    generators = _integers(
        owner.get("relations", {}).get("principalGenerators"),
        3 * columns,
        "principal generators",
    )
    alpha = [Fraction(1), Fraction(0), Fraction(0)]
    for column, exponent in enumerate(raw_coefficients):
        if exponent:
            alpha = _multiply(
                alpha,
                _power(generators[3 * column : 3 * column + 3], exponent, table),
                table,
            )
    if any(value.denominator != 1 for value in alpha):
        raise Row18ClassWitnessFailure("principal generator is not integral")
    principal_generator = [value.numerator for value in alpha]

    permutation = _integers(
        owner.get("replay", {}).get("terminalPermutation"), rows, "permutation"
    )
    terminal_index = permutation.index(chosen + 1)
    descriptors = _integers(
        owner.get("factorBase", {}).get("descriptors"), 16 * rows, "descriptors"
    )
    ideals = _integers(owner.get("factorBase", {}).get("ideals"), 9 * rows, "ideals")
    descriptor = descriptors[16 * terminal_index : 16 * (terminal_index + 1)]
    ideal = ideals[9 * terminal_index : 9 * (terminal_index + 1)]
    reconstructed = [0] * 9
    pari_prime_ideal_hnf(
        table,
        descriptor[4:7],
        3,
        descriptor[0],
        descriptor[3],
        [0] * 9,
        [0] * 9,
        [0] * 3,
        reconstructed,
    )
    if reconstructed != ideal:
        raise Row18ClassWitnessFailure("selected factor ideal reconstruction failed")
    power = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for _ in range(ORDER):
        power = _ideal_product(power, ideal, table)
    principal_matrix = [0] * 9
    pari_cubic_mul_matrix(table, principal_generator, principal_matrix)
    principal_hnf = [0] * 9
    if _pari_exact_cubic_column_hnf(principal_matrix, 3, [0] * 9, principal_hnf):
        raise Row18ClassWitnessFailure("principal HNF computation failed")
    if power != principal_hnf:
        raise Row18ClassWitnessFailure("selected ideal power is not principal")
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "generator": {
            "sourceIndex": chosen,
            "terminalIndex": terminal_index,
            "descriptor": _strings(descriptor),
            "idealHnf": _strings(ideal),
            "norm": str(descriptor[0] ** descriptor[2]),
        },
        "quotient": {
            "coordinateOrders": _strings(coordinate_orders),
            "generatorOrder": str(ORDER),
            "properDivisorsRejected": ["1", "2", "3", "6", "9"],
        },
        "orderRelation": {
            "presentationCoefficients": _strings(presentation_coefficients),
            "rawRelationCoefficients": _strings(raw_coefficients),
            "factorBaseExponents": _strings(target),
            "principalGenerator": _strings(principal_generator),
        },
        "exactIdealReplay": {
            "powerHnf": _strings(power),
            "principalHnf": _strings(principal_hnf),
            "powerEqualsPrincipal": True,
        },
        "computedBeforeExpectedComparison": True,
    }


__all__ = [
    "Row18ClassWitnessFailure",
    "SCHEMA",
    "compose_row18_cyclic_class_witness",
]
