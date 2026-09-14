"""PARI 2.17.4 prime-modulus HNF dependency of `pr_hnf`.

Copyright (C) 2000 The PARI group. GPL-2.0-or-later, without warranty.
Translate `hnf_snf.c: FpM_echelon, FpM_hnfend, ZM_hnfmodprime` for square
matrices of degree three or four and word primes. Row-major workspaces replace
GEN column pointers; recording the destination row by column avoids sorting
and then reversing the same pivot list. `base3.c:zk_multable/zk_ei_mul` builds
the generator multiplication matrix from the prepared field's basis table;
`base4.c:pr_hnf` selects the inert or prime-modulus path.
"""

from sagejs.native import IntegerBuffer, native
from .relation_cache import pari_word_mod_inverse


@native
def pari_prime_modulus_hnf(
    original: IntegerBuffer,
    n: int,
    prime: int,
    work: IntegerBuffer,
    pivots: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Return modular rank and the HNF of original columns together with pI.

    The caller supplies a prime below 2**64, as in the word-prime factor base.
    All buffers are disjoint. Preserve upstream backward pivot selection,
    normalization and the final integer column reductions, including signed
    remainders for intermediates longer than one PARI word.
    """
    if n < 3 or n > 4 or prime < 2 or prime >= 18446744073709551616:
        raise ValueError("unsupported prime-modulus HNF domain")
    if len(original) < n * n or len(work) < n * n or len(output) < n * n:
        raise ValueError("insufficient prime-modulus matrix storage")
    if len(pivots) < n:
        raise ValueError("insufficient prime-modulus pivot storage")
    for i in range(n * n):
        work[i] = original[i] % prime
        output[i] = 0
    for i in range(n):
        pivots[i] = -1
        output[i * n + i] = prime
    remaining = n
    for row in range(n - 1, -1, -1):
        column = remaining - 1
        while column >= 0 and work[row * n + column] == 0:
            column -= 1
        if column < 0:
            continue
        destination = remaining - 1
        pivot = work[row * n + column]
        if column != destination:
            for i in range(n):
                temporary = work[i * n + destination]
                work[i * n + destination] = work[i * n + column]
                work[i * n + column] = temporary
        if pivot != 1:
            inverse = pari_word_mod_inverse(pivot, prime)
            for i in range(row):
                work[i * n + destination] = work[i * n + destination] * inverse % prime
        work[row * n + destination] = 1
        for j in range(destination - 1, -1, -1):
            multiplier = work[row * n + j]
            if multiplier != 0:
                for i in range(n):
                    work[i * n + j] -= multiplier * work[i * n + destination]
                for i in range(row):
                    work[i * n + j] %= prime
        pivots[destination] = row
        remaining -= 1
    rank = n - remaining
    if rank == n:
        for i in range(n * n):
            output[i] = 0
        for i in range(n):
            output[i * n + i] = 1
        return rank
    for j in range(remaining, n):
        for i in range(n):
            output[i * n + pivots[j]] = work[i * n + j]
    for i in range(n - 1, -1, -1):
        if output[i * n + i] == 1:
            for j in range(i + 1, n):
                multiplier = output[i * n + j]
                if multiplier != 0:
                    for k in range(n):
                        output[k * n + j] -= multiplier * output[k * n + i]
                    for k in range(i):
                        value = output[k * n + j]
                        if value >= 18446744073709551616:
                            output[k * n + j] = value % prime
                        elif value <= -18446744073709551616:
                            output[k * n + j] = -((-value) % prime)
        else:
            for j in range(i + 1, n):
                output[i * n + j] %= prime
    return rank


@native
def pari_prime_ideal_hnf(
    basis_table: IntegerBuffer,
    generator: IntegerBuffer,
    n: int,
    prime: int,
    inert: int,
    multiplication: IntegerBuffer,
    work: IntegerBuffer,
    pivots: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Construct `pr_hnf` from a prime descriptor and prepared basis table.

    Table entry (i*n+j)*n+k is the coefficient of w_k in w_i*w_j;
    w_0=1, as in PARI's maximal-order basis. The generator has integral basis
    coordinates. Prime decomposition and the prepared nf table are external;
    no ideal HNF or generator multiplication matrix is supplied as an answer.
    Return modular rank as a diagnostic (zero for an inert ideal).
    """
    if n < 3 or n > 4 or prime < 2 or prime >= 18446744073709551616:
        raise ValueError("unsupported prime-ideal HNF domain")
    if inert != 0 and inert != 1:
        raise ValueError("invalid prime-ideal inert flag")
    if len(output) < n * n or len(multiplication) < n * n:
        raise ValueError("insufficient prime-ideal output storage")
    if inert != 0:
        for i in range(n * n):
            output[i] = 0
        for i in range(n):
            output[i * n + i] = prime
        return 0
    if len(basis_table) < n * n * n or len(generator) < n:
        raise ValueError("insufficient prepared field multiplication data")
    for k in range(n):
        multiplication[k * n] = generator[k]
    for i in range(1, n):
        for k in range(n):
            value = 0
            for j in range(n):
                coefficient = basis_table[(i * n + j) * n + k]
                if coefficient != 0:
                    if coefficient == 1:
                        value += generator[j]
                    elif coefficient == -1:
                        value -= generator[j]
                    else:
                        value += coefficient * generator[j]
            multiplication[k * n + i] = value
    return pari_prime_modulus_hnf(multiplication, n, prime, work, pivots, output)
