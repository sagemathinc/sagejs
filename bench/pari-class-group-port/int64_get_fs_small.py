"""PARI 2.17.4 polynomial-to-prime-degree patterns, initial small domain.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is an upstream-assumed experimental translation of `buch2.c:get_fs`,
not an independent class-group certificate or a general prime decomposition.
"""

from sagejs.native import (
    IntegerBuffer,
    UInt64Buffer,
    checked_uint64,
    native,
    Int64Buffer,
    int64,
    checked_int64,
)

from .int64_flx_small_factor import (
    int64_pari_flx_small_degfact,
    int64_pari_flx_small_factor_workspace_size,
)
from .f2x_small_factor import (
    pari_f2x_small_degfact,
    pari_f2x_small_factor_workspace_size,
)


@native
def int64_pari_get_fs_small(
    coefficients: IntegerBuffer,
    degree: int64,
    equation_index: int64,
    prime: int64,
    exact_workspace: IntegerBuffer,
    binary_factor_degrees: IntegerBuffer,
    binary_factor_exponents: IntegerBuffer,
    word_workspace: UInt64Buffer,
    word_metadata: Int64Buffer,
    factor_degrees: Int64Buffer,
    factor_exponents: Int64Buffer,
    degrees: Int64Buffer,
    counts: Int64Buffer,
    state: Int64Buffer,
) -> int64:
    """Derive splitting-degree counts without supplied modular factors.

    Coefficients are low-to-high, monic, and exact. The caller supplies a
    rational prime; primality is not recomputed inside this source path.
    Every buffer owner is disjoint. State receives status, group count, and
    irreducible factor count. Success has status zero. Negative frontiers are
    an index divisor (-3), degree outside 2--4 (-4),
    prime outside PARI's small-word corridor (-5), or short storage (-6).
    Frontier returns only change the three state entries, never the outputs.
    Invalid scalar inputs raise before mutation. Unexpected internal failure
    may mutate scratch and leaves status -1, not a published result.

    Counts ignore factorization exponents exactly as upstream `get_fs` does.
    Repeated factors must still be found by the squarefree factorization path.
    This routine alone cannot supply all primes needed by analytic preparation.
    """
    if len(state) < 3:
        raise ValueError("short get_fs state")
    if prime < 2 or equation_index < 1:
        raise ValueError("invalid get_fs scalar input")
    status: int64 = 0
    if equation_index % prime == 0:
        status = -3
    elif degree < 2 or degree > 4:
        status = -4
    elif prime > 3037000493:
        status = -5
    elif (
        len(coefficients) < degree + 1
        or len(exact_workspace) < 9 + pari_f2x_small_factor_workspace_size()
        or len(word_workspace) < 9 + int64_pari_flx_small_factor_workspace_size()
        or len(word_metadata) < 9 + int64_pari_flx_small_factor_workspace_size()
        or len(factor_degrees) < degree
        or len(factor_exponents) < degree
        or len(degrees) < degree
        or len(counts) < degree
    ):
        status = -6
    if status != 0:
        state[0] = status
        state[1] = 0
        state[2] = 0
        return checked_int64(status)
    if coefficients[degree] != 1:
        raise ValueError("get_fs requires a monic defining polynomial")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    # ZX_to_Flx, with the monic normalization already an input invariant.
    _range_0_0: int64 = degree + 1
    i: int64 = 0
    for i in range(_range_0_0):
        exact_workspace[i] = coefficients[i] % prime
    if prime == 2:
        # Flx_to_F2x before the characteristic-two source dispatcher.
        binary = checked_uint64(0)
        _range_1_0: int64 = degree + 1
        i: int64 = 0
        for i in range(_range_1_0):
            coefficient = checked_uint64(exact_workspace[i])
            shift = checked_uint64(i)
            binary |= coefficient << shift
        # The packed F2x implementation remains exact. Stage its at-most-four
        # outputs, then return immediately to bounded signed storage.
        number: int64 = checked_int64(
            pari_f2x_small_degfact(
                int(binary),
                binary_factor_degrees,
                binary_factor_exponents,
                exact_workspace,
                9,
            )
        )
        _range_binary: int64 = number
        i: int64 = 0
        for i in range(_range_binary):
            factor_degrees[i] = checked_int64(binary_factor_degrees[i])
            factor_exponents[i] = checked_int64(binary_factor_exponents[i])
    else:
        word_prime = checked_uint64(prime)
        _range_2_0: int64 = degree + 1
        i: int64 = 0
        for i in range(_range_2_0):
            word_workspace[i] = checked_uint64(coefficients[i] % prime)
        number: int64 = int64_pari_flx_small_degfact(
            word_workspace,
            word_metadata,
            0,
            degree,
            word_prime,
            factor_degrees,
            factor_exponents,
            9,
        )
    # Literal grouping of the sorted degree vector, not exponent sums.
    f: int64 = factor_degrees[0]
    n: int64 = 1
    k: int64 = 0
    _range_3_0: int64 = 1
    _range_3_1: int64 = number
    j: int64 = 0
    for j in range(_range_3_0, _range_3_1):
        if factor_degrees[j] == f:
            n += 1
        else:
            counts[k] = n
            degrees[k] = f
            k += 1
            f = factor_degrees[j]
            n = 1
    counts[k] = n
    degrees[k] = f
    k += 1
    state[0] = 0
    state[1] = k
    state[2] = number
    return checked_int64(0)
