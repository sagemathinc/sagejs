"""PARI 2.17.4 `hnfspec_i`: connected sparse prefix through END2 cleanup.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.

Stop immediately before `if (!col)` / `ZM_rowrankprofile`. Rank extraction,
row rearrangement, dep/B/C construction, hnffinal and hnfadd_i are NOT ported.
Neither return value is a completed HNF or a class-group invariant.

The resident sparse buffers and their 13-slot state retain the prefix contract.
All buffers must be disjoint, except no new aliasing is needed or permitted.
Exact buffers require caller-supplied limb capacity. Allocation exhaustion or
arithmetic rejection may follow partial mutations; inputs are not retry tokens.
Scalar/index `int` remains exact, not an unboxed-word performance claim.
Conservative output capacity uses original column count, including deferred
columns; only the retained/live region is defined. No timing claim is made.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnfspec_sparse import pari_hnfspec_sparse_prefix


@native
def pari_hnfspec_cleanup(
    mat0: Int64Buffer,
    rows: int,
    columns: int,
    perm: Int64Buffer,
    k0: int,
    c_rows: int,
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
) -> int:
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
    if rows < 0 or columns < 0 or k0 < 0 or k0 > rows:
        raise ValueError("invalid cleanup dimensions")
    # Validate added owner capacity before the prefix mutates any output.
    if len(bottom) < (rows - k0) * columns:
        raise ValueError("short cleanup bottom workspace")
    if len(updated_dense) < k0 * columns or len(extra) < rows * columns:
        raise ValueError("short cleanup exact workspace")
    if len(state) < 10:
        raise ValueError("short cleanup state")
    result = pari_hnfspec_sparse_prefix(
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
    co = sparse_state[0]
    lig = sparse_state[1]
    col = sparse_state[2]
    lk0 = sparse_state[3]
    has_t = sparse_state[4]
    retained = co - 1
    stride = rows - k0
    for i in range(10):
        state[i] = 0
    # END2: go multiprecision first, respecting the current row permutation.
    for j in range(retained):
        for i in range(k0, rows):
            bottom[j * stride + i - k0] = mat[j * rows + perm[i] - 1]
    i = rows - 1  # upstream li-2, not the final identity row
    while i > lig:
        i0 = i - k0
        k = i + co - (rows + 1)
        for j in range(k + 1, co):
            at = (j - 1) * stride + i0 - 1
            value = bottom[at]
            if value == 0:
                state[6] += 1
                continue
            bottom[at] = 0
            if value == 1:
                state[7] += 1
                for h in range(i0 - 1):
                    bottom[(j - 1) * stride + h] -= bottom[(k - 1) * stride + h]
            elif value == -1:
                state[8] += 1
                for h in range(i0 - 1):
                    bottom[(j - 1) * stride + h] += bottom[(k - 1) * stride + h]
            else:
                state[9] += 1
                for h in range(i0 - 1):
                    bottom[(j - 1) * stride + h] -= value * bottom[(k - 1) * stride + h]
            if has_t != 0:
                for h in range(retained):
                    transform[(j - 1) * retained + h] -= (
                        value * transform[(k - 1) * retained + h]
                    )
        i -= 1
    # Upstream setlg forgets bottom rows. They remain allocated but are not
    # defined output here. Exact ZM_mul updates all retained top-row columns.
    nlze = lk0 - k0
    lnz = lig - nlze + 1
    for j in range(retained):
        for i in range(k0):
            value = dense[j * k0 + i]
            if has_t != 0:
                value = 0
                for h in range(retained):
                    value += dense[h * k0 + i] * transform[j * retained + h]
            updated_dense[j * k0 + i] = value
    for j in range(col):
        for i in range(k0):
            extra[j * (lnz - 1) + i] = updated_dense[j * k0 + i]
        for i in range(k0, lnz - 1):
            extra[j * (lnz - 1) + i] = bottom[j * stride + i + nlze - k0]
    state[0] = lig - k0
    state[1] = nlze
    state[2] = lnz
    state[3] = col
    state[4] = retained
    state[5] = has_t
    return result
