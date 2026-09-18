"""Detached maximal ideal-witness replay for the fresh row-1 result.

The neutral row-1 envelope intentionally retains less state than the generic
ideal replay needs.  This adapter proves every statement derivable from that
envelope alone and reports the omitted owners explicitly.  In particular, it
does not turn determinant consistency into an ideal-equality claim.
"""

from __future__ import annotations

from collections.abc import Mapping
from math import prod
from typing import Any


class Row1IndependentIdealReplayFailure(ValueError):
    """The retained row-1 ideal evidence failed detached replay."""


def _integers(value: Any, label: str, length: int | None = None) -> list[int]:
    if not isinstance(value, list) or (length is not None and len(value) != length):
        raise Row1IndependentIdealReplayFailure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row1IndependentIdealReplayFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row1IndependentIdealReplayFailure(label + " is not canonical")
        result.append(integer)
    return result


def _owners(payload: Mapping[str, Any]) -> dict[str, list[int]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row1IndependentIdealReplayFailure("storage is absent")
    owners: dict[str, list[int]] = {}
    for raw in storage:
        if not isinstance(raw, Mapping) or not isinstance(raw.get("name"), str):
            raise Row1IndependentIdealReplayFailure("storage owner is malformed")
        name = raw["name"]
        if name in owners:
            raise Row1IndependentIdealReplayFailure("storage owner is duplicated")
        entries = _integers(raw.get("entries"), name + " entries")
        if raw.get("logicalLength") != str(len(entries)):
            raise Row1IndependentIdealReplayFailure(name + " length changed")
        owners[name] = entries
    return owners


def _determinant3(matrix: list[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _bareiss_determinant(column_major: list[int], dimension: int) -> int:
    matrix = [
        [column_major[column * dimension + row] for column in range(dimension)]
        for row in range(dimension)
    ]
    sign = 1
    previous = 1
    for pivot_index in range(dimension - 1):
        pivot_row = next(
            (row for row in range(pivot_index, dimension) if matrix[row][pivot_index]),
            None,
        )
        if pivot_row is None:
            return 0
        if pivot_row != pivot_index:
            matrix[pivot_index], matrix[pivot_row] = (
                matrix[pivot_row],
                matrix[pivot_index],
            )
            sign = -sign
        pivot = matrix[pivot_index][pivot_index]
        for row in range(pivot_index + 1, dimension):
            for column in range(pivot_index + 1, dimension):
                numerator = (
                    matrix[row][column] * pivot
                    - matrix[row][pivot_index] * matrix[pivot_index][column]
                )
                if numerator % previous:
                    raise Row1IndependentIdealReplayFailure(
                        "presentation determinant division was not exact"
                    )
                matrix[row][column] = numerator // previous
        previous = pivot
    return sign * matrix[-1][-1]


def replay_row1_retained_ideal_evidence(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay exactly the class presentation and retained witness invariants."""
    field = payload.get("field")
    group = payload.get("classGroup")
    if not isinstance(field, Mapping) or not isinstance(group, Mapping):
        raise Row1IndependentIdealReplayFailure("field or class group is absent")
    if int(field.get("degree", 0)) != 3:
        raise Row1IndependentIdealReplayFailure("row-1 degree changed")
    invariants = _integers(group.get("invariantFactors"), "invariant factors", 1)
    class_number = int(group.get("classNumber", 0))
    if invariants != [3] or class_number != prod(invariants):
        raise Row1IndependentIdealReplayFailure("row-1 class invariants changed")

    owners = _owners(payload)
    presentation = owners.get("class-presentation")
    witness = owners.get("class-generator-witness")
    if presentation is None or witness is None:
        raise Row1IndependentIdealReplayFailure("retained class owners are absent")
    if len(presentation) != 51 * 51 or len(witness) != 21:
        raise Row1IndependentIdealReplayFailure("retained class owner shape changed")
    presentation_determinant = abs(_bareiss_determinant(presentation, 51))
    if presentation_determinant != 3:
        raise Row1IndependentIdealReplayFailure("presentation determinant changed")

    ideal_hnf = witness[:9]
    principal_generator = witness[9:12]
    power_hnf = witness[12:]
    ideal_norm = abs(_determinant3(ideal_hnf))
    power_norm = abs(_determinant3(power_hnf))
    if ideal_norm <= 1 or power_norm != ideal_norm**3:
        raise Row1IndependentIdealReplayFailure("order-three norm relation changed")
    if not any(principal_generator):
        raise Row1IndependentIdealReplayFailure("principal generator vanished")

    missing = [
        "class-order-principal-coefficients",
        "factor-base-ideals",
        "factor-map",
        "field-multiplication-table",
        "principal-generators-by-relation",
        "raw-relation-records",
    ]
    return {
        "schema": "sagejs.pari-class-group/row1-independent-ideal-replay-v1",
        "classNumber": class_number,
        "invariantFactors": invariants,
        "presentationDimension": 51,
        "presentationDeterminant": presentation_determinant,
        "generatorIdealNorm": ideal_norm,
        "publishedPowerIdealNorm": power_norm,
        "orderNormConsistencyExact": True,
        "principalGeneratorRetained": True,
        "detachedChecks": [
            "canonical-retained-owner-encoding",
            "full-rank-presentation-determinant",
            "prime-determinant-class-invariant",
            "order-three-ideal-norm-consistency",
            "nonzero-principal-generator",
        ],
        "missingOwnersForExactIdealEquality": missing,
        "idealGeneratorReplayComplete": False,
        "qualifiedTiming": False,
    }


__all__ = [
    "Row1IndependentIdealReplayFailure",
    "replay_row1_retained_ideal_evidence",
]
