"""Authenticated high-precision replay of the field-3 local HNF schedule.

This module intentionally has no terminal-A or low-precision checkpoint input.
The retained integer ancestry and the floating replay are two views of the same
local PARI ``hnffinal``/``hnfadd_i`` owners.  Packed logarithms are accumulated
in source order; multiplying the raw matrix by the final ancestry is not an
equivalent floating-point operation.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import re
from typing import Any

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


class Field3HighPrecisionTransformFailure(ValueError):
    """An input was not the exact owner required by this replay."""


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


def _protocol_arrays(owner: Mapping[str, Any]) -> dict[str, list[int]]:
    required = {
        "schema",
        "field",
        "sourceRunId",
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
    }
    if set(owner) != required:
        raise Field3HighPrecisionTransformFailure("protocol keys changed")
    if (
        owner["schema"] != PROTOCOL_SCHEMA
        or owner["field"] != FIELD
        or owner["sourceRunId"] != "field3-post-rnd-live-unit-transform"
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
    "transform_authenticated_owners",
]
