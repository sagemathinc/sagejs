"""Retain the complete field-3 terminal `[A13 | Ce2]` ancestry.

This is an additive companion to `field3_high_precision_hnf_transform`.
That module's v1 owner remains the unit-only `301 x 13` kernel ancestry.
Here the same authenticated local HNF schedule is reversed from all fifteen
terminal non-`B` columns.  The last two columns are intentionally not in the
relation kernel: their images are the terminal class presentation `H`, in
the physical row order recorded by the terminal permutation.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .field3_high_precision_hnf_transform import (
    FIELD,
    LOCAL_SCHEDULE,
    RUN_IDENTITY,
    TARGET_BITS,
    _authenticate_authority,
    _entry_sum,
    _forward,
    _matrix_transform,
    _packed_sha256,
    _protocol_arrays,
    _raw_logs,
)
from .field3_unit_transform_retention import (
    _pari_reverse_hnfadd_selection,
    _pari_reverse_hnffinal_selection,
)
from .log_matrix_transform import pari_log_entry_product, pari_log_entry_sum


RAW_COLUMNS = 301
RELATION_ROWS = 288
UNIT_COLUMNS = 13
CLASS_COLUMNS = 2
TERMINAL_COLUMNS = UNIT_COLUMNS + CLASS_COLUMNS
PLACES = 3
ENTRY_CELLS = 7
LOG_STRIDE = PLACES * ENTRY_CELLS
OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1"
TERMINAL_STATE = [2, 15, 286, 0, 13, 3, 0, 301, 0]


class Field3FullTerminalAncestryFailure(ValueError):
    """An authenticated full-terminal owner failed closed."""


@native
def pari_field3_retain_full_terminal_transform(
    initial_cleanup_transform: IntegerBuffer,
    initial_transform: IntegerBuffer,
    initial_full_h: IntegerBuffer,
    initial_full_dep: IntegerBuffer,
    initial_trailing: IntegerBuffer,
    initial_diagonal: Int64Buffer,
    append_metadata: Int64Buffer,
    append_transform: IntegerBuffer,
    append_full_h: IntegerBuffer,
    append_full_dep: IntegerBuffer,
    append_trailing: IntegerBuffer,
    append_diagonal: Int64Buffer,
    append_permutations: Int64Buffer,
    append_relations: Int64Buffer,
    selected: IntegerBuffer,
    previous: IntegerBuffer,
    work: IntegerBuffer,
    bwork: IntegerBuffer,
    candidate: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish the column-major `301 x 15` terminal ancestry atomically."""
    targets = TERMINAL_COLUMNS
    size = RAW_COLUMNS * targets
    if (
        len(initial_cleanup_transform) < 293 * 293
        or len(initial_transform) < 41 * 41
        or len(initial_full_h) < 34 * 41
        or len(initial_full_dep) < 2 * 41
        or len(initial_trailing) < 36 * 252
        or len(initial_diagonal) < 34
        or len(append_metadata) < 3 * 16
        or len(selected) < size
        or len(previous) < size
        or len(work) < size
        or len(bwork) < 36 * 252
        or len(candidate) < size
        or len(output) < size
        or len(state) < 8
    ):
        raise ValueError("short field3 full-terminal transform owner")
    expected_old = 293
    for stage in range(3):
        at = stage * 16
        if append_metadata[at] != expected_old:
            raise ValueError("disconnected field3 full-terminal ancestry")
        expected_old += append_metadata[at + 1]
    if expected_old != RAW_COLUMNS:
        raise ValueError("incomplete field3 full-terminal ancestry")

    for index in range(size):
        candidate[index] = 0
        selected[index] = 0
        previous[index] = 0
        work[index] = 0
    for target in range(targets):
        selected[target * RAW_COLUMNS + target] = 1

    current = RAW_COLUMNS
    for stage in range(2, -1, -1):
        at = stage * 16
        old_columns = append_metadata[at]
        new_columns = append_metadata[at + 1]
        if current != old_columns + new_columns:
            raise ValueError("invalid field3 full-terminal reverse order")
        _pari_reverse_hnfadd_selection(
            selected,
            targets,
            old_columns,
            new_columns,
            append_metadata[at + 2],
            append_metadata[at + 3],
            append_metadata[at + 4],
            append_metadata[at + 5],
            append_transform,
            append_metadata[at + 6],
            append_full_h,
            append_metadata[at + 7],
            append_full_dep,
            append_metadata[at + 8],
            append_trailing,
            append_metadata[at + 9],
            append_diagonal,
            append_metadata[at + 10],
            append_permutations,
            append_metadata[at + 11],
            append_metadata[at + 12],
            append_relations,
            append_metadata[at + 13],
            previous,
            work,
            bwork,
            candidate,
        )
        for target in range(targets):
            for column in range(old_columns):
                selected[target * old_columns + column] = previous[
                    target * old_columns + column
                ]
        current = old_columns

    _pari_reverse_hnffinal_selection(
        selected,
        293,
        targets,
        34,
        2,
        41,
        252,
        initial_transform,
        0,
        initial_full_h,
        0,
        initial_full_dep,
        0,
        initial_trailing,
        0,
        initial_diagonal,
        0,
        work,
        bwork,
    )
    for target in range(targets):
        for raw in range(293):
            value = 0
            for cleaned in range(293):
                value += (
                    initial_cleanup_transform[cleaned * 293 + raw]
                    * selected[target * 293 + cleaned]
                )
            candidate[target * RAW_COLUMNS + raw] = value

    for index in range(size):
        output[index] = candidate[index]
    state[0] = 0
    state[1] = RAW_COLUMNS
    state[2] = targets
    state[3] = 293
    state[4] = 3
    state[5] = size
    state[6] = UNIT_COLUMNS
    state[7] = CLASS_COLUMNS
    return 0


@native
def pari_field3_validate_full_terminal_image(
    relation_records: Int64Buffer,
    transform: IntegerBuffer,
    terminal_h: IntegerBuffer,
    terminal_permutation: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Check `R*T = [0 | perm^-1(H)]` without partial publication."""
    if (
        len(relation_records) < RELATION_ROWS * RAW_COLUMNS
        or len(transform) < RAW_COLUMNS * TERMINAL_COLUMNS
        or len(terminal_h) < CLASS_COLUMNS * CLASS_COLUMNS
        or len(terminal_permutation) < RELATION_ROWS
        or len(state) < 8
    ):
        raise ValueError("short field3 full-terminal certificate owner")
    for row in range(RELATION_ROWS):
        physical = terminal_permutation[row]
        if physical < 1 or physical > RELATION_ROWS:
            raise ValueError("invalid terminal HNF permutation")
        for earlier in range(row):
            if terminal_permutation[earlier] == physical:
                raise ValueError("duplicate terminal HNF permutation")

    for target in range(TERMINAL_COLUMNS):
        for row in range(RELATION_ROWS):
            value = 0
            for relation in range(RAW_COLUMNS):
                value += (
                    relation_records[relation * RELATION_ROWS + row]
                    * transform[target * RAW_COLUMNS + relation]
                )
            expected = 0
            if target >= UNIT_COLUMNS:
                for logical in range(CLASS_COLUMNS):
                    if terminal_permutation[logical] - 1 == row:
                        expected = terminal_h[
                            (target - UNIT_COLUMNS) * CLASS_COLUMNS + logical
                        ]
            if value != expected:
                return 1
    state[0] = 0
    state[1] = RELATION_ROWS
    state[2] = RAW_COLUMNS
    state[3] = UNIT_COLUMNS
    state[4] = CLASS_COLUMNS
    state[5] = TERMINAL_COLUMNS
    state[6] = RELATION_ROWS * UNIT_COLUMNS
    state[7] = RELATION_ROWS * CLASS_COLUMNS
    return 0


def _full_replay(raw: list[int], p: dict[str, list[int]]) -> list[int]:
    """Replay PARI's source operation tree, retaining `A13` and `Ce2`."""
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
            raise Field3FullTerminalAncestryFailure("append order changed")
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
                    source = ((zero_prefix + old_h + k) * PLACES + place) * 7
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
                source = ((old + column) * PLACES + place) * 7
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
                destination = (column * PLACES + place) * 7
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
    return current[: TERMINAL_COLUMNS * LOG_STRIDE]


def _integers(value: Any, length: int, label: str) -> list[int]:
    if not isinstance(value, list) or len(value) != length:
        raise Field3FullTerminalAncestryFailure(f"{label} shape changed")
    answer: list[int] = []
    for cell in value:
        if isinstance(cell, bool) or not isinstance(cell, (int, str)):
            raise Field3FullTerminalAncestryFailure(f"{label} is not integral")
        try:
            integer = int(cell)
        except ValueError as error:
            raise Field3FullTerminalAncestryFailure(
                f"{label} is not integral"
            ) from error
        if str(integer) != str(cell):
            raise Field3FullTerminalAncestryFailure(f"{label} is not canonical")
        answer.append(integer)
    return answer


def transform_authenticated_owners(
    raw_owner: Mapping[str, Any],
    protocol_owner: Mapping[str, Any],
    authority_owner: Mapping[str, Any],
) -> dict[str, Any]:
    """Return an authenticated full-terminal ancestry owner."""
    raw = _raw_logs(raw_owner)
    protocol = _protocol_arrays(protocol_owner)
    _, relations, _ = _authenticate_authority(authority_owner)
    terminal_hnf = authority_owner.get("terminalHNF")
    if not isinstance(terminal_hnf, list) or len(terminal_hnf) != 4:
        raise Field3FullTerminalAncestryFailure("terminal HNF owner changed")
    terminal_h = _integers(terminal_hnf[0], 4, "terminal H")
    terminal_permutation = _integers(
        authority_owner["authority"]["owners"]["hnfPermutation"],
        RELATION_ROWS,
        "terminal permutation",
    )
    terminal_state = _integers(
        authority_owner["authority"]["owners"]["hnfState"],
        9,
        "terminal HNF state",
    )
    if terminal_state != TERMINAL_STATE:
        raise Field3FullTerminalAncestryFailure("terminal HNF state changed")
    checkpoints = protocol_owner.get("checkpointHashes")
    if (
        not isinstance(checkpoints, Mapping)
        or checkpoints.get("terminalH") != _packed_sha256(terminal_h)
        or checkpoints.get("terminalPermutation")
        != _packed_sha256(terminal_permutation)
    ):
        raise Field3FullTerminalAncestryFailure(
            "terminal H/permutation authority changed"
        )

    size = RAW_COLUMNS * TERMINAL_COLUMNS
    transform = [0] * size
    retention_state = [0] * 8
    status = pari_field3_retain_full_terminal_transform(
        protocol["initialCleanupTransform"],
        protocol["initialTransform"],
        protocol["initialFullH"],
        protocol["initialFullDep"],
        protocol["initialTrailing"],
        protocol["initialDiagonal"],
        protocol["appendMetadata"],
        protocol["appendTransform"],
        protocol["appendFullH"],
        protocol["appendFullDep"],
        protocol["appendTrailing"],
        protocol["appendDiagonal"],
        protocol["appendPermutations"],
        protocol["appendRelations"],
        [0] * size,
        [0] * size,
        [0] * size,
        [0] * (36 * 252),
        [0] * size,
        transform,
        retention_state,
    )
    expected_retention = [0, 301, 15, 293, 3, 4515, 13, 2]
    if status != 0 or retention_state != expected_retention:
        raise Field3FullTerminalAncestryFailure("terminal ancestry retention failed")
    image_state = [0] * 8
    if pari_field3_validate_full_terminal_image(
        relations,
        transform,
        terminal_h,
        terminal_permutation,
        image_state,
    ) != 0 or image_state != [0, 288, 301, 13, 2, 15, 3744, 576]:
        raise Field3FullTerminalAncestryFailure("terminal relation image changed")

    packed = _full_replay(raw, protocol)
    split = UNIT_COLUMNS * LOG_STRIDE
    return {
        "schema": OUTPUT_SCHEMA,
        "field": FIELD,
        "runIdentity": RUN_IDENTITY,
        "targetBits": TARGET_BITS,
        "sourceShape": [PLACES, RAW_COLUMNS],
        "terminalShape": [PLACES, TERMINAL_COLUMNS],
        "unitColumns": UNIT_COLUMNS,
        "classColumns": CLASS_COLUMNS,
        "layout": "column-major packed [kind,rm,rp,re,im,ip,ie]",
        "transformShape": [RAW_COLUMNS, TERMINAL_COLUMNS],
        "transform": [str(value) for value in transform],
        "retentionState": retention_state,
        "imageState": image_state,
        "terminalState": terminal_state,
        "terminalH": [str(value) for value in terminal_h],
        "terminalPermutation": [str(value) for value in terminal_permutation],
        "packedTerminal": [str(value) for value in packed],
        "packedA": [str(value) for value in packed[:split]],
        "packedCe": [str(value) for value in packed[split:]],
        "schedule": LOCAL_SCHEDULE,
    }


__all__ = [
    "Field3FullTerminalAncestryFailure",
    "pari_field3_retain_full_terminal_transform",
    "pari_field3_validate_full_terminal_image",
    "transform_authenticated_owners",
]
