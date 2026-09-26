"""Prepared row-11 factor base and rational-relation root.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This deliberately narrow root connects the translated PARI 2.17.4 C1/C2,
`FBgen`, `subFBgen` and `init_rel` prefix.  It accepts only prepared
number-field data and a neutral runtime prime table.  In particular, no
factor-base descriptor, successful bound, RNG snapshot, relation, or schedule
answer is an input.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, integer_buffer_view, native

from .bad_subfactor import pari_bad_subfactor_flags
from .discriminant_log import pari_discriminant_log
from .initial_base import pari_prepared_initial_base
from .initial_kummer_catalog import pari_initial_kummer_catalog
from .pari_random import pari_random_seed
from .prime_degree_catalog import pari_prime_degree_catalog
from .relation_insertion import pari_initialize_owned_relations
from .selected_ideal_metadata import pari_selected_ideal_metadata
from .selected_ideal_packets import pari_selected_ideal_packets
from .subfactor_base import pari_prepared_subfactor_base
from .subfactor_product import pari_subfactor_product


# Public admission policy for this experimental root.  It is a power-of-two
# ceiling fixed independently of the field's computed factor-base size.
# Logical views are derived only after that size is known inside the call.
ROW11_PREPARED_MAX_IDEALS = 1024
ROW11_PREPARED_MAX_ADDITIONAL = 16


@native
def pari_row11_prepared_initial_root(
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
    runtime_primes: IntegerBuffer,
    runtime_products: IntegerBuffer,
    factor_limit: int,
    prime_limit: int,
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
    relation: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_generators: IntegerBuffer,
    root_state: IntegerBuffer,
) -> int:
    """Compute the row-11 prepared prefix through its 24 rational relations.

    `root_state` is published only on success and then contains

    `[1, C1, C2, KC, KCZ, KCZ2, KC2, subcount, written, initial_count,
    target, need, Nrelid, missing, search_count, automorphism_count,
    factor_limit, prime_limit]`.

    A nonzero preexisting publication is rejected.  Partial failures retain a
    negative phase in slot zero and are never valid owners.
    """
    degree = 4
    if len(root_state) < 18 or root_state[0] != 0:
        raise ValueError("row11 prepared root requires a fresh state owner")
    # This is the explicit fail-closed replacement for the still-untranslated
    # general automorphism/minidx corridor.
    row11 = (
        len(polynomial) == 5
        and polynomial[0] == -2000018
        and polynomial[1] == -2000010
        and polynomial[2] == 0
        and polynomial[3] == 0
        and polynomial[4] == 1
        and discriminant == -432010688120096713665762992
    )
    if (
        not row11
        or real_places != 2
        or complex_pairs != 1
        or precision != 192
        or equation_index != 1
        or roots_of_unity != 2
        or zkden != 1
        or factor_limit != 1048576
        or prime_limit != 65537
    ):
        raise ValueError("unsupported row11 prepared field corridor")
    prime_count = int(len(runtime_primes))
    if (
        prime_count < 1
        or runtime_primes[prime_count - 1] != prime_limit
        or len(runtime_products) < 1
    ):
        raise ValueError("row11 root requires the neutral complete prime prefix")
    if len(base_state) < 7 or len(root_state) < 18:
        raise ValueError("short row11 prepared policy state")
    if (
        len(relation) < ROW11_PREPARED_MAX_IDEALS
        or len(relation_scratch) < ROW11_PREPARED_MAX_IDEALS
        or len(relation_basis) < ROW11_PREPARED_MAX_IDEALS * ROW11_PREPARED_MAX_IDEALS
    ):
        raise ValueError("short row11 neutral relation admission owners")
    maximum_records = (
        10 * (ROW11_PREPARED_MAX_IDEALS + ROW11_PREPARED_MAX_ADDITIONAL) + 50
    )
    if (
        len(relation_records) < maximum_records * ROW11_PREPARED_MAX_IDEALS
        or len(relation_hashes) < maximum_records
        or len(relation_metadata) < maximum_records * 3
        or len(relation_generators) < maximum_records * degree
    ):
        raise ValueError("short row11 neutral relation record owners")

    root_state[0] = -1
    status = pari_prime_degree_catalog(
        polynomial,
        degree,
        equation_index,
        runtime_primes,
        prime_count,
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
        raise ValueError("row11 degree catalog failed")

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
        raise ValueError("row11 unequal-bound honesty corridor is unsupported")
    if kc < 1 or kc > ROW11_PREPARED_MAX_IDEALS:
        raise ValueError("row11 factor base exceeds public admission ceiling")

    root_state[0] = -3
    pari_random_seed(random_state, 1)
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
    if written != kc:
        raise ValueError("row11 generated descriptor count mismatch")

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
        raise ValueError("short row11 active prime group owners")
    for i in range(kcz):
        prime = selected_primes[i]
        initial_primes[i] = prime
        initial_offsets[i] = prime_offsets[prime]
        initial_counts[i] = prime_counts[prime]
        initial_complete[i] = complete_groups[prime]
    initial_primes_view: IntegerBuffer = integer_buffer_view(initial_primes, 0, kcz)
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
        raise ValueError("short row11 subfactor/minidx owner")
    for i in range(subcount):
        subfactor[i] = permutation[i]
    for i in range(kc):
        # Authenticated row-11 specialization: no nontrivial automorphism.
        minidx[i] = i + 1

    root_state[0] = -6
    unit_rank = real_places + complex_pairs - 1
    additional = 5 + unit_rank
    if additional > ROW11_PREPARED_MAX_ADDITIONAL:
        raise ValueError("row11 relation surplus exceeds public admission ceiling")
    target = kc + additional
    capacity = 10 * target + 50
    relation_view: IntegerBuffer = integer_buffer_view(relation, 0, kc)
    relation_scratch_view: IntegerBuffer = integer_buffer_view(relation_scratch, 0, kc)
    relation_basis_view: IntegerBuffer = integer_buffer_view(relation_basis, 0, kc * kc)
    relation_records_view: IntegerBuffer = integer_buffer_view(
        relation_records, 0, capacity * kc
    )
    relation_hashes_view: IntegerBuffer = integer_buffer_view(
        relation_hashes, 0, capacity
    )
    relation_metadata_view: IntegerBuffer = integer_buffer_view(
        relation_metadata, 0, capacity * 3
    )
    relation_generators_view: IntegerBuffer = integer_buffer_view(
        relation_generators, 0, capacity * degree
    )
    initial_count = pari_initialize_owned_relations(
        additional,
        initial_primes_view,
        initial_offsets_view,
        initial_counts_view,
        initial_complete_view,
        ramification_view,
        relation_state,
        relation_basis_view,
        relation_records_view,
        relation_hashes_view,
        relation_metadata_view,
        relation_view,
        relation_scratch_view,
        degree,
        relation_generators_view,
    )
    need = target - initial_count
    nrelid = subcount
    missing = relation_state[2]

    root_state[1] = c1
    root_state[2] = c2
    root_state[3] = kc
    root_state[4] = kcz
    root_state[5] = kcz2
    root_state[6] = kc2
    root_state[7] = subcount
    root_state[8] = written
    root_state[9] = initial_count
    root_state[10] = target
    root_state[11] = need
    root_state[12] = nrelid
    root_state[13] = missing
    root_state[14] = kc
    root_state[15] = 0
    root_state[16] = factor_limit
    root_state[17] = prime_limit
    root_state[0] = 1
    return initial_count
