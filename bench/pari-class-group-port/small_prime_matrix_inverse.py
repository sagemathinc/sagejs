# sagejs: native-bitwise
"""PARI 2.17.4 small `FpM_inv` dispatch, for square matrices of order <=4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
`alglin1.c:FpM_gauss_i` dispatches p=2 to `F2m_gauss_sp`; all other
supported primes (including 3) use `Flv.c:Flm_gauss_sp_OK`. Packed binary
columns preserve source XOR operations. The odd-prime branch preserves lazy
HIGHMASK/HIGHBIT reductions and `Fl_get_col_OK` back substitution. Larger
primes and the CUP matrix-size corridor are not implemented here.
"""

from sagejs.native import IntegerBuffer, native

from .f2x_small import _f2x_xor
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_matrix_inverse_workspace_size(n: int) -> int:
    """Mutable A/B spans of n² entries and a binary pivot span of n entries."""
    if n < 0 or n > 4:
        raise ValueError("unsupported small prime inverse dimension")
    return 2 * n * n + n


@native
def pari_small_prime_matrix_inverse(
    w: IntegerBuffer, a: int, n: int, p: int, out: int, scratch: int
) -> int:
    """Invert a column-major matrix; return 0, or -1 for singular input.

    Primehood is a caller precondition. Input, output, and scratch spans must
    be disjoint. Input coefficients are reduced as by `FpM_init`. Singular
    input leaves output untouched but may mutate scratch. All bounds are
    validated before writes. n=0 follows the upstream empty-matrix result.
    """
    size = pari_small_prime_matrix_inverse_workspace_size(n)
    if p < 2 or p > 3037000493:
        raise ValueError("unsupported small prime inverse modulus")
    if a < 0 or out < 0 or scratch < 0:
        raise ValueError("negative small prime inverse offset")
    if a + n * n > len(w) or out + n * n > len(w) or scratch + size > len(w):
        raise ValueError("insufficient small prime inverse storage")
    if n == 0:
        return 0
    aa = scratch
    bb = aa + n * n
    pivots = bb + n * n
    if p == 2:
        for j in range(n):
            column = 0
            for i in range(n):
                column += int(w[a + j * n + i] % 2) << int(i)
            w[aa + j] = column
            w[bb + j] = 1 << int(j)
            w[pivots + j] = 0
        for i in range(n):
            ai = w[aa + i]
            k = i
            if w[pivots + i] != 0 or (ai >> i) % 2 == 0:
                k = 0
                while k < n:
                    if w[pivots + k] == 0 and (ai >> k) % 2 != 0:
                        break
                    k += 1
            if k == n:
                return -1
            w[pivots + k] = i + 1
            ai -= 1 << int(k)
            for j in range(n):
                if (w[aa + j] >> k) % 2 != 0:
                    w[aa + j] = _f2x_xor(w[aa + j], ai)
            for j in range(n):
                if (w[bb + j] >> k) % 2 != 0:
                    w[bb + j] = _f2x_xor(w[bb + j], ai)
        for j in range(n):
            for i in range(n):
                w[out + j * n + w[pivots + i] - 1] = (w[bb + j] >> i) % 2
        return 0
    for j in range(n):
        for i in range(n):
            w[aa + j * n + i] = w[a + j * n + i] % p
            w[bb + j * n + i] = 0
        w[bb + j * n + j] = 1
    for i in range(n):
        for k in range(i):
            w[aa + i * n + k] %= p
        k = i
        while k < n:
            w[aa + i * n + k] %= p
            pivot = w[aa + i * n + k]
            if pivot != 0:
                w[aa + i * n + k] = pari_word_mod_inverse(pivot, p)
                break
            k += 1
        if k == n:
            return -1
        if k != i:
            for j in range(i, n):
                temporary = w[aa + j * n + i]
                w[aa + j * n + i] = w[aa + j * n + k]
                w[aa + j * n + k] = temporary
            for j in range(n):
                temporary = w[bb + j * n + i]
                w[bb + j * n + i] = w[bb + j * n + k]
                w[bb + j * n + k] = temporary
        if i == n - 1:
            break
        inverse = p - w[aa + i * n + i]
        for k in range(i + 1, n):
            w[aa + i * n + k] %= p
            multiplier = w[aa + i * n + k]
            if multiplier == 0:
                continue
            multiplier = multiplier * inverse % p
            if multiplier == 1:
                for j in range(i + 1, n):
                    w[aa + j * n + k] += w[aa + j * n + i]
                    if w[aa + j * n + k] >= 4294967296:
                        w[aa + j * n + k] %= p
                for j in range(n):
                    w[bb + j * n + k] += w[bb + j * n + i]
                    if w[bb + j * n + k] >= 4294967296:
                        w[bb + j * n + k] %= p
            else:
                for j in range(i + 1, n):
                    w[aa + j * n + k] += multiplier * w[aa + j * n + i]
                    if w[aa + j * n + k] >= 4294967296:
                        w[aa + j * n + k] %= p
                for j in range(n):
                    w[bb + j * n + k] += multiplier * w[bb + j * n + i]
                    if w[bb + j * n + k] >= 4294967296:
                        w[bb + j * n + k] %= p
    for j in range(n):
        m = w[bb + j * n + n - 1] % p
        w[out + j * n + n - 1] = m * w[aa + (n - 1) * n + n - 1] % p
        for i in range(n - 2, -1, -1):
            m = p - w[bb + j * n + i] % p
            for k in range(i + 1, n):
                if m >= 9223372036854775808:
                    m %= p
                m += w[aa + k * n + i] * w[out + j * n + k]
            m %= p
            if m != 0:
                m = (p - m) * w[aa + i * n + i] % p
            w[out + j * n + i] = m
    return 0
