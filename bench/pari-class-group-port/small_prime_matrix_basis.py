"""PARI 2.17.4 FpM_image/FpM_suppl, small-prime Gaussian corridor.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Sources: alglin1.c FpM_gauss_pivot/image_from_pivot/get_suppl,
F2v.c F2m_gauss_pivot, Flv.c Flm_gauss_pivot. Unlike FpM_ker,
the p=3 branch uses Flm, not F3m. No CUP branch occurs for rows<=4.
Column-major input is copied into scratch before elimination. Scratch size
is rows*columns+rows+columns, holding matrix, used rows, one-based pivots.
Input/output/scratch spans must be disjoint. Arbitrary signed integer input
is reduced only in the private pivot matrix, as in FpM_init. Image/supplement
columns retain the exact original integer entries. Primality is not checked.
Binary operations use dense
residues, preserving source column operation order but not packed-word cost.
"""

from sagejs.native import IntegerBuffer, native
from .f2x_small import _f2x_xor
from .relation_cache import pari_word_mod_inverse


@native
def _small_prime_matrix_pivots(
    w: IntegerBuffer, a: int, rows: int, columns: int, p: int, out: int, scratch: int
) -> int:
    if rows < 0 or rows > 5 or columns < 0 or columns > 10 or p < 2 or p > 3037000493:
        raise ValueError("outside small matrix basis corridor")
    size = rows * columns
    capacity = rows * rows
    if (
        a < 0
        or out < 0
        or scratch < 0
        or len(w) < a + size
        or len(w) < out + capacity
        or len(w) < scratch + size + rows + columns
    ):
        raise ValueError("invalid matrix basis workspace")
    x = scratch
    used = x + size
    pivots = used + rows
    for i in range(size):
        w[x + i] = w[a + i] % p
    for j in range(rows):
        w[used + j] = 0
    nullity = 0
    for k in range(columns):
        j = 0
        while j < rows:
            if w[used + j] == 0:
                if p != 2:
                    w[x + k * rows + j] %= p
                if w[x + k * rows + j] != 0:
                    break
            j += 1
        if j == rows:
            nullity += 1
            w[pivots + k] = 0
        else:
            w[used + j] = k + 1
            w[pivots + k] = j + 1
            if p == 2:
                for i in range(k + 1, columns):
                    if w[x + i * rows + j] != 0:
                        for t in range(rows):
                            w[x + i * rows + t] = _f2x_xor(
                                w[x + i * rows + t], w[x + k * rows + t]
                            )
            else:
                pivot = p - pari_word_mod_inverse(w[x + k * rows + j], p)
                for i in range(k + 1, columns):
                    w[x + i * rows + j] = pivot * w[x + i * rows + j] % p
                for t in range(rows):
                    if w[used + t] == 0:
                        pivot = w[x + k * rows + t]
                        if pivot != 0:
                            w[x + k * rows + t] = 0
                            for i in range(k + 1, columns):
                                value = (
                                    w[x + i * rows + t]
                                    + pivot * w[x + i * rows + j] % p
                                )
                                if value >= p:
                                    value -= p
                                w[x + i * rows + t] = value
                for i in range(k, columns):
                    w[x + i * rows + j] = 0
    return nullity


@native
def pari_small_prime_matrix_image(
    w: IntegerBuffer, a: int, rows: int, columns: int, p: int, out: int, scratch: int
) -> int:
    """Copy original pivot columns in input order; return image dimension."""
    nullity = _small_prime_matrix_pivots(w, a, rows, columns, p, out, scratch)
    pivots = scratch + rows * columns + rows
    at = 0
    for k in range(columns):
        if w[pivots + k] != 0:
            for i in range(rows):
                w[out + at * rows + i] = w[a + k * rows + i]
            at += 1
    return columns - nullity


@native
def pari_small_prime_matrix_supplement(
    w: IntegerBuffer, a: int, rows: int, columns: int, p: int, out: int, scratch: int
) -> int:
    """Copy pivot columns, append unused-row standard vectors; return zero."""
    if columns == 0:
        raise ValueError("PARI supplement does not support empty-column input")
    nullity = _small_prime_matrix_pivots(w, a, rows, columns, p, out, scratch)
    if columns == rows and nullity == 0:
        for i in range(rows * columns):
            w[out + i] = w[a + i]
        return 0
    used = scratch + rows * columns
    pivots = used + rows
    for i in range(rows):
        w[used + i] = 0
    at = 0
    for k in range(columns):
        if w[pivots + k] != 0:
            w[used + w[pivots + k] - 1] = 1
            for i in range(rows):
                w[out + at * rows + i] = w[a + k * rows + i]
            at += 1
    for j in range(rows):
        if w[used + j] == 0:
            for i in range(rows):
                w[out + at * rows + i] = 0
            w[out + at * rows + j] = 1
            at += 1
    return 0
