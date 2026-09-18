"""Exact compact order-two class witness for development-panel row 4.

The row-4 presentation contains a source-derived vector `c` satisfying
`R*c = 2*e_s`.  Expanding `product(alpha_j**c_j)` is needlessly enormous.
This leaf instead retains that signed product exactly, replays every involved
principal relation `(alpha_j) = product(P_i**R_ij)`, and verifies the small
ideal power `P_s**2`.  Thus the compact product is an exact principal
witness for the generator order relation without a common denominator or a
huge algebraic intermediate.

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


SCHEMA = "sagejs.pari-class-group/row4-real-cubic-class-witness-v1"
PRESENTATION_SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1"
FIELD_ID = (
    "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9"
)
ROWS = 560
COLUMNS = 567
DEGREE = 3
ORDER = 2


class Row4ClassWitnessFailure(ValueError):
    """The authenticated row-4 compact class witness failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row4ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row4ClassWitnessFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row4ClassWitnessFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _array_digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _ideal_product(left: list[int], right: list[int], table: list[int]) -> list[int]:
    output = [0] * 9
    if _pari_exact_cubic_ideal_multiply(left, right, table, [0] * 27, [0] * 27, output):
        raise Row4ClassWitnessFailure("exact cubic ideal multiplication failed")
    return output


def compose_row4_real_cubic_class_witness(
    owner: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Prove the row-4 generator has exact order two using compact factors."""
    if (
        owner.get("schema") != PRESENTATION_SCHEMA
        or owner.get("field", {}).get("id") != FIELD_ID
        or owner.get("field", {}).get("panelIndex") != 4
    ):
        raise Row4ClassWitnessFailure("wrong row-4 presentation owner")
    dimensions = owner.get("dimensions", {})
    if (
        dimensions.get("degree") != DEGREE
        or dimensions.get("factorBaseSize") != ROWS
        or dimensions.get("relationCount") != COLUMNS
        or dimensions.get("classPresentationDimension") != 1
    ):
        raise Row4ClassWitnessFailure("wrong row-4 presentation dimensions")
    presentation = owner.get("presentation", {})
    if (
        _integers(presentation.get("terminalW"), 1, "terminal W") != [ORDER]
        or presentation.get("classNumber") != str(ORDER)
        or presentation.get("invariants") != [str(ORDER)]
    ):
        raise Row4ClassWitnessFailure("row-4 cyclic presentation changed")

    relation_coefficients = _integers(
        presentation.get("rawToClassPresentation"), COLUMNS, "class map"
    )
    relation_matrix = _integers(
        owner.get("relations", {}).get("matrix"), ROWS * COLUMNS, "relations"
    )
    permutation = _integers(
        owner.get("replay", {}).get("terminalPermutation"), ROWS, "permutation"
    )
    source_index = permutation[0] - 1
    target = [ORDER if row == source_index else 0 for row in range(ROWS)]
    combined = [
        sum(
            relation_matrix[column * ROWS + row] * relation_coefficients[column]
            for column in range(COLUMNS)
        )
        for row in range(ROWS)
    ]
    if combined != target:
        raise Row4ClassWitnessFailure("raw compact factors do not prove 2*e_s")

    table = _integers(owner.get("field", {}).get("multiplicationTensor"), 27, "tensor")
    descriptors = _integers(
        owner.get("factorBase", {}).get("descriptors"), 16 * ROWS, "descriptors"
    )
    ideals = _integers(
        owner.get("factorBase", {}).get("ideals"), 9 * ROWS, "factor ideals"
    )
    descriptor = descriptors[:16]
    generator_ideal = ideals[:9]
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
    if reconstructed != generator_ideal or descriptor[0] ** descriptor[2] != 5:
        raise Row4ClassWitnessFailure("class-generator ideal reconstruction failed")

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
    for column, coefficient in enumerate(relation_coefficients):
        if coefficient == 0:
            continue
        factor_indices.append(column)
        factor_exponents.append(coefficient)
        alpha = generators[DEGREE * column : DEGREE * (column + 1)]
        factor_generators.extend(alpha)

        # Replay this retained relation before accepting it as one compact
        # principal factor.  Its factor-base exponents are small and positive;
        # only the outer signed coefficients are large.
        product = identity
        row = relation_matrix[ROWS * column : ROWS * (column + 1)]
        if any(exponent < 0 or exponent > 16 for exponent in row):
            raise Row4ClassWitnessFailure("relation exponent left retained domain")
        for terminal_index, exponent in enumerate(row):
            # Relations use source factor order; published factor ideals use
            # terminal order, so invert the retained terminal permutation.
            if exponent:
                source_ideal = ideals[
                    9 * permutation.index(terminal_index + 1) : 9
                    * (permutation.index(terminal_index + 1) + 1)
                ]
                for _ in range(exponent):
                    product = _multiply_ideals(product, source_ideal, table)
                    ideal_multiplications += 1
        principal_matrix = [0] * 9
        pari_cubic_mul_matrix(table, alpha, principal_matrix)
        if not _same_lattice(product, principal_matrix):
            raise Row4ClassWitnessFailure(
                f"principal relation replay failed at column {column + 1}"
            )
        relation_replays += 1

    if relation_replays == 0:
        raise Row4ClassWitnessFailure("compact witness has no factors")
    power = _ideal_product(generator_ideal, generator_ideal, table)
    if power != [25, 17, 6, 0, 1, 0, 0, 0, 1]:
        raise Row4ClassWitnessFailure("computed class-generator square changed")

    # Each replay proves (alpha_j)=prod_i(P_i^R_ij).  The exact equality
    # R*c=2e_s therefore proves product_j(alpha_j^c_j)=P_s^2, including the
    # negative exponents, without materializing the enormous field element.
    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "generator": {
            "terminalIndex": 0,
            "sourceIndex": source_index,
            "descriptor": _strings(descriptor),
            "idealHnf": _strings(generator_ideal),
            "norm": "5",
        },
        "quotient": {
            "presentation": [str(ORDER)],
            "generatorOrder": str(ORDER),
            "properDivisorRejected": "1",
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
    "Row4ClassWitnessFailure",
    "SCHEMA",
    "compose_row4_real_cubic_class_witness",
]
