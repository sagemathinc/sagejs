"""Prepared-input factor-base owner for the row-23 aggregate root.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the live counterpart of `row23_factor_base_coordinator.cjs`.  It
derives the decomposition catalog, PARI bounds, ordinary prime descriptors,
prime-ideal HNFs, and subfactor permutation from the authenticated prepared
number field.  All answer-dependent storage is caller-owned and initially
empty; no serialized factor owner is accepted.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    integer_buffer_view,
    native,
)

from .row21_factor_base import (
    pari_row21_initial_base,
    pari_row21_prime_ideal_hnf,
    pari_row21_quintic_factor_degrees,
    pari_row21_subfactor_base,
)
from .row23_factor_base import pari_row23_prime_descriptors
from .row23_index_prime_packet import pari_row23_index_prime_packet


@native
def pari_row23_phase6_prepared_factor_root(
    polynomial: IntegerBuffer,
    invzk: IntegerBuffer,
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
    index_workspace: IntegerBuffer,
    index_descriptors: IntegerBuffer,
    index_ranks: IntegerBuffer,
    index_ideals: IntegerBuffer,
    index_norms: IntegerBuffer,
    index_state: IntegerBuffer,
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
    admission_group_tau: IntegerBuffer,
    admission_group_e: IntegerBuffer,
    admission_group_f: IntegerBuffer,
    admission_group_inert: IntegerBuffer,
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    search_ideals: IntegerBuffer,
    packet_ids: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    packet_primes: IntegerBuffer,
    packet_generators: IntegerBuffer,
    packet_inert: IntegerBuffer,
    initial_offsets: IntegerBuffer,
    initial_counts: IntegerBuffer,
    initial_complete: IntegerBuffer,
    hnf_perm: Int64Buffer,
    outer_state: Int64Buffer,
    outer_minidx: IntegerBuffer,
    outer_present: IntegerBuffer,
    outer_live: IntegerBuffer,
    outer_perm: IntegerBuffer,
    outer_multiplier: IntegerBuffer,
    subfactor: IntegerBuffer,
    resident_state: IntegerBuffer,
) -> int:
    """Derive the exact 31-ideal row-23 factor base into live owners."""
    degree = 5
    stride = 33
    expected_descriptors = 31
    expected_groups = 20
    if (
        equation_index != 131
        or prime_count < 1
        or len(resident_state) < 12
        or len(descriptor_workspace) < 12000
        or len(descriptor_scratch) < degree * stride
        or len(index_workspace) < 12600
        or len(selected_descriptors) < expected_descriptors * stride
        or len(selected_ideals) < expected_descriptors * degree * degree
        or len(selected_norms) < expected_descriptors
        or len(packet_ideals) < expected_descriptors * degree * degree
        or len(packet_generators) < expected_descriptors * degree
    ):
        raise ValueError("short row23 prepared factor-base storage")
    for i in range(12):
        resident_state[i] = 0
    resident_state[0] = -1

    index_count = pari_row23_index_prime_packet(
        basis_table,
        matrix_m,
        matrix_p,
        matrix_e,
        index_workspace,
        index_descriptors,
        index_ranks,
        index_ideals,
        index_norms,
        index_state,
    )
    if index_count < 1 or index_state[0] != 0:
        resident_state[0] = 1
        resident_state[1] = index_count
        return 1

    pattern_cursor = 0
    full_cursor = 0
    for catalog_index in range(prime_count):
        prime = primes[catalog_index]
        pattern_offsets[catalog_index] = pattern_cursor
        full_offsets[catalog_index] = full_cursor
        count = 0
        if prime == equation_index:
            count = index_count
            for j in range(count):
                degree_scratch[j] = index_descriptors[j * stride + 2]
                exponent_scratch[j] = index_descriptors[j * stride + 1]
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
        degree,
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
    group_count = base_state[4]
    if (
        selected_count != expected_descriptors
        or group_count != expected_groups
        or base_state[3] != expected_groups
        or base_state[5] != expected_descriptors
        or base_state[7] != 1
    ):
        resident_state[0] = 2
        resident_state[2] = selected_count
        resident_state[3] = group_count
        return 2

    descriptor_cursor = 0
    c2 = base_state[1]
    for group in range(group_count):
        prime = selected_primes[group]
        # The authenticated row-23 corridor has C2=123, strictly below the
        # equation-index prime.  Fail closed rather than silently selecting an
        # index-prime packet through the ordinary Kummer path.
        if prime >= equation_index:
            resident_state[0] = 3
            resident_state[4] = prime
            return 3
        group_offsets[group] = descriptor_cursor
        limit = 0
        power = 1
        while power * prime <= c2:
            power *= prime
            limit += 1
        if limit > 2:
            limit = 2
        count = pari_row23_prime_descriptors(
            polynomial,
            invzk,
            basis_table,
            prime,
            limit,
            descriptor_workspace,
            descriptor_scratch,
            descriptor_ranks,
            descriptor_state,
        )
        needed = prime_counts[prime]
        if needed < 1 or needed > count:
            resident_state[0] = 4
            resident_state[4] = prime
            resident_state[5] = needed
            resident_state[6] = count
            return 4
        group_sizes[group] = needed
        local_degree = 0
        for j in range(needed):
            for k in range(stride):
                selected_descriptors[descriptor_cursor * stride + k] = (
                    descriptor_scratch[j * stride + k]
                )
            residue_degree = descriptor_scratch[j * stride + 2]
            ramification_index = descriptor_scratch[j * stride + 1]
            local_degree += residue_degree * ramification_index
            relation_primes[descriptor_cursor] = prime
            packet_primes[descriptor_cursor] = prime
            ramification[descriptor_cursor] = ramification_index
            admission_group_e[descriptor_cursor] = ramification_index
            admission_group_f[descriptor_cursor] = residue_degree
            inert = 1
            for k in range(degree):
                value = descriptor_scratch[j * stride + 3 + k]
                packet_generators[descriptor_cursor * degree + k] = value
                if value != 0:
                    inert = 0
            packet_inert[descriptor_cursor] = inert
            admission_group_inert[descriptor_cursor] = inert
            for row in range(degree):
                for column in range(degree):
                    admission_group_tau[
                        descriptor_cursor * degree * degree + row * degree + column
                    ] = descriptor_scratch[j * stride + 8 + column * degree + row]
            ideal = integer_buffer_view(
                selected_ideals, descriptor_cursor * degree * degree, degree * degree
            )
            pari_row21_prime_ideal_hnf(
                basis_table,
                integer_buffer_view(descriptor_scratch, j * stride + 3, degree),
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
        initial_offsets[group] = group_offsets[group]
        initial_counts[group] = group_sizes[group]
        initial_complete[group] = group_complete[group]

    if descriptor_cursor != expected_descriptors:
        resident_state[0] = 5
        resident_state[2] = descriptor_cursor
        return 5
    subcount = pari_row21_subfactor_base(
        selected_norms,
        group_offsets,
        group_sizes,
        group_complete,
        group_count,
        0,
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
    if subcount != 3:
        resident_state[0] = 6
        resident_state[7] = subcount
        return 6

    for i in range(expected_descriptors):
        search_ideals[i] = permutation[i]
        hnf_perm[i] = permutation[i]
        outer_perm[i] = permutation[i]
        packet_ids[i] = i + 1
        outer_minidx[i] = i + 1
        outer_present[i] = 0
        outer_live[i] = 0
        outer_multiplier[i] = 0
        for k in range(degree * degree):
            packet_ideals[i * degree * degree + k] = selected_ideals[
                i * degree * degree + k
            ]
        packet_norms[i] = selected_norms[i]
        if i < subcount:
            subfactor[i] = permutation[i]
    for i in range(len(outer_state)):
        outer_state[i] = 0
    outer_state[0] = 40
    outer_state[1] = 4
    outer_state[4] = expected_descriptors + 1

    resident_state[0] = 0
    resident_state[1] = selected_count
    resident_state[2] = descriptor_cursor
    resident_state[3] = group_count
    resident_state[4] = subcount
    resident_state[5] = pattern_cursor
    resident_state[6] = full_cursor
    resident_state[7] = base_state[7]
    resident_state[8] = index_count
    resident_state[9] = base_state[0]
    resident_state[10] = base_state[1]
    resident_state[11] = base_state[6]
    return 0


__all__ = ["pari_row23_phase6_prepared_factor_root"]
