"""Eager diagnostic degree-pattern catalog using PARI get_fs translation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This cache preparation wrapper does not claim source demand-order timing.
"""

from sagejs.native import IntegerBuffer, native
from .get_fs_small import pari_get_fs_small
from .flx_small_factor import pari_flx_small_factor_workspace_size


@native
def pari_prime_degree_catalog(
    coefficients: IntegerBuffer,
    degree: int,
    equation_index: int,
    primes: IntegerBuffer,
    prime_count: int,
    workspace: IntegerBuffer,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    group_degrees: IntegerBuffer,
    group_counts: IntegerBuffer,
    local_state: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
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
    status = 0
    if degree < 2 or degree > 4:
        status = -4
    elif len(primes) < prime_count or len(coefficients) < degree + 1:
        status = -6
    else:
        if coefficients[degree] != 1:
            raise ValueError("degree catalog requires monic polynomial")
        for i in range(prime_count):
            if primes[i] < 2:
                raise ValueError("invalid degree catalog prime")
            if equation_index % primes[i] == 0:
                status = -3
            elif primes[i] > 3037000493 and status == 0:
                status = -5
        capacity = prime_count * degree
        if status == 0 and (
            len(workspace) < 9 + pari_flx_small_factor_workspace_size()
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
    for i in range(1, 4):
        state[i] = 0
    if status != 0:
        return status
    state[0] = -1
    groups = 0
    factors = 0
    for i in range(prime_count):
        result = pari_get_fs_small(
            coefficients,
            degree,
            equation_index,
            primes[i],
            workspace,
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
        for j in range(local_state[1]):
            pattern_degrees[groups] = group_degrees[j]
            pattern_multiplicities[groups] = group_counts[j]
            groups += 1
        for j in range(local_state[2]):
            full_degrees[factors] = factor_degrees[j]
            factors += 1
    state[1] = prime_count
    state[2] = groups
    state[3] = factors
    state[0] = 0
    return 0
