"""Detached maximal ideal-witness replay for the fresh row-3 result."""

from __future__ import annotations

from collections.abc import Mapping
from math import gcd, prod
from typing import Any


class Row3IndependentIdealReplayFailure(ValueError):
    """The retained row-3 ideal evidence failed detached replay."""


def _integers(value: Any, label: str) -> list[int]:
    if not isinstance(value, list):
        raise Row3IndependentIdealReplayFailure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row3IndependentIdealReplayFailure(label + " is not integer data")
        integer = int(entry)
        if str(integer) != str(entry):
            raise Row3IndependentIdealReplayFailure(label + " is not canonical")
        result.append(integer)
    return result


def _owners(payload: Mapping[str, Any]) -> dict[str, list[int]]:
    storage = payload.get("storage")
    if not isinstance(storage, list):
        raise Row3IndependentIdealReplayFailure("storage is absent")
    owners: dict[str, list[int]] = {}
    for raw in storage:
        if not isinstance(raw, Mapping) or not isinstance(raw.get("name"), str):
            raise Row3IndependentIdealReplayFailure("storage owner is malformed")
        name = raw["name"]
        if name in owners:
            raise Row3IndependentIdealReplayFailure("storage owner is duplicated")
        entries = _integers(raw.get("entries"), name + " entries")
        if raw.get("logicalLength") != str(len(entries)):
            raise Row3IndependentIdealReplayFailure(name + " length changed")
        owners[name] = entries
    return owners


def _determinant3(matrix: list[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def replay_row3_retained_ideal_evidence(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay the Smith presentation and compact order-witness structure."""
    field = payload.get("field")
    group = payload.get("classGroup")
    if not isinstance(field, Mapping) or not isinstance(group, Mapping):
        raise Row3IndependentIdealReplayFailure("field or class group is absent")
    if int(field.get("degree", 0)) != 3:
        raise Row3IndependentIdealReplayFailure("row-3 degree changed")
    invariants = _integers(group.get("invariantFactors"), "invariant factors")
    class_number = int(group.get("classNumber", 0))
    if invariants != [6] or class_number != prod(invariants):
        raise Row3IndependentIdealReplayFailure("row-3 class invariants changed")

    owners = _owners(payload)
    required = {
        "class-generator-ideal",
        "class-generator-presentation-ideals",
        "class-order-factor-base-exponents",
        "class-order-principal-generators",
        "class-order-relation-exponents",
        "class-order-relation-indices",
        "class-presentation",
    }
    missing_retained = sorted(required - owners.keys())
    if missing_retained:
        raise Row3IndependentIdealReplayFailure(
            "retained class owners are absent: " + ", ".join(missing_retained)
        )
    presentation = owners["class-presentation"]
    if len(presentation) != 4:
        raise Row3IndependentIdealReplayFailure("presentation shape changed")
    determinant = presentation[0] * presentation[3] - presentation[1] * presentation[2]
    content = 0
    for value in presentation:
        content = gcd(content, abs(value))
    if abs(determinant) != 6 or content != 1:
        raise Row3IndependentIdealReplayFailure("Smith presentation changed")

    generator = owners["class-generator-ideal"]
    presentation_ideals = owners["class-generator-presentation-ideals"]
    relation_indices = owners["class-order-relation-indices"]
    relation_exponents = owners["class-order-relation-exponents"]
    principal_generators = owners["class-order-principal-generators"]
    if len(generator) != 9 or len(presentation_ideals) % 9:
        raise Row3IndependentIdealReplayFailure("retained ideal shape changed")
    if len(relation_indices) != len(relation_exponents) or not relation_indices:
        raise Row3IndependentIdealReplayFailure("compact relation witness changed")
    if len(principal_generators) != 3 * len(relation_indices):
        raise Row3IndependentIdealReplayFailure("principal generator list changed")
    if any(index < 0 for index in relation_indices):
        raise Row3IndependentIdealReplayFailure("relation index became negative")
    if not any(relation_exponents) or not any(principal_generators):
        raise Row3IndependentIdealReplayFailure("compact witness became trivial")
    generator_norm = abs(_determinant3(generator))
    if generator_norm <= 1:
        raise Row3IndependentIdealReplayFailure("generator ideal became trivial")

    missing = [
        "factor-base-ideals",
        "field-multiplication-table",
        "raw-relation-records",
    ]
    return {
        "schema": "sagejs.pari-class-group/row3-independent-ideal-replay-v1",
        "classNumber": class_number,
        "invariantFactors": invariants,
        "presentationDimension": 2,
        "presentationDeterminant": abs(determinant),
        "presentationContent": content,
        "generatorIdealNorm": generator_norm,
        "presentationIdealCount": len(presentation_ideals) // 9,
        "compactRelationTermCount": len(relation_indices),
        "principalGeneratorCount": len(principal_generators) // 3,
        "detachedChecks": [
            "canonical-retained-owner-encoding",
            "smith-presentation-determinant-and-content",
            "compact-order-witness-shapes",
            "nontrivial-generator-ideal-norm",
        ],
        "missingOwnersForExactIdealEquality": missing,
        "idealGeneratorReplayComplete": False,
        "qualifiedTiming": False,
    }


__all__ = [
    "Row3IndependentIdealReplayFailure",
    "replay_row3_retained_ideal_evidence",
]
