"""PARI 2.17.4 initial modular rank path for small square LLL inputs.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
alglin1.c ZM_pivots and Flv.c Flm_gauss_pivot, with the first two primes
of the pinned 64-bit init_modular_small sieve. Dubious-rank verification
remains an explicit dependency, not a guessed rank.
"""

from sagejs.native import IntegerBuffer, native

from .relation_cache import pari_word_mod_inverse


@native
def pari_flm_pivots(
    matrix: IntegerBuffer,
    n: int,
    prime: int,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
) -> int:
    """Flm_gauss_pivot in row-major storage; return nullity and destroy x.

    The small residue products use exact integers before reduction instead
    of PARI's word primitives. This backend cost is not presumed identical.
    """
    if n < 1 or n > 4 or len(matrix) < n * n or len(occupied) < n or len(pivots) < n:
        raise ValueError("unsupported modular pivot shape")
    for i in range(n):
        occupied[i] = 0
        pivots[i] = 0
    nullity = 0
    for k in range(n):
        j = 0
        while j < n:
            if occupied[j] == 0:
                matrix[j * n + k] %= prime
                if matrix[j * n + k] != 0:
                    break
            j += 1
        if j == n:
            nullity += 1
        else:
            pivot = prime - pari_word_mod_inverse(matrix[j * n + k], prime)
            occupied[j] = k + 1
            pivots[k] = j + 1
            for i in range(k + 1, n):
                matrix[j * n + i] = (pivot * matrix[j * n + i]) % prime
            for t in range(n):
                if occupied[t] == 0:
                    pivot = matrix[t * n + k]
                    if pivot != 0:
                        matrix[t * n + k] = 0
                        for i in range(k + 1, n):
                            matrix[t * n + i] = (
                                matrix[t * n + i] + pivot * matrix[j * n + i] % prime
                            ) % prime
            for i in range(k, n):
                matrix[j * n + i] = 0
    return nullity


@native
def pari_initial_integer_rank(
    original: IntegerBuffer,
    n: int,
    matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """ZM_pivots through its initial two-prime phase for n <= 4.

    Return exact rank on upstream maximal-rank/all-zero exits, otherwise -1
    for the unported rational verification phase. diagnostic records trials,
    last prime and best nullity. Inputs/outputs must be disjoint.
    """
    if (
        n < 1
        or n > 4
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
