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

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .hnfspec_sparse import pari_hnfspec_swap_exact


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
    rows: int,
    columns: int,
    j: int,
    lam: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """findi_normalize and Minus; j and returned row use source indexing."""
    row = 0
    for i in range(rows):
        if a[(j - 1) * rows + i] != 0:
            row = i + 1
            break
    if row != 0 and a[(j - 1) * rows + row - 1] < 0:
        state[1] += 1
        for i in range(rows):
            a[(j - 1) * rows + i] = -a[(j - 1) * rows + i]
        for i in range(columns):
            u[(j - 1) * columns + i] = -u[(j - 1) * columns + i]
        for k in range(1, j):
            lam[(j - 1) * columns + k - 1] = -lam[(j - 1) * columns + k - 1]
        for k in range(j + 1, columns + 1):
            lam[(k - 1) * columns + j - 1] = -lam[(k - 1) * columns + j - 1]
    return row


@native
def pari_hnflll_reduce(
    a: IntegerBuffer,
    u: IntegerBuffer,
    rows: int,
    columns: int,
    k: int,
    j: int,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    state: Int64Buffer,
) -> tuple[int, int]:
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
    if quotient != 0:
        state[6] += 1
        quotient = -quotient
        # ZC_lincomb1z visits rows in descending order.
        if row0 != 0:
            for i in range(rows - 1, -1, -1):
                if a[(j - 1) * rows + i] != 0:
                    a[(k - 1) * rows + i] += quotient * a[(j - 1) * rows + i]
        for i in range(columns - 1, -1, -1):
            if u[(j - 1) * columns + i] != 0:
                u[(k - 1) * columns + i] += quotient * u[(j - 1) * columns + i]
        lam[(k - 1) * columns + j - 1] += quotient * d[j]
        for i in range(j - 1):
            if lam[(j - 1) * columns + i] != 0:
                if quotient == 1:
                    lam[(k - 1) * columns + i] += lam[(j - 1) * columns + i]
                elif quotient == -1:
                    lam[(k - 1) * columns + i] -= lam[(j - 1) * columns + i]
                else:
                    lam[(k - 1) * columns + i] += quotient * lam[(j - 1) * columns + i]
    return row0, row1


@native
def pari_hnflll_swap(
    a: IntegerBuffer,
    u: IntegerBuffer,
    rows: int,
    columns: int,
    k: int,
    lam: IntegerBuffer,
    d: IntegerBuffer,
) -> int:
    """hnfswap, including simultaneous updates before overwriting old values."""
    pari_hnfspec_swap_exact(a, rows, k, k - 1)
    pari_hnfspec_swap_exact(u, columns, k, k - 1)
    for j in range(k - 2, 0, -1):
        temporary = lam[(k - 2) * columns + j - 1]
        lam[(k - 2) * columns + j - 1] = lam[(k - 1) * columns + j - 1]
        lam[(k - 1) * columns + j - 1] = temporary
    for i in range(k + 1, columns + 1):
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
    rows: int,
    columns: int,
    a: IntegerBuffer,
    u: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    state: Int64Buffer,
) -> int:
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
    for j in range(columns):
        for i in range(rows):
            a[j * rows + i] = original[j * rows + rows - i - 1]
    for i in range(columns * columns):
        u[i] = 0
        lam[i] = 0
    for i in range(columns):
        u[i * columns + i] = 1
    for i in range(columns + 1):
        d[i] = 1
    for i in range(11):
        state[i] = 0
    k = 2
    kmax = 2
    while k < columns + 1:
        state[0] += 1
        row0, row1 = pari_hnflll_reduce(a, u, rows, columns, k, k - 1, lam, d, state)
        swap = 0
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
            for i in range(k - 2, 0, -1):
                row0, row1 = pari_hnflll_reduce(
                    a, u, rows, columns, k, i, lam, d, state
                )
            k += 1
            if k > kmax:
                kmax = k
    if columns == 1:
        pari_hnflll_normalize(a, u, rows, columns, 1, lam, state)
    for j in range(columns):
        for i in range(rows // 2):
            temporary = a[j * rows + i]
            a[j * rows + i] = a[j * rows + rows - i - 1]
            a[j * rows + rows - i - 1] = temporary
    state[9] = k
    state[10] = kmax
    return 0
