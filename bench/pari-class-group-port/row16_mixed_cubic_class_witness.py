"""Three exact order-3 class witnesses for mixed-cubic row 16.

This leaf consumes the authenticated row-16 presentation owner.  It derives
the complete three-dimensional modulo-3 quotient, normalizes it on three
presentation-derived prime ideals, and transports each exact order relation
through the retained raw-relation map.  The principal generators and ideal
powers are computed before the frozen results are used for comparison.

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


SCHEMA = "sagejs.pari-class-group/row16-mixed-cubic-class-witness-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/mixed-cubic-presentation-v1"
FIELD_ID = "3.1.1002718428660.2"
ROWS = 48
COLUMNS = 54
DEGREE = 3
MODULUS = 3
GENERATOR_TERMINAL_INDICES = [0, 1, 2]


class Row16ClassWitnessFailure(ValueError):
    """The authenticated row-16 class witness failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row16ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row16ClassWitnessFailure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row16ClassWitnessFailure(label + " is not canonical")
        result.append(number)
    return result


def _strings(value: list[int]) -> list[str]:
    return [str(entry) for entry in value]


def _array_digest(value: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(value)).encode()).hexdigest()


def _nullspace_mod3(presentation: list[int]) -> list[list[int]]:
    """Return a deterministic basis of maps from the cokernel to `F_3`."""
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
        inverse = pow(work[rank][column], -1, MODULUS)
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
    if rank != ROWS - 3 or len(free) != 3:
        raise Row16ClassWitnessFailure(
            "presentation does not have three C3 coordinates"
        )
    basis: list[list[int]] = []
    for free_column in free:
        projection = [0] * ROWS
        projection[free_column] = 1
        for row in range(rank - 1, -1, -1):
            projection[pivots[row]] = (
                -sum(work[row][column] * projection[column] for column in free)
                % MODULUS
            )
        basis.append(projection)
    return basis


def _solve_mod3(matrix: list[list[int]], target: list[int]) -> list[int]:
    augmented = [
        [matrix[row][column] % MODULUS for column in range(3)] + [target[row] % MODULUS]
        for row in range(3)
    ]
    for column in range(3):
        pivot = next((row for row in range(column, 3) if augmented[row][column]), None)
        if pivot is None:
            raise Row16ClassWitnessFailure("generator coordinates are dependent")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        inverse = pow(augmented[column][column], -1, MODULUS)
        augmented[column] = [(inverse * value) % MODULUS for value in augmented[column]]
        for row in range(3):
            if row != column and augmented[row][column]:
                multiplier = augmented[row][column]
                augmented[row] = [
                    (augmented[row][index] - multiplier * augmented[column][index])
                    % MODULUS
                    for index in range(4)
                ]
    return [augmented[row][3] for row in range(3)]


def _normalized_projections(
    presentation: list[int], source_indices: list[int]
) -> list[list[int]]:
    basis = _nullspace_mod3(presentation)
    # Evaluation has generator rows and raw-basis columns.  Solving against
    # each standard vector makes the three distinguished ideal coordinates I.
    evaluation = [
        [basis[column][source_indices[row]] for column in range(3)] for row in range(3)
    ]
    result: list[list[int]] = []
    for coordinate in range(3):
        coefficients = _solve_mod3(
            evaluation, [int(row == coordinate) for row in range(3)]
        )
        result.append(
            [
                sum(coefficients[index] * basis[index][row] for index in range(3))
                % MODULUS
                for row in range(ROWS)
            ]
        )
    return result


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
            raise Row16ClassWitnessFailure("singular relation generator")
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
    if (
        _pari_exact_cubic_ideal_multiply(left, right, table, [0] * 27, [0] * 27, output)
        != 0
    ):
        raise Row16ClassWitnessFailure("exact ideal multiplication failed")
    return output


def compose_row16_mixed_cubic_class_witness(
    presentation_owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Compute three independent C3 generators and exact order witnesses."""
    if (
        presentation_owner.get("schema") != PRESENTATION_SCHEMA
        or presentation_owner.get("field", {}).get("id") != FIELD_ID
        or presentation_owner.get("field", {}).get("panelIndex") != 16
    ):
        raise Row16ClassWitnessFailure("wrong row-16 presentation owner")
    dimensions = presentation_owner.get("dimensions", {})
    if (
        dimensions.get("factorBaseSize") != ROWS
        or dimensions.get("relationCount") != COLUMNS
        or presentation_owner.get("presentation", {}).get("classNumber") != "27"
        or presentation_owner.get("presentation", {}).get("invariants")
        != ["3", "3", "3"]
    ):
        raise Row16ClassWitnessFailure("wrong row-16 presentation dimensions")

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
    retained_norms = _integers(
        presentation_owner.get("factorBase", {}).get("norms"), ROWS, "norms"
    )
    permutation = _integers(
        presentation_owner.get("replay", {}).get("terminalPermutation"),
        ROWS,
        "permutation",
    )
    source_indices = [permutation[index] - 1 for index in GENERATOR_TERMINAL_INDICES]
    if len(set(source_indices)) != 3:
        raise Row16ClassWitnessFailure("distinguished generator indices collided")

    presentation = _integers(
        presentation_owner.get("presentation", {}).get("matrix"),
        ROWS * ROWS,
        "presentation",
    )
    projections = _normalized_projections(presentation, source_indices)
    if any(
        sum(projection[row] * presentation[column * ROWS + row] for row in range(ROWS))
        % MODULUS
        for projection in projections
        for column in range(ROWS)
    ):
        raise Row16ClassWitnessFailure(
            "quotient projection does not annihilate presentation"
        )
    coordinate_matrix = [
        projections[coordinate][source_indices[generator]]
        for generator in range(3)
        for coordinate in range(3)
    ]
    if coordinate_matrix != [1, 0, 0, 0, 1, 0, 0, 0, 1]:
        raise Row16ClassWitnessFailure(
            "class generator coordinates are not independent"
        )

    relation_map = _integers(
        presentation_owner.get("presentation", {}).get("relationToPresentation"),
        COLUMNS * ROWS,
        "relation map",
    )
    relations = _integers(
        presentation_owner.get("relations", {}).get("matrix"),
        ROWS * COLUMNS,
        "relations",
    )
    generators = _integers(
        presentation_owner.get("relations", {}).get("principalGenerators"),
        DEGREE * COLUMNS,
        "principal generators",
    )

    witnesses: list[dict[str, Any]] = []
    computed_powers: list[list[int]] = []
    for generator_index, terminal_index in enumerate(GENERATOR_TERMINAL_INDICES):
        source_index = source_indices[generator_index]
        descriptor = descriptors[16 * terminal_index : 16 * (terminal_index + 1)]
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
        retained = retained_ideals[9 * terminal_index : 9 * (terminal_index + 1)]
        norm = prime**residue_degree
        if reconstructed != retained or norm != retained_norms[terminal_index]:
            raise Row16ClassWitnessFailure(
                "distinguished descriptor reconstruction failed"
            )

        presentation_column = generator_index
        target = [MODULUS if row == source_index else 0 for row in range(ROWS)]
        if (
            presentation[presentation_column * ROWS : (presentation_column + 1) * ROWS]
            != target
        ):
            raise Row16ClassWitnessFailure("source-derived order column changed")
        raw_coefficients = relation_map[
            presentation_column * COLUMNS : (presentation_column + 1) * COLUMNS
        ]
        replayed = [
            sum(
                relations[column * ROWS + row] * raw_coefficients[column]
                for column in range(COLUMNS)
            )
            for row in range(ROWS)
        ]
        if replayed != target:
            raise Row16ClassWitnessFailure("raw order relation changed")

        alpha = [Fraction(1), Fraction(0), Fraction(0)]
        for column, exponent in enumerate(raw_coefficients):
            if exponent:
                alpha = _multiply(
                    alpha,
                    _power(
                        generators[DEGREE * column : DEGREE * (column + 1)],
                        exponent,
                        table,
                    ),
                    table,
                )
        if any(entry.denominator != 1 for entry in alpha):
            raise Row16ClassWitnessFailure(
                "computed principal generator is not integral"
            )
        principal_generator = [entry.numerator for entry in alpha]

        square = _ideal_product(reconstructed, reconstructed, table)
        cube = _ideal_product(square, reconstructed, table)
        principal_matrix = [0] * 9
        pari_cubic_mul_matrix(table, principal_generator, principal_matrix)
        principal_hnf = [0] * 9
        if (
            _pari_exact_cubic_column_hnf(
                principal_matrix, DEGREE, [0] * 9, principal_hnf
            )
            != 0
        ):
            raise Row16ClassWitnessFailure("principal HNF computation failed")
        if cube != principal_hnf:
            raise Row16ClassWitnessFailure(
                "ideal cube is not the computed principal ideal"
            )
        computed_powers.append(cube)
        witnesses.append(
            {
                "generatorIndex": generator_index,
                "descriptor": {
                    "terminalIndex": terminal_index,
                    "sourceIndex": source_index,
                    "values": _strings(descriptor),
                    "idealHnf": _strings(reconstructed),
                    "norm": str(norm),
                },
                "coordinateVector": _strings(
                    [projection[source_index] for projection in projections]
                ),
                "orderRelation": {
                    "presentationColumn": presentation_column,
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
            }
        )

    # Filled only after deriving the three exact values from the authenticated
    # owner.  These constants are regression comparisons, never inputs.
    expected_powers = [
        [4, 1, 2, 0, 1, 0, 0, 0, 2],
        [25, 20, 2, 0, 5, 1, 0, 0, 1],
        [1331, 315, 353, 0, 1, 0, 0, 0, 1],
    ]
    if computed_powers != expected_powers:
        raise Row16ClassWitnessFailure(
            "computed ideal powers differ from frozen comparison"
        )
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "quotient": {
            "modulus": MODULUS,
            "dimension": 3,
            "projections": [_strings(projection) for projection in projections],
            "projectionSha256": [
                _array_digest(projection) for projection in projections
            ],
            "generatorCoordinateMatrix": _strings(coordinate_matrix),
            "presentationAnnihilated": True,
        },
        "witnesses": witnesses,
        "comparison": {
            "expectedPowerHnfs": [_strings(power) for power in expected_powers],
            "matches": True,
        },
    }


__all__ = [
    "Row16ClassWitnessFailure",
    "SCHEMA",
    "compose_row16_mixed_cubic_class_witness",
]
