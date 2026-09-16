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
    uint64,
)

from .int64_flx_small_factor import (
    int64_pari_flx_small_degfact,
    int64_pari_flx_small_factor_workspace_size,
)
from .int64_f2x_small_factor import int64_pari_f2x_small_degfact


@native
def int64_pari_get_fs_small(
    coefficients: Int64Buffer,
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

    Coefficients are low-to-high, monic, and signed 64-bit. The caller supplies a
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
    state_length: int64 = checked_int64(len(state))
    if state_length < 3:
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
    degree_entries: int64 = degree + 1
    coefficients_length: int64 = checked_int64(len(coefficients))
    exact_workspace_length: int64 = checked_int64(len(exact_workspace))
    word_workspace_length: int64 = checked_int64(len(word_workspace))
    word_metadata_length: int64 = checked_int64(len(word_metadata))
    factor_degrees_length: int64 = checked_int64(len(factor_degrees))
    factor_exponents_length: int64 = checked_int64(len(factor_exponents))
    degrees_length: int64 = checked_int64(len(degrees))
    counts_length: int64 = checked_int64(len(counts))
    exact_workspace_required: int64 = 29
    word_workspace_required: int64 = 9 + int64_pari_flx_small_factor_workspace_size()
    if status == 0 and (
        coefficients_length < degree_entries
        or exact_workspace_length < exact_workspace_required
        or word_workspace_length < word_workspace_required
        or word_metadata_length < word_workspace_required
        or factor_degrees_length < degree
        or factor_exponents_length < degree
        or degrees_length < degree
        or counts_length < degree
    ):
        status = -6
    if status != 0:
        state[0] = status
        state[1] = 0
        state[2] = 0
        return checked_int64(status)
    leading_coefficient: int64 = coefficients[degree]
    if leading_coefficient != 1:
        raise ValueError("get_fs requires a monic defining polynomial")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    if prime == 2:
        # The positive signed divisor gives Python's canonical nonnegative
        # remainder even for a negative signed coefficient.
        two_signed: int64 = 2
        bit: uint64 = 1
        binary: uint64 = 0
        _range_0_0: int64 = degree + 1
        i: int64 = 0
        for i in range(_range_0_0):
            source_coefficient: int64 = coefficients[i]
            reduced_coefficient: int64 = source_coefficient % two_signed
            coefficient: uint64 = checked_uint64(reduced_coefficient)
            binary |= coefficient * bit
            bit <<= 1
        number: int64 = int64_pari_f2x_small_degfact(
            binary,
            factor_degrees,
            factor_exponents,
        )
    else:
        word_prime: uint64 = checked_uint64(prime)
        _range_2_0: int64 = degree + 1
        i: int64 = 0
        for i in range(_range_2_0):
            source_coefficient: int64 = coefficients[i]
            reduced_coefficient: int64 = source_coefficient % prime
            word_workspace[i] = checked_uint64(reduced_coefficient)
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
        next_degree: int64 = factor_degrees[j]
        if next_degree == f:
            n += 1
        else:
            counts[k] = n
            degrees[k] = f
            k += 1
            f = next_degree
            n = 1
    counts[k] = n
    degrees[k] = f
    k += 1
    state[0] = 0
    state[1] = k
    state[2] = number
    return checked_int64(0)
