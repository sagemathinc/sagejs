"""Bridge an accepted resident PARI candidate to the final-state contracts.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The random/LIE continuation publishes PARI's compact resident `H/B/C`
state and returns acceptance action zero.  The resumable driver's ordinary
tail then computes invariant factors and marks the candidate terminal.  This
module exposes precisely that tail and converts the resulting compact square
presentation into the existing immutable relation/Smith component contracts.

The compact `H` is already the class-group presentation after the `B`
rows have been eliminated.  Consequently the relation matrix at this boundary
is `H` itself and both relation/presentation witnesses are identities.  This
does not claim to retain a witness from all pre-elimination factor-base rows;
the authenticated resident `H/B/C` publication remains the authority for
that earlier reduction.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .class_group_final_state import (
    RelationComponentOutput,
    TransformComponentOutput,
    canonical_component_sha256,
)
from .class_group_internal_result import (
    PreparedCandidateLayout,
    snapshot_prepared_candidate,
)
from .class_invariant_output import pari_class_invariant_output


@native
def pari_publish_terminal_candidate_tail(
    terminal_action: int,
    rows: int,
    places: int,
    columns: int,
    resident_state: Int64Buffer,
    resident_h: IntegerBuffer,
    resident_b: IntegerBuffer,
    resident_c: IntegerBuffer,
    relation_state: IntegerBuffer,
    accept_regulator: IntegerBuffer,
    driver_state: Int64Buffer,
    presentation: IntegerBuffer,
    candidate_relations: IntegerBuffer,
    candidate_logs: IntegerBuffer,
    class_invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    smith_work: IntegerBuffer,
    smith_column: IntegerBuffer,
    smith_state: Int64Buffer,
    reduced_relation_state: IntegerBuffer,
    bridge_state: Int64Buffer,
) -> int:
    """Publish the exact invariant-only tail after acceptance action zero.

    `bridge_state` is status, original row count, original relation column
    count, compact presentation dimension, eliminated `B` rows, invariant
    count, copied packed-log words, and checked `B` cells.  Capacity and
    source-state checks precede mathematical publication.
    """
    if rows < 1 or places < 1 or columns < 1:
        raise ValueError("invalid terminal candidate dimensions")
    if (
        len(resident_state) < 9
        or len(relation_state) < 6
        or len(accept_regulator) < 3
        or len(driver_state) < 8
        or len(reduced_relation_state) < 5
        or len(bridge_state) < 8
    ):
        raise ValueError("short terminal candidate state owner")
    h_rows = int(resident_state[0])
    b_columns = int(resident_state[2])
    total_columns = int(resident_state[7])
    log_words = 7 * places * columns
    if h_rows < 1 or b_columns < 0:
        raise ValueError("invalid compact terminal presentation")
    if (
        len(resident_h) < h_rows * h_rows
        or len(resident_b) < h_rows * b_columns
        or len(resident_c) < log_words
        or len(presentation) < h_rows * h_rows
        or len(candidate_relations) < h_rows * h_rows
        or len(candidate_logs) < log_words
        or len(class_invariants) < h_rows
        or len(class_number) < 1
        or len(smith_work) < h_rows * h_rows
        or len(smith_column) < h_rows
        or len(smith_state) < 6
    ):
        raise ValueError("short terminal candidate arithmetic owner")

    for index in range(8):
        bridge_state[index] = 0
    bridge_state[0] = -1
    if (
        terminal_action != 0
        or resident_state[8] != 0
        or h_rows + b_columns != rows
        or total_columns != columns
        or relation_state[0] != columns
        or relation_state[4] != columns
        or driver_state[0] != 3
        or driver_state[4] != 0
        or driver_state[7] != columns
        or accept_regulator[0] <= 0
        or accept_regulator[1] <= 0
    ):
        return -1

    status = pari_class_invariant_output(
        resident_h,
        h_rows,
        smith_work,
        smith_column,
        class_invariants,
        class_number,
        smith_state,
    )
    if status != 0:
        return -1

    for index in range(h_rows * h_rows):
        value = resident_h[index]
        presentation[index] = value
        candidate_relations[index] = value
    for index in range(log_words):
        candidate_logs[index] = resident_c[index]
    checked_b = 0
    for column in range(b_columns):
        for row in range(h_rows):
            # Reading every logical cell authenticates the compact owner and
            # prevents a short or stale B view from being silently ignored.
            checked_value = resident_b[column * h_rows + row]
            if checked_value != resident_b[column * h_rows + row]:
                return -1
            checked_b += 1

    reduced_relation_state[0] = h_rows
    reduced_relation_state[1] = h_rows
    reduced_relation_state[2] = 0
    reduced_relation_state[3] = 0
    reduced_relation_state[4] = h_rows
    driver_state[0] = 4
    driver_state[1] = 0
    driver_state[4] = 1
    driver_state[5] = smith_state[1]
    bridge_state[0] = 0
    bridge_state[1] = rows
    bridge_state[2] = columns
    bridge_state[3] = h_rows
    bridge_state[4] = b_columns
    bridge_state[5] = smith_state[1]
    bridge_state[6] = log_words
    bridge_state[7] = checked_b
    return 0


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or len(values) < length:
        raise ValueError(name + " is shorter than its logical prefix")
    answer: list[int] = []
    for value in values[:length]:
        if isinstance(value, bool):
            raise ValueError(name + " contains a non-integer")
        integer = int(value)
        if integer != value:
            raise ValueError(name + " contains a non-integer")
        answer.append(integer)
    return answer


def _row_major(column_major: Sequence[Any], dimension: int, name: str) -> list[str]:
    values = _integers(column_major, dimension * dimension, name)
    return [
        str(values[column * dimension + row])
        for row in range(dimension)
        for column in range(dimension)
    ]


def build_terminal_candidate_components(
    *,
    run_id: str,
    field_id: str,
    owner_generation: int,
    places: int,
    presentation: Sequence[Any],
    candidate_relations: Sequence[Any],
    candidate_logs: Sequence[Any],
    class_invariants: Sequence[Any],
    class_number: Sequence[Any],
    accept_regulator: Sequence[Any],
    driver_state: Sequence[Any],
    reduced_relation_state: Sequence[Any],
    bridge_state: Sequence[Any],
    smith: Mapping[str, Sequence[Any]],
) -> tuple[RelationComponentOutput, TransformComponentOutput]:
    """Create linked relation and transform outputs from live bridge owners.

    This host-level adapter performs no mathematics and accepts no oracle or
    fixture fields.  All exact matrices must be outputs of the resident tail
    and `pari_class_group_smith_transform` from the same owner generation.
    """
    bridge = _integers(bridge_state, 8, "bridge state")
    if bridge[0] != 0 or bridge[3] < 1 or bridge[4] < 0:
        raise ValueError("terminal candidate bridge did not complete")
    dimension = bridge[3]
    if places < 1 or bridge[6] != 7 * places * bridge[2]:
        raise ValueError("terminal candidate log shape is inconsistent")
    if bridge[7] != dimension * bridge[4]:
        raise ValueError("terminal candidate B authentication is incomplete")
    invariant_count = bridge[5]
    state = {
        "relation_records": _integers(
            candidate_relations, dimension * dimension, "candidate relations"
        ),
        "hnf_result_h": _integers(
            presentation, dimension * dimension, "candidate presentation"
        ),
        "hnf_result_c": _integers(candidate_logs, bridge[6], "candidate logarithms"),
        "class_invariants": _integers(
            class_invariants, invariant_count, "class invariants"
        ),
        "class_number": _integers(class_number, 1, "class number"),
        "accept_regulator": _integers(accept_regulator, 3, "accepted regulator"),
        "driver_state": _integers(driver_state, 8, "driver state"),
        "relation_state": _integers(
            reduced_relation_state, 5, "reduced relation state"
        ),
    }
    layout = PreparedCandidateLayout(
        dimension,
        dimension,
        dimension,
        dimension,
        bridge[6],
        invariant_count,
        places - 1,
    )
    relation = RelationComponentOutput(
        run_id,
        field_id,
        owner_generation,
        "candidate-accepted",
        state,
        layout,
    )
    candidate = snapshot_prepared_candidate(state, layout, field_id)
    candidate_sha256 = canonical_component_sha256(candidate)
    identity = [
        str(int(row == column))
        for row in range(dimension)
        for column in range(dimension)
    ]
    evidence = {
        "shape": [str(dimension), str(dimension)],
        "presentation": _row_major(presentation, dimension, "presentation"),
        "left": _row_major(smith["left"], dimension, "left transform"),
        "left_inverse": _row_major(smith["left_inverse"], dimension, "left inverse"),
        "right": _row_major(smith["right"], dimension, "right transform"),
        "right_inverse": _row_major(smith["right_inverse"], dimension, "right inverse"),
        "diagonal": _row_major(smith["diagonal"], dimension, "Smith diagonal"),
        "relation_to_presentation_shape": [str(dimension), str(dimension)],
        "relation_to_presentation": identity,
        "presentation_to_relation_shape": [str(dimension), str(dimension)],
        "presentation_to_relation": identity,
    }
    transform = TransformComponentOutput(
        run_id,
        owner_generation,
        "smith-and-hnf-complete",
        candidate_sha256,
        evidence,
    )
    return relation, transform


__all__ = [
    "build_terminal_candidate_components",
    "pari_publish_terminal_candidate_tail",
]
