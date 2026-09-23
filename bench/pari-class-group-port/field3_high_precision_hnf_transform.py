"""Authenticated high-precision replay of the field-3 local HNF schedule.

This module intentionally has no terminal-A or low-precision checkpoint input.
The retained integer ancestry and the floating replay are two views of the same
local PARI `hnffinal`/`hnfadd_i` owners.  Packed logarithms are accumulated
in source order; multiplying the raw matrix by the final ancestry is not an
equivalent floating-point operation.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import inspect
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import Any

if hasattr(sys, "set_int_max_str_digits"):
    # Authentic high-precision logarithm cells have roughly 46,000 decimal
    # digits.  Python's interpreter-wide denial-of-service guard defaults to
    # 4,300 digits, but these strings have already crossed immutable digest,
    # shape, and canonical-owner boundaries before this module parses them.
    sys.set_int_max_str_digits(0)

from .field3_unit_transform_retention import (
    _pari_forward_hnffinal_logs,
    pari_field3_retain_unit_relation_transform,
    pari_field3_validate_unit_relation_kernel,
)
from .log_matrix_transform import pari_log_entry_product, pari_log_entry_sum

RAW_COLUMNS = 301
RELATION_ROWS = 288
ACCEPTED_COLUMNS = 13
PLACES = 3
ENTRY_CELLS = 7
LOG_STRIDE = PLACES * ENTRY_CELLS
TARGET_BITS = 153088
INPUT_PRECISIONS = (TARGET_BITS, TARGET_BITS + 64, TARGET_BITS + 128)
RAW_SCHEMA = "sagejs.pari-class-group/field3-raw-log-owner-v1"
PROTOCOL_SCHEMA = "sagejs.pari-class-group/field3-local-hnf-protocol-v1"
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-high-precision-A-v1"
FIELD = "x^4-2000022*x-2000042"
RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3"
RAW_LAYOUT = (
    "source-column-major [real-place-0 seven-cell log, real-place-1 "
    "seven-cell log, complex-place-2 seven-cell weighted log]"
)
AUTHORITY_SHA256 = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c"
INITIAL_SHA256 = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe"
PREPARED_SHA256 = "bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf"
NORM_SHA256 = "65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53"
SOURCE_DIGESTS = {
    "principalGeneratorsSha256": "31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de",
    "relationMetadataSha256": "c751a9a91b9f17fc4047d8483e36d6ac6f9a0c1fe04ad072ed405f4a9c3a9f3b",
    "relationRecordsSha256": "5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719",
}
_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
SOURCE_RUN_ID = "field3-post-rnd-live-unit-transform"
LOCAL_SCHEDULE = "PARI-2.17.4-local-hnfspec-hnffinal-hnfadd-source-order"
PROTOCOL_ARRAYS = (
    "rawRelations",
    "initialCleanupTransform",
    "initialTransform",
    "initialFullH",
    "initialFullDep",
    "initialTrailing",
    "initialDiagonal",
    "appendMetadata",
    "appendTransform",
    "appendFullH",
    "appendFullDep",
    "appendTrailing",
    "appendDiagonal",
    "appendPermutations",
    "appendRelations",
)


class Field3HighPrecisionTransformFailure(ValueError):
    """An input was not the exact owner required by this replay."""


def _packed_sha256(values: Sequence[Any]) -> str:
    return hashlib.sha256(
        "\n".join(str(value) for value in values).encode()
    ).hexdigest()


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Field3HighPrecisionTransformFailure(f"{label} shape changed")
    result: list[int] = []
    for cell in value:
        if isinstance(cell, bool) or not isinstance(cell, (int, str)):
            raise Field3HighPrecisionTransformFailure(f"{label} is not integral")
        try:
            parsed = int(cell)
        except ValueError as error:
            raise Field3HighPrecisionTransformFailure(
                f"{label} is not integral"
            ) from error
        if str(parsed) != str(cell):
            raise Field3HighPrecisionTransformFailure(f"{label} is not canonical")
        result.append(parsed)
    return result


def _protocol_arrays(
    owner: Mapping[str, Any], *, require_certificate: bool = True
) -> dict[str, list[int]]:
    required = {
        "schema",
        "field",
        "sourceRunId",
        "authoritySha256",
        "initialOwnerSha256",
        "preparedOwnerSha256",
        "relationRecordsSha256",
        "dimensions",
        "schedule",
        "ownerHashes",
        "checkpointHashes",
        *PROTOCOL_ARRAYS,
    }
    if set(owner) != required:
        raise Field3HighPrecisionTransformFailure("protocol keys changed")
    dimensions = owner.get("dimensions")
    expected_dimensions = {
        "relationShape": [RELATION_ROWS, RAW_COLUMNS],
        "transformShape": [RAW_COLUMNS, ACCEPTED_COLUMNS],
        "initial": [293, 41, 34, 2, 252],
        "appendColumns": [[293, 2], [295, 1], [296, 5]],
    }
    if not isinstance(dimensions, Mapping):
        raise Field3HighPrecisionTransformFailure("protocol dimensions changed")
    if any(dimensions.get(key) != value for key, value in expected_dimensions.items()):
        raise Field3HighPrecisionTransformFailure("protocol dimensions changed")
    expected_dimension_keys = set(expected_dimensions)
    if require_certificate:
        expected_dimension_keys.update(("transformSha256", "kernelState"))
        if (
            not isinstance(dimensions.get("transformSha256"), str)
            or _SHA256.fullmatch(dimensions["transformSha256"]) is None
            or dimensions.get("kernelState") != [0, 288, 301, 13, 3744]
        ):
            raise Field3HighPrecisionTransformFailure("protocol certificate changed")
    if set(dimensions) != expected_dimension_keys:
        raise Field3HighPrecisionTransformFailure("protocol dimension keys changed")
    if (
        owner["schema"] != PROTOCOL_SCHEMA
        or owner["field"] != FIELD
        or owner["sourceRunId"] != SOURCE_RUN_ID
        or owner["authoritySha256"] != AUTHORITY_SHA256
        or owner["initialOwnerSha256"] != INITIAL_SHA256
        or owner["preparedOwnerSha256"] != PREPARED_SHA256
        or owner["relationRecordsSha256"] != SOURCE_DIGESTS["relationRecordsSha256"]
        or owner["schedule"] != LOCAL_SCHEDULE
    ):
        raise Field3HighPrecisionTransformFailure("protocol identity changed")
    metadata = _integers(owner["appendMetadata"], 48, "append metadata")
    expected_old = 293
    expected_new = (2, 1, 5)
    cursors = [0] * 8
    for stage in range(3):
        at = 16 * stage
        old, new, old_h, old_b, rows, dep = metadata[at : at + 6]
        if metadata[at] != expected_old or new != expected_new[stage]:
            raise Field3HighPrecisionTransformFailure("append order changed")
        if old < old_h + old_b or rows + dep + old_b != RELATION_ROWS:
            raise Field3HighPrecisionTransformFailure("append dimensions changed")
        sizes = (
            (new + old_h) ** 2,
            rows * (new + old_h),
            dep * (new + old_h),
            (rows + dep) * old_b,
            rows,
            RELATION_ROWS,
            RELATION_ROWS * new,
        )
        offset_fields = (6, 7, 8, 9, 10, 11, 13)
        for index, (field, size) in enumerate(zip(offset_fields, sizes)):
            if metadata[at + field] != cursors[index]:
                raise Field3HighPrecisionTransformFailure("append owner order changed")
            cursors[index] += size
        if metadata[at + 12] != RELATION_ROWS:
            raise Field3HighPrecisionTransformFailure("append relation height changed")
        if metadata[at + 14 : at + 16] != [0, 0]:
            raise Field3HighPrecisionTransformFailure("append metadata padding changed")
        expected_old += new
    if expected_old != RAW_COLUMNS:
        raise Field3HighPrecisionTransformFailure("append coverage changed")

    # Concatenations are required to be exact: trailing data cannot hide after
    # the final referenced stage owner.
    lengths = {
        "appendTransform": max(
            metadata[s * 16 + 6] + (metadata[s * 16 + 1] + metadata[s * 16 + 2]) ** 2
            for s in range(3)
        ),
        "appendFullH": max(
            metadata[s * 16 + 7]
            + metadata[s * 16 + 4] * (metadata[s * 16 + 1] + metadata[s * 16 + 2])
            for s in range(3)
        ),
        "appendFullDep": max(
            metadata[s * 16 + 8]
            + metadata[s * 16 + 5] * (metadata[s * 16 + 1] + metadata[s * 16 + 2])
            for s in range(3)
        ),
        "appendTrailing": max(
            metadata[s * 16 + 9]
            + (metadata[s * 16 + 4] + metadata[s * 16 + 5]) * metadata[s * 16 + 3]
            for s in range(3)
        ),
        "appendDiagonal": max(
            metadata[s * 16 + 10] + metadata[s * 16 + 4] for s in range(3)
        ),
        "appendPermutations": max(
            metadata[s * 16 + 11] + metadata[s * 16 + 12] for s in range(3)
        ),
        "appendRelations": max(
            metadata[s * 16 + 13] + metadata[s * 16 + 12] * metadata[s * 16 + 1]
            for s in range(3)
        ),
    }
    arrays = {
        "rawRelations": _integers(
            owner["rawRelations"], RELATION_ROWS * RAW_COLUMNS, "raw relations"
        ),
        "initialCleanupTransform": _integers(
            owner["initialCleanupTransform"], 293 * 293, "cleanup transform"
        ),
        "initialTransform": _integers(
            owner["initialTransform"], 41 * 41, "initial transform"
        ),
        "initialFullH": _integers(owner["initialFullH"], 34 * 41, "initial H"),
        "initialFullDep": _integers(
            owner["initialFullDep"], 2 * 41, "initial dependencies"
        ),
        "initialTrailing": _integers(
            owner["initialTrailing"], 36 * 252, "initial trailing"
        ),
        "initialDiagonal": _integers(owner["initialDiagonal"], 34, "initial diagonal"),
        "appendMetadata": metadata,
    }
    for name, length in lengths.items():
        arrays[name] = _integers(owner[name], length, name)
    if (
        _packed_sha256(arrays["rawRelations"])
        != SOURCE_DIGESTS["relationRecordsSha256"]
    ):
        raise Field3HighPrecisionTransformFailure("protocol relation hash changed")
    if set(owner["ownerHashes"]) != set(PROTOCOL_ARRAYS):
        raise Field3HighPrecisionTransformFailure("protocol owner-hash keys changed")
    for name in PROTOCOL_ARRAYS:
        if owner["ownerHashes"].get(name) != _packed_sha256(arrays[name]):
            raise Field3HighPrecisionTransformFailure(f"protocol {name} hash changed")
    checkpoints = owner["checkpointHashes"]
    if not isinstance(checkpoints, Mapping) or set(checkpoints) != {
        "initialH",
        "initialDep",
        "initialB",
        "initialC",
        "initialPermutation",
        "randomH",
        "randomDep",
        "randomB",
        "randomC",
        "randomPermutation",
        "postH",
        "postDep",
        "postB",
        "postC",
        "postPermutation",
        "terminalH",
        "terminalDep",
        "terminalB",
        "terminalC",
        "terminalPermutation",
    }:
        raise Field3HighPrecisionTransformFailure("checkpoint-hash keys changed")
    if any(
        not isinstance(value, str) or _SHA256.fullmatch(value) is None
        for value in checkpoints.values()
    ):
        raise Field3HighPrecisionTransformFailure("checkpoint hash changed")
    return arrays


def _raw_logs(owner: Mapping[str, Any]) -> list[int]:
    required = {
        "schema",
        "field",
        "runIdentity",
        "targetBits",
        "sourceStart",
        "sourceCount",
        "sourceStop",
        "totalColumns",
        "scalarColumns",
        "nonscalarColumns",
        "places",
        "layout",
        "packedLogs",
        "authoritySha256",
        "initialOwnerSha256",
        "preparedOwnerSha256",
        "normConsequencesSha256",
        "sourceDigests",
        "realOwnerSha256",
        "complexOwnerSha256",
    }
    if (
        set(owner) != required
        or owner.get("schema") != RAW_SCHEMA
        or owner.get("field") != FIELD
        or owner.get("runIdentity") != RUN_IDENTITY
        or owner.get("targetBits") != TARGET_BITS
        or owner.get("sourceStart") != 0
        or owner.get("sourceCount") != RAW_COLUMNS
        or owner.get("sourceStop") != RAW_COLUMNS
        or owner.get("totalColumns") != RAW_COLUMNS
        or owner.get("scalarColumns") != 26
        or owner.get("nonscalarColumns") != 275
        or owner.get("places") != PLACES
        or owner.get("layout") != RAW_LAYOUT
        or owner.get("authoritySha256") != AUTHORITY_SHA256
        or owner.get("initialOwnerSha256") != INITIAL_SHA256
        or owner.get("preparedOwnerSha256") != PREPARED_SHA256
        or owner.get("normConsequencesSha256") != NORM_SHA256
        or owner.get("sourceDigests") != SOURCE_DIGESTS
        or not isinstance(owner.get("realOwnerSha256"), str)
        or _SHA256.fullmatch(owner["realOwnerSha256"]) is None
        or not isinstance(owner.get("complexOwnerSha256"), str)
        or _SHA256.fullmatch(owner["complexOwnerSha256"]) is None
    ):
        raise Field3HighPrecisionTransformFailure("raw-log identity changed")
    logs = _integers(
        owner.get("packedLogs"), RAW_COLUMNS * LOG_STRIDE, "raw packed logs"
    )
    for entry in range(RAW_COLUMNS * PLACES):
        at = entry * ENTRY_CELLS
        kind = logs[at]
        if kind not in (1, 2):
            raise Field3HighPrecisionTransformFailure("raw-log kind changed")
        for component in range(kind):
            mantissa, precision, exponent = logs[
                at + 1 + 3 * component : at + 4 + 3 * component
            ]
            if precision == -1:
                if mantissa != 0 or exponent != 0:
                    raise Field3HighPrecisionTransformFailure("nonzero exact raw log")
            elif mantissa == 0:
                if precision != 0:
                    raise Field3HighPrecisionTransformFailure(
                        "zero raw-log precision changed"
                    )
            elif (
                precision not in INPUT_PRECISIONS
                or abs(mantissa).bit_length() != precision
            ):
                raise Field3HighPrecisionTransformFailure("raw-log precision changed")
    return logs


def _matrix_transform(
    entries: Sequence[int], coefficients: Sequence[int], inner: int
) -> list[int]:
    output = [0] * (inner * LOG_STRIDE)
    for column in range(inner):
        for place in range(PLACES):
            source = place * ENTRY_CELLS
            value = pari_log_entry_product(
                coefficients[column * inner], *entries[source : source + 7]
            )
            for row in range(1, inner):
                coefficient = coefficients[column * inner + row]
                if coefficient == 0:
                    continue
                source = (row * PLACES + place) * ENTRY_CELLS
                term = pari_log_entry_product(
                    coefficient, *entries[source : source + 7]
                )
                value = pari_log_entry_sum(*value, *term)
            destination = (column * PLACES + place) * ENTRY_CELLS
            output[destination : destination + 7] = value
    return output


def _entry_sum(a: Sequence[int], b: Sequence[int]) -> tuple[int, ...]:
    if len(a) != ENTRY_CELLS or len(b) != ENTRY_CELLS:
        raise Field3HighPrecisionTransformFailure("packed entry shape changed")
    return pari_log_entry_sum(
        a[0],
        a[1],
        a[2],
        a[3],
        a[4],
        a[5],
        a[6],
        b[0],
        b[1],
        b[2],
        b[3],
        b[4],
        b[5],
        b[6],
    )


def _forward(
    logs: list[int],
    rows: int,
    dep: int,
    width: int,
    tail: int,
    transform: list[int],
    transform_offset: int,
    full_h: list[int],
    h_offset: int,
    full_dep: list[int],
    dep_offset: int,
    trailing: list[int],
    trailing_offset: int,
    diagonal: list[int],
    diagonal_offset: int,
) -> list[int]:
    total = width + tail
    transformed = [0] * (total * LOG_STRIDE)
    output = [0] * (total * LOG_STRIDE)
    status = _pari_forward_hnffinal_logs(
        logs,
        PLACES,
        rows,
        dep,
        width,
        tail,
        transform,
        transform_offset,
        full_h,
        h_offset,
        full_dep,
        dep_offset,
        trailing,
        trailing_offset,
        diagonal,
        diagonal_offset,
        transformed,
        [0] * ((rows + dep) * tail),
        output,
    )
    if status != 0:
        raise Field3HighPrecisionTransformFailure("local hnffinal replay failed")
    return output


def _replay(raw: list[int], p: dict[str, list[int]]) -> list[int]:
    current = _matrix_transform(
        raw[: 293 * LOG_STRIDE], p["initialCleanupTransform"], 293
    )
    current = _forward(
        current,
        34,
        2,
        41,
        252,
        p["initialTransform"],
        0,
        p["initialFullH"],
        0,
        p["initialFullDep"],
        0,
        p["initialTrailing"],
        0,
        p["initialDiagonal"],
        0,
    )
    current_columns = 293
    metadata = p["appendMetadata"]
    for stage in range(3):
        at = stage * 16
        old, new, old_h, old_b, rows, dep = metadata[at : at + 6]
        if current_columns != old:
            raise Field3HighPrecisionTransformFailure("append order changed")
        zero_prefix = old - old_h - old_b
        width = new + old_h
        subcolumns = width + old_b
        joined = [0] * (subcolumns * LOG_STRIDE)
        for column in range(new):
            for place in range(PLACES):
                accumulated: tuple[int, ...] | None = None
                for k in range(old_b):
                    row = (
                        p["appendPermutations"][metadata[at + 11] + rows + dep + k] - 1
                    )
                    coefficient = p["appendRelations"][
                        metadata[at + 13] + column * RELATION_ROWS + row
                    ]
                    if coefficient == 0:
                        continue
                    source = ((zero_prefix + old_h + k) * PLACES + place) * ENTRY_CELLS
                    term = pari_log_entry_product(
                        coefficient, *current[source : source + 7]
                    )
                    accumulated = (
                        term
                        if accumulated is None
                        else pari_log_entry_sum(*accumulated, *term)
                    )
                if accumulated is None:
                    accumulated = (1, 0, -1, 0, 0, -1, 0)
                source = ((old + column) * PLACES + place) * ENTRY_CELLS
                correction = (
                    accumulated[0],
                    -accumulated[1],
                    accumulated[2],
                    accumulated[3],
                    -accumulated[4],
                    accumulated[5],
                    accumulated[6],
                )
                value = _entry_sum(raw[source : source + 7], correction)
                destination = (column * PLACES + place) * ENTRY_CELLS
                joined[destination : destination + 7] = value
        for column in range(old_h + old_b):
            source = (zero_prefix + column) * LOG_STRIDE
            destination = (new + column) * LOG_STRIDE
            joined[destination : destination + LOG_STRIDE] = current[
                source : source + LOG_STRIDE
            ]
        next_logs = _forward(
            joined,
            rows,
            dep,
            width,
            old_b,
            p["appendTransform"],
            metadata[at + 6],
            p["appendFullH"],
            metadata[at + 7],
            p["appendFullDep"],
            metadata[at + 8],
            p["appendTrailing"],
            metadata[at + 9],
            p["appendDiagonal"],
            metadata[at + 10],
        )
        current_columns = old + new
        current = current[: zero_prefix * LOG_STRIDE] + next_logs
        if len(current) != current_columns * LOG_STRIDE:
            raise Field3HighPrecisionTransformFailure("append result shape changed")
    return current[: ACCEPTED_COLUMNS * LOG_STRIDE]


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Field3HighPrecisionTransformFailure(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _load_frozen_owner(
    path: str | Path, expected: str, label: str
) -> Mapping[str, Any]:
    source = Path(path)
    if stat.S_IMODE(source.stat().st_mode) != 0o444:
        raise Field3HighPrecisionTransformFailure(f"{label} is not mode 0444")
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise Field3HighPrecisionTransformFailure(f"{label} hash changed")
    try:
        value = json.loads(data, object_pairs_hook=_strict_object)
    except (TypeError, ValueError, UnicodeError) as error:
        raise Field3HighPrecisionTransformFailure(
            f"{label} is not strict JSON"
        ) from error
    if not isinstance(value, Mapping):
        raise Field3HighPrecisionTransformFailure(f"{label} is not an object")
    return value


def _authenticate_authority(
    document: Mapping[str, Any],
) -> tuple[Mapping[str, Any], list[int], list[int]]:
    try:
        authority = document["authority"]
        owners = authority["owners"]
    except (KeyError, TypeError) as error:
        raise Field3HighPrecisionTransformFailure(
            "authority structure changed"
        ) from error
    if not isinstance(authority, Mapping) or not isinstance(owners, Mapping):
        raise Field3HighPrecisionTransformFailure("authority structure changed")
    names = (
        "relationState",
        "relationRecords",
        "relationBasis",
        "relationHashes",
        "relationMetadata",
        "principalGenerators",
        "logCompleted",
        "relationLogs",
        "packetIds",
        "packetIdeals",
        "packetNorms",
        "packetPrimes",
        "packetGenerators",
        "packetInert",
        "relationPrimes",
        "ramification",
        "hnfPermutation",
        "outerPermutation",
        "randomState",
        "randomSchedule",
        "randomSubfactor",
        "smallSchedule",
        "outerState",
        "driverState",
        "hnfState",
        "controlState",
    )
    if set(owners) != set(names):
        raise Field3HighPrecisionTransformFailure("authority owner set changed")
    values = {name: _integers(owners[name], len(owners[name]), name) for name in names}
    fingerprints = [0] * 48
    state = [0] * 24
    authenticate = __import__(
        "bench.pari-class-group-port.field3_full_owner_authority",
        fromlist=["pari_field3_full_owner_authority"],
    ).pari_field3_full_owner_authority
    status = authenticate(
        int(document.get("terminalAction", -1)),
        values["relationState"],
        values["relationRecords"],
        values["relationBasis"],
        values["relationHashes"],
        values["relationMetadata"],
        values["principalGenerators"],
        values["logCompleted"],
        values["relationLogs"],
        values["packetIds"],
        values["packetIdeals"],
        values["packetNorms"],
        values["packetPrimes"],
        values["packetGenerators"],
        values["packetInert"],
        values["relationPrimes"],
        values["ramification"],
        values["hnfPermutation"],
        values["outerPermutation"],
        values["randomState"],
        values["randomSchedule"],
        values["randomSubfactor"],
        len(values["randomSubfactor"]),
        values["smallSchedule"],
        values["outerState"],
        values["driverState"],
        values["hnfState"],
        values["controlState"],
        fingerprints,
        state,
    )
    if status != 0:
        raise Field3HighPrecisionTransformFailure("resident authority rejected")
    if fingerprints != _integers(
        authority.get("fingerprints"), 48, "authority fingerprints"
    ):
        raise Field3HighPrecisionTransformFailure("authority fingerprints changed")
    if state != _integers(authority.get("state"), 24, "authority state"):
        raise Field3HighPrecisionTransformFailure("authority state changed")
    relations = values["relationRecords"]
    logs = values["relationLogs"]
    if _packed_sha256(relations) != SOURCE_DIGESTS["relationRecordsSha256"]:
        raise Field3HighPrecisionTransformFailure("relation-record hash changed")
    return owners, relations, logs


def _initial_hnf_capture(
    initial: Mapping[str, Any], relations: list[int], logs: list[int]
) -> tuple[
    dict[str, list[int]],
    list[int],
    list[int],
    list[int],
    list[int],
    list[int],
    list[int],
]:
    try:
        packet = next(
            value
            for value in initial["nativeInputs"]
            if value["backend"] == "gmp" and value["field"] == 3
        )
        checkpoint = next(
            value
            for value in initial["nativeOutputs"]
            if value["backend"] == "gmp" and value["field"] == 3
        )
        raw = packet["input"]
    except (KeyError, StopIteration, TypeError) as error:
        raise Field3HighPrecisionTransformFailure(
            "initial field-3 capsule changed"
        ) from error
    if (
        int(checkpoint.get("factorCount", -1)) != RELATION_ROWS
        or int(checkpoint.get("logRows", -1)) != PLACES
    ):
        raise Field3HighPrecisionTransformFailure(
            "initial checkpoint dimensions changed"
        )
    initial_columns = 293
    workspace_lengths = {
        "mat": RELATION_ROWS * initial_columns,
        "dense": int(raw["hnf_k0"]) * initial_columns,
        "transform": initial_columns * initial_columns,
        "vmax": initial_columns,
        "found": 1,
        "sparse_state": 13,
        "bottom": RELATION_ROWS * initial_columns,
        "updated_dense": int(raw["hnf_k0"]) * initial_columns,
        "extra": RELATION_ROWS * initial_columns,
        "cleanup_state": 10,
        "rank_matrix": RELATION_ROWS * initial_columns,
        "occupied": initial_columns,
        "rank_pivots": RELATION_ROWS,
        "best": RELATION_ROWS,
        "profile": RELATION_ROWS + 1,
        "rank_state": 10,
        "perm_work": RELATION_ROWS,
        "matbnew": RELATION_ROWS * initial_columns,
        "dep": RELATION_ROWS * initial_columns,
        "b": RELATION_ROWS * initial_columns,
        "assembly_state": 6,
        "transformed_logs": initial_columns * LOG_STRIDE,
        "full_h": RELATION_ROWS * initial_columns,
        "hnf_transform": initial_columns * initial_columns,
        "lam": initial_columns * initial_columns,
        "d": initial_columns + 1,
        "hnf_state": 11,
        "full_dep": RELATION_ROWS * initial_columns,
        "work_b": RELATION_ROWS * initial_columns,
        "work_c": initial_columns * LOG_STRIDE,
        "diagonal": RELATION_ROWS,
        "result_h": RELATION_ROWS * initial_columns,
        "result_dep": RELATION_ROWS * initial_columns,
        "result_b": RELATION_ROWS * (initial_columns + RELATION_ROWS),
        "result_c": initial_columns * LOG_STRIDE,
        "final_state": 7,
        "state": 9,
        "cup_arena": len(raw["hnf_cup_arena"]),
        "cup_frames": len(raw["hnf_cup_frames"]),
        "cup_solve_state": len(raw["hnf_cup_solve_state"]),
        "cup_state": len(raw["hnf_cup_state"]),
    }
    work = {name: [0] * length for name, length in workspace_lengths.items()}
    permutation = _integers(raw["hnf_perm"], RELATION_ROWS, "initial permutation")
    complete = __import__(
        "bench.pari-class-group-port.hnfspec_complete",
        fromlist=["pari_hnfspec_complete"],
    ).pari_hnfspec_complete
    status = complete(
        relations[: RELATION_ROWS * initial_columns],
        RELATION_ROWS,
        initial_columns,
        permutation,
        int(raw["hnf_k0"]),
        logs[: initial_columns * LOG_STRIDE],
        PLACES,
        *(work[name] for name in workspace_lengths),
    )
    if status != 0 or work["state"] != [4, 11, 282, 2, 7, 30, 0, 293, 0]:
        raise Field3HighPrecisionTransformFailure("initial local HNF replay changed")
    checks = (
        ("H", work["result_h"], 16),
        ("D", work["result_dep"], 8),
        ("B", work["result_b"], 1692),
        ("C", work["result_c"], 6153),
        ("perm", permutation, RELATION_ROWS),
    )
    for name, value, length in checks:
        if [str(cell) for cell in value[:length]] != [
            str(cell) for cell in checkpoint[name]
        ]:
            raise Field3HighPrecisionTransformFailure(
                f"initial {name} checkpoint changed"
            )
    return (
        work,
        permutation,
        work["result_h"],
        work["result_dep"],
        work["result_b"],
        work["result_c"],
        work["state"],
    )


def _append_hnf_captures(
    authority: Mapping[str, Any],
    relations: list[int],
    logs: list[int],
    permutation: list[int],
    current_h: list[int],
    current_dep: list[int],
    current_b: list[int],
    current_c: list[int],
    current_state: list[int],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    append = __import__(
        "bench.pari-class-group-port.hnfadd", fromlist=["pari_hnfadd"]
    ).pari_hnfadd
    checkpoints = (
        ("random", authority.get("randomHNF")),
        ("post", authority.get("postHNF")),
        ("terminal", authority.get("terminalHNF")),
    )
    boundaries = ((293, 295), (295, 296), (296, 301))
    captures: list[dict[str, Any]] = []
    hashes: dict[str, str] = {}
    for (old, total), (label, checkpoint) in zip(boundaries, checkpoints):
        if not isinstance(checkpoint, list) or len(checkpoint) != 4:
            raise Field3HighPrecisionTransformFailure(f"{label} HNF checkpoint changed")
        new = total - old
        h_rows = current_state[0]
        b_columns = current_state[2]
        input_permutation = permutation[:]
        explicit = {
            "h": current_h,
            "h_rows": h_rows,
            "dep": current_dep,
            "b": current_b,
            "b_columns": b_columns,
            "logs": current_c,
            "total_columns": old,
            "log_rows": PLACES,
            "perm": permutation,
            "rows": RELATION_ROWS,
            "new_relations": relations[old * RELATION_ROWS : total * RELATION_ROWS],
            "new_columns": new,
            "new_logs": logs[old * LOG_STRIDE : total * LOG_STRIDE],
        }
        capacity = max(
            8192,
            RELATION_ROWS * (h_rows + new),
            LOG_STRIDE * total,
            RELATION_ROWS * (total + RELATION_ROWS),
        )
        owners: dict[str, list[int]] = {}
        arguments: list[Any] = []
        for name in inspect.signature(append).parameters:
            if name in explicit:
                value: Any = explicit[name]
            else:
                value = [0] * capacity
                owners[name] = value
            arguments.append(value)
        if append(*arguments) != 0:
            raise Field3HighPrecisionTransformFailure(
                f"{label} local HNF replay failed"
            )
        state = owners["state"][:9]
        expected_states = {
            "random": [5, 12, 283, 0, 7, 1, 0, 295, 0],
            "post": [5, 13, 283, 0, 8, 0, 0, 296, 0],
            "terminal": [2, 15, 286, 0, 13, 3, 0, 301, 0],
        }
        if state != expected_states[label]:
            raise Field3HighPrecisionTransformFailure(f"{label} HNF state changed")
        lengths = (
            state[0] * state[0],
            state[3] * state[0],
            (RELATION_ROWS - state[2]) * state[2],
            total * LOG_STRIDE,
        )
        for name, value, expected, length in zip(
            ("H", "Dep", "B", "C"),
            (
                owners["result_h"],
                owners["result_dep"],
                owners["result_b"],
                owners["result_c"],
            ),
            checkpoint,
            lengths,
        ):
            actual = value[:length]
            if [str(cell) for cell in actual] != [str(cell) for cell in expected]:
                raise Field3HighPrecisionTransformFailure(
                    f"{label} {name} checkpoint changed"
                )
            hashes[f"{label}{name}"] = _packed_sha256(actual)
        hashes[f"{label}Permutation"] = _packed_sha256(permutation)
        lig = RELATION_ROWS - b_columns
        dep_rows = state[3]
        rows = lig - dep_rows
        width = new + h_rows
        captures.append(
            {
                "old": old,
                "new": new,
                "oldH": h_rows,
                "oldB": b_columns,
                "rows": rows,
                "dep": dep_rows,
                "transform": owners["transform"][: width * width],
                "fullH": owners["full_h"][: rows * width],
                "fullDep": owners["full_dep"][: dep_rows * width],
                "trailing": owners["permuted_b"][: lig * b_columns],
                "diagonal": owners["diagonal"][:rows],
                "permutation": input_permutation,
                "relations": explicit["new_relations"],
            }
        )
        current_h = owners["result_h"]
        current_dep = owners["result_dep"]
        current_b = owners["result_b"]
        current_c = owners["result_c"]
        current_state = state
    final_permutation = _integers(
        authority["authority"]["owners"]["hnfPermutation"],
        RELATION_ROWS,
        "terminal permutation",
    )
    if permutation != final_permutation:
        raise Field3HighPrecisionTransformFailure("terminal permutation changed")
    return captures, hashes


def capture_local_hnf_protocol(
    authority_path: str | Path, initial_path: str | Path
) -> dict[str, Any]:
    """Capture exact local HNF owners from the two frozen resident capsules."""
    authority = _load_frozen_owner(authority_path, AUTHORITY_SHA256, "authority")
    initial = _load_frozen_owner(initial_path, INITIAL_SHA256, "initial owner")
    _, relations, logs = _authenticate_authority(authority)
    work, permutation, h, dep, b, c, state = _initial_hnf_capture(
        initial, relations, logs
    )
    checkpoint_hashes = {
        "initialH": _packed_sha256(h[:16]),
        "initialDep": _packed_sha256(dep[:8]),
        "initialB": _packed_sha256(b[:1692]),
        "initialC": _packed_sha256(c[:6153]),
        "initialPermutation": _packed_sha256(permutation),
    }
    stages, append_hashes = _append_hnf_captures(
        authority, relations, logs, permutation, h, dep, b, c, state
    )
    checkpoint_hashes.update(append_hashes)
    metadata: list[int] = []
    concatenated: dict[str, list[int]] = {
        "appendTransform": [],
        "appendFullH": [],
        "appendFullDep": [],
        "appendTrailing": [],
        "appendDiagonal": [],
        "appendPermutations": [],
        "appendRelations": [],
    }
    source_names = (
        "transform",
        "fullH",
        "fullDep",
        "trailing",
        "diagonal",
        "permutation",
        "relations",
    )
    output_names = tuple(concatenated)
    for stage in stages:
        offsets = [len(concatenated[name]) for name in output_names]
        metadata.extend(
            [
                int(stage["old"]),
                int(stage["new"]),
                int(stage["oldH"]),
                int(stage["oldB"]),
                int(stage["rows"]),
                int(stage["dep"]),
                offsets[0],
                offsets[1],
                offsets[2],
                offsets[3],
                offsets[4],
                offsets[5],
                RELATION_ROWS,
                offsets[6],
                0,
                0,
            ]
        )
        for source, output in zip(source_names, output_names):
            concatenated[output].extend(stage[source])  # type: ignore[arg-type]
    arrays: dict[str, list[int]] = {
        "rawRelations": relations,
        "initialCleanupTransform": work["transform"][: 293 * 293],
        "initialTransform": work["hnf_transform"][: 41 * 41],
        "initialFullH": work["full_h"][: 34 * 41],
        "initialFullDep": work["full_dep"][: 2 * 41],
        "initialTrailing": work["b"][: 36 * 252],
        "initialDiagonal": work["diagonal"][:34],
        "appendMetadata": metadata,
        **concatenated,
    }
    owner: dict[str, Any] = {
        "schema": PROTOCOL_SCHEMA,
        "field": FIELD,
        "sourceRunId": SOURCE_RUN_ID,
        "authoritySha256": AUTHORITY_SHA256,
        "initialOwnerSha256": INITIAL_SHA256,
        "preparedOwnerSha256": PREPARED_SHA256,
        "relationRecordsSha256": SOURCE_DIGESTS["relationRecordsSha256"],
        "dimensions": {
            "relationShape": [RELATION_ROWS, RAW_COLUMNS],
            "transformShape": [RAW_COLUMNS, ACCEPTED_COLUMNS],
            "initial": [293, 41, 34, 2, 252],
            "appendColumns": [[293, 2], [295, 1], [296, 5]],
        },
        "schedule": LOCAL_SCHEDULE,
        "ownerHashes": {name: _packed_sha256(arrays[name]) for name in PROTOCOL_ARRAYS},
        "checkpointHashes": checkpoint_hashes,
        **{name: [str(value) for value in arrays[name]] for name in PROTOCOL_ARRAYS},
    }
    parsed = _protocol_arrays(owner, require_certificate=False)
    transform = [0] * (RAW_COLUMNS * ACCEPTED_COLUMNS)
    transform_state = [0] * 8
    if (
        pari_field3_retain_unit_relation_transform(
            parsed["initialCleanupTransform"],
            parsed["initialTransform"],
            parsed["initialFullH"],
            parsed["initialFullDep"],
            parsed["initialTrailing"],
            parsed["initialDiagonal"],
            parsed["appendMetadata"],
            parsed["appendTransform"],
            parsed["appendFullH"],
            parsed["appendFullDep"],
            parsed["appendTrailing"],
            parsed["appendDiagonal"],
            parsed["appendPermutations"],
            parsed["appendRelations"],
            [0] * 3913,
            [0] * 3913,
            [0] * 3913,
            [0] * (36 * 252),
            [0] * 3913,
            transform,
            transform_state,
        )
        != 0
    ):
        raise Field3HighPrecisionTransformFailure("captured transform retention failed")
    kernel_state = [0] * 5
    if (
        pari_field3_validate_unit_relation_kernel(relations, transform, kernel_state)
        != 0
    ):
        raise Field3HighPrecisionTransformFailure("captured R*T is nonzero")
    owner["dimensions"]["transformSha256"] = _packed_sha256(transform)
    owner["dimensions"]["kernelState"] = kernel_state
    return owner


def publish_local_hnf_protocol(
    output_directory: str | Path, owner: Mapping[str, Any]
) -> dict[str, Any]:
    """Publish one validated, content-addressed, immutable protocol owner."""
    arrays = _protocol_arrays(owner)
    transform = [0] * (RAW_COLUMNS * ACCEPTED_COLUMNS)
    transform_state = [0] * 8
    if (
        pari_field3_retain_unit_relation_transform(
            arrays["initialCleanupTransform"],
            arrays["initialTransform"],
            arrays["initialFullH"],
            arrays["initialFullDep"],
            arrays["initialTrailing"],
            arrays["initialDiagonal"],
            arrays["appendMetadata"],
            arrays["appendTransform"],
            arrays["appendFullH"],
            arrays["appendFullDep"],
            arrays["appendTrailing"],
            arrays["appendDiagonal"],
            arrays["appendPermutations"],
            arrays["appendRelations"],
            [0] * 3913,
            [0] * 3913,
            [0] * 3913,
            [0] * (36 * 252),
            [0] * 3913,
            transform,
            transform_state,
        )
        != 0
    ):
        raise Field3HighPrecisionTransformFailure("protocol transform retention failed")
    kernel_state = [0] * 5
    if (
        pari_field3_validate_unit_relation_kernel(
            arrays["rawRelations"], transform, kernel_state
        )
        != 0
    ):
        raise Field3HighPrecisionTransformFailure("protocol R*T is nonzero")
    if (
        owner["dimensions"].get("transformSha256") != _packed_sha256(transform)
        or owner["dimensions"].get("kernelState") != kernel_state
    ):
        raise Field3HighPrecisionTransformFailure("protocol exact certificate changed")
    data = (json.dumps(owner, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(data).hexdigest()
    directory = Path(output_directory)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"field3-local-hnf-protocol-{digest}.json"
    if destination.exists():
        if (
            hashlib.sha256(destination.read_bytes()).hexdigest() != digest
            or stat.S_IMODE(destination.stat().st_mode) != 0o444
        ):
            raise Field3HighPrecisionTransformFailure("existing protocol owner changed")
    else:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", dir=directory
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.chmod(0o400)
            temporary.replace(destination)
            destination.chmod(0o444)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    return {
        "schema": PROTOCOL_SCHEMA,
        "durablePath": str(destination),
        "sha256": digest,
        "bytes": len(data),
        "transformSha256": _packed_sha256(transform),
        "kernelState": kernel_state,
    }


def transform_authenticated_owners(
    raw_owner: Mapping[str, Any], protocol_owner: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate both owners completely, then return T and high-precision A."""
    raw = _raw_logs(raw_owner)
    p = _protocol_arrays(protocol_owner)
    transform = [0] * (RAW_COLUMNS * ACCEPTED_COLUMNS)
    state = [0] * 8
    status = pari_field3_retain_unit_relation_transform(
        p["initialCleanupTransform"],
        p["initialTransform"],
        p["initialFullH"],
        p["initialFullDep"],
        p["initialTrailing"],
        p["initialDiagonal"],
        p["appendMetadata"],
        p["appendTransform"],
        p["appendFullH"],
        p["appendFullDep"],
        p["appendTrailing"],
        p["appendDiagonal"],
        p["appendPermutations"],
        p["appendRelations"],
        [0] * 3913,
        [0] * 3913,
        [0] * 3913,
        [0] * (36 * 252),
        [0] * 3913,
        transform,
        state,
    )
    if status != 0 or state != [0, 301, 13, 293, 3, 3913, 0, 0]:
        raise Field3HighPrecisionTransformFailure("integer ancestry retention failed")
    kernel_state = [0] * 5
    if (
        pari_field3_validate_unit_relation_kernel(
            p["rawRelations"], transform, kernel_state
        )
        != 0
    ):
        raise Field3HighPrecisionTransformFailure("R*T is nonzero")
    if kernel_state != [0, 288, 301, 13, 3744]:
        raise Field3HighPrecisionTransformFailure("kernel certificate shape changed")
    accepted = _replay(raw, p)
    return {
        "schema": OUTPUT_SCHEMA,
        "field": FIELD,
        "runIdentity": RUN_IDENTITY,
        "targetBits": TARGET_BITS,
        "sourceShape": [PLACES, RAW_COLUMNS],
        "acceptedShape": [PLACES, ACCEPTED_COLUMNS],
        "layout": "column-major packed [kind,rm,rp,re,im,ip,ie]",
        "transformShape": [RAW_COLUMNS, ACCEPTED_COLUMNS],
        "transform": [str(value) for value in transform],
        "kernelState": kernel_state,
        "packedA": [str(value) for value in accepted],
        "schedule": "PARI-2.17.4-local-hnffinal-hnfadd-source-order",
    }


__all__ = [
    "Field3HighPrecisionTransformFailure",
    "capture_local_hnf_protocol",
    "publish_local_hnf_protocol",
    "transform_authenticated_owners",
]
