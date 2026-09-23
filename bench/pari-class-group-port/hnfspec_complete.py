"""Connected PARI 2.17.4 hnfspec_i, stopping before deferred hnfadd_i.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Original sparse relation words and prepared t_MAT logarithms flow through
resident cleanup, certified rank, block assembly, C*T and hnffinal. HNFLLL
executes once, inside hnffinal. This is not a complete class-group engine:
rational rank verification, general exact Strassen/CRT and hnfadd_i
remain explicit frontiers. No fixture supplies ranks or transformations.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    native,
)

from .hnfspec_cleanup import _pari_hnfspec_cleanup_bounded_transform
from .hnfspec_cup_rank import pari_hnfspec_cup_rank_prefix
from .hnfspec_assembly import pari_hnfspec_assemble_blocks
from .log_matrix_transform import (
    _pari_log_matrix_transform_bounded_word_zero_exact,
    _pari_pack_log_metadata_zero_exact,
    _pari_log_matrix_transform_int64,
    _pari_log_matrix_transform_word_coefficients_nongeneric,
    pari_validate_log_entries,
)
from .hnffinal import pari_hnffinal_nonempty


@native
def pari_hnfspec_complete(
    original: Int64Buffer,
    rows: int64,
    columns: int64,
    perm: Int64Buffer,
    k0: int64,
    logs: IntegerBuffer,
    log_rows: int64,
    mat: Int64Buffer,
    dense: IntegerBuffer,
    transform: IntegerBuffer,
    vmax: Int64Buffer,
    found: Int64Buffer,
    sparse_state: Int64Buffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    cleanup_state: Int64Buffer,
    rank_matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    rank_state: IntegerBuffer,
    perm_work: Int64Buffer,
    matbnew: IntegerBuffer,
    dep: IntegerBuffer,
    b: IntegerBuffer,
    assembly_state: Int64Buffer,
    transformed_logs: IntegerBuffer,
    full_h: IntegerBuffer,
    hnf_transform: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    hnf_state: Int64Buffer,
    full_dep: IntegerBuffer,
    work_b: IntegerBuffer,
    work_c: IntegerBuffer,
    diagonal: Int64Buffer,
    result_h: IntegerBuffer,
    result_dep: IntegerBuffer,
    result_b: IntegerBuffer,
    result_c: IntegerBuffer,
    final_state: Int64Buffer,
    state: Int64Buffer,
    cup_arena: IntegerBuffer,
    cup_frames: IntegerBuffer,
    cup_solve_state: Int64Buffer,
    cup_state: Int64Buffer,
) -> int:
    """Return 0 complete for nondeferred columns; negatives are NOT success.

    State[0:7] follows hnffinal: H rows, retained relation columns, B columns,
    dependent rows, initial zero columns, removed unit diagonals, status.
    State[7] is the original-column prefix retained by source co; state[8]
    identifies the frontier: 0 complete, 1 rank, 2 exact multiplication,
    3 deferred hnfadd_i. Rank/exact -1/-2 leave dimensions -1 and final
    outputs unpublished. Deferred -3 preserves valid PREFIX dimensions and
    outputs, but explicitly does not process the remaining original columns.

    On empty live col, C*T still runs before the source hnffinal early return;
    H/U/HNF workspaces remain untouched. Empty H/dep lack a stored row extent.
    Caller owns disjoint, preallocated buffers and sufficient integer limbs.
    Matrix capacity is conservatively rows*original columns; transformations
    reserve original columns squared, although source T uses co-1 stride.
    Logs are t_MAT with positive row count, prepared 7-field entries. Scalar
    arithmetic and extra validation are prototype overhead, not word timing.
    Exceptions after validation can leave partial work; no retry-as-fresh.
    CUP capacity is checked against the actual reduced matrix after cleanup;
    insufficient CUP scratch therefore leaves a partial cleanup checkpoint.
    The caller chooses a bounded arena, not an original-size recursive arena.
    """
    diagnostic_stage_switch(1)
    if rows < 0 or columns < 0 or k0 < 0 or k0 > rows or log_rows < 1:
        raise ValueError("invalid connected hnfspec dimensions")
    size: int64 = rows * columns
    log_size: int64 = 7 * log_rows * columns
    if len(original) < size or len(perm) < rows:
        raise ValueError("short connected hnfspec input")
    if (
        len(mat) < size
        or len(dense) < k0 * columns
        or len(transform) < columns * columns
        or len(vmax) < columns
        or len(found) < 1
        or len(sparse_state) < 13
        or len(bottom) < (rows - k0) * columns
        or len(updated_dense) < k0 * columns
        or len(extra) < size
        or len(cleanup_state) < 10
    ):
        raise ValueError("short connected cleanup workspace")
    if (
        len(rank_matrix) < size
        or len(occupied) < columns
        or len(pivots) < rows
        or len(best) < rows
        or len(profile) < rows + 1
        or len(rank_state) < 10
        or len(perm_work) < rows
        or len(matbnew) < size
        or len(dep) < size
        or len(b) < size
        or len(assembly_state) < 6
    ):
        raise ValueError("short connected rank/assembly workspace")
    if (
        len(transformed_logs) < log_size
        or len(full_h) < size
        or len(hnf_transform) < columns * columns
        or len(lam) < columns * columns
        or len(d) < columns + 1
        or len(hnf_state) < 11
        or len(full_dep) < size
        or len(work_b) < size
        or len(work_c) < log_size
        or len(diagonal) < rows
        or len(result_h) < size
        or len(result_dep) < size
        or len(result_b) < rows * (columns + rows)
        or len(result_c) < log_size
        or len(final_state) < 7
        or len(state) < 9
    ):
        raise ValueError("short connected final workspace")
    pari_validate_log_entries(logs, log_rows * columns)
    i: int64 = 0
    j: int64 = 0
    range_start: int64 = 0
    range_stop: int64 = 0
    range_step: int64 = -1
    for i in range(rows):
        if perm[i] < 1 or perm[i] > rows:
            raise ValueError("invalid connected permutation")
        for j in range(i):
            if perm[i] == perm[j]:
                raise ValueError("invalid connected permutation")
    for i in range(9):
        state[i] = -1
    diagnostic_stage_switch(2)
    cleanup_status: int64 = _pari_hnfspec_cleanup_bounded_transform(
        original,
        rows,
        columns,
        perm,
        k0,
        log_rows,
        mat,
        dense,
        transform,
        vmax,
        found,
        sparse_state,
        bottom,
        updated_dense,
        extra,
        cleanup_state,
    )
    if cleanup_status != 0 and cleanup_status != 1:
        raise ValueError("incomplete cleanup checkpoint")
    diagnostic_stage_switch(3)
    status: int64 = checked_int64(
        pari_hnfspec_cup_rank_prefix(
            extra,
            cleanup_state,
            rank_matrix,
            occupied,
            pivots,
            best,
            profile,
            rank_state,
            cup_arena,
            cup_frames,
            cup_solve_state,
            cup_state,
        )
    )
    retained: int64 = sparse_state[0] - 1
    state[7] = retained
    if status != 0:
        state[6] = status
        state[8] = 1
        return status
    diagnostic_stage_switch(4)
    pari_hnfspec_assemble_blocks(
        rows,
        k0,
        perm,
        sparse_state,
        cleanup_state,
        rank_state,
        profile,
        bottom,
        updated_dense,
        extra,
        perm_work,
        matbnew,
        dep,
        b,
        assembly_state,
    )
    diagnostic_stage_switch(7)
    # Literal source co includes eliminated columns: T is retained x retained.
    # At retained==0, lg(C)==1: RgM_ZM_mul returns cgetg(lg(T),t_MAT).
    if sparse_state[4] != 0 and retained != 0:
        metadata_offset: int64 = retained * retained
        bounded_logs: bool = len(mat) >= (metadata_offset + 5 * log_rows * retained)
        if bounded_logs:
            bounded_logs = _pari_pack_log_metadata_zero_exact(
                logs, log_rows * retained, mat, metadata_offset
            )
        if bounded_logs:
            range_start = retained - 1
            range_stop = -1
            for j in range(range_start, range_stop, range_step):
                range_start = retained - 1
                for i in range(range_start, range_stop, range_step):
                    mat[j * retained + i] = original[j * retained + i]
            _pari_log_matrix_transform_bounded_word_zero_exact(
                logs,
                mat,
                log_rows,
                retained,
                retained,
                False,
                metadata_offset,
                transformed_logs,
            )
        else:
            _pari_log_matrix_transform_word_coefficients_nongeneric(
                logs,
                original,
                transform,
                retained,
                log_rows,
                retained,
                retained,
                transformed_logs,
            )
    else:
        range_stop = 7 * log_rows * retained
        for i in range(range_stop):
            transformed_logs[i] = logs[i]
    diagnostic_stage_switch(8)
    col: int64 = assembly_state[2]
    if col == 0:
        # hnffinal returns BEFORE touching dep/B/C or invoking HNFLLL.
        range_stop = assembly_state[3] * assembly_state[4]
        for i in range(range_stop):
            result_b[i] = b[i]
        range_stop = 7 * log_rows * retained
        for i in range(range_stop):
            result_c[i] = transformed_logs[i]
        range_stop = 7
        for i in range(range_stop):
            final_state[i] = 0
        final_state[2] = assembly_state[4]
    else:
        diagnostic_stage_switch(5)
        status = checked_int64(
            pari_hnffinal_nonempty(
                matbnew,
                assembly_state[0],
                col,
                perm,
                dep,
                assembly_state[1],
                b,
                retained,
                transformed_logs,
                log_rows,
                full_h,
                hnf_transform,
                mat,
                lam,
                d,
                hnf_state,
                full_dep,
                work_b,
                work_c,
                diagonal,
                perm_work,
                result_h,
                result_dep,
                result_b,
                result_c,
                final_state,
            )
        )
        if status != 0:
            state[6] = status
            state[8] = 2
            return status
    diagnostic_stage_switch(6)
    range_stop = 7
    for i in range(range_stop):
        state[i] = final_state[i]
    state[8] = 0
    if retained < columns:
        state[6] = -3
        state[8] = 3
        return -3
    return 0
