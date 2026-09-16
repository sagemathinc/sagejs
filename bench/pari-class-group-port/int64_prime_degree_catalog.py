"""Eager diagnostic degree-pattern catalog using PARI get_fs translation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This cache preparation wrapper does not claim source demand-order timing.
"""

from sagejs.native import (
    IntegerBuffer,
    UInt64Buffer,
    native,
    Int64Buffer,
    int64,
    checked_int64,
)
from .int64_get_fs_small import int64_pari_get_fs_small
from .int64_flx_small_factor import int64_pari_flx_small_factor_workspace_size


@native
def int64_pari_prime_degree_catalog(
    coefficients: Int64Buffer,
    degree: int64,
    equation_index: int64,
    primes: Int64Buffer,
    prime_count: int64,
    exact_workspace: IntegerBuffer,
    binary_factor_degrees: IntegerBuffer,
    binary_factor_exponents: IntegerBuffer,
    word_workspace: UInt64Buffer,
    word_metadata: Int64Buffer,
    factor_degrees: Int64Buffer,
    factor_exponents: Int64Buffer,
    group_degrees: Int64Buffer,
    group_counts: Int64Buffer,
    local_state: Int64Buffer,
    pattern_offsets: Int64Buffer,
    pattern_counts: Int64Buffer,
    pattern_degrees: Int64Buffer,
    pattern_multiplicities: Int64Buffer,
    full_offsets: Int64Buffer,
    full_counts: Int64Buffer,
    full_degrees: Int64Buffer,
    state: Int64Buffer,
) -> int64:
    """Fill compact grouped and full degree lists from polynomial and primes.

    All owners disjoint. Coefficients use an explicit signed-64 storage
    corridor. Source factor exponents are deliberately discarded.
    Primehood is a caller precondition; primes need not be sorted. Worst-case
    output capacity is prime_count*degree. Preflight frontiers change only
    state[status,0,0,0]. Arithmetic exceptions leave status -1: partial data
    are not a published catalog. Success state is [0,primes,groups,factors].
    This eager fill order is not the source get_fs cache's demand order.
    """
    state_length: int64 = checked_int64(len(state))
    if state_length < 4:
        raise ValueError("short degree catalog state")
    if prime_count < 0 or equation_index < 1:
        raise ValueError("invalid degree catalog scalar")
    status: int64 = 0
    degree_entries: int64 = degree + 1
    primes_length: int64 = checked_int64(len(primes))
    coefficients_length: int64 = checked_int64(len(coefficients))
    if degree < 2 or degree > 4:
        status = -4
    elif primes_length < prime_count or coefficients_length < degree_entries:
        status = -6
    else:
        leading_coefficient: int64 = coefficients[degree]
        if leading_coefficient != 1:
            raise ValueError("degree catalog requires monic polynomial")
        _range_0_0: int64 = prime_count
        i: int64 = 0
        for i in range(_range_0_0):
            prime: int64 = primes[i]
            if prime < 2:
                raise ValueError("invalid degree catalog prime")
            if equation_index % prime == 0:
                status = -3
            elif prime > 3037000493 and status == 0:
                status = -5
        capacity: int64 = prime_count * degree
        exact_workspace_length: int64 = checked_int64(len(exact_workspace))
        word_workspace_length: int64 = checked_int64(len(word_workspace))
        word_metadata_length: int64 = checked_int64(len(word_metadata))
        factor_degrees_length: int64 = checked_int64(len(factor_degrees))
        factor_exponents_length: int64 = checked_int64(len(factor_exponents))
        group_degrees_length: int64 = checked_int64(len(group_degrees))
        group_counts_length: int64 = checked_int64(len(group_counts))
        local_state_length: int64 = checked_int64(len(local_state))
        pattern_offsets_length: int64 = checked_int64(len(pattern_offsets))
        pattern_counts_length: int64 = checked_int64(len(pattern_counts))
        full_offsets_length: int64 = checked_int64(len(full_offsets))
        full_counts_length: int64 = checked_int64(len(full_counts))
        pattern_degrees_length: int64 = checked_int64(len(pattern_degrees))
        pattern_multiplicities_length: int64 = checked_int64(
            len(pattern_multiplicities)
        )
        full_degrees_length: int64 = checked_int64(len(full_degrees))
        exact_workspace_required: int64 = 29
        word_workspace_required: int64 = (
            9 + int64_pari_flx_small_factor_workspace_size()
        )
        if status == 0 and (
            exact_workspace_length < exact_workspace_required
            or word_workspace_length < word_workspace_required
            or word_metadata_length < word_workspace_required
            or factor_degrees_length < degree
            or factor_exponents_length < degree
            or group_degrees_length < degree
            or group_counts_length < degree
            or local_state_length < 3
            or pattern_offsets_length < prime_count
            or pattern_counts_length < prime_count
            or full_offsets_length < prime_count
            or full_counts_length < prime_count
            or pattern_degrees_length < capacity
            or pattern_multiplicities_length < capacity
            or full_degrees_length < capacity
        ):
            status = -6
    state[0] = status
    _range_1_0: int64 = 1
    _range_1_1: int64 = 4
    i: int64 = 0
    for i in range(_range_1_0, _range_1_1):
        state[i] = 0
    if status != 0:
        return checked_int64(status)
    state[0] = -1
    groups: int64 = 0
    factors: int64 = 0
    _range_2_0: int64 = prime_count
    i: int64 = 0
    for i in range(_range_2_0):
        result: int64 = int64_pari_get_fs_small(
            coefficients,
            degree,
            equation_index,
            primes[i],
            exact_workspace,
            binary_factor_degrees,
            binary_factor_exponents,
            word_workspace,
            word_metadata,
            factor_degrees,
            factor_exponents,
            group_degrees,
            group_counts,
            local_state,
        )
        if result != 0:
            raise ValueError("degree catalog preflight mismatch")
        pattern_offsets[i] = groups
        pattern_counts[i] = local_state[1]
        full_offsets[i] = factors
        full_counts[i] = local_state[2]
        _range_3_0: int64 = local_state[1]
        j: int64 = 0
        for j in range(_range_3_0):
            pattern_degrees[groups] = group_degrees[j]
            pattern_multiplicities[groups] = group_counts[j]
            groups += 1
        _range_4_0: int64 = local_state[2]
        j: int64 = 0
        for j in range(_range_4_0):
            full_degrees[factors] = factor_degrees[j]
            factors += 1
    state[1] = prime_count
    state[2] = groups
    state[3] = factors
    state[0] = 0
    return checked_int64(0)
