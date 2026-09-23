"""Allocation-free resident factor-base root for qualification row 20."""

from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native

from .prepared_index_prime import pari_prepared_index_prime_descriptors
from .row21_factor_base import (
    pari_row21_initial_base,
    pari_row21_prime_ideal_hnf,
    pari_row21_quintic_factor_degrees,
    pari_row21_subfactor_base,
)


@native
def pari_row20_phase6_factor_base_root(
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
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    packet_generators: IntegerBuffer,
    admission_group_tau: IntegerBuffer,
    packet_inert: IntegerBuffer,
    packet_primes: IntegerBuffer,
    hnf_perm: IntegerBuffer,
    outer_perm: IntegerBuffer,
    hnf_subfactor: IntegerBuffer,
    resident_state: IntegerBuffer,
) -> int:
    """Derive all seven factor-base ideals into caller-owned buffers."""
    stride = 33
    degree = 5
    if prime_count < 1 or len(resident_state) < 8:
        raise ValueError("short row20 resident factor-base storage")
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
            count = pari_prepared_index_prime_descriptors(
                basis_table,
                degree,
                prime,
                1,
                matrix_m,
                matrix_p,
                matrix_e,
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
    group_count = base_state[4]
    if selected_count != 7 or group_count != 3:
        resident_state[0] = 1
        resident_state[1] = selected_count
        resident_state[2] = group_count
        return 1

    descriptor_cursor = 0
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
        count = pari_prepared_index_prime_descriptors(
            basis_table,
            degree,
            prime,
            1,
            matrix_m,
            matrix_p,
            matrix_e,
            descriptor_workspace,
            descriptor_scratch,
            descriptor_ranks,
            descriptor_state,
        )
        needed = prime_counts[prime]
        copied = 0
        local_degree = 0
        for j in range(count):
            residue_degree = descriptor_scratch[j * stride + 2]
            if copied < needed and residue_degree <= limit:
                for k in range(stride):
                    selected_descriptors[descriptor_cursor * stride + k] = (
                        descriptor_scratch[j * stride + k]
                    )
                ramification_index = descriptor_scratch[j * stride + 1]
                relation_primes[descriptor_cursor] = prime
                packet_primes[descriptor_cursor] = prime
                ramification[descriptor_cursor] = ramification_index
                residue_degrees[descriptor_cursor] = residue_degree
                inert = 1
                for k in range(degree):
                    value = descriptor_scratch[j * stride + 3 + k]
                    packet_generators[descriptor_cursor * degree + k] = value
                    if value != 0:
                        inert = 0
                packet_inert[descriptor_cursor] = inert
                for row in range(degree):
                    for column in range(degree):
                        admission_group_tau[
                            descriptor_cursor * degree * degree + row * degree + column
                        ] = descriptor_scratch[j * stride + 8 + column * degree + row]
                local_degree += residue_degree * ramification_index
                generator = integer_buffer_view(
                    descriptor_scratch, j * stride + 3, degree
                )
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
                copied += 1
        if copied != needed:
            resident_state[0] = 2
            resident_state[2] = prime
            return 2
        group_sizes[group] = copied
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
    for i in range(selected_count):
        hnf_perm[i] = permutation[i]
        outer_perm[i] = permutation[i]
        if i < subcount:
            hnf_subfactor[i] = permutation[i]
    resident_state[0] = 0
    resident_state[1] = selected_count
    resident_state[2] = descriptor_cursor
    resident_state[3] = group_count
    resident_state[4] = subcount
    resident_state[5] = pattern_cursor
    resident_state[6] = full_cursor
    resident_state[7] = base_state[7]
    return 0


__all__ = ["pari_row20_phase6_factor_base_root"]
