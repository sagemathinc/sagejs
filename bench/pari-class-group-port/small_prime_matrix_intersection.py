"""PARI 2.17.4 word-prime FpM_intersect_i / Flm_intersect_i.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
alglin1.c dispatches every word prime, including 2 and 3, to Flm (not F2m
or F3m). Flv.c forms ker([X|Y]), truncates kernel columns to X coordinates,
then FpV.c Flm_mul_classical/Flmrow_Flc_mul_i_SMALL computes X times them.
Inputs are full-column-rank subspaces, rows<=4, nx/ny<=rows, prime<=3037000493.
Input signed integers are reduced privately; output is reduced, not original
signed columns. All spans must be disjoint. Output requires rows² entries.
The nullity equals intersection dimension under the full-rank precondition.
Fixed workspace copies replace GEN allocation, not the arithmetic schedule.
"""

from sagejs.native import IntegerBuffer, native
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_matrix_intersection_scratch_size(rows: int) -> int:
    if rows < 0 or rows > 5:
        raise ValueError("small intersection dimension frontier")
    return 7 * rows * rows + 3 * rows


@native
def pari_small_prime_matrix_intersection(
    w: IntegerBuffer,
    x: int,
    nx: int,
    y: int,
    ny: int,
    rows: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    capacity = pari_small_prime_matrix_intersection_scratch_size(rows)
    if nx < 0 or nx > rows or ny < 0 or ny > rows or p < 2 or p > 3037000493:
        raise ValueError("small intersection prime/column frontier")
    if (
        x < 0
        or y < 0
        or out < 0
        or scratch < 0
        or len(w) < x + rows * nx
        or len(w) < y + rows * ny
        or len(w) < out + rows * rows
        or len(w) < scratch + capacity
    ):
        raise ValueError("short intersection workspace")
    if nx == 0 or ny == 0:
        return 0
    columns = nx + ny
    saved = scratch
    a = saved + rows * rows
    used = a + rows * columns
    pivots = used + rows
    kernel = pivots + columns
    for i in range(rows * nx):
        value = w[x + i] % p
        w[saved + i] = value
        w[a + i] = value
    for i in range(rows * ny):
        w[a + rows * nx + i] = w[y + i] % p
    nullity = pari_small_flm_kernel(w, a, rows, columns, p, kernel, used, pivots)
    if nullity > rows:
        raise ValueError("intersection input violates full-column-rank precondition")
    # Source truncation changes vector length, not entries; retain column stride.
    for j in range(nullity):
        for i in range(rows):
            value = w[saved + i] * w[kernel + j * columns]
            for k in range(1, nx):
                value += w[saved + k * rows + i] * w[kernel + j * columns + k]
                if value & 9223372036854775808:
                    value %= p
            w[out + j * rows + i] = value % p
    return nullity


@native
def pari_small_flm_kernel(
    w: IntegerBuffer,
    a: int,
    rows: int,
    columns: int,
    p: int,
    kernel: int,
    used: int,
    pivots: int,
) -> int:
    """Literal Flm kernel, including p=2/3; destroy reduced column-major a.

    Disjoint spans: a rows*columns, kernel columns², used rows, pivots columns.
    Kernel active columns have stride columns; return nullity. Pivots one-based
    row or zero. Dense Gaussian corridor rows<=4, columns<=8, small prime.
    """
    if rows < 0 or rows > 5 or columns < 0 or columns > 10 or p < 2 or p > 3037000493:
        raise ValueError("small Flm kernel domain")
    if (
        a < 0
        or kernel < 0
        or used < 0
        or pivots < 0
        or len(w) < a + rows * columns
        or len(w) < kernel + columns * columns
        or len(w) < used + rows
        or len(w) < pivots + columns
    ):
        raise ValueError("small Flm kernel workspace")
    for i in range(rows * columns):
        if w[a + i] < 0 or w[a + i] >= p:
            raise ValueError("small Flm kernel reduced input required")
    for j in range(rows):
        w[used + j] = 0
    nullity = 0
    # Literal Flm_ker_gauss_OK(deplin=0), including for p=2/3.
    for k in range(columns):
        j = 0
        value = 0
        while j < rows:
            if w[used + j] == 0:
                value = w[a + k * rows + j] % p
                if value != 0:
                    break
            j += 1
        if j == rows:
            nullity += 1
            w[pivots + k] = 0
        else:
            pivot = p - pari_word_mod_inverse(value, p)
            w[used + j] = k + 1
            w[pivots + k] = j + 1
            w[a + k * rows + j] = p - 1
            if pivot != 1:
                for i in range(k + 1, columns):
                    w[a + i * rows + j] = pivot * w[a + i * rows + j] % p
            for t in range(rows):
                if t == j:
                    continue
                pivot = w[a + k * rows + t] % p
                w[a + k * rows + t] = pivot
                if pivot == 0:
                    continue
                for i in range(k + 1, columns):
                    if pivot == 1:
                        value = w[a + i * rows + t] + w[a + i * rows + j]
                    else:
                        value = w[a + i * rows + t] + pivot * w[a + i * rows + j]
                    if value & 18446744069414584320:
                        value %= p
                    w[a + i * rows + t] = value
    at = 0
    for k in range(columns):
        if w[pivots + k] == 0:
            for i in range(columns):
                w[kernel + at * columns + i] = 0
            for i in range(k):
                if w[pivots + i] != 0:
                    w[kernel + at * columns + i] = (
                        w[a + k * rows + w[pivots + i] - 1] % p
                    )
            w[kernel + at * columns + k] = 1
            at += 1
    return nullity
