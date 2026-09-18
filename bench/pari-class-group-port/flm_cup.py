"""PARI 2.17.4 `Flm_CUP_pre` and its pivot map, in borrowed row-major storage.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translated from `src/basemath/Flv.c`, including its recursive row split,
column permutations, and packed C/U outputs. Exact residue arithmetic replaces
word primitives; this is not a claim of equal arithmetic-leaf performance.
An exact bounded cubic bridge covers modest products where PARI dispatches to
Strassen-Winograd; larger products remain an explicit frontier.
"""

from sagejs.native import Int64Buffer, IntegerBuffer, native

from .flm_upper_solve import pari_flm_lsolve_upper
from .relation_cache import pari_word_mod_inverse


@native
def _pari_flm_cup_frame(
    arena: IntegerBuffer,
    base: int,
    capacity: int,
    stride: int,
    rows: int,
    columns: int,
    prime: int,
    frames: IntegerBuffer,
    solve_state: Int64Buffer,
) -> int:
    """Each recursive frame has eight capacity-sized disjoint arena regions."""
    c = base + capacity
    u = base + 2 * capacity
    t = base + 3 * capacity
    first_u = base + 4 * capacity
    scratch = base + 5 * capacity
    r = base + 6 * capacity
    p = base + 7 * capacity
    child = base + 8 * capacity
    if rows < 8 or columns < 8:
        for j in range(columns):
            arena[p + j] = j + 1
        pivot_row = -1
        rank = 0
        for j in range(columns):
            pivot_row += 1
            pivot_column = -1
            while pivot_row < rows:
                for k in range(j, columns):
                    value = arena[base + pivot_row * stride + k]
                    if pivot_column == -1 and value != 0:
                        pivot_column = k
                if pivot_column != -1:
                    break
                pivot_row += 1
            if pivot_column == -1:
                break
            arena[r + j] = pivot_row + 1
            if pivot_column != j:
                for i in range(rows):
                    value = arena[base + i * stride + j]
                    arena[base + i * stride + j] = arena[
                        base + i * stride + pivot_column
                    ]
                    arena[base + i * stride + pivot_column] = value
                value = arena[p + j]
                arena[p + j] = arena[p + pivot_column]
                arena[p + pivot_column] = value
            inverse = pari_word_mod_inverse(arena[base + pivot_row * stride + j], prime)
            for i in range(pivot_row + 1, rows):
                value = arena[base + i * stride + j] * inverse % prime
                arena[base + i * stride + j] = value
                value = -value % prime
                for k in range(j + 1, columns):
                    arena[base + i * stride + k] = (
                        arena[base + i * stride + k]
                        + arena[base + pivot_row * stride + k] * value
                    ) % prime
            rank += 1
        for i in range(rows):
            for j in range(rank):
                arena[c + i * stride + j] = arena[base + i * stride + j]
        for i in range(rank):
            for j in range(columns):
                arena[u + i * stride + j] = arena[
                    base + (arena[r + i] - 1) * stride + j
                ]
        return rank
    split = rows
    if columns < split:
        split = columns
    split = (split + 1) // 2
    for i in range(split):
        for j in range(columns):
            arena[child + i * stride + j] = arena[base + i * stride + j]
    rank1 = _pari_flm_cup_frame(
        arena, child, capacity, stride, split, columns, prime, frames, solve_state
    )
    if rank1 < 0:
        return rank1
    for i in range(split):
        for j in range(rank1):
            arena[c + i * stride + j] = arena[child + capacity + i * stride + j]
    for i in range(rank1):
        arena[r + i] = arena[child + 6 * capacity + i]
        for j in range(columns):
            arena[first_u + i * stride + j] = arena[
                child + 2 * capacity + i * stride + j
            ]
    for j in range(columns):
        arena[p + j] = arena[child + 7 * capacity + j]
    bottom = rows - split
    remaining = columns - rank1
    if rank1 == 0:
        for i in range(bottom):
            for j in range(columns):
                arena[child + i * stride + j] = arena[base + (split + i) * stride + j]
    else:
        for i in range(bottom):
            for j in range(rank1):
                arena[t + i * stride + j] = arena[
                    base + (split + i) * stride + arena[p + j] - 1
                ]
        status = pari_flm_lsolve_upper(
            arena,
            first_u,
            stride,
            arena,
            t,
            stride,
            rank1,
            bottom,
            prime,
            arena,
            t,
            stride,
            arena,
            scratch,
            frames,
            0,
            solve_state,
        )
        if status != 0:
            return -1
        # PARI dispatches large blocks to Strassen-Winograd here.  The source
        # transparent port retains the exact cubic update only for bounded
        # work, including row 14's first 61*54*54 update and row 13's
        # 72*72*71 prepared-HNF update.  This is an
        # algorithmic multiplication bridge, not a Strassen translation.
        if bottom * rank1 * remaining > 500000:
            return -1
        for i in range(bottom):
            for j in range(remaining):
                product = 0
                for k in range(rank1):
                    product += (
                        arena[t + i * stride + k]
                        * arena[first_u + k * stride + rank1 + j]
                    )
                arena[child + i * stride + j] = (
                    arena[base + (split + i) * stride + arena[p + rank1 + j] - 1]
                    - product
                ) % prime
    rank2 = _pari_flm_cup_frame(
        arena, child, capacity, stride, bottom, remaining, prime, frames, solve_state
    )
    if rank2 < 0:
        return rank2
    for i in range(rank2):
        arena[r + rank1 + i] = arena[child + 6 * capacity + i] + split
    for i in range(rows):
        for j in range(rank2):
            value = 0
            if i >= split:
                value = arena[child + capacity + (i - split) * stride + j]
            arena[c + i * stride + rank1 + j] = value
    for i in range(bottom):
        for j in range(rank1):
            arena[c + (split + i) * stride + j] = arena[t + i * stride + j]
    for i in range(rank1 + rank2):
        for j in range(columns):
            value = 0
            if i < rank1:
                if j < rank1:
                    value = arena[first_u + i * stride + j]
                else:
                    value = arena[
                        first_u
                        + i * stride
                        + rank1
                        + arena[child + 7 * capacity + j - rank1]
                        - 1
                    ]
            elif j >= rank1:
                value = arena[child + 2 * capacity + (i - rank1) * stride + j - rank1]
            arena[u + i * stride + j] = value
    for j in range(columns):
        arena[base + j] = arena[p + j]
    for j in range(rank1, columns):
        arena[p + j] = arena[base + rank1 + arena[child + 7 * capacity + j - rank1] - 1]
    return rank1 + rank2


@native
def pari_flm_cup(
    matrix: IntegerBuffer,
    rows: int,
    columns: int,
    prime: int,
    arena: IntegerBuffer,
    frames: IntegerBuffer,
    solve_state: Int64Buffer,
    pivots: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Return 0 or -1 (over-cap multiplication dispatch), preserving input.

    Owners must be disjoint. Let `s=max(1,rows*columns,rows,columns)` and
    `d=rows//4+1`. Arena needs `8*s*d` entries;
    triangular frames need `3*(columns.bit_length()+1)`. State owners need
    eight entries each. Active outputs: C at s, U at 2s, both stride columns;
    one-based R at 6s, P at 7s. State starts `[status,rank,nullity]`.
    Output pivots use `d[P[i]]=R[i]`, exactly as `Flm_pivots_CUP`.
    The wrapper copies its input, including for the destructive basecase.
    Every recursive edge removes at least four rows. This conservative depth
    bound also covers tall matrices whose successive top blocks have rank zero.
    """
    if rows < 0 or columns < 0 or prime < 2 or prime >= 9223372036854775808:
        raise ValueError("unsupported CUP shape or prime")
    capacity = rows * columns
    if capacity < 1:
        capacity = 1
    if rows > capacity:
        capacity = rows
    if columns > capacity:
        capacity = columns
    depth = rows // 4 + 1
    if (
        len(matrix) < rows * columns
        or len(arena) < 8 * capacity * depth
        or len(frames) < 3 * (columns.bit_length() + 1)
        or len(solve_state) < 8
        or len(state) < 8
        or len(pivots) < columns
    ):
        raise ValueError("short CUP workspace")
    for i in range(rows * columns):
        if matrix[i] < 0 or matrix[i] >= prime:
            raise ValueError("CUP requires reduced residues")
    for i in range(rows * columns):
        arena[i] = matrix[i]
    rank = _pari_flm_cup_frame(
        arena, 0, capacity, columns, rows, columns, prime, frames, solve_state
    )
    state[0] = -1
    if rank < 0:
        return -1
    for j in range(columns):
        pivots[j] = 0
    for i in range(rank):
        pivots[arena[7 * capacity + i] - 1] = arena[6 * capacity + i]
    state[0] = 0
    state[1] = rank
    state[2] = columns - rank
    return 0
