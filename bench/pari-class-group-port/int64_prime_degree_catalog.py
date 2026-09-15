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
from .f2x_small_factor import pari_f2x_small_factor_workspace_size


@native
def int64_pari_prime_degree_catalog(
    coefficients: IntegerBuffer,
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

    All owners disjoint. Source factor exponents are deliberately discarded.
    Primehood is a caller precondition; primes need not be sorted. Worst-case
    output capacity is prime_count*degree. Preflight frontiers change only
    state[status,0,0,0]. Arithmetic exceptions leave status -1: partial data
    are not a published catalog. Success state is [0,primes,groups,factors].
    This eager fill order is not the source get_fs cache's demand order.
    """
    if len(state) < 4:
        raise ValueError("short degree catalog state")
    if prime_count < 0 or equation_index < 1:
        raise ValueError("invalid degree catalog scalar")
    status: int64 = 0
    if degree < 2 or degree > 4:
        status = -4
    elif len(primes) < prime_count or len(coefficients) < degree + 1:
        status = -6
    else:
        if coefficients[degree] != 1:
            raise ValueError("degree catalog requires monic polynomial")
        _range_0_0: int64 = prime_count
        i: int64 = 0
        for i in range(_range_0_0):
            if primes[i] < 2:
                raise ValueError("invalid degree catalog prime")
            if equation_index % primes[i] == 0:
                status = -3
            elif primes[i] > 3037000493 and status == 0:
                status = -5
        capacity: int64 = prime_count * degree
        if status == 0 and (
            len(exact_workspace) < 9 + pari_f2x_small_factor_workspace_size()
            or len(word_workspace) < 9 + int64_pari_flx_small_factor_workspace_size()
            or len(word_metadata) < 9 + int64_pari_flx_small_factor_workspace_size()
            or len(factor_degrees) < degree
            or len(factor_exponents) < degree
            or len(group_degrees) < degree
            or len(group_counts) < degree
            or len(local_state) < 3
            or len(pattern_offsets) < prime_count
            or len(pattern_counts) < prime_count
            or len(full_offsets) < prime_count
            or len(full_counts) < prime_count
            or len(pattern_degrees) < capacity
            or len(pattern_multiplicities) < capacity
            or len(full_degrees) < capacity
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
