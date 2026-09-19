"""PARI 2.17.4 `hnf_snf.c:ZM_hnflll`, ptB present and remove=0.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the exact Havas–Majewski–Mathews source algorithm, not floating LLL
or a generic replacement HNF. All matrices are packed column-major. The
source's GEN allocation/GC/in-place capacity reuse becomes ordinary exact
IntegerBuffer storage; the caller supplies sufficient element/limb capacity.
Owners must be disjoint. Allocation or invariant errors may leave partial
mutation, never a completed result. Scalar and index int arithmetic remains
exact/GMP; no upstream word-cost or timing equivalence is claimed.

Initial zero columns are retained and the full column transform U is returned
in its resident owner, as required by hnffinal. This is not hnffinal itself:
dep/B/C transformations and class-group invariants remain outside this module.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    checked_int64,
    diagnostic_stage_switch,
    int64,
    integer_buffer_addmul_range,
    integer_buffer_negate_range,
    integer_buffer_sign,
    native,
)

from .hnfspec_sparse import pari_hnfspec_swap_exact_int64


@native
def pari_hnflll_round_quotient(value: int, divisor: int) -> int:
    """gen3.c:diviiround on positive D: nearest, ties toward +infinity."""
    if divisor <= 0:
        raise ValueError("HNFLLL rounding requires positive divisor")
    quotient = abs(value) // divisor
    if value < 0:
        quotient = -quotient
    remainder = value - quotient * divisor
    if remainder == 0:
        return quotient
    twice = 2 * abs(remainder)
    if twice > divisor or (twice == divisor and value > 0):
        if value > 0:
            quotient += 1
        else:
            quotient -= 1
    return quotient


@native
def pari_hnflll_exact_quotient(value: int, divisor: int) -> int:
    """The positive-D diviiexact invariant is checked rather than truncated."""
    if divisor <= 0 or value % divisor != 0:
        raise ValueError("invalid HNFLLL exact quotient")
    return value // divisor


@native
def pari_hnflll_normalize(
    a: IntegerBuffer,
    u: IntegerBuffer,
    rows: int64,
    columns: int64,
    j: int64,
    lam: IntegerBuffer,
    state: Int64Buffer,
) -> int64:
    """findi_normalize and Minus; j and returned row use source indexing."""
    row: int64 = 0
    i: int64 = 0
    k: int64 = 0
    range_start: int64 = 1
    range_stop: int64 = 0
    column_start: int64 = checked_int64((j - 1) * rows)
    position: int64 = 0
    for i in range(rows):
        position = checked_int64(column_start + i)
        if integer_buffer_sign(a, position) != 0:
            row = i + 1
            break
    position = checked_int64(column_start + row - 1)
    if row != 0 and integer_buffer_sign(a, position) < 0:
        state[1] += 1
        integer_buffer_negate_range(a, column_start, rows)
        column_start = checked_int64((j - 1) * columns)
        integer_buffer_negate_range(u, column_start, columns)
        integer_buffer_negate_range(lam, column_start, checked_int64(j - 1))
        range_start = checked_int64(j + 1)
        range_stop = checked_int64(columns + 1)
        for k in range(range_start, range_stop):
            lam[(k - 1) * columns + j - 1] = -lam[(k - 1) * columns + j - 1]
    return row


@native
def pari_hnflll_reduce(
    a: IntegerBuffer,
    u: IntegerBuffer,
    rows: int64,
    columns: int64,
    k: int64,
    j: int64,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    state: Int64Buffer,
) -> tuple[int64, int64]:
    """Literal reduce2. Return the rows recorded BEFORE column reduction."""
    state[2] += 1
    row0 = pari_hnflll_normalize(a, u, rows, columns, j, lam, state)
    row1 = pari_hnflll_normalize(a, u, rows, columns, k, lam, state)
    # Definite-assignment witness for native lowering across the early return;
    # every path reaching the reduction below overwrites this initial value.
    quotient = 0
    if row0 != 0:
        state[3] += 1
        # truedivii is Euclidean; normalization makes the divisor positive.
        quotient = a[(k - 1) * rows + row0 - 1] // a[(j - 1) * rows + row0 - 1]
    elif abs(2 * lam[(k - 1) * columns + j - 1]) > d[j]:
        state[4] += 1
        quotient = pari_hnflll_round_quotient(lam[(k - 1) * columns + j - 1], d[j])
    else:
        state[5] += 1
        return row0, row1
    range_start: int64 = 0
    range_stop: int64 = -1
    range_step: int64 = -1
    i: int64 = 0
    if quotient != 0:
        state[6] += 1
        quotient = -quotient
        # ZC_lincomb1z visits rows in descending order.
        if row0 != 0:
            range_start = checked_int64(rows - 1)
            for i in range(range_start, range_stop, range_step):
                if a[(j - 1) * rows + i] != 0:
                    a[(k - 1) * rows + i] += quotient * a[(j - 1) * rows + i]
        destination_start: int64 = checked_int64((k - 1) * columns)
        source_start: int64 = checked_int64((j - 1) * columns)
        integer_buffer_addmul_range(
            u,
            destination_start,
            source_start,
            columns,
            quotient,
        )
        lam[(k - 1) * columns + j - 1] += quotient * d[j]
        range_stop = j - 1
        if range_stop > 0:
            integer_buffer_addmul_range(
                lam,
                destination_start,
                source_start,
                range_stop,
                quotient,
            )
    return row0, row1


@native
def pari_hnflll_swap(
    a: IntegerBuffer,
    u: IntegerBuffer,
    rows: int64,
    columns: int64,
    k: int64,
    lam: IntegerBuffer,
    d: IntegerBuffer,
) -> int64:
    """hnfswap, including simultaneous updates before overwriting old values."""
    previous: int64 = k - 1
    pari_hnfspec_swap_exact_int64(a, rows, k, previous)
    pari_hnfspec_swap_exact_int64(u, columns, k, previous)
    range_start: int64 = k - 2
    range_stop: int64 = 0
    range_step: int64 = -1
    j: int64 = 0
    i: int64 = 0
    for j in range(range_start, range_stop, range_step):
        temporary = lam[(k - 2) * columns + j - 1]
        lam[(k - 2) * columns + j - 1] = lam[(k - 1) * columns + j - 1]
        lam[(k - 1) * columns + j - 1] = temporary
    range_start = k + 1
    range_stop = columns + 1
    for i in range(range_start, range_stop):
        left = lam[(i - 1) * columns + k - 2]
        right = lam[(i - 1) * columns + k - 1]
        if left == 0 and right == 0:
            continue
        cross = lam[(k - 1) * columns + k - 2]
        second = pari_hnflll_exact_quotient(left * d[k] - right * cross, d[k - 1])
        first = pari_hnflll_exact_quotient(right * d[k - 2] + left * cross, d[k - 1])
        lam[(i - 1) * columns + k - 2] = first
        lam[(i - 1) * columns + k - 1] = second
    cross = lam[(k - 1) * columns + k - 2]
    d[k - 1] = pari_hnflll_exact_quotient(d[k - 2] * d[k] + cross * cross, d[k - 1])
    return 0


@native
def pari_hnflll(
    original: IntegerBuffer,
    rows: int64,
    columns: int64,
    a: IntegerBuffer,
    u: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    state: Int64Buffer,
) -> int64:
    """Return 0 after the complete ptB-present/remove=0 ZM_hnflll path.

    State counts: iterations, sign normalizations, reduce2 calls, Euclidean
    quotients, rounded quotients, skipped rounding, nonzero quotients, swaps,
    must_swap calls, final k, kmax. D has columns+1 entries, including D[0].
    Malformed dimensions/capacities reject before output mutation.
    """
    if rows < 0 or columns < 0:
        raise ValueError("invalid HNFLLL dimensions")
    if len(original) < rows * columns or len(a) < rows * columns:
        raise ValueError("short HNFLLL input or matrix workspace")
    if len(u) < columns * columns or len(lam) < columns * columns:
        raise ValueError("short HNFLLL square workspace")
    if len(d) < columns + 1 or len(state) < 11:
        raise ValueError("short HNFLLL scalar state")
    # ZM_copy followed by reverse_rows, in the same column order.
    i: int64 = 0
    j: int64 = 0
    range_stop: int64 = 0
    for j in range(columns):
        for i in range(rows):
            a[j * rows + i] = original[j * rows + rows - i - 1]
    range_stop = columns * columns
    for i in range(range_stop):
        u[i] = 0
        lam[i] = 0
    for i in range(columns):
        u[i * columns + i] = 1
    range_stop = columns + 1
    for i in range(range_stop):
        d[i] = 1
    range_stop = 11
    for i in range(range_stop):
        state[i] = 0
    k: int64 = 2
    kmax: int64 = 2
    range_stop = columns + 1
    diagnostic_stage_switch(3)
    while k < range_stop:
        state[0] += 1
        row0, row1 = pari_hnflll_reduce(a, u, rows, columns, k, k - 1, lam, d, state)
        swap: int64 = 0
        if row0 != 0:
            if row1 == 0 or row0 <= row1:
                swap = 1
        elif row1 == 0:
            state[8] += 1
            cross = lam[(k - 1) * columns + k - 2]
            if d[k - 2] * d[k] + cross * cross < d[k - 1] * d[k - 1]:
                swap = 1
        if swap != 0:
            state[7] += 1
            pari_hnflll_swap(a, u, rows, columns, k, lam, d)
            if k > 2:
                k -= 1
        else:
            range_start: int64 = k - 2
            range_zero: int64 = 0
            range_step: int64 = -1
            for i in range(range_start, range_zero, range_step):
                row0, row1 = pari_hnflll_reduce(
                    a, u, rows, columns, k, i, lam, d, state
                )
            k += 1
            if k > kmax:
                kmax = k
    if columns == 1:
        one: int64 = 1
        pari_hnflll_normalize(a, u, rows, columns, one, lam, state)
    diagnostic_stage_switch(4)
    half_rows: int64 = rows // 2
    for j in range(columns):
        for i in range(half_rows):
            temporary = a[j * rows + i]
            a[j * rows + i] = a[j * rows + rows - i - 1]
            a[j * rows + rows - i - 1] = temporary
    state[9] = k
    state[10] = kmax
    return 0
