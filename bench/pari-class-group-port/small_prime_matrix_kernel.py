"""PARI 2.17.4 FpM_ker small-prime dispatch, kernel basis (deplin=0).

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Sources: alglin1.c FpM_ker_i, F2v.c/F3v.c F2m/F3m_ker_sp,
Flv.c Flm_ker_gauss_OK. Input and output are column-major. Input has
rows*columns entries; output columns have length columns. Only the returned
number of output columns is written. Scratch owns rows*columns+rows+columns
entries (private matrix, row-used markers, one-based row pivots).
All three spans must be disjoint; canonical residues and primality are caller
preconditions. Dimensions <=7 and prime <=3037000493 bound the Gaussian
corridor; no CUP or arbitrary-precision-prime branch is substituted.
Binary/ternary column operations use dense residues instead of source packed
word planes: exact pivot/basis order is preserved, not identical access costs.
"""

from sagejs.native import IntegerBuffer, native
from .f2x_small import _f2x_xor
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_matrix_kernel(
    w: IntegerBuffer,
    a: int,
    rows: int,
    columns: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    if rows < 0 or rows > 7 or columns < 0 or columns > 7 or p < 2 or p > 3037000493:
        raise ValueError("outside small-prime Gaussian kernel corridor")
    size = rows * columns
    if (
        a < 0
        or out < 0
        or scratch < 0
        or len(w) < a + size
        or len(w) < out + columns * columns
        or len(w) < scratch + size + rows + columns
    ):
        raise ValueError("invalid kernel workspace")
    for i in range(size):
        if w[a + i] < 0 or w[a + i] >= p:
            raise ValueError("kernel input must be reduced")
    if columns == 0:
        return 0
    x = scratch
    used = x + size
    pivots = used + rows
    for i in range(size):
        w[x + i] = w[a + i]
    for j in range(rows):
        w[used + j] = 0
    count = 0
    for k in range(columns):
        j = 0
        value = 0
        while j < rows:
            if w[used + j] == 0:
                value = w[x + k * rows + j] % p
                if value != 0:
                    break
            j += 1
        if j == rows:
            count += 1
            w[pivots + k] = 0
        else:
            w[used + j] = k + 1
            w[pivots + k] = j + 1
            if p == 2:
                w[x + k * rows + j] = 0
                for i in range(k + 1, columns):
                    if w[x + i * rows + j] != 0:
                        for t in range(rows):
                            w[x + i * rows + t] = _f2x_xor(
                                w[x + i * rows + t], w[x + k * rows + t]
                            )
                w[x + k * rows + j] = 1
            elif p == 3:
                w[x + k * rows + j] = 0
                for i in range(k + 1, columns):
                    u = w[x + i * rows + j]
                    if u != 0:
                        for t in range(rows):
                            if u == value:
                                w[x + i * rows + t] = (
                                    w[x + i * rows + t] - w[x + k * rows + t]
                                ) % 3
                            else:
                                w[x + i * rows + t] = (
                                    w[x + i * rows + t] + w[x + k * rows + t]
                                ) % 3
                w[x + k * rows + j] = 2
                if value == 1:
                    for i in range(k + 1, columns):
                        w[x + i * rows + j] = (-w[x + i * rows + j]) % 3
            else:
                pivot = p - pari_word_mod_inverse(value, p)
                w[x + k * rows + j] = p - 1
                if pivot != 1:
                    for i in range(k + 1, columns):
                        w[x + i * rows + j] = pivot * w[x + i * rows + j] % p
                for t in range(rows):
                    if t == j:
                        continue
                    pivot = w[x + k * rows + t] % p
                    w[x + k * rows + t] = pivot
                    if pivot == 0:
                        continue
                    for i in range(k + 1, columns):
                        if pivot == 1:
                            z = w[x + i * rows + t] + w[x + i * rows + j]
                        else:
                            z = w[x + i * rows + t] + pivot * w[x + i * rows + j]
                        if z & 18446744069414584320:
                            z %= p
                        w[x + i * rows + t] = z
    at = 0
    for k in range(columns):
        if w[pivots + k] == 0:
            for i in range(columns):
                w[out + at * columns + i] = 0
            for i in range(k):
                if w[pivots + i] != 0:
                    w[out + at * columns + i] = w[x + k * rows + w[pivots + i] - 1] % p
            w[out + at * columns + k] = 1
            at += 1
    return count
