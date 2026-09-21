"""Prepared-input factor, initial-relation, and analytic prefix for row 19.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a deliberately field-specific composition of the already translated
PARI 2.17.4 routines.  Its only mathematical inputs are authenticated
``nfinit`` data and neutral prime tables.  In particular no factor-base
selection, prime descriptor, relation, analytic degree catalog, or terminal
answer enters this boundary.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native

from .bad_subfactor import pari_bad_subfactor_flags
from .discriminant_log import pari_discriminant_log
from .get_fs_small import pari_get_fs_small
from .initial_base import pari_prepared_initial_base
from .initial_kummer_catalog import pari_initial_kummer_catalog
from .pari_random import pari_random_seed
from .prepared_index_prime import pari_prepared_index_prime_descriptors
from .relation_insertion import pari_initialize_owned_relations
from .selected_ideal_metadata import pari_selected_ideal_metadata
from .selected_ideal_packets import pari_selected_ideal_packets
from .subfactor_base import pari_prepared_subfactor_base
from .subfactor_product import pari_subfactor_product


ROW19_INDEX_PRIME_COUNT = 5
ROW19_MAX_IDEALS = 512


@native
def pari_row19_prime_degree_catalog(
    polynomial: IntegerBuffer,
    equation_index: int,
    primes: IntegerBuffer,
    prime_count: int,
    index_descriptors: IntegerBuffer,
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
    """Build a degree catalog, using live maximal-order index descriptors."""
    degree = 3
    capacity = prime_count * degree
    if (
        equation_index != 254541
        or len(index_descriptors) < ROW19_INDEX_PRIME_COUNT * 45
        or len(pattern_offsets) < prime_count
        or len(pattern_counts) < prime_count
        or len(pattern_degrees) < capacity
        or len(pattern_multiplicities) < capacity
        or len(full_offsets) < prime_count
        or len(full_counts) < prime_count
        or len(full_degrees) < capacity
        or len(state) < 4
    ):
        raise ValueError("short row19 degree-catalog storage")
    state[0] = -1
    groups = 0
    factors = 0
    for position in range(prime_count):
        prime = primes[position]
        pattern_offsets[position] = groups
        full_offsets[position] = factors
        bank = -1
        if prime == 3:
            bank = 0
        elif prime == 7:
            bank = 1
        elif prime == 17:
            bank = 2
        elif prime == 23:
            bank = 3
        elif prime == 31:
            bank = 4
        if equation_index % prime == 0:
            if bank < 0:
                raise ValueError("missing row19 index-prime descriptor")
            descriptor = bank * 45
            if (
                index_descriptors[descriptor] != prime
                or index_descriptors[descriptor + 1] != 3
                or index_descriptors[descriptor + 2] != 1
            ):
                raise ValueError("invalid row19 index-prime descriptor")
            full_degrees[factors] = 1
            pattern_degrees[groups] = 1
            pattern_multiplicities[groups] = 1
            factors += 1
            groups += 1
            pattern_counts[position] = 1
            full_counts[position] = 1
        else:
            status = pari_get_fs_small(
                polynomial,
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
            if status != 0:
                raise ValueError("row19 ordinary prime degree catalog failed")
            pattern_counts[position] = local_state[1]
            full_counts[position] = local_state[2]
            for index in range(local_state[1]):
                pattern_degrees[groups] = group_degrees[index]
                pattern_multiplicities[groups] = group_counts[index]
                groups += 1
            for index in range(local_state[2]):
                full_degrees[factors] = factor_degrees[index]
                factors += 1
    state[0] = 0
    state[1] = prime_count
    state[2] = groups
    state[3] = factors
    return 0


@native
def pari_row19_phase6_prepared_factor_root(
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
    preparation_rounded_embedding: IntegerBuffer,
    preparation_embedding: IntegerBuffer,
    factor_limit: int,
    prime_limit: int,
    index_workspace: IntegerBuffer,
    index_descriptors: IntegerBuffer,
    index_ranks: IntegerBuffer,
    index_states: IntegerBuffer,
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
    factor_product: IntegerBuffer,
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
    rational_primes: IntegerBuffer,
    rational_offsets: IntegerBuffer,
    rational_counts: IntegerBuffer,
    rational_complete: IntegerBuffer,
    bad_flags: IntegerBuffer,
    sub_configuration: Float64Buffer,
    sub_order: IntegerBuffer,
    sub_scratch: IntegerBuffer,
    sub_stack: IntegerBuffer,
    sub_chosen: IntegerBuffer,
    sub_rejected: IntegerBuffer,
    permutation: IntegerBuffer,
    subfactor: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    relation_generators: IntegerBuffer,
    analytic_primes: IntegerBuffer,
    analytic_workspace: IntegerBuffer,
    analytic_factor_degrees: IntegerBuffer,
    analytic_factor_exponents: IntegerBuffer,
    analytic_group_degrees: IntegerBuffer,
    analytic_group_counts: IntegerBuffer,
    analytic_local_state: IntegerBuffer,
    analytic_offsets: IntegerBuffer,
    analytic_counts: IntegerBuffer,
    analytic_degrees: IntegerBuffer,
    analytic_multiplicities: IntegerBuffer,
    analytic_full_offsets: IntegerBuffer,
    analytic_full_counts: IntegerBuffer,
    analytic_full_degrees: IntegerBuffer,
    analytic_state: IntegerBuffer,
    root_state: IntegerBuffer,
) -> int:
    """Derive row 19's two prefixes and initial relations in one graph."""
    degree = 3
    if len(root_state) < 16 or root_state[0] != 0:
        raise ValueError("row19 prepared root requires fresh state")
    if (
        len(polynomial) != 4
        or polynomial[0] != -51050867718180330
        or polynomial[1] != 0
        or polynomial[2] != 0
        or polynomial[3] != 1
        or discriminant != -1086061775432017340256300
        or real_places != 1
        or complex_pairs != 1
        or precision != 192
        or equation_index != 254541
        or roots_of_unity != 2
        or zkden != 254541
        or factor_limit != 1048576
        or prime_limit != 65537
    ):
        raise ValueError("unsupported row19 prepared field corridor")
    prime_count = len(runtime_primes)
    if (
        prime_count != 6543
        or runtime_primes[prime_count - 1] != prime_limit
        or len(runtime_products) < 1
        or len(preparation_rounded_embedding) < 9
        or len(preparation_embedding) < 27
    ):
        raise ValueError("row19 requires the neutral complete prime prefix")
    if (
        len(index_workspace) < 12000
        or len(index_descriptors) < ROW19_INDEX_PRIME_COUNT * 45
        or len(index_ranks) < ROW19_INDEX_PRIME_COUNT * 3
        or len(index_states) < ROW19_INDEX_PRIME_COUNT * 4
    ):
        raise ValueError("short row19 index-prime owners")
    root_state[0] = -1
    for bank in range(ROW19_INDEX_PRIME_COUNT):
        prime = 3
        if bank == 1:
            prime = 7
        elif bank == 2:
            prime = 17
        elif bank == 3:
            prime = 23
        elif bank == 4:
            prime = 31
        count = pari_prepared_index_prime_descriptors(
            basis_table,
            degree,
            prime,
            real_places,
            embedding_m,
            embedding_p,
            embedding_e,
            index_workspace,
            integer_buffer_view(index_descriptors, bank * 45, 45),
            integer_buffer_view(index_ranks, bank * 3, 3),
            integer_buffer_view(index_states, bank * 4, 4),
        )
        if count != 1 or index_states[bank * 4 + 2] != 1:
            raise ValueError("row19 index-prime decomposition changed")
    status = pari_row19_prime_degree_catalog(
        polynomial,
        equation_index,
        runtime_primes,
        prime_count,
        index_descriptors,
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
    if status != 0 or degree_state[3] != 11920:
        raise ValueError("row19 factor degree catalog changed")
    base_configuration[0] = pari_discriminant_log(discriminant)
    (
        c1,
        c2,
        kc,
        kcz,
        kcz2,
        kc2,
        product,
    ) = pari_prepared_initial_base(
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
    if c1 != 3440 or c2 != 3440 or kc != 424 or kcz != 307 or kcz2 != 307 or kc2 != 424:
        raise ValueError("row19 factor-base shape changed")
    factor_product[0] = product
    pari_random_seed(random_state, 1)
    # The defining-order Kummer path must skip all five index primes.  Its
    # degree-3 placeholders are restored immediately after the call and the
    # live maximal-order descriptors are installed in their reserved slots.
    for position in range(prime_count):
        prime = runtime_primes[position]
        if equation_index % prime == 0:
            pattern_degrees[pattern_offsets[position]] = degree
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
    for position in range(prime_count):
        prime = runtime_primes[position]
        bank = -1
        if prime == 3:
            bank = 0
        elif prime == 7:
            bank = 1
        elif prime == 17:
            bank = 2
        elif prime == 23:
            bank = 3
        elif prime == 31:
            bank = 4
        if bank >= 0:
            pattern_degrees[pattern_offsets[position]] = 1
            slot = full_offsets[position]
            descriptor = bank * 45
            catalog_primes[slot] = index_descriptors[descriptor]
            catalog_e[slot] = index_descriptors[descriptor + 1]
            catalog_f[slot] = index_descriptors[descriptor + 2]
            catalog_inert[slot] = 0
            for coordinate in range(degree):
                catalog_generators[slot * degree + coordinate] = index_descriptors[
                    descriptor + 3 + coordinate
                ]
            for row in range(degree):
                for column in range(degree):
                    catalog_tau[slot * 9 + row * 3 + column] = index_descriptors[
                        descriptor + 6 + column * 3 + row
                    ]
            requested_counts[position] = 1
            written += 1
    kummer_state[3] = written
    if written != kc:
        raise ValueError("row19 generated descriptor count changed")
    pari_selected_ideal_packets(
        basis_table,
        catalog_primes,
        catalog_f,
        catalog_inert,
        catalog_generators,
        degree_state[3],
        selected_indices,
        kc,
        degree,
        packet_generator,
        packet_multiplication,
        packet_work,
        packet_pivots,
        packet_ideal,
        packet_ideals,
        packet_norms,
    )
    pari_selected_ideal_metadata(
        catalog_primes,
        catalog_e,
        catalog_f,
        catalog_inert,
        catalog_tau,
        degree_state[3],
        selected_indices,
        kc,
        degree,
        relation_primes,
        ramification,
        residue_degrees,
        inert_flags,
        selected_tau,
    )
    for index in range(kcz):
        prime = selected_primes[index]
        rational_primes[index] = prime
        rational_offsets[index] = prime_offsets[prime]
        rational_counts[index] = prime_counts[prime]
        rational_complete[index] = complete_groups[prime]
    pari_bad_subfactor_flags(
        rational_offsets,
        rational_counts,
        rational_complete,
        kcz,
        kc,
        bad_flags,
    )
    sub_configuration[0] = pari_subfactor_product(
        degree, real_places, base_configuration[0], c2
    )
    subcount, sublimit, sublimit2 = pari_prepared_subfactor_base(
        packet_norms,
        bad_flags,
        sub_configuration,
        3,
        sub_order,
        sub_scratch,
        sub_stack,
        sub_chosen,
        sub_rejected,
        permutation,
    )
    if subcount != 3:
        raise ValueError("row19 subfactor-base shape changed")
    for index in range(subcount):
        subfactor[index] = permutation[index]
    initial_count = pari_initialize_owned_relations(
        6,
        rational_primes,
        rational_offsets,
        rational_counts,
        rational_complete,
        ramification,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        relation_scratch,
        bad_flags,
        degree,
        relation_generators,
    )
    if initial_count != 71:
        raise ValueError("row19 initial relation count changed")
    analytic_count = len(analytic_primes)
    status = pari_row19_prime_degree_catalog(
        polynomial,
        equation_index,
        analytic_primes,
        analytic_count,
        index_descriptors,
        analytic_workspace,
        analytic_factor_degrees,
        analytic_factor_exponents,
        analytic_group_degrees,
        analytic_group_counts,
        analytic_local_state,
        analytic_offsets,
        analytic_counts,
        analytic_degrees,
        analytic_multiplicities,
        analytic_full_offsets,
        analytic_full_counts,
        analytic_full_degrees,
        analytic_state,
    )
    if status != 0:
        raise ValueError("row19 analytic degree catalog failed")
    root_state[0] = 1
    root_state[1] = c1
    root_state[2] = c2
    root_state[3] = kc
    root_state[4] = kcz
    root_state[5] = kcz2
    root_state[6] = kc2
    root_state[7] = subcount
    root_state[8] = initial_count
    root_state[9] = written
    root_state[10] = sublimit
    root_state[11] = sublimit2
    root_state[12] = degree_state[2]
    root_state[13] = degree_state[3]
    root_state[14] = analytic_state[2]
    root_state[15] = analytic_state[3]
    return kc


__all__ = [
    "pari_row19_phase6_prepared_factor_root",
    "pari_row19_prime_degree_catalog",
]
