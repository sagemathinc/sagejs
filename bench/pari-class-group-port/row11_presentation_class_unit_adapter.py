"""Derive the honest row-11 class presentation and expose its next blockers.

The frozen PARI trace is authority for the retained exact HNF matrices, but its
terminal class generators and fundamental-unit event are comparison oracles.
This adapter therefore computes Smith data from the accepted retained HNF and
stops before claiming generator witnesses or units that have not been replayed
from raw exact relations.
"""

from __future__ import annotations

import hashlib
import importlib
import json
from collections.abc import Mapping, Sequence
from typing import Any


SCHEMA = "sagejs.pari-class-group/row11-presentation-class-unit-boundary-v1"
W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1"
FIELD_ID = (
    "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab"
)
PANEL_INDEX = 11
POLYNOMIAL = ["-2000018", "-2000010", "0", "0", "1"]
SIGNATURE = [2, 1]
HNF_SCHEDULE = [
    [427, 427, 2, 2, 3, 418, 1, 2],
    [428, 1, 3, 3, 3, 418, 0, 3],
    [430, 2, 2, 2, 2, 419, 0, 2],
]
ACCEPTANCE_SCHEDULE = [[1, "32"], [0, "4"]]


class Row11BoundaryFailure(ValueError):
    """The row-11 authority or its honest completion boundary changed."""


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise Row11BoundaryFailure(label + " is not an integer")
    try:
        result = int(value)
    except (ValueError, OverflowError) as error:
        raise Row11BoundaryFailure(label + " is not an integer") from error
    if str(result) != str(value):
        raise Row11BoundaryFailure(label + " is not canonical")
    return result


def _exported_vector(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, Mapping) or value.get("kind") not in {
        "column",
        "vector",
        "small-vector",
    }:
        raise Row11BoundaryFailure(label + " is not an exported vector")
    entries = value.get("values")
    if not isinstance(entries, list) or len(entries) != length:
        raise Row11BoundaryFailure(label + " has the wrong length")
    result = []
    for index, entry in enumerate(entries):
        if isinstance(entry, Mapping):
            if entry.get("kind") != "integer":
                raise Row11BoundaryFailure(label + " has a noninteger cell")
            entry = entry.get("value")
        result.append(_integer(entry, f"{label}[{index}]"))
    return result


def _exported_matrix(value: Any, label: str) -> tuple[list[int], int, int]:
    if not isinstance(value, Mapping) or value.get("kind") != "matrix":
        raise Row11BoundaryFailure(label + " is not an exported matrix")
    columns = value.get("values")
    if not isinstance(columns, list) or not columns:
        raise Row11BoundaryFailure(label + " is empty")
    first = columns[0]
    if not isinstance(first, Mapping) or not isinstance(first.get("values"), list):
        raise Row11BoundaryFailure(label + " has a malformed first column")
    rows = len(first["values"])
    if rows < 1:
        raise Row11BoundaryFailure(label + " has no rows")
    packed = [
        cell
        for column, entry in enumerate(columns)
        for cell in _exported_vector(entry, rows, f"{label}[{column}]")
    ]
    return packed, rows, len(columns)


def _events(w0: Mapping[str, Any], name: str) -> list[Mapping[str, Any]]:
    events = w0.get("events")
    if not isinstance(events, list):
        raise Row11BoundaryFailure("W0 events changed")
    result = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    return result


def _matrix_shape(value: Any, label: str) -> tuple[int, int]:
    if not isinstance(value, Mapping) or value.get("kind") != "matrix":
        raise Row11BoundaryFailure(label + " is not an exported matrix")
    columns = value.get("values")
    if not isinstance(columns, list):
        raise Row11BoundaryFailure(label + " has malformed columns")
    if not columns:
        return 0, 0
    first = columns[0]
    if not isinstance(first, Mapping) or not isinstance(first.get("values"), list):
        raise Row11BoundaryFailure(label + " has a malformed first column")
    rows = len(first["values"])
    for column, entry in enumerate(columns):
        if (
            not isinstance(entry, Mapping)
            or entry.get("kind") != "column"
            or not isinstance(entry.get("values"), list)
            or len(entry["values"]) != rows
        ):
            raise Row11BoundaryFailure(f"{label}[{column}] has the wrong shape")
    return rows, len(columns)


def _digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def compose_row11_boundary(
    w0: Mapping[str, Any], ancestry: Mapping[str, Any]
) -> dict[str, Any]:
    """Compute the retained-HNF Smith presentation, then stop honestly."""
    field = w0.get("field")
    if (
        w0.get("schema") != W0_SCHEMA
        or not isinstance(field, Mapping)
        or field.get("id") != FIELD_ID
        or field.get("panelIndex") != PANEL_INDEX
        or field.get("degree") != 4
        or field.get("signature") != SIGNATURE
        or field.get("unitRank") != 2
        or [str(value) for value in field.get("coefficients", [])] != POLYNOMIAL
    ):
        raise Row11BoundaryFailure("wrong row-11 field authority")
    prepared = w0.get("prepared")
    if (
        not isinstance(prepared, Mapping)
        or prepared.get("degree") != 4
        or prepared.get("signature") != SIGNATURE
        or [str(value) for value in prepared.get("polynomial", [])] != POLYNOMIAL
        or len(prepared.get("multiplicationTensor", [])) != 64
    ):
        raise Row11BoundaryFailure("wrong row-11 prepared authority")

    initialized = _events(w0, "initialized")
    hnfs = _events(w0, "hnf")
    acceptances = _events(w0, "acceptance")
    small_norm_before = _events(w0, "small_norm_before")
    units = _events(w0, "fundamental_units")
    class_inputs = _events(w0, "class_group_input")
    finals = _events(w0, "result")
    if not all(
        len(selected) == expected
        for selected, expected in [
            (initialized, 1),
            (hnfs, 3),
            (acceptances, 2),
            (small_norm_before, 4),
            (units, 1),
            (class_inputs, 1),
            (finals, 1),
        ]
    ):
        raise Row11BoundaryFailure("row-11 event multiplicity changed")
    if initialized[0].get("relations") != 24 or initialized[0].get("target") != 428:
        raise Row11BoundaryFailure("row-11 initial relation schedule changed")
    if [
        [event.get("relations"), event.get("target")] for event in small_norm_before
    ] != [[24, 428], [427, 428], [427, 428], [428, 431]]:
        raise Row11BoundaryFailure("row-11 collection targets changed")

    schedule = []
    for index, event in enumerate(hnfs):
        w_rows, w_columns = _matrix_shape(event.get("exactW"), "retained W")
        b_rows, b_columns = _matrix_shape(event.get("exactB"), "retained B")
        dep_rows, dep_columns = _matrix_shape(event.get("exactDep"), "retained dep")
        records = event.get("relationRecords")
        permutation = event.get("perm")
        if not isinstance(records, list) or len(records) != event.get("relations"):
            raise Row11BoundaryFailure("retained relation record count changed")
        if (
            not isinstance(permutation, Mapping)
            or len(permutation.get("values", [])) != 421
        ):
            raise Row11BoundaryFailure("retained factor-base permutation changed")
        schedule.append(
            [
                event.get("relations"),
                event.get("newRelations"),
                w_rows,
                w_columns,
                b_rows,
                b_columns,
                dep_rows,
                dep_columns,
            ]
        )
        if event.get("precision") != 192:
            raise Row11BoundaryFailure(f"HNF {index} precision changed")
    if schedule != HNF_SCHEDULE:
        raise Row11BoundaryFailure("row-11 retained HNF schedule changed")
    observed_acceptance = [
        [_integer(event.get("code"), "acceptance code"), str(event.get("h"))]
        for event in acceptances
    ]
    if observed_acceptance != ACCEPTANCE_SCHEDULE:
        raise Row11BoundaryFailure("row-11 acceptance schedule changed")

    retained_w, rows, columns = _exported_matrix(hnfs[-1].get("exactW"), "final W")
    if rows != columns or rows != 2:
        raise Row11BoundaryFailure("final presentation dimension changed")
    smith_module = importlib.import_module(
        "bench.pari-class-group-port.mixed_cubic_presentation"
    )
    invariants, class_number, smith_state = smith_module._smith(retained_w, rows)
    if invariants != [2, 2] or class_number != 4:
        raise Row11BoundaryFailure("computed Smith presentation changed")

    class_w, class_rows, class_columns = _exported_matrix(
        class_inputs[0].get("W"), "class input W"
    )
    if class_rows != 2 or class_columns != 2 or class_w != retained_w:
        raise Row11BoundaryFailure("class input detached from retained final W")
    final = finals[0]
    expected = {
        "classNumber": _integer(final.get("classNumber"), "final class number"),
        "invariants": [
            _integer(value, "final invariant") for value in final.get("invariants", [])
        ],
    }
    computed = {"classNumber": class_number, "invariants": invariants}
    if computed != expected:
        raise Row11BoundaryFailure("computed presentation differs from terminal oracle")

    unit = units[0]
    u_rows, u_columns = _matrix_shape(unit.get("U"), "oracle U")
    a_rows, a_columns = _matrix_shape(unit.get("A"), "oracle A")
    if (
        unit.get("fu") is not None
        or u_rows != 9
        or u_columns != 2
        or a_rows != 3
        or a_columns != 2
    ):
        raise Row11BoundaryFailure("row-11 oracle unit event changed")

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "panelIndex": PANEL_INDEX,
            "polynomial": POLYNOMIAL,
            "signature": SIGNATURE,
            "discriminant": str(prepared.get("discriminant")),
            "index": str(prepared.get("index")),
        },
        "ancestry": dict(ancestry),
        "schedule": {
            "initialRelations": 24,
            "initialTarget": 428,
            "hnf": HNF_SCHEDULE,
            "acceptance": ACCEPTANCE_SCHEDULE,
            "retryTarget": 431,
        },
        "presentation": {
            "authority": "authenticated-retained-exact-hnf",
            "matrix": [str(value) for value in retained_w],
            "matrixSha256": _digest([str(value) for value in retained_w]),
            "invariants": [str(value) for value in invariants],
            "classNumber": str(class_number),
            "smithState": smith_state,
            "computedBeforeOracleComparison": True,
            "oracleComparisonMatches": True,
            "rawRelationClosureReplayed": False,
        },
        "classGenerators": {
            "available": False,
            "blocker": (
                "no source-derived row-11 relation-to-presentation transform and "
                "order-principal factorbacks have been published"
            ),
            "oracleClassOutputUsedAsAuthority": False,
        },
        "units": {
            "available": False,
            "rank": 2,
            "blocker": (
                "fundamental_units records fu=null and no authenticated raw-to-unit "
                "transform with exact factorback has been replayed"
            ),
            "oracleEventDigest": _digest(unit),
            "oracleMatricesCopied": False,
            "oracleFuWasNull": True,
        },
        "completion": {
            "presentationComplete": True,
            "classWitnessesComplete": False,
            "unitsComplete": False,
            "correspondenceComplete": False,
            "publicComplete": False,
        },
    }


__all__ = ["SCHEMA", "Row11BoundaryFailure", "compose_row11_boundary"]
