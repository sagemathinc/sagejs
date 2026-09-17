"""Exact compact order-six class witness for development-panel row 3.

The authenticated row-3 presentation is ``diag(3, 2)``.  The product of its
two presentation ideals therefore has exact order six.  This producer keeps
the principal relation proving its sixth power as a signed product of the
retained relation generators; it never expands that potentially enormous
field element.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .generator_order_witness import _pari_exact_cubic_ideal_multiply
from .mixed_cubic_presentation import _multiply_ideals, _same_lattice
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


SCHEMA = "sagejs.pari-class-group/row3-real-cubic-class-witness-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1"
FIELD_ID = (
    "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9"
)
ROWS = 668
COLUMNS = 675
DEGREE = 3
ORDER = 6


class Row3ClassWitnessFailure(ValueError):
    """The authenticated row-3 compact class witness failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row3ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3ClassWitnessFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3ClassWitnessFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _array_digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _ideal_product(left: list[int], right: list[int], table: list[int]) -> list[int]:
    output = [0] * 9
    if _pari_exact_cubic_ideal_multiply(left, right, table, [0] * 27, [0] * 27, output):
        raise Row3ClassWitnessFailure("exact cubic ideal multiplication failed")
    return output


def compose_row3_real_cubic_class_witness(
    owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Prove that the product of the two presentation ideals has order six."""
    if (
        owner.get("schema") != PRESENTATION_SCHEMA
        or owner.get("field", {}).get("id") != FIELD_ID
        or owner.get("field", {}).get("panelIndex") != 3
    ):
        raise Row3ClassWitnessFailure("wrong row-3 presentation owner")
    dimensions = owner.get("dimensions", {})
    if (
        dimensions.get("degree") != DEGREE
        or dimensions.get("factorBaseSize") != ROWS
        or dimensions.get("relationCount") != COLUMNS
        or dimensions.get("classPresentationDimension") != 2
    ):
        raise Row3ClassWitnessFailure("wrong row-3 presentation dimensions")
    presentation = owner.get("presentation", {})
    if (
        _integers(presentation.get("terminalW"), 4, "terminal W") != [3, 0, 0, 2]
        or presentation.get("classNumber") != str(ORDER)
        or presentation.get("invariants") != [str(ORDER)]
    ):
        raise Row3ClassWitnessFailure("row-3 presentation changed")

    class_map = _integers(
        presentation.get("rawToClassPresentation"), 2 * COLUMNS, "class map"
    )
    # Two times the order-three column plus three times the order-two column
    # proves the sixth power of the product presentation ideal.
    relation_coefficients = [
        2 * class_map[column] + 3 * class_map[COLUMNS + column]
        for column in range(COLUMNS)
    ]
    relation_matrix = _integers(
        owner.get("relations", {}).get("matrix"), ROWS * COLUMNS, "relations"
    )
    permutation = _integers(
        owner.get("replay", {}).get("terminalPermutation"), ROWS, "permutation"
    )
    source_indices = [permutation[0] - 1, permutation[1] - 1]
    target = [ORDER if row in source_indices else 0 for row in range(ROWS)]
    combined = [
        sum(
            relation_matrix[column * ROWS + row] * relation_coefficients[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ]
    if combined != target:
        raise Row3ClassWitnessFailure("raw compact factors do not prove 6*(e0+e1)")

    field = owner.get("field", {})
    table = _integers(field.get("multiplicationTensor"), 27, "tensor")
    factors = owner.get("factorBase", {})
    descriptors = _integers(factors.get("descriptors"), 16 * ROWS, "descriptors")
    ideals = _integers(factors.get("ideals"), 9 * ROWS, "factor ideals")
    presentation_ideals: list[list[int]] = []
    presentation_descriptors: list[list[int]] = []
    for terminal_index in range(2):
        descriptor = descriptors[16 * terminal_index : 16 * (terminal_index + 1)]
        ideal = ideals[9 * terminal_index : 9 * (terminal_index + 1)]
        reconstructed = [0] * 9
        pari_prime_ideal_hnf(
            table,
            descriptor[4:7],
            DEGREE,
            descriptor[0],
            descriptor[3],
            [0] * 9,
            [0] * 9,
            [0] * 3,
            reconstructed,
        )
        if reconstructed != ideal:
            raise Row3ClassWitnessFailure("class-generator ideal reconstruction failed")
        presentation_descriptors.append(descriptor)
        presentation_ideals.append(ideal)

    generators = _integers(
        owner.get("relations", {}).get("principalGenerators"),
        DEGREE * COLUMNS,
        "principal generators",
    )
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    factor_indices: list[int] = []
    factor_exponents: list[int] = []
    factor_generators: list[int] = []
    relation_replays = 0
    ideal_multiplications = 0
    inverse_permutation = [permutation.index(index + 1) for index in range(ROWS)]
    for column, coefficient in enumerate(relation_coefficients):
        if coefficient == 0:
            continue
        factor_indices.append(column)
        factor_exponents.append(coefficient)
        alpha = generators[DEGREE * column : DEGREE * (column + 1)]
        factor_generators.extend(alpha)
        product = identity
        row = relation_matrix[ROWS * column : ROWS * (column + 1)]
        if any(exponent < 0 or exponent > 16 for exponent in row):
            raise Row3ClassWitnessFailure("relation exponent left retained domain")
        for source_index, exponent in enumerate(row):
            if exponent:
                terminal_index = inverse_permutation[source_index]
                source_ideal = ideals[9 * terminal_index : 9 * (terminal_index + 1)]
                for _ in range(exponent):
                    product = _multiply_ideals(product, source_ideal, table)
                    ideal_multiplications += 1
        principal_matrix = [0] * 9
        pari_cubic_mul_matrix(table, alpha, principal_matrix)
        if not _same_lattice(product, principal_matrix):
            raise Row3ClassWitnessFailure(
                f"principal relation replay failed at column {column + 1}"
            )
        relation_replays += 1
    if relation_replays == 0:
        raise Row3ClassWitnessFailure("compact witness has no factors")

    generator_ideal = _ideal_product(
        presentation_ideals[0], presentation_ideals[1], table
    )
    power = identity
    for _ in range(ORDER):
        power = _ideal_product(power, generator_ideal, table)

    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "generator": {
            "presentationCoordinates": ["1", "1"],
            "terminalIndices": [0, 1],
            "sourceIndices": source_indices,
            "descriptors": [_strings(value) for value in presentation_descriptors],
            "presentationIdealHnfs": [_strings(value) for value in presentation_ideals],
            "idealHnf": _strings(generator_ideal),
        },
        "quotient": {
            "presentation": ["3", "0", "0", "2"],
            "smithInvariants": ["6"],
            "generatorOrder": str(ORDER),
            "properDivisorsRejected": ["1", "2", "3"],
            "generatorNontrivial": True,
        },
        "compactPrincipalWitness": {
            "kind": "signed-retained-relation-product",
            "relationIndices": _strings(factor_indices),
            "relationExponents": _strings(factor_exponents),
            "principalGenerators": _strings(factor_generators),
            "factorCount": relation_replays,
            "relationIndicesSha256": _array_digest(factor_indices),
            "relationExponentsSha256": _array_digest(factor_exponents),
            "principalGeneratorsSha256": _array_digest(factor_generators),
            "expandedGeneratorMaterialized": False,
        },
        "orderRelation": {
            "rawRelationCoefficientsSha256": _array_digest(relation_coefficients),
            "factorBaseExponents": _strings(target),
            "factorBaseExponentsSha256": _array_digest(target),
            "coefficientCombinationExact": True,
        },
        "exactIdealReplay": {
            "powerHnf": _strings(power),
            "principalRelationsReplayed": relation_replays,
            "idealMultiplications": ideal_multiplications,
            "powerEqualsCompactPrincipalProduct": True,
            "computedBeforeFrozenPowerComparison": True,
        },
        "completion": {
            "classWitnessesComplete": True,
            "compactPrincipalWitnessComplete": True,
            "expandedPrincipalGeneratorMaterialized": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = [
    "Row3ClassWitnessFailure",
    "SCHEMA",
    "compose_row3_real_cubic_class_witness",
]
