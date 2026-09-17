"""PARI 2.17.4 initial modular rank path for square LLL inputs through degree 5.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
alglin1.c ZM_pivots and Flv.c Flm_gauss_pivot, with the first two primes
of the pinned 64-bit init_modular_small sieve. Dubious-rank verification
remains an explicit dependency, not a guessed rank.
"""

from sagejs.native import IntegerBuffer, native

from .relation_cache import pari_word_mod_inverse


@native
def pari_flm_rectangular_pivots(
    matrix: IntegerBuffer,
    rows: int,
    columns: int,
    prime: int,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
) -> int:
    """Flm_gauss_pivot in row-major storage; return nullity and destroy x.

    The small residue products use exact integers before reduction instead
    of PARI's word primitives. This backend cost is not presumed identical.
    """
    if rows < 0 or columns < 0 or (rows >= 8 and columns >= 8):
        raise ValueError("unsupported modular pivot shape")
    if len(matrix) < rows * columns or len(occupied) < rows or len(pivots) < columns:
        raise ValueError("short modular pivot workspace")
    for i in range(rows):
        occupied[i] = 0
    for i in range(columns):
        pivots[i] = 0
    nullity = 0
    for k in range(columns):
        j = 0
        while j < rows:
            if occupied[j] == 0:
                matrix[j * columns + k] %= prime
                if matrix[j * columns + k] != 0:
                    break
            j += 1
        if j == rows:
            nullity += 1
        else:
            pivot = prime - pari_word_mod_inverse(matrix[j * columns + k], prime)
            occupied[j] = k + 1
            pivots[k] = j + 1
            for i in range(k + 1, columns):
                matrix[j * columns + i] = (pivot * matrix[j * columns + i]) % prime
            for t in range(rows):
                if occupied[t] == 0:
                    pivot = matrix[t * columns + k]
                    if pivot != 0:
                        matrix[t * columns + k] = 0
                        for i in range(k + 1, columns):
                            matrix[t * columns + i] = (
                                matrix[t * columns + i]
                                + pivot * matrix[j * columns + i] % prime
                            ) % prime
            for i in range(k, columns):
                matrix[j * columns + i] = 0
    return nullity


@native
def pari_flm_pivots(
    matrix: IntegerBuffer,
    n: int,
    prime: int,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
) -> int:
    """Preserve the small-square LLL entry while sharing literal elimination."""
    if n < 1 or n > 5:
        raise ValueError("unsupported modular pivot shape")
    return pari_flm_rectangular_pivots(matrix, n, n, prime, occupied, pivots)


@native
def pari_initial_integer_rank(
    original: IntegerBuffer,
    n: int,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """ZM_pivots through its initial two-prime phase for n <= 5.

    Return exact rank on upstream maximal-rank/all-zero exits, otherwise -1
    for the unported rational verification phase. diagnostic records trials,
    last prime and best nullity. Inputs/outputs must be disjoint.
    """
    if (
        n < 1
        or n > 5
        or len(original) < n * n
        or len(matrix) < n * n
        or len(occupied) < n
        or len(pivots) < n
        or len(diagnostic) < 3
    ):
        raise ValueError("unsupported initial integer rank shape")
    zeros = 0
    for j in range(n):
        is_zero = 1
        for i in range(n):
            if original[i * n + j] != 0:
                is_zero = 0
        zeros += is_zero
    diagnostic[0] = 0
    diagnostic[1] = 0
    diagnostic[2] = n
    if zeros == n:
        for i in range(n):
            pivots[i] = 0
        return 0
    best = n
    for trial in range(2):
        prime = 2147483659
        if trial == 1:
            prime = 2147483693
        for i in range(n * n):
            matrix[i] = original[i] % prime
        nullity = pari_flm_pivots(matrix, n, prime, occupied, pivots)
        if nullity < best:
            best = nullity
        diagnostic[0] = trial + 1
        diagnostic[1] = prime
        diagnostic[2] = best
        if nullity == zeros:
            return n - nullity
    return -1
