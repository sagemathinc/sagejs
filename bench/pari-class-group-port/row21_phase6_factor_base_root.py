"""Resident prepared-input factor-base root for development row 21.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the first source-transparent Phase-6 fusion cut for row 21.  It moves
the fixed-degree catalog loop, initial-bound selection, prime-descriptor
recovery, prime-ideal HNF construction, and subfactor-base choice behind one
native call.  All storage is caller-owned and no intermediate owner is
serialized or published.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native

from .row21_factor_base import (
    pari_row21_initial_base,
    pari_row21_prime_descriptors,
    pari_row21_prime_ideal_hnf,
    pari_row21_quintic_factor_degrees,
    pari_row21_subfactor_base,
)
from .row21_relation_hnf_frontier import pari_row21_initial_relation_frontier


@native
def pari_row21_phase6_factor_base_root(
    polynomial: IntegerBuffer,
    basis_table: IntegerBuffer,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    discriminant: int,
    equation_index: int,
    primes: IntegerBuffer,
    prime_count: int,
    descriptor_workspace: IntegerBuffer,
    descriptor_scratch: IntegerBuffer,
    descriptor_ranks: IntegerBuffer,
    descriptor_state: IntegerBuffer,
    degree_scratch: IntegerBuffer,
    exponent_scratch: IntegerBuffer,
    factor_workspace: IntegerBuffer,
    factor_state: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    configuration: Float64Buffer,
    bound_norms: IntegerBuffer,
    constants_logs: Float64Buffer,
    sums: Float64Buffer,
    factor_logs: Float64Buffer,
    selected_primes: IntegerBuffer,
    prime_offsets: IntegerBuffer,
    prime_counts: IntegerBuffer,
    complete_groups: IntegerBuffer,
    selected_indices: IntegerBuffer,
    base_state: IntegerBuffer,
    selected_descriptors: IntegerBuffer,
    selected_ideals: IntegerBuffer,
    selected_norms: IntegerBuffer,
    group_offsets: IntegerBuffer,
    group_sizes: IntegerBuffer,
    group_complete: IntegerBuffer,
    hnf_multiplication: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_pivots: IntegerBuffer,
    subfactor_bad: IntegerBuffer,
    subfactor_configuration: Float64Buffer,
    subfactor_order: IntegerBuffer,
    subfactor_scratch: IntegerBuffer,
    subfactor_stack: IntegerBuffer,
    subfactor_chosen: IntegerBuffer,
    subfactor_rejected: IntegerBuffer,
    permutation: IntegerBuffer,
    subfactor_state: IntegerBuffer,
    relation_ramification: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    relation_generators: IntegerBuffer,
    frontier_state: IntegerBuffer,
    resident_state: IntegerBuffer,
) -> int:
    """Compute the row-21 factor and subfactor owners without a host cut."""
    stride = 33
    degree = 5
    if (
        prime_count < 1
        or len(resident_state) < 8
        or len(descriptor_workspace) < 12000
        or len(descriptor_scratch) < 5 * stride
        or len(selected_descriptors) < 24 * stride
        or len(selected_ideals) < 24 * 25
    ):
        raise ValueError("short row21 resident factor-base storage")
    for i in range(8):
        resident_state[i] = 0
    resident_state[0] = -1

    pattern_cursor = 0
    full_cursor = 0
    for catalog_index in range(prime_count):
        prime = primes[catalog_index]
        pattern_offsets[catalog_index] = pattern_cursor
        full_offsets[catalog_index] = full_cursor
        count = 0
        if equation_index % prime == 0:
            count = pari_row21_prime_descriptors(
                basis_table,
                prime,
                3,
                matrix_m,
                matrix_p,
                matrix_e,
                3,
                descriptor_workspace,
                descriptor_scratch,
                descriptor_ranks,
                descriptor_state,
            )
            for j in range(count):
                degree_scratch[j] = descriptor_scratch[j * stride + 2]
                exponent_scratch[j] = descriptor_scratch[j * stride + 1]
        else:
            count = pari_row21_quintic_factor_degrees(
                polynomial,
                prime,
                degree_scratch,
                exponent_scratch,
                factor_workspace,
                factor_state,
            )
        full_counts[catalog_index] = count
        for j in range(count):
            current_degree = degree_scratch[j]
            full_degrees[full_cursor] = current_degree
            full_cursor += 1
            if j == 0 or pattern_degrees[pattern_cursor - 1] != current_degree:
                pattern_degrees[pattern_cursor] = current_degree
                pattern_multiplicities[pattern_cursor] = 1
                pattern_cursor += 1
            else:
                pattern_multiplicities[pattern_cursor - 1] += 1
        pattern_counts[catalog_index] = pattern_cursor - pattern_offsets[catalog_index]

    selected_count = pari_row21_initial_base(
        discriminant,
        3,
        primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        configuration,
        bound_norms,
        constants_logs,
        sums,
        factor_logs,
        selected_primes,
        prime_offsets,
        prime_counts,
        complete_groups,
        selected_indices,
        base_state,
    )
    if selected_count != 24 or base_state[3] != base_state[4]:
        resident_state[1] = selected_count
        resident_state[0] = 1
        return 1

    descriptor_cursor = 0
    group_count = base_state[4]
    c2 = base_state[1]
    for group in range(group_count):
        prime = selected_primes[group]
        group_offsets[group] = descriptor_cursor
        limit = 0
        power = 1
        while power * prime <= c2:
            power *= prime
            limit += 1
        if limit > 3:
            limit = 3
        count = pari_row21_prime_descriptors(
            basis_table,
            prime,
            3,
            matrix_m,
            matrix_p,
            matrix_e,
            limit,
            descriptor_workspace,
            descriptor_scratch,
            descriptor_ranks,
            descriptor_state,
        )
        needed = prime_counts[prime]
        if needed < 1 or needed > count:
            resident_state[2] = prime
            resident_state[0] = 2
            return 2
        group_sizes[group] = needed
        local_degree = 0
        for j in range(needed):
            for k in range(stride):
                selected_descriptors[descriptor_cursor * stride + k] = (
                    descriptor_scratch[j * stride + k]
                )
            residue_degree = descriptor_scratch[j * stride + 2]
            ramification = descriptor_scratch[j * stride + 1]
            local_degree += residue_degree * ramification
            generator = integer_buffer_view(descriptor_scratch, j * stride + 3, degree)
            ideal = integer_buffer_view(selected_ideals, descriptor_cursor * 25, 25)
            pari_row21_prime_ideal_hnf(
                basis_table,
                generator,
                prime,
                hnf_multiplication,
                hnf_work,
                hnf_pivots,
                ideal,
            )
            norm = 1
            for _ in range(residue_degree):
                norm *= prime
            selected_norms[descriptor_cursor] = norm
            descriptor_cursor += 1
        if local_degree == degree:
            group_complete[group] = 1
        else:
            group_complete[group] = 0

    subcount = pari_row21_subfactor_base(
        selected_norms,
        group_offsets,
        group_sizes,
        group_complete,
        group_count,
        1,
        configuration[0],
        c2,
        subfactor_bad,
        subfactor_configuration,
        subfactor_order,
        subfactor_scratch,
        subfactor_stack,
        subfactor_chosen,
        subfactor_rejected,
        permutation,
        subfactor_state,
    )

    for i in range(descriptor_cursor):
        relation_ramification[i] = selected_descriptors[i * stride + 1]
    relation_count = pari_row21_initial_relation_frontier(
        integer_buffer_view(selected_primes, 0, group_count),
        group_offsets,
        group_sizes,
        group_complete,
        relation_ramification,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        relation,
        relation_scratch,
        relation_generators,
        frontier_state,
    )
    if relation_count != 5:
        resident_state[0] = 3
        return 3
    resident_state[0] = 0
    resident_state[1] = selected_count
    resident_state[2] = descriptor_cursor
    resident_state[3] = group_count
    resident_state[4] = subcount
    resident_state[5] = pattern_cursor
    resident_state[6] = full_cursor
    resident_state[7] = base_state[7]
    return 0


__all__ = ["pari_row21_phase6_factor_base_root"]
