"""Exact class-generator and order-principal witness for panel row 1.

This leaf consumes the authenticated panel-1 presentation.  It reconstructs
the distinguished prime ideal from its retained descriptor, computes a
modulo-3 Smith projection of the full presentation, and transports the exact
order relation back through the retained raw-relation map.  The principal
generator is consequently computed from the 58 authenticated relation
generators; it is not a frozen answer.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
from fractions import Fraction
from typing import Any

from .generator_order_witness import (
    _pari_exact_cubic_column_hnf,
    _pari_exact_cubic_ideal_multiply,
)
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


SCHEMA = "sagejs.pari-class-group/panel1-c3-class-witness-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/panel1-presentation-authority-v1"
ROWS = 51
COLUMNS = 58
DEGREE = 3
MODULUS = 3


class Panel1ClassWitnessFailure(ValueError):
    """The authenticated row-1 class witness failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Panel1ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Panel1ClassWitnessFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Panel1ClassWitnessFailure(label + " is not canonical")
        result.append(number)
    return result


def _strings(value: list[int]) -> list[str]:
    return [str(entry) for entry in value]


def _array_digest(value: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(value)).encode()).hexdigest()


def _smith_projection_mod3(presentation: list[int]) -> list[int]:
    """Return the normalized one-dimensional cokernel projection modulo 3."""
    # Row-reduce presentation transpose: its nullspace consists of the maps
    # from the presented lattice to F_3.
    work = [
        [presentation[column * ROWS + row] % MODULUS for row in range(ROWS)]
        for column in range(ROWS)
    ]
    pivots: list[int] = []
    rank = 0
    for column in range(ROWS):
        pivot = rank
        while pivot < ROWS and work[pivot][column] == 0:
            pivot += 1
        if pivot == ROWS:
            continue
        work[rank], work[pivot] = work[pivot], work[rank]
        inverse = 1 if work[rank][column] == 1 else 2
        work[rank] = [(inverse * value) % MODULUS for value in work[rank]]
        for row in range(ROWS):
            multiplier = work[row][column]
            if row != rank and multiplier:
                work[row] = [
                    (work[row][index] - multiplier * work[rank][index]) % MODULUS
                    for index in range(ROWS)
                ]
        pivots.append(column)
        rank += 1
    free = [column for column in range(ROWS) if column not in pivots]
    if rank != ROWS - 1 or len(free) != 1:
        raise Panel1ClassWitnessFailure("presentation does not have one C3 coordinate")
    projection = [0] * ROWS
    projection[free[0]] = 1
    for row in range(rank - 1, -1, -1):
        projection[pivots[row]] = (
            -sum(work[row][column] * projection[column] for column in free) % MODULUS
        )
    return projection


def _multiply(
    left: list[Fraction], right: list[Fraction], table: list[int]
) -> list[Fraction]:
    return [
        sum(
            Fraction(table[(i * DEGREE + j) * DEGREE + k]) * left[i] * right[j]
            for i in range(DEGREE)
            for j in range(DEGREE)
        )
        for k in range(DEGREE)
    ]


def _inverse(value: list[Fraction], table: list[int]) -> list[Fraction]:
    augmented = [
        [
            sum(
                Fraction(table[(i * DEGREE + column) * DEGREE + row]) * value[i]
                for i in range(DEGREE)
            )
            for column in range(DEGREE)
        ]
        + [Fraction(row == 0)]
        for row in range(DEGREE)
    ]
    for column in range(DEGREE):
        pivot = column
        while pivot < DEGREE and augmented[pivot][column] == 0:
            pivot += 1
        if pivot == DEGREE:
            raise Panel1ClassWitnessFailure("singular relation generator")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [entry / divisor for entry in augmented[column]]
        for row in range(DEGREE):
            if row != column:
                multiplier = augmented[row][column]
                augmented[row] = [
                    augmented[row][index] - multiplier * augmented[column][index]
                    for index in range(DEGREE + 1)
                ]
    return [augmented[row][DEGREE] for row in range(DEGREE)]


def _power(value: list[int], exponent: int, table: list[int]) -> list[Fraction]:
    base = [Fraction(entry) for entry in value]
    if exponent < 0:
        base = _inverse(base, table)
        exponent = -exponent
    result = [Fraction(1), Fraction(0), Fraction(0)]
    while exponent:
        if exponent & 1:
            result = _multiply(result, base, table)
        exponent //= 2
        if exponent:
            base = _multiply(base, base, table)
    return result


def _ideal_product(left: list[int], right: list[int], table: list[int]) -> list[int]:
    output = [0] * 9
    status = _pari_exact_cubic_ideal_multiply(
        left, right, table, [0] * 27, [0] * 27, output
    )
    if status != 0:
        raise Panel1ClassWitnessFailure("exact ideal multiplication failed")
    return output


def compose_panel1_c3_class_witness(
    presentation_owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Compute the row-1 C3 generator and its exact principal order witness."""
    if presentation_owner.get("schema") != PRESENTATION_SCHEMA:
        raise Panel1ClassWitnessFailure("wrong presentation owner")
    dimensions = presentation_owner.get("dimensions", {})
    if (
        dimensions.get("factorBaseSize") != ROWS
        or dimensions.get("relationCount") != COLUMNS
    ):
        raise Panel1ClassWitnessFailure("wrong presentation dimensions")
    table = _integers(
        presentation_owner.get("field", {}).get("multiplicationTensor"), 27, "table"
    )
    descriptors = _integers(
        presentation_owner.get("factorBase", {}).get("descriptors"),
        16 * ROWS,
        "descriptors",
    )
    retained_ideals = _integers(
        presentation_owner.get("factorBase", {}).get("ideals"), 9 * ROWS, "ideals"
    )
    permutation = _integers(
        presentation_owner.get("replay", {}).get("terminalPermutation"),
        ROWS,
        "permutation",
    )
    # Vbase[0] is source descriptor 5, hence source relation coordinate 4.
    terminal_index = 0
    source_index = permutation[terminal_index] - 1
    descriptor = descriptors[:16]
    prime, _, residue_degree, inert = descriptor[:4]
    reconstructed = [0] * 9
    pari_prime_ideal_hnf(
        table,
        descriptor[4:7],
        DEGREE,
        prime,
        inert,
        [0] * 9,
        [0] * 9,
        [0] * 3,
        reconstructed,
    )
    if reconstructed != retained_ideals[:9] or prime**residue_degree != 11:
        raise Panel1ClassWitnessFailure(
            "distinguished descriptor reconstruction failed"
        )

    presentation = _integers(
        presentation_owner.get("presentation", {}).get("matrix"),
        ROWS * ROWS,
        "presentation",
    )
    projection = _smith_projection_mod3(presentation)
    if projection[source_index] == 0:
        raise Panel1ClassWitnessFailure("distinguished ideal has zero C3 coordinate")
    inverse_coordinate = pow(projection[source_index], -1, MODULUS)
    projection = [(entry * inverse_coordinate) % MODULUS for entry in projection]
    if any(
        sum(projection[row] * presentation[column * ROWS + row] for row in range(ROWS))
        % MODULUS
        for column in range(ROWS)
    ):
        raise Panel1ClassWitnessFailure(
            "Smith projection does not annihilate presentation"
        )

    # The computed first presentation column is exactly 3*e_source.  Transport
    # that column through R*V=P to obtain its raw-relation coefficients.
    target = [MODULUS if row == source_index else 0 for row in range(ROWS)]
    if presentation[:ROWS] != target:
        raise Panel1ClassWitnessFailure("source-derived order column changed")
    relation_map = _integers(
        presentation_owner.get("presentation", {}).get("relationToPresentation"),
        COLUMNS * ROWS,
        "relation map",
    )
    raw_coefficients = relation_map[:COLUMNS]
    relations = _integers(
        presentation_owner.get("relations", {}).get("matrix"),
        ROWS * COLUMNS,
        "relations",
    )
    if [
        sum(
            relations[column * ROWS + row] * raw_coefficients[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ] != target:
        raise Panel1ClassWitnessFailure("raw order relation changed")

    generators = _integers(
        presentation_owner.get("relations", {}).get("principalGenerators"),
        DEGREE * COLUMNS,
        "principal generators",
    )
    alpha = [Fraction(1), Fraction(0), Fraction(0)]
    for column, exponent in enumerate(raw_coefficients):
        if exponent:
            alpha = _multiply(
                alpha,
                _power(
                    generators[DEGREE * column : DEGREE * (column + 1)], exponent, table
                ),
                table,
            )
    if any(entry.denominator != 1 for entry in alpha):
        raise Panel1ClassWitnessFailure("computed principal generator is not integral")
    principal_generator = [entry.numerator for entry in alpha]

    square = _ideal_product(reconstructed, reconstructed, table)
    cube = _ideal_product(square, reconstructed, table)
    principal_matrix = [0] * 9
    pari_cubic_mul_matrix(table, principal_generator, principal_matrix)
    principal_hnf = [0] * 9
    if _pari_exact_cubic_column_hnf(principal_matrix, 3, [0] * 9, principal_hnf) != 0:
        raise Panel1ClassWitnessFailure("principal HNF computation failed")
    if cube != principal_hnf:
        raise Panel1ClassWitnessFailure("P^3 is not the computed principal ideal")

    expected = [1331, 437, 831, 0, 1, 0, 0, 0, 1]
    if cube != expected:
        raise Panel1ClassWitnessFailure(
            "computed ideal power differs from frozen comparison"
        )
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "descriptor": {
            "terminalIndex": terminal_index,
            "sourceIndex": source_index,
            "values": _strings(descriptor),
            "idealHnf": _strings(reconstructed),
            "norm": str(prime**residue_degree),
        },
        "smithCoordinate": {
            "modulus": MODULUS,
            "projection": _strings(projection),
            "projectionSha256": _array_digest(projection),
            "generatorCoordinate": str(projection[source_index]),
            "presentationAnnihilated": True,
        },
        "orderRelation": {
            "presentationCoordinates": ["1"] + ["0"] * (ROWS - 1),
            "rawRelationCoefficients": _strings(raw_coefficients),
            "rawRelationCoefficientsSha256": _array_digest(raw_coefficients),
            "factorBaseExponents": _strings(target),
            "principalGenerator": _strings(principal_generator),
            "principalGeneratorSha256": _array_digest(principal_generator),
        },
        "exactIdealReplay": {
            "squareHnf": _strings(square),
            "powerHnf": _strings(cube),
            "principalHnf": _strings(principal_hnf),
            "powerEqualsPrincipal": True,
            "computedBeforeExpectedComparison": True,
        },
        "comparison": {"expectedPowerHnf": _strings(expected), "matches": True},
    }


__all__ = ["Panel1ClassWitnessFailure", "SCHEMA", "compose_panel1_c3_class_witness"]
