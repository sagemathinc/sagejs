"""PARI 2.17.4 ZM_hnfall_i(A,NULL,1), wide ZM_hnf dispatch.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is the source c/h delayed-elimination algorithm, NOT HNFLLL or hnf_i.
The hnf_bezout multiword Euclidean arithmetic-leaf substitution remains
explicit. Packed column copies replace pointer/stack ownership; integer
indices remain Python int. No performance equivalence is claimed.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .hnf_bezout import pari_hnf_bezout
from .regulator_hnf import pari_regulator_hnf_lincomb


@native
def pari_regulator_wide_elem(
    work: IntegerBuffer,
    scratch: IntegerBuffer,
    rows: int,
    a: int,
    b: int,
    j: int,
    k: int,
    state: Int64Buffer,
) -> int:
    """ZC_elem, nonzero a, one-based j/k; no transformation owner."""
    state[6] += 1
    if b == 0:
        for i in range(rows):
            at, bt = (j - 1) * rows + i, (k - 1) * rows + i
            saved = work[at]
            work[at] = work[bt]
            work[bt] = saved
        state[7] += 1
        return 0
    d, u, v = pari_hnf_bezout(a, b)
    if u == 0:
        q = -(a // b)
        for i in range(rows - 1, -1, -1):
            work[(j - 1) * rows + i] += work[(k - 1) * rows + i] * q
        state[8] += 1
        return 0
    if v == 0:
        q = -(b // a)
        for i in range(rows - 1, -1, -1):
            work[(k - 1) * rows + i] += work[(j - 1) * rows + i] * q
        for i in range(rows):
            at, bt = (j - 1) * rows + i, (k - 1) * rows + i
            saved = work[at]
            work[at] = work[bt]
            work[bt] = saved
        state[9] += 1
        return 0
    if d != 1 and d != -1:
        a, b = a // d, b // d
    a = -a
    for i in range(rows):
        scratch[i] = work[(k - 1) * rows + i]
    for i in range(rows):
        work[(k - 1) * rows + i] = pari_regulator_hnf_lincomb(
            u, v, work[(j - 1) * rows + i], scratch[i]
        )
    for i in range(rows):
        work[(j - 1) * rows + i] = pari_regulator_hnf_lincomb(
            a, b, scratch[i], work[(j - 1) * rows + i]
        )
    state[10] += 1
    return 0


@native
def pari_regulator_wide_reduce(
    work: IntegerBuffer,
    rows: int,
    columns: int,
    row: int,
    pivot: int,
    state: Int64Buffer,
) -> int:
    """ZM_reduce; caller's c/h invariant supplies a nonzero pivot."""
    d = work[(pivot - 1) * rows + row - 1]
    if d < 0:
        for i in range(rows):
            work[(pivot - 1) * rows + i] = -work[(pivot - 1) * rows + i]
        d = -d
        state[11] += 1
    for j in range(pivot, columns):
        q = work[j * rows + row - 1] // d
        if q == 0:
            continue
        q = -q
        for i in range(rows - 1, -1, -1):
            work[j * rows + i] += work[(pivot - 1) * rows + i] * q
        state[12] += 1
    return 0


@native
def pari_regulator_hnf_wide(
    original: IntegerBuffer,
    rows: int,
    columns: int,
    work: IntegerBuffer,
    column_scratch: IntegerBuffer,
    row_pivots: Int64Buffer,
    heights: Int64Buffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Wide dispatch only (columns>7), return0 after complete publication.

    Column-major disjoint owners. Output's first rows*state[1] entries are H;
    unused capacity is untouched. Work retains leading dependent columns.
    row_pivots=c and heights=h remain literal source snapshots (one-based
    values; c may remain zero when source does not assign it).

    State15: status, live columns, removed columns, first-phase rows, column
    visits, catch-up rows, elem calls, empty-ak/u-zero/v-zero/general branches,
    column negations, nonzero quotient updates, final-phase rows, pivot swaps.
    Malformed shapes/capacities reject before mutation. Arithmetic failures
    may leave partial scratch; state[0] stays-1 until final publication.
    """
    if rows < 0 or columns <= 7:
        raise ValueError("wide HNF requires nonnegative rows and width above seven")
    size = rows * columns
    if (
        len(original) < size
        or len(work) < size
        or len(column_scratch) < rows
        or len(row_pivots) < rows
        or len(heights) < columns
        or len(output) < size
        or len(state) < 15
    ):
        raise ValueError("short wide HNF workspace")
    for i in range(15):
        state[i] = 0
    state[0] = -1
    for i in range(rows):
        row_pivots[i] = 0
    for j in range(columns):
        heights[j] = rows
    for i in range(size):
        work[i] = original[i]
    remaining = columns + 1
    for row in range(rows, 0, -1):
        state[3] += 1
        j = 1
        while j < remaining:
            state[4] += 1
            for i in range(heights[j - 1], row, -1):
                state[5] += 1
                a = work[(j - 1) * rows + i - 1]
                k = row_pivots[i - 1]
                if a != 0:
                    pari_regulator_wide_elem(
                        work,
                        column_scratch,
                        rows,
                        a,
                        work[(k - 1) * rows + i - 1],
                        j,
                        k,
                        state,
                    )
                pari_regulator_wide_reduce(work, rows, columns, i, k, state)
            if work[(j - 1) * rows + row - 1] != 0:
                break
            heights[j - 1] = row - 1
            j += 1
        if j == remaining:
            continue
        remaining -= 1
        if j < remaining:
            for i in range(rows):
                at, bt = (j - 1) * rows + i, (remaining - 1) * rows + i
                saved = work[at]
                work[at] = work[bt]
                work[bt] = saved
            heights[j - 1] = heights[remaining - 1]
            heights[remaining - 1] = row
            row_pivots[row - 1] = remaining
            state[14] += 1
        if work[(remaining - 1) * rows + row - 1] < 0:
            for i in range(rows):
                work[(remaining - 1) * rows + i] = -work[(remaining - 1) * rows + i]
            state[11] += 1
        pari_regulator_wide_reduce(work, rows, columns, row, remaining, state)
    remaining -= 1
    for j in range(1, remaining + 1):
        for i in range(heights[j - 1], 0, -1):
            state[13] += 1
            a = work[(j - 1) * rows + i - 1]
            k = row_pivots[i - 1]
            if a != 0:
                pari_regulator_wide_elem(
                    work,
                    column_scratch,
                    rows,
                    a,
                    work[(k - 1) * rows + i - 1],
                    j,
                    k,
                    state,
                )
            pari_regulator_wide_reduce(work, rows, columns, i, k, state)
    live = columns - remaining
    for i in range(rows * live):
        output[i] = work[rows * remaining + i]
    state[1] = live
    state[2] = remaining
    state[0] = 0
    return 0
