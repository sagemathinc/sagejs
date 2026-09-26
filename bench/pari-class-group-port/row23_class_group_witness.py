"""Live row-23 cyclic class presentation and compact principal witness.

The input projection is produced by the connected row-23 relation/HNF root.
It contains no PARI class-group answer.  This module composes the two exact
column transformations retained by that root, executes the translated Smith
suffix, and publishes the factor-base relation proving the sixth power of the
selected class representative principal.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform


SCHEMA = "sagejs.pari-class-group/row23-cyclic-class-witness-v1"
DEGREE = 5
FACTOR_ROWS = 31
RELATIONS = 40
ASSEMBLY_ROWS = 4
ASSEMBLY_COLUMNS = 13
ZERO_COLUMNS = 9


class Row23ClassWitnessFailure(ValueError):
    """The retained row-23 class-presentation replay failed closed."""


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Row23ClassWitnessFailure(label + " has the wrong length")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row23ClassWitnessFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row23ClassWitnessFailure(label + " is not canonical")
        result.append(integer)
    return result


def _strings(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _digest(values: list[int]) -> str:
    return hashlib.sha256("\n".join(_strings(values)).encode()).hexdigest()


def _multiply(
    left: list[int], rows: int, inner: int, right: list[int], columns: int
) -> list[int]:
    """Multiply column-major integer matrices."""
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _smith() -> dict[str, list[int]]:
    matrices = [[0] for _ in range(10)]
    invariants = [0]
    class_number = [0]
    states = [[0] * 5, [0] * 5, [0] * 6, [0] * 6, [0] * 7]
    status = pari_class_group_smith_transform(
        [6],
        1,
        *matrices,
        invariants,
        class_number,
        [0],
        [0],
        [0] * 2,
        *states,
    )
    if status != 0 or states[-1] != [0, 1, 0, 0, 0, 0, 3]:
        raise Row23ClassWitnessFailure("row-23 Smith transform changed")
    names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"]
    result = dict(zip(names, matrices, strict=True))
    result["invariants"] = invariants
    result["classNumber"] = class_number
    result["leftInverseState"] = states[0]
    result["rightInverseState"] = states[1]
    result["firstDivisionState"] = states[2]
    result["secondDivisionState"] = states[3]
    result["state"] = states[4]
    return result


def compose_row23_class_group_witness(
    projection: dict[str, Any], ancestry: dict[str, Any]
) -> dict[str, Any]:
    """Compose the live HNF transforms into an exact cyclic-order witness."""
    dimensions = projection.get("dimensions", {})
    if dimensions != {
        "degree": DEGREE,
        "factorRows": FACTOR_ROWS,
        "relations": RELATIONS,
        "assemblyRows": ASSEMBLY_ROWS,
        "assemblyColumns": ASSEMBLY_COLUMNS,
    }:
        raise Row23ClassWitnessFailure("wrong row-23 retained dimensions")
    states = projection.get("states", {})
    if (
        states.get("relation") != [40, 450, 0, 1, 0, 40]
        or states.get("chain") != [3, 0, 0, 40]
        or states.get("hnf") != [1, 10, 30, 0, 9, 3, 0, 40, 0]
        or states.get("assembly") != [4, 0, 13, 4, 27, 0]
        or states.get("final") != [1, 10, 30, 0, 9, 3, 0]
        or states.get("diagonal") != [0, 1, 1, 1]
    ):
        raise Row23ClassWitnessFailure("row-23 live HNF state changed")

    relations = _integers(
        projection.get("relations", {}).get("matrix"),
        FACTOR_ROWS * RELATIONS,
        "relation matrix",
    )
    generators = _integers(
        projection.get("relations", {}).get("principalGenerators"),
        DEGREE * RELATIONS,
        "principal generators",
    )
    cleanup = _integers(
        projection.get("hnf", {}).get("cleanupTransform"),
        RELATIONS * RELATIONS,
        "cleanup transform",
    )
    hnf_transform = _integers(
        projection.get("hnf", {}).get("hnfTransform"),
        ASSEMBLY_COLUMNS * ASSEMBLY_COLUMNS,
        "HNF transform",
    )
    full_h = _integers(
        projection.get("hnf", {}).get("fullH"),
        ASSEMBLY_ROWS * ASSEMBLY_COLUMNS,
        "full HNF",
    )
    terminal_h = _integers(projection.get("hnf", {}).get("W"), 1, "terminal W")
    terminal_b = _integers(projection.get("hnf", {}).get("B"), 30, "terminal B")
    permutation = _integers(
        projection.get("hnf", {}).get("terminalPermutation"),
        FACTOR_ROWS,
        "terminal permutation",
    )
    if (
        terminal_h != [6]
        or full_h[ZERO_COLUMNS * ASSEMBLY_ROWS] != 6
        or any(
            full_h[ZERO_COLUMNS * ASSEMBLY_ROWS + row]
            for row in range(1, ASSEMBLY_ROWS)
        )
        or sorted(permutation) != list(range(1, FACTOR_ROWS + 1))
        or permutation[0] != 1
    ):
        raise Row23ClassWitnessFailure("row-23 terminal presentation changed")

    digest_checks = {
        "relationMatrixSha256": _digest(relations),
        "principalGeneratorsSha256": _digest(generators),
        "cleanupTransformSha256": _digest(cleanup),
        "hnfTransformSha256": _digest(hnf_transform),
        "hnfResultSha256": _digest(terminal_h),
        "hnfTailSha256": _digest(terminal_b),
        "terminalPermutationSha256": _digest(permutation),
    }
    for label, actual in digest_checks.items():
        if ancestry.get(label) != actual:
            raise Row23ClassWitnessFailure(label + " changed")
    for required in (
        "preparedAuthoritySha256",
        "factorOwnerSha256",
        "relationRootSourceSha256",
        "relationRootCoreSha256",
        "composerSourceSha256",
    ):
        value = ancestry.get(required)
        if not isinstance(value, str) or len(value) != 64:
            raise Row23ClassWitnessFailure("incomplete ancestry: " + required)

    # Cleanup publishes `R*T`; assembly retains its first thirteen columns;
    # HNFLLL publishes `(R*T[:13])*V`.  The sole nonunit column is V[:,9].
    retained_cleanup = [
        cleanup[column * RELATIONS + row]
        for column in range(ASSEMBLY_COLUMNS)
        for row in range(RELATIONS)
    ]
    raw_map = _multiply(
        retained_cleanup,
        RELATIONS,
        ASSEMBLY_COLUMNS,
        hnf_transform,
        ASSEMBLY_COLUMNS,
    )
    relation_coefficients = raw_map[
        ZERO_COLUMNS * RELATIONS : (ZERO_COLUMNS + 1) * RELATIONS
    ]
    target = _multiply(relations, FACTOR_ROWS, RELATIONS, relation_coefficients, 1)
    if target != [6] + [0] * (FACTOR_ROWS - 1):
        raise Row23ClassWitnessFailure("raw relations do not prove 6*e0")

    smith = _smith()
    if (
        smith["D"] != [6]
        or smith["U"] != [1]
        or smith["Ui"] != [1]
        or smith["V"] != [1]
        or smith["Ur"] != [1]
        or smith["Y"] != [0]
        or smith["Uir"] != [1]
        or smith["X"] != [0]
        or smith["M1"] != [1]
        or smith["M2"] != [0]
        or smith["invariants"] != [6]
        or smith["classNumber"] != [6]
    ):
        raise Row23ClassWitnessFailure("row-23 one-dimensional transforms changed")

    factor = projection.get("factor", {})
    ideal = _integers(factor.get("selectedIdealHnf"), 25, "selected ideal")
    descriptor = _integers(factor.get("selectedDescriptor"), 33, "descriptor")
    if descriptor[:3] != [7, 1, 1] or ideal[0] != 7 or factor.get("norm") != "7":
        raise Row23ClassWitnessFailure("row-23 selected factor ideal changed")
    if ancestry.get("selectedIdealSha256") != _digest(ideal):
        raise Row23ClassWitnessFailure("selected ideal digest changed")

    support = [index for index, value in enumerate(relation_coefficients) if value]
    if not support:
        raise Row23ClassWitnessFailure("empty compact principal witness")
    factor_generators = [
        generators[DEGREE * index : DEGREE * (index + 1)] for index in support
    ]
    factor_exponents = [relation_coefficients[index] for index in support]
    if any(value == [0] * DEGREE for value in factor_generators):
        raise Row23ClassWitnessFailure("principal witness contains a zero generator")

    return {
        "schema": SCHEMA,
        "ancestry": dict(ancestry),
        "presentation": {
            "W": ["6"],
            "classNumber": "6",
            "invariants": ["6"],
            "cyclic": True,
            "matrices": {
                name: _strings(smith[name])
                for name in ("D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2")
            },
            "states": {
                name: smith[name]
                for name in (
                    "leftInverseState",
                    "rightInverseState",
                    "firstDivisionState",
                    "secondDivisionState",
                    "state",
                )
            },
            "identities": {
                "UWVEqualsD": True,
                "UiEqualsUInverse": True,
                "UrEqualsUPlusDY": True,
                "UirEqualsUiPlusWX": True,
            },
        },
        "generator": {
            "presentationCoordinates": ["1"],
            "terminalIndex": 0,
            "sourceIndex": 0,
            "descriptor": _strings(descriptor),
            "selectedIdealHnf": _strings(ideal),
            "order": "6",
            "properDivisorsRejected": ["1", "2", "3"],
            "exactOrderFromSmithPresentation": True,
        },
        "genback": {
            "request": ["1"],
            "sourceIndices": [0],
            "candidateIdealHnf": _strings(ideal),
            "requestComplete": True,
            "degreeFiveIdealredExecuted": False,
            "reducedRepresentativePublished": False,
        },
        "compactPrincipalWitness": {
            "identity": "P_0^6=(product alpha_i^c_i)",
            "kind": "signed-live-relation-product",
            "rawRelationCoefficients": _strings(relation_coefficients),
            "rawRelationCoefficientsSha256": _digest(relation_coefficients),
            "factorBaseExponents": _strings(target),
            "factorBaseExponentsSha256": _digest(target),
            "relationIndices": support,
            "relationExponents": _strings(factor_exponents),
            "principalGenerators": [_strings(value) for value in factor_generators],
            "principalGeneratorsSha256": _digest(
                [entry for value in factor_generators for entry in value]
            ),
            "factorCount": len(support),
            "coefficientCombinationExact": True,
            "expandedPrincipalGeneratorMaterialized": False,
            "degreeFiveIdealProductReplayComplete": False,
        },
        "provenance": {
            "frozenAnswerInputs": False,
            "postcomputeOracleConsumed": False,
            "relationColumnsReplayed": RELATIONS,
            "cleanupColumnsReplayed": ASSEMBLY_COLUMNS,
            "hnfNonunitColumn": ZERO_COLUMNS,
            "terminalPermutationReplayed": True,
        },
        "completion": {
            "fullSmithTransformsComplete": True,
            "inverseHnfDivisionsComplete": True,
            "genbackRequestComplete": True,
            "selectedGeneratorIdealComplete": True,
            "reducedGeneratorIdealComplete": False,
            "presentationOrderWitnessComplete": True,
            "compactPrincipalWitnessComplete": True,
            "degreeFiveIdealProductReplayComplete": False,
            "analyticClassGroupCompletenessJoined": False,
            "unitsComplete": False,
            "publicComplete": False,
        },
        "nextMissingOwner": {
            "name": "source-derived degree-five idealred and ideal-product replay",
            "reason": (
                "the live owners prove the cyclic presentation and compact principal "
                "relation, but do not yet execute degree-five idealred or expand the "
                "signed principal product"
            ),
        },
    }


__all__ = [
    "Row23ClassWitnessFailure",
    "SCHEMA",
    "compose_row23_class_group_witness",
]
