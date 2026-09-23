"""Prepared row-6 factor-base frontier.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This narrow experimental root translates the PARI 2.17.4 `C1`/`C2`,
`FBgen`, and `subFBgen` prefix.  It accepts authenticated prepared
number-field data plus neutral runtime prime/product tables.  No successful
bound, descriptor, permutation, subfactor choice, relation, or HNF data is an
input.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native

from .bad_subfactor import pari_bad_subfactor_flags
from .discriminant_log import pari_discriminant_log
from .initial_base import pari_prepared_initial_base
from .initial_kummer_catalog import pari_initial_kummer_catalog
from .get_fs_small import pari_get_fs_small
from .pari_random import pari_random_seed
from .pradical import pari_small_pradical
from .prime_complements import pari_small_prime_complements
from .prime_descriptor import pari_prepared_prime_descriptor
from .quotient_split_recursive import pari_small_quotient_split_recursive
from .selected_ideal_metadata import pari_selected_ideal_metadata
from .selected_ideal_packets import pari_selected_ideal_packets
from .subfactor_base import pari_prepared_subfactor_base
from .subfactor_product import pari_subfactor_product


# Fixed before the row-6 result is admitted.  The former experimental root's
# 1,024-ideal ceiling is intentionally crossed by this field (KC=1,130).
# Relation/HNF matrices are not allocated by this frontier.
ROW6_PREPARED_MAX_IDEALS = 2048


@native
def pari_row6_prime_degree_catalog(
    coefficients: IntegerBuffer,
    degree: int,
    equation_index: int,
    primes: IntegerBuffer,
    prime_count: int,
    index_prime: int,
    index_ideals: IntegerBuffer,
    index_ranks: IntegerBuffer,
    index_count: int,
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
    """Degree catalog with the maximal-order index-prime decomposition.

    Ordinary primes use PARI's polynomial `get_fs` path.  For the unique
    index prime, residue degrees come from the live radical/quotient split:
    an image of rank `r` represents residue degree `degree-r`.
    """
    capacity = prime_count * degree
    if (
        degree != 3
        or equation_index != 3
        or index_prime != 3
        or index_count < 1
        or index_count > degree
        or len(index_ideals) < index_count * degree * degree
        or len(index_ranks) < index_count
        or len(pattern_offsets) < prime_count
        or len(pattern_counts) < prime_count
        or len(pattern_degrees) < capacity
        or len(pattern_multiplicities) < capacity
        or len(full_offsets) < prime_count
        or len(full_counts) < prime_count
        or len(full_degrees) < capacity
        or len(state) < 4
    ):
        raise ValueError("short row6 index-prime degree catalog")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    groups = 0
    factors = 0
    for i in range(prime_count):
        prime = primes[i]
        pattern_offsets[i] = groups
        full_offsets[i] = factors
        if equation_index % prime == 0:
            if prime != index_prime:
                raise ValueError("unexpected row6 equation-index divisor")
            for j in range(index_count):
                residue_degree = degree - index_ranks[j]
                if residue_degree < 1 or residue_degree > degree:
                    raise ValueError("invalid row6 index-prime residue degree")
                full_degrees[factors] = residue_degree
                factors += 1
            # General stable grouping of the source-ordered degree vector.
            previous = 0
            for j in range(index_count):
                residue_degree = full_degrees[full_offsets[i] + j]
                if residue_degree < previous:
                    raise ValueError("unsorted row6 index-prime decomposition")
                if j == 0 or residue_degree != previous:
                    pattern_degrees[groups] = residue_degree
                    pattern_multiplicities[groups] = 1
                    groups += 1
                else:
                    pattern_multiplicities[groups - 1] += 1
                previous = residue_degree
            pattern_counts[i] = groups - pattern_offsets[i]
            full_counts[i] = index_count
        else:
            result = pari_get_fs_small(
                coefficients,
                degree,
                equation_index,
                prime,
                workspace,
                factor_degrees,
                factor_exponents,
                group_degrees,
                group_counts,
                local_state,
            )
            if result != 0:
                raise ValueError("row6 ordinary degree catalog failed")
            pattern_counts[i] = local_state[1]
            full_counts[i] = local_state[2]
            for j in range(local_state[1]):
                pattern_degrees[groups] = group_degrees[j]
                pattern_multiplicities[groups] = group_counts[j]
                groups += 1
            for j in range(local_state[2]):
                full_degrees[factors] = factor_degrees[j]
                factors += 1
    state[0] = 0
    state[1] = prime_count
    state[2] = groups
    state[3] = factors
    return 0


@native
def pari_row6_prepared_factor_base_root(
    polynomial: IntegerBuffer,
    discriminant: int,
    real_places: int,
    complex_pairs: int,
    precision: int,
    equation_index: int,
    roots_of_unity: int,
    zkden: int,
    invzk: IntegerBuffer,
    zk: IntegerBuffer,
    zk_degrees: IntegerBuffer,
    basis_table: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    runtime_primes: IntegerBuffer,
    runtime_products: IntegerBuffer,
    factor_limit: int,
    prime_limit: int,
    index_work: IntegerBuffer,
    degree_workspace: IntegerBuffer,
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
    degree_state: IntegerBuffer,
    base_norms: IntegerBuffer,
    base_configuration: Float64Buffer,
    base_constants_logs: Float64Buffer,
    base_sums: Float64Buffer,
    base_factor_logs: Float64Buffer,
    selected_primes: IntegerBuffer,
    prime_offsets: IntegerBuffer,
    prime_counts: IntegerBuffer,
    complete_groups: IntegerBuffer,
    selected_indices: IntegerBuffer,
    base_state: IntegerBuffer,
    random_state: IntegerBuffer,
    kummer_factorwork: IntegerBuffer,
    kummer_factor: IntegerBuffer,
    kummer_diagnostic: IntegerBuffer,
    kummer_minpoly_diagnostic: IntegerBuffer,
    kummer_polywork: IntegerBuffer,
    kummer_u: IntegerBuffer,
    kummer_t: IntegerBuffer,
    kummer_rational: IntegerBuffer,
    kummer_primitive: IntegerBuffer,
    kummer_column: IntegerBuffer,
    kummer_resultant_work: IntegerBuffer,
    kummer_resultant_trace: IntegerBuffer,
    kummer_u_output: IntegerBuffer,
    kummer_tau_output: IntegerBuffer,
    kummer_descriptor_state: IntegerBuffer,
    kummer_unsorted: IntegerBuffer,
    kummer_generators: IntegerBuffer,
    kummer_residue_degrees: IntegerBuffer,
    kummer_order: IntegerBuffer,
    kummer_sort_diagnostic: IntegerBuffer,
    kummer_decomposition_output: IntegerBuffer,
    kummer_decomposition_state: IntegerBuffer,
    catalog_primes: IntegerBuffer,
    catalog_e: IntegerBuffer,
    catalog_f: IntegerBuffer,
    catalog_inert: IntegerBuffer,
    catalog_generators: IntegerBuffer,
    catalog_tau: IntegerBuffer,
    requested_counts: IntegerBuffer,
    kummer_state: IntegerBuffer,
    packet_generator: IntegerBuffer,
    packet_multiplication: IntegerBuffer,
    packet_work: IntegerBuffer,
    packet_pivots: IntegerBuffer,
    packet_ideal: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    residue_degrees: IntegerBuffer,
    inert_flags: IntegerBuffer,
    selected_tau: IntegerBuffer,
    initial_primes: IntegerBuffer,
    initial_offsets: IntegerBuffer,
    initial_counts: IntegerBuffer,
    initial_complete: IntegerBuffer,
    bad_flags: IntegerBuffer,
    sub_configuration: Float64Buffer,
    sub_order: IntegerBuffer,
    sub_scratch: IntegerBuffer,
    sub_stack: IntegerBuffer,
    sub_chosen: IntegerBuffer,
    sub_rejected: IntegerBuffer,
    permutation: IntegerBuffer,
    subfactor: IntegerBuffer,
    minidx: IntegerBuffer,
    root_state: IntegerBuffer,
) -> int:
    """Compute and publish the row-6 factor-base frontier.

    On success `root_state` is

    `[1,C1,C2,KC,KCZ,KCZ2,KC2,subcount,written,automorphisms,
    factor_limit,prime_limit,admission_ceiling,catalog_count]`.
    """
    degree = 3
    if len(root_state) < 14 or root_state[0] != 0:
        raise ValueError("row6 factor-base root requires a fresh state owner")
    if (
        len(polynomial) != 4
        or polynomial[0] != 2000000000018
        or polynomial[1] != -2000000000010
        or polynomial[2] != 0
        or polynomial[3] != 1
        or discriminant != 3555555555596888888888939555555555028
        or real_places != 3
        or complex_pairs != 0
        or precision != 192
        or equation_index != 3
        or roots_of_unity != 2
        or zkden != 3
        or factor_limit != 1048576
        or prime_limit != 65537
    ):
        raise ValueError("unsupported row6 prepared field corridor")
    prime_count = int(len(runtime_primes))
    if (
        prime_count < 1
        or runtime_primes[prime_count - 1] != prime_limit
        or len(runtime_products) < 1
    ):
        raise ValueError("row6 root requires the neutral complete prime prefix")
    if len(base_state) < 7:
        raise ValueError("short row6 factor-base state")

    root_state[0] = -1
    # PARI cannot use the defining-polynomial Kummer shortcut at p=3 because
    # 3 divides the equation-order index.  Reconstruct that one decomposition
    # from the maximal-order multiplication table.  One explicitly bounded
    # scratch owner is reused throughout this sequential dependency graph.
    if len(index_work) < 1170:
        raise ValueError("short row6 index-prime workspace")
    radical_workspace: IntegerBuffer = integer_buffer_view(index_work, 0, 51)
    radical_temporary: IntegerBuffer = integer_buffer_view(index_work, 51, 3)
    radical_column: IntegerBuffer = integer_buffer_view(index_work, 54, 3)
    radical_power_diagnostic: IntegerBuffer = integer_buffer_view(index_work, 57, 3)
    radical_phi: IntegerBuffer = integer_buffer_view(index_work, 60, 9)
    radical_basis: IntegerBuffer = integer_buffer_view(index_work, 69, 9)
    radical_diagnostic: IntegerBuffer = integer_buffer_view(index_work, 78, 4)
    radical_rank = pari_small_pradical(
        basis_table,
        degree,
        3,
        radical_workspace,
        radical_temporary,
        radical_column,
        radical_power_diagnostic,
        radical_phi,
        radical_basis,
        radical_diagnostic,
    )
    split_projection: IntegerBuffer = integer_buffer_view(index_work, 82, 105)
    split_workspace: IntegerBuffer = integer_buffer_view(index_work, 187, 99)
    split_element: IntegerBuffer = integer_buffer_view(index_work, 286, 3)
    split_column: IntegerBuffer = integer_buffer_view(index_work, 289, 3)
    split_matrix: IntegerBuffer = integer_buffer_view(index_work, 292, 9)
    split_polynomial_workspace: IntegerBuffer = integer_buffer_view(index_work, 301, 46)
    split_coefficients: IntegerBuffer = integer_buffer_view(index_work, 347, 5)
    split_polynomial_diagnostic: IntegerBuffer = integer_buffer_view(index_work, 352, 2)
    split_roots: IntegerBuffer = integer_buffer_view(index_work, 354, 4)
    split_root_workspace: IntegerBuffer = integer_buffer_view(index_work, 358, 244)
    split_children: IntegerBuffer = integer_buffer_view(index_work, 602, 27)
    split_child_ranks: IntegerBuffer = integer_buffer_view(index_work, 629, 3)
    split_step_state: IntegerBuffer = integer_buffer_view(index_work, 632, 6)
    split_current: IntegerBuffer = integer_buffer_view(index_work, 638, 9)
    split_pending: IntegerBuffer = integer_buffer_view(index_work, 647, 27)
    split_pending_ranks: IntegerBuffer = integer_buffer_view(index_work, 674, 3)
    split_final: IntegerBuffer = integer_buffer_view(index_work, 677, 27)
    split_final_ranks: IntegerBuffer = integer_buffer_view(index_work, 704, 3)
    split_state: IntegerBuffer = integer_buffer_view(index_work, 707, 3)
    index_count = pari_small_quotient_split_recursive(
        basis_table,
        radical_basis,
        radical_phi,
        degree,
        radical_rank,
        3,
        split_projection,
        split_workspace,
        split_element,
        split_column,
        split_matrix,
        split_polynomial_workspace,
        split_coefficients,
        split_polynomial_diagnostic,
        split_roots,
        split_root_workspace,
        split_children,
        split_child_ranks,
        split_step_state,
        split_current,
        split_pending,
        split_pending_ranks,
        split_final,
        split_final_ranks,
        split_state,
    )
    complement_workspace: IntegerBuffer = integer_buffer_view(index_work, 710, 162)
    complement_work_ranks: IntegerBuffer = integer_buffer_view(index_work, 872, 6)
    complements: IntegerBuffer = integer_buffer_view(index_work, 878, 27)
    complement_ranks: IntegerBuffer = integer_buffer_view(index_work, 905, 3)
    complement_state: IntegerBuffer = integer_buffer_view(index_work, 908, 3)
    pari_small_prime_complements(
        split_final,
        split_final_ranks,
        index_count,
        degree,
        3,
        complement_workspace,
        complement_work_ranks,
        complements,
        complement_ranks,
        complement_state,
    )
    if index_count != 1:
        raise ValueError("unsupported row6 index-prime component count")
    descriptor_workspace: IntegerBuffer = integer_buffer_view(index_work, 911, 160)
    descriptor_u: IntegerBuffer = integer_buffer_view(index_work, 1071, 3)
    descriptor_candidate: IntegerBuffer = integer_buffer_view(index_work, 1074, 3)
    descriptor_column: IntegerBuffer = integer_buffer_view(index_work, 1077, 3)
    descriptor_values_m: IntegerBuffer = integer_buffer_view(index_work, 1080, 3)
    descriptor_values_p: IntegerBuffer = integer_buffer_view(index_work, 1083, 3)
    descriptor_values_e: IntegerBuffer = integer_buffer_view(index_work, 1086, 3)
    descriptor_selected: IntegerBuffer = integer_buffer_view(index_work, 1089, 3)
    descriptor_trace: IntegerBuffer = integer_buffer_view(index_work, 1092, 32)
    descriptor_norm_state: IntegerBuffer = integer_buffer_view(index_work, 1124, 5)
    descriptor_tau_work: IntegerBuffer = integer_buffer_view(index_work, 1129, 9)
    descriptor_stack: IntegerBuffer = integer_buffer_view(index_work, 1138, 1)
    descriptor_anti: IntegerBuffer = integer_buffer_view(index_work, 1139, 3)
    descriptor_tau: IntegerBuffer = integer_buffer_view(index_work, 1142, 9)
    index_descriptor: IntegerBuffer = integer_buffer_view(index_work, 1151, 15)
    index_descriptor_state: IntegerBuffer = integer_buffer_view(index_work, 1166, 3)
    pari_prepared_prime_descriptor(
        basis_table,
        split_final,
        complements,
        degree,
        split_final_ranks[0],
        complement_ranks[0],
        3,
        1,
        real_places,
        embedding_m,
        embedding_p,
        embedding_e,
        descriptor_workspace,
        descriptor_u,
        descriptor_candidate,
        descriptor_column,
        descriptor_values_m,
        descriptor_values_p,
        descriptor_values_e,
        descriptor_selected,
        descriptor_trace,
        descriptor_norm_state,
        descriptor_tau_work,
        descriptor_stack,
        descriptor_anti,
        descriptor_tau,
        index_descriptor,
        index_descriptor_state,
    )

    status = pari_row6_prime_degree_catalog(
        polynomial,
        degree,
        equation_index,
        runtime_primes,
        prime_count,
        3,
        split_final,
        split_final_ranks,
        index_count,
        degree_workspace,
        factor_degrees,
        factor_exponents,
        group_degrees,
        group_counts,
        local_state,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        degree_state,
    )
    if status != 0:
        raise ValueError("row6 degree catalog failed")

    root_state[0] = -2
    logd = pari_discriminant_log(discriminant)
    base_configuration[0] = logd
    base_configuration[1] = 0.0
    base_configuration[2] = 0.0
    c1, c2, kc, kcz, kcz2, kc2, product = pari_prepared_initial_base(
        degree,
        real_places,
        base_configuration,
        runtime_primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        base_norms,
        base_constants_logs,
        base_sums,
        base_factor_logs,
        selected_primes,
        prime_offsets,
        prime_counts,
        complete_groups,
        selected_indices,
    )
    base_state[0] = c1
    base_state[1] = c2
    base_state[2] = kc
    base_state[3] = kcz
    base_state[4] = kcz2
    base_state[5] = kc2
    base_state[6] = product
    if kcz != kcz2:
        raise ValueError("row6 unequal-bound honesty corridor is unsupported")
    if kc < 1 or kc > ROW6_PREPARED_MAX_IDEALS:
        raise ValueError("row6 factor base exceeds public admission ceiling")

    root_state[0] = -3
    pari_random_seed(random_state, 1)
    index_prime_position = 1
    index_pattern_position = pattern_offsets[index_prime_position]
    if (
        runtime_primes[index_prime_position] != 3
        or pattern_counts[index_prime_position] != 1
        or pattern_degrees[index_pattern_position] != 1
        or pattern_multiplicities[index_pattern_position] != 1
        or full_counts[index_prime_position] != 1
    ):
        raise ValueError("row6 index-prime catalog identity changed")
    # The ordinary Kummer catalog must skip p=3; its exact descriptor was
    # produced above by the maximal-order radical/quotient path.  Restore the
    # authentic pattern immediately after the call.
    pattern_degrees[index_pattern_position] = degree
    written = pari_initial_kummer_catalog(
        runtime_primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        prime_count,
        c2,
        polynomial,
        invzk,
        zk,
        zk_degrees,
        basis_table,
        degree,
        equation_index,
        zkden,
        random_state,
        kummer_factorwork,
        kummer_factor,
        kummer_diagnostic,
        kummer_minpoly_diagnostic,
        kummer_polywork,
        kummer_u,
        kummer_t,
        kummer_rational,
        kummer_primitive,
        kummer_column,
        kummer_resultant_work,
        kummer_resultant_trace,
        kummer_u_output,
        kummer_tau_output,
        kummer_descriptor_state,
        kummer_unsorted,
        kummer_generators,
        kummer_residue_degrees,
        kummer_order,
        kummer_sort_diagnostic,
        kummer_decomposition_output,
        kummer_decomposition_state,
        catalog_primes,
        catalog_e,
        catalog_f,
        catalog_inert,
        catalog_generators,
        catalog_tau,
        requested_counts,
        kummer_state,
    )
    pattern_degrees[index_pattern_position] = 1
    index_slot = full_offsets[index_prime_position]
    catalog_primes[index_slot] = index_descriptor[0]
    catalog_e[index_slot] = index_descriptor[1]
    catalog_f[index_slot] = index_descriptor[2]
    catalog_inert[index_slot] = 0
    for i in range(degree):
        catalog_generators[index_slot * degree + i] = index_descriptor[3 + i]
    for a in range(degree):
        for b in range(degree):
            catalog_tau[index_slot * degree * degree + a * degree + b] = (
                index_descriptor[3 + degree + b * degree + a]
            )
    requested_counts[index_prime_position] = 1
    written += 1
    kummer_state[3] = written
    if written != kc:
        raise ValueError("row6 generated descriptor count mismatch")

    root_state[0] = -4
    catalog_count = int(degree_state[3])
    packet_ideals_view: IntegerBuffer = integer_buffer_view(
        packet_ideals, 0, kc * degree * degree
    )
    packet_norms_view: IntegerBuffer = integer_buffer_view(packet_norms, 0, kc)
    relation_primes_view: IntegerBuffer = integer_buffer_view(relation_primes, 0, kc)
    ramification_view: IntegerBuffer = integer_buffer_view(ramification, 0, kc)
    residue_degrees_view: IntegerBuffer = integer_buffer_view(residue_degrees, 0, kc)
    inert_flags_view: IntegerBuffer = integer_buffer_view(inert_flags, 0, kc)
    selected_tau_view: IntegerBuffer = integer_buffer_view(
        selected_tau, 0, kc * degree * degree
    )
    pari_selected_ideal_packets(
        basis_table,
        catalog_primes,
        catalog_f,
        catalog_inert,
        catalog_generators,
        catalog_count,
        selected_indices,
        kc,
        degree,
        packet_generator,
        packet_multiplication,
        packet_work,
        packet_pivots,
        packet_ideal,
        packet_ideals_view,
        packet_norms_view,
    )
    pari_selected_ideal_metadata(
        catalog_primes,
        catalog_e,
        catalog_f,
        catalog_inert,
        catalog_tau,
        catalog_count,
        selected_indices,
        kc,
        degree,
        relation_primes_view,
        ramification_view,
        residue_degrees_view,
        inert_flags_view,
        selected_tau_view,
    )

    root_state[0] = -5
    if (
        len(initial_primes) < kcz
        or len(initial_offsets) < kcz
        or len(initial_counts) < kcz
        or len(initial_complete) < kcz
    ):
        raise ValueError("short row6 active prime group owners")
    for i in range(kcz):
        prime = selected_primes[i]
        initial_primes[i] = prime
        initial_offsets[i] = prime_offsets[prime]
        initial_counts[i] = prime_counts[prime]
        initial_complete[i] = complete_groups[prime]
    initial_offsets_view: IntegerBuffer = integer_buffer_view(initial_offsets, 0, kcz)
    initial_counts_view: IntegerBuffer = integer_buffer_view(initial_counts, 0, kcz)
    initial_complete_view: IntegerBuffer = integer_buffer_view(initial_complete, 0, kcz)
    bad_view: IntegerBuffer = integer_buffer_view(bad_flags, 0, kc)
    pari_bad_subfactor_flags(
        initial_offsets_view,
        initial_counts_view,
        initial_complete_view,
        kcz,
        kc,
        bad_view,
    )
    sub_configuration[0] = pari_subfactor_product(degree, complex_pairs, logd, c2)
    permutation_view: IntegerBuffer = integer_buffer_view(permutation, 0, kc)
    subcount, sublimit, sublimit2 = pari_prepared_subfactor_base(
        packet_norms_view,
        bad_view,
        sub_configuration,
        3,
        sub_order,
        sub_scratch,
        sub_stack,
        sub_chosen,
        sub_rejected,
        permutation_view,
    )
    if subcount < 1 or len(subfactor) < subcount or len(minidx) < kc:
        raise ValueError("short row6 subfactor/minidx owner")
    for i in range(subcount):
        subfactor[i] = permutation[i]
    for i in range(kc):
        minidx[i] = i + 1

    root_state[1] = c1
    root_state[2] = c2
    root_state[3] = kc
    root_state[4] = kcz
    root_state[5] = kcz2
    root_state[6] = kc2
    root_state[7] = subcount
    root_state[8] = written
    root_state[9] = 0
    root_state[10] = factor_limit
    root_state[11] = prime_limit
    root_state[12] = ROW6_PREPARED_MAX_IDEALS
    root_state[13] = catalog_count
    root_state[0] = 1
    return kc
