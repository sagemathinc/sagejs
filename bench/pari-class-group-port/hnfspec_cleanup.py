"""PARI 2.17.4 `hnfspec_i`: connected sparse prefix through END2 cleanup.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.

Stop immediately before `if (!col)` / `ZM_rowrankprofile`. Rank extraction,
row rearrangement, dep/B/C construction, hnffinal and hnfadd_i are NOT ported.
Neither return value is a completed HNF or a class-group invariant.

The resident sparse buffers and their 13-slot state retain the prefix contract.
All buffers must be disjoint, except no new aliasing is needed or permitted.
Exact buffers require caller-supplied limb capacity. Allocation exhaustion or
arithmetic rejection may follow partial mutations; inputs are not retry tokens.
Bounded dimensions and indices use checked `int64`; exact matrix entries remain
ordinary Python integers in `IntegerBuffer` storage.
Conservative output capacity uses original column count, including deferred
columns; only the retained/live region is defined. No timing claim is made.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    int64,
    int64_buffer_addmul_range,
    integer_buffer_addmul_range,
    native,
)

from .hnfspec_sparse import pari_hnfspec_sparse_prefix


@native
def _pari_hnfspec_cleanup_bounded_transform(
    mat0: Int64Buffer,
    rows: int64,
    columns: int64,
    perm: Int64Buffer,
    k0: int64,
    c_rows: int64,
    mat: Int64Buffer,
    dense: IntegerBuffer,
    transform: IntegerBuffer,
    vmax: Int64Buffer,
    found: Int64Buffer,
    sparse_state: Int64Buffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    state: Int64Buffer,
) -> int64:
    """Cleanup with the proven signed-word transform stored in dead `mat`.

    The sparse prefix still computes the ordinary exact transform. Once its
    word matrix is dead, the first `rows` entries of every transform column
    move into that `Int64Buffer`; any short column tail remains exact. The
    complete HNF path does not expose `mat`, and the exact transform is
    restored before return.
    """
    diagnostic_stage_switch(1)
    if rows < 0 or columns < 0 or k0 < 0 or k0 > rows:
        raise ValueError("invalid bounded cleanup dimensions")
    if len(bottom) < (rows - k0) * columns:
        raise ValueError("short bounded cleanup bottom workspace")
    if len(updated_dense) < k0 * columns or len(extra) < rows * columns:
        raise ValueError("short bounded cleanup exact workspace")
    if len(state) < 10:
        raise ValueError("short bounded cleanup state")
    result: int64 = pari_hnfspec_sparse_prefix(
        mat0,
        rows,
        columns,
        perm,
        k0,
        c_rows,
        mat,
        dense,
        transform,
        vmax,
        found,
        sparse_state,
    )
    diagnostic_stage_switch(2)
    co: int64 = sparse_state[0]
    lig: int64 = sparse_state[1]
    col: int64 = sparse_state[2]
    lk0: int64 = sparse_state[3]
    has_t: int64 = sparse_state[4]
    retained: int64 = co - 1
    stride: int64 = rows - k0
    word_rows: int64 = rows
    if retained < word_rows:
        word_rows = retained
    i: int64 = 0
    j: int64 = 0
    h: int64 = 0
    i0: int64 = 0
    k: int64 = 0
    at: int64 = 0
    range_start: int64 = 0
    range_stop: int64 = 10
    for i in range(range_stop):
        state[i] = 0
    for j in range(retained):
        for i in range(k0, rows):
            bottom[j * stride + i - k0] = mat[j * rows + perm[i] - 1]
    if has_t != 0:
        for j in range(retained):
            for h in range(word_rows):
                mat[j * word_rows + h] = checked_int64(transform[j * retained + h])
    diagnostic_stage_switch(3)
    i = rows - 1
    while i > lig:
        i0 = i - k0
        k = i + co - (rows + 1)
        range_start = k + 1
        for j in range(range_start, co):
            at = (j - 1) * stride + i0 - 1
            value = bottom[at]
            if value == 0:
                state[6] += 1
                continue
            bottom[at] = 0
            if value == 1:
                state[7] += 1
            elif value == -1:
                state[8] += 1
            else:
                state[9] += 1
            range_stop = i0 - 1
            if range_stop > 0:
                destination_start: int64 = checked_int64((j - 1) * stride)
                source_start: int64 = checked_int64((k - 1) * stride)
                integer_buffer_addmul_range(
                    bottom,
                    destination_start,
                    source_start,
                    range_stop,
                    -value,
                )
            if has_t != 0:
                destination_start = checked_int64((j - 1) * word_rows)
                source_start = checked_int64((k - 1) * word_rows)
                int64_buffer_addmul_range(
                    mat,
                    destination_start,
                    source_start,
                    word_rows,
                    checked_int64(-value),
                )
                for h in range(word_rows, retained):
                    transform[(j - 1) * retained + h] -= (
                        value * transform[(k - 1) * retained + h]
                    )
        i -= 1
    diagnostic_stage_switch(4)
    nlze: int64 = lk0 - k0
    lnz: int64 = lig - nlze + 1
    for j in range(retained):
        for i in range(k0):
            value = dense[j * k0 + i]
            if has_t != 0:
                value = 0
                for h in range(word_rows):
                    value += dense[h * k0 + i] * mat[j * word_rows + h]
                for h in range(word_rows, retained):
                    value += dense[h * k0 + i] * transform[j * retained + h]
            updated_dense[j * k0 + i] = value
    diagnostic_stage_switch(5)
    if has_t != 0:
        for j in range(retained):
            for h in range(word_rows):
                transform[j * retained + h] = mat[j * word_rows + h]
    for j in range(col):
        for i in range(k0):
            extra[j * (lnz - 1) + i] = updated_dense[j * k0 + i]
        range_stop = lnz - 1
        for i in range(k0, range_stop):
            extra[j * (lnz - 1) + i] = bottom[j * stride + i + nlze - k0]
    state[0] = lig - k0
    state[1] = nlze
    state[2] = lnz
    state[3] = col
    state[4] = retained
    state[5] = has_t
    diagnostic_stage_switch(6)
    return result


@native
def pari_hnfspec_cleanup(
    mat0: Int64Buffer,
    rows: int64,
    columns: int64,
    perm: Int64Buffer,
    k0: int64,
    c_rows: int64,
    mat: Int64Buffer,
    dense: IntegerBuffer,
    transform: IntegerBuffer,
    vmax: Int64Buffer,
    found: Int64Buffer,
    sparse_state: Int64Buffer,
    bottom: IntegerBuffer,
    updated_dense: IntegerBuffer,
    extra: IntegerBuffer,
    state: Int64Buffer,
) -> int64:
    """Run actual prefix and multiprecision cleanup in one native call.

    Bottom uses stride `rows-k0`, with only `lig-k0` live rows after cleanup.
    Updated dense uses stride `k0`; extra uses stride `lnz-1`. Bottom and dense
    retain `co-1` columns, while extra has `col` columns. Sparse mat, original
    dense snapshot and permutation remain unchanged by the cleanup itself.

    State: bottom live rows, nlze, lnz (includes header), col, co-1, has_T,
    cleanup zero skips, +1 updates, -1 updates, general updates.
    Return preserves prefix 0 / HIGHBIT-stop 1; BOTH have completed cleanup
    and stop before row-rank-profile extraction, not after hnfspec_i.
    """
    diagnostic_stage_switch(1)
    if rows < 0 or columns < 0 or k0 < 0 or k0 > rows:
        raise ValueError("invalid cleanup dimensions")
    # Validate added owner capacity before the prefix mutates any output.
    if len(bottom) < (rows - k0) * columns:
        raise ValueError("short cleanup bottom workspace")
    if len(updated_dense) < k0 * columns or len(extra) < rows * columns:
        raise ValueError("short cleanup exact workspace")
    if len(state) < 10:
        raise ValueError("short cleanup state")
    result: int64 = pari_hnfspec_sparse_prefix(
        mat0,
        rows,
        columns,
        perm,
        k0,
        c_rows,
        mat,
        dense,
        transform,
        vmax,
        found,
        sparse_state,
    )
    diagnostic_stage_switch(2)
    co: int64 = sparse_state[0]
    lig: int64 = sparse_state[1]
    col: int64 = sparse_state[2]
    lk0: int64 = sparse_state[3]
    has_t: int64 = sparse_state[4]
    retained: int64 = co - 1
    stride: int64 = rows - k0
    i: int64 = 0
    j: int64 = 0
    h: int64 = 0
    i0: int64 = 0
    k: int64 = 0
    at: int64 = 0
    range_start: int64 = 0
    range_stop: int64 = 10
    for i in range(range_stop):
        state[i] = 0
    # END2: go multiprecision first, respecting the current row permutation.
    for j in range(retained):
        for i in range(k0, rows):
            bottom[j * stride + i - k0] = mat[j * rows + perm[i] - 1]
    diagnostic_stage_switch(3)
    i = rows - 1  # upstream li-2, not the final identity row
    while i > lig:
        i0 = i - k0
        k = i + co - (rows + 1)
        range_start = k + 1
        for j in range(range_start, co):
            at = (j - 1) * stride + i0 - 1
            value = bottom[at]
            if value == 0:
                state[6] += 1
                continue
            bottom[at] = 0
            if value == 1:
                state[7] += 1
                range_stop = i0 - 1
                for h in range(range_stop):
                    bottom[(j - 1) * stride + h] -= bottom[(k - 1) * stride + h]
            elif value == -1:
                state[8] += 1
                range_stop = i0 - 1
                for h in range(range_stop):
                    bottom[(j - 1) * stride + h] += bottom[(k - 1) * stride + h]
            else:
                state[9] += 1
                range_stop = i0 - 1
                for h in range(range_stop):
                    bottom[(j - 1) * stride + h] -= value * bottom[(k - 1) * stride + h]
            if has_t != 0:
                for h in range(retained):
                    transform[(j - 1) * retained + h] -= (
                        value * transform[(k - 1) * retained + h]
                    )
        i -= 1
    diagnostic_stage_switch(4)
    # Upstream setlg forgets bottom rows. They remain allocated but are not
    # defined output here. Exact ZM_mul updates all retained top-row columns.
    nlze: int64 = lk0 - k0
    lnz: int64 = lig - nlze + 1
    for j in range(retained):
        for i in range(k0):
            value = dense[j * k0 + i]
            if has_t != 0:
                value = 0
                for h in range(retained):
                    value += dense[h * k0 + i] * transform[j * retained + h]
            updated_dense[j * k0 + i] = value
    diagnostic_stage_switch(5)
    for j in range(col):
        for i in range(k0):
            extra[j * (lnz - 1) + i] = updated_dense[j * k0 + i]
        range_stop = lnz - 1
        for i in range(k0, range_stop):
            extra[j * (lnz - 1) + i] = bottom[j * stride + i + nlze - k0]
    state[0] = lig - k0
    state[1] = nlze
    state[2] = lnz
    state[3] = col
    state[4] = retained
    state[5] = has_t
    diagnostic_stage_switch(6)
    return result
