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
    fmpz_matrix,
    fmpz_matrix_det,
    fmpz_matrix_entry,
    fmpz_matrix_hnf_transform,
    fmpz_matrix_set_entry,
    fmpz_mat_det,
    fmpz_mat_hnf,
    fmpz_mat_hnf_transform,
    fmpz_mat_mul,
)
from sagejs.native import IntegerBuffer, NativeExactArena, native, uint64


@native
def resident_exact_relation_hnf_select_v2(
    metadata: IntegerBuffer,
    basis: IntegerBuffer,
    support: IntegerBuffer,
    selected: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    initial_rows: uint64,
    columns: uint64,
    maximum_trials: uint64,
    work_limit: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Select exact relation rows in one resident FLINT workspace.

    The packed source is an authenticated ingress/checkpoint format only.
    Six fixed-shape FLINT matrices are allocated before arithmetic begins;
    source import, HNF, exact transform replay, support extraction, and every
    bounded deletion trial then run under one native checkpoint.  No public
    matrix or Python ideal is constructed inside the region.  Return values
    are the same compact basis and masks as the original selector.
    """
    row_entries = rows * columns
    candidate_rows = rows - initial_rows
    valid = rows > 0 and columns > 0 and initial_rows <= rows
    if len(metadata) != 7 or len(basis) != row_entries:
        valid = False
    if len(support) != rows or len(selected) != candidate_rows:
        valid = False
    if len(source) != row_entries:
        valid = False
    if not valid:
        return -1

    work: uint64 = 0
    for metadata_index in range(7):
        metadata[metadata_index] = 0
    for support_index in range(rows):
        support[support_index] = 0
    for selected_index in range(candidate_rows):
        selected[selected_index] = 0

    with NativeExactArena(memory_limit, temporary_limit) as arena:
        source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        basis_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        transform_matrix = arena.foreign_resource(fmpz_matrix, rows, rows)
        trial_source_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_hnf_matrix = arena.foreign_resource(fmpz_matrix, rows, columns)
        trial_transform_matrix = arena.foreign_resource(fmpz_matrix, rows, rows)

        for source_row in range(rows):
            for source_column in range(columns):
                source_index = source_row * columns + source_column
                source_value = source[source_index]
                if not fmpz_matrix_set_entry(
                    source_matrix, source_row, source_column, source_value
                ):
                    return -1
                if not fmpz_matrix_set_entry(
                    trial_source_matrix, source_row, source_column, source_value
                ):
                    return -1

        if not fmpz_matrix_hnf_transform(basis_matrix, transform_matrix, source_matrix):
            return -1
        metadata[4] = 1

        # Replay `transform * source == basis` without allocating a product
        # matrix. Exact locals and direct exact FFI values stay under the
        # arena checkpoint established after the fixed resource preflight.
        for replay_row in range(rows):
            for replay_column in range(columns):
                replay_value = 0
                for replay_inner in range(rows):
                    replay_value = replay_value + fmpz_matrix_entry(
                        transform_matrix, replay_row, replay_inner
                    ) * fmpz_matrix_entry(source_matrix, replay_inner, replay_column)
                    work = work + 1
                    if work > work_limit:
                        return -1
                if replay_value != fmpz_matrix_entry(
                    basis_matrix, replay_row, replay_column
                ):
                    return 0
        determinant = fmpz_matrix_det(transform_matrix)
        if determinant != 1 and determinant != -1:
            return 0

        rank: uint64 = 0
        for basis_row in range(rows):
            nonzero = False
            for basis_column in range(columns):
                work = work + 1
                if work > work_limit:
                    return -1
                value = fmpz_matrix_entry(basis_matrix, basis_row, basis_column)
                basis[basis_row * columns + basis_column] = value
                if value != 0:
                    nonzero = True
            if nonzero:
                rank = rank + 1

        support_count: uint64 = 0
        for support_source_row in range(rows):
            used = False
            for support_hnf_row in range(rank):
                work = work + 1
                if work > work_limit:
                    return -1
                if (
                    fmpz_matrix_entry(
                        transform_matrix, support_hnf_row, support_source_row
                    )
                    != 0
                ):
                    used = True
            if used:
                support[support_source_row] = 1
                support_count = support_count + 1
                if support_source_row >= initial_rows:
                    selected[support_source_row - initial_rows] = 1

        selected_count: uint64 = 0
        for candidate_index in range(candidate_rows):
            if selected[candidate_index] == 1:
                selected_count = selected_count + 1

        # Zero unretained candidate rows once. Rejected deletion trials restore
        # one exact row; accepted trials leave it absent for later HNF calls.
        for retained_candidate in range(candidate_rows):
            retained_row: uint64 = initial_rows + retained_candidate
            if selected[retained_candidate] == 0:
                for retained_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    if not fmpz_matrix_set_entry(
                        trial_source_matrix, retained_row, retained_column, 0
                    ):
                        return -1

        trials: uint64 = 0
        deletion_complete = True
        deletion_candidate: uint64 = 0
        while deletion_candidate < candidate_rows:
            if selected[deletion_candidate] == 0:
                deletion_candidate = deletion_candidate + 1
            elif trials >= maximum_trials:
                deletion_complete = False
                deletion_candidate = candidate_rows
            elif initial_rows + selected_count - 1 < rank:
                deletion_candidate = deletion_candidate + 1
            else:
                deleted_row: uint64 = initial_rows + deletion_candidate
                for deleted_column in range(columns):
                    work = work + 1
                    if work > work_limit:
                        return -1
                    if not fmpz_matrix_set_entry(
                        trial_source_matrix, deleted_row, deleted_column, 0
                    ):
                        return -1

                if not fmpz_matrix_hnf_transform(
                    trial_hnf_matrix,
                    trial_transform_matrix,
                    trial_source_matrix,
                ):
                    return -1
                metadata[4] = metadata[4] + 1
                same_lattice = True
                for trial_row in range(rows):
                    for trial_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        if fmpz_matrix_entry(
                            trial_hnf_matrix, trial_row, trial_column
                        ) != fmpz_matrix_entry(basis_matrix, trial_row, trial_column):
                            same_lattice = False
                trials = trials + 1
                if same_lattice:
                    selected[deletion_candidate] = 0
                    selected_count = selected_count - 1
                else:
                    for restored_column in range(columns):
                        work = work + 1
                        if work > work_limit:
                            return -1
                        restored_index = deleted_row * columns + restored_column
                        if not fmpz_matrix_set_entry(
                            trial_source_matrix,
                            deleted_row,
                            restored_column,
                            source[restored_index],
                        ):
                            return -1
                    deletion_candidate = deletion_candidate + 1

        metadata[0] = rank
        metadata[1] = support_count
        metadata[2] = selected_count
        metadata[3] = trials
        metadata[5] = work
        if deletion_complete:
            metadata[6] = 1
        return 1
    return -1


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


__all__ = [
    "resident_exact_relation_hnf_select",
    "resident_exact_relation_hnf_select_v2",
]
