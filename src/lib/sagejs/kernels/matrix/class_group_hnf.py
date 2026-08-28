"""Resident exact HNF support and bounded row selection.

The complete source matrix stays in one packed `IntegerBuffer` for the whole
kernel call.  FLINT supplies canonical row HNF, while this ordinary typed
Python body owns support extraction, exact replay, and the stable bounded
deletion schedule.  Replay output may alias the later trial-source workspace;
those lifetimes do not overlap.  The same body supplies the generated
JavaScript target.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    fmpz_mat_det,
    fmpz_mat_hnf,
    fmpz_mat_hnf_transform,
    fmpz_mat_mul,
)
from sagejs.native import IntegerBuffer, native, uint64


@native
def resident_exact_relation_hnf_select(
    metadata: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    support: IntegerBuffer,
    selected: IntegerBuffer,
    trial_source: IntegerBuffer,
    trial_hnf: IntegerBuffer,
    replay_product: IntegerBuffer,
    determinant: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    initial_rows: uint64,
    columns: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    one: uint64,
) -> int:
    """Select source-supported rows in one isolated exact-matrix region.

    Return `1` on success, `0` when exact replay fails, and `-1` for an
    invalid packed ABI or a declared FLINT failure.  `metadata` receives
    rank, support count, selected count, deletion trials, HNF calls, scalar
    work units, and a flag saying whether the deletion schedule completed.
    """
    row_entries = rows * columns
    square_entries = rows * rows
    candidate_rows = rows - initial_rows
    valid = rows > 0 and columns > 0 and initial_rows <= rows
    if len(metadata) != 7:
        valid = False
    if len(basis) != row_entries or len(transform) != square_entries:
        valid = False
    if len(support) != rows or len(selected) != candidate_rows:
        valid = False
    if len(trial_source) != row_entries or len(trial_hnf) != row_entries:
        valid = False
    if len(replay_product) != row_entries or len(determinant) != 1:
        valid = False
    if len(source) != row_entries or one != 1:
        valid = False
    if not valid:
        return -1

    work: uint64 = 0
    for metadata_index in range(7):
        metadata[metadata_index] = 0
    for support_index in range(rows):
        support[support_index] = 0
    for candidate_zero_index in range(candidate_rows):
        selected[candidate_zero_index] = 0

    if not fmpz_mat_hnf_transform(basis, transform, source, rows, columns):
        return -1
    metadata[4] = 1
    if not fmpz_mat_mul(
        replay_product,
        transform,
        source,
        rows,
        rows,
        columns,
    ):
        return -1
    for replay_index in range(row_entries):
        work = work + 1
        if work > work_limit:
            return -1
        if replay_product[replay_index] != basis[replay_index]:
            return 0
    if not fmpz_mat_det(determinant, transform, rows, one):
        return -1
    if determinant[0] != 1 and determinant[0] != -1:
        return 0

    rank: uint64 = 0
    for row in range(rows):
        nonzero = False
        for column in range(columns):
            work = work + 1
            if work > work_limit:
                return -1
            if basis[row * columns + column] != 0:
                nonzero = True
        if nonzero:
            rank = rank + 1

    support_count: uint64 = 0
    for source_row in range(rows):
        used = False
        for hnf_row in range(rank):
            work = work + 1
            if work > work_limit:
                return -1
            if transform[hnf_row * rows + source_row] != 0:
                used = True
        if used:
            support[source_row] = 1
            support_count = support_count + 1
            if source_row >= initial_rows:
                selected[source_row - initial_rows] = 1

    selected_count: uint64 = 0
    for selected_index in range(candidate_rows):
        if selected[selected_index] == 1:
            selected_count = selected_count + 1

    # Construct the retained workspace once.  A deletion trial changes only
    # one candidate row; rejected deletions restore that row, while accepted
    # deletions leave it zero for all later trials.
    for retained_source_row in range(rows):
        retain_source_row = retained_source_row < initial_rows
        if retained_source_row >= initial_rows:
            retained_candidate = retained_source_row - initial_rows
            retain_source_row = selected[retained_candidate] == 1
        for retained_column in range(columns):
            work = work + 1
            if work > work_limit:
                return -1
            retained_target = retained_source_row * columns + retained_column
            if retain_source_row:
                trial_source[retained_target] = source[retained_target]
            else:
                trial_source[retained_target] = 0

    trials: uint64 = 0
    deletion_complete = True
    candidate_index: uint64 = 0
    while candidate_index < candidate_rows:
        if selected[candidate_index] == 0:
            candidate_index = candidate_index + 1
        elif trials >= maximum_trials:
            deletion_complete = False
            candidate_index = candidate_rows
        elif initial_rows + selected_count - 1 < rank:
            candidate_index = candidate_index + 1
        else:
            deleted_row = initial_rows + candidate_index
            for deleted_column in range(columns):
                work = work + 1
                if work > work_limit:
                    return -1
                deleted_target = deleted_row * columns + deleted_column
                trial_source[deleted_target] = 0

            if not fmpz_mat_hnf(trial_hnf, trial_source, rows, columns):
                return -1
            metadata[4] = metadata[4] + 1
            same_lattice = True
            for trial_index in range(row_entries):
                work = work + 1
                if work > work_limit:
                    return -1
                if trial_hnf[trial_index] != basis[trial_index]:
                    same_lattice = False
            trials = trials + 1
            if same_lattice:
                selected[candidate_index] = 0
                selected_count = selected_count - 1
            else:
                for restored_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    restored_target = deleted_row * columns + restored_column
                    trial_source[restored_target] = source[restored_target]
                candidate_index = candidate_index + 1

    metadata[0] = rank
    metadata[1] = support_count
    metadata[2] = selected_count
    metadata[3] = trials
    metadata[5] = work
    if deletion_complete:
        metadata[6] = 1
    return 1


__all__ = ["resident_exact_relation_hnf_select"]
