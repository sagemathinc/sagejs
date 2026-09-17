"""Resident prepared-nf to generated-catalog initial class candidate.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This fixed field-0 experiment retains prepared nf numerical/basis data and
runtime tables. Catalogs, factor-base policy and analytic hR are produced here.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    native,
    integer_buffer_view,
)
from .prime_degree_catalog import pari_prime_degree_catalog
from .discriminant_log import pari_discriminant_log
from .initial_base import pari_prepared_initial_base
from .initial_kummer_catalog import pari_initial_kummer_catalog
from .pari_random import pari_random_seed
from .selected_ideal_packets import pari_selected_ideal_packets
from .selected_ideal_metadata import pari_selected_ideal_metadata
from .bad_subfactor import pari_bad_subfactor_flags
from .subfactor_product import pari_subfactor_product
from .subfactor_base import pari_prepared_subfactor_base
from .ball_volume import pari_small_norm_scale
from .analytic_class_group_attempt import pari_analytic_class_group_attempt


@native
def pari_resident_generated_class_attempt(
    matrix: IntegerBuffer,
    ideal: IntegerBuffer,
    n: int,
    precision: int,
    reduction: IntegerBuffer,
    vectors: IntegerBuffer,
    betas: IntegerBuffer,
    norms: IntegerBuffer,
    column: IntegerBuffer,
    float_q: Float64Buffer,
    float_v: Float64Buffer,
    bound: Float64Buffer,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    x: Int64Buffer,
    y: Float64Buffer,
    z: Float64Buffer,
    inc: Int64Buffer,
    state: Int64Buffer,
    cursor_output: Int64Buffer,
    element: IntegerBuffer,
    counters: Int64Buffer,
    admission_matrix_m: IntegerBuffer,
    admission_matrix_p: IntegerBuffer,
    admission_matrix_e: IntegerBuffer,
    admission_embedding_m: IntegerBuffer,
    admission_embedding_p: IntegerBuffer,
    admission_embedding_e: IntegerBuffer,
    admission_real_count: int,
    admission_ideal: IntegerBuffer,
    admission_primes: IntegerBuffer,
    admission_products: IntegerBuffer,
    admission_factorlimit: int,
    admission_prime_limit: int,
    admission_rational_factors: IntegerBuffer,
    admission_rational_exponents: IntegerBuffer,
    admission_prime_offsets: IntegerBuffer,
    admission_prime_counts: IntegerBuffer,
    admission_group_tau: IntegerBuffer,
    admission_group_e: IntegerBuffer,
    admission_group_f: IntegerBuffer,
    admission_group_inert: IntegerBuffer,
    admission_tau: IntegerBuffer,
    admission_x: IntegerBuffer,
    admission_y: IntegerBuffer,
    admission_spare: IntegerBuffer,
    admission_stack: IntegerBuffer,
    admission_primitive: IntegerBuffer,
    admission_columns: IntegerBuffer,
    admission_values: IntegerBuffer,
    admission_temporary: IntegerBuffer,
    admission_indices: IntegerBuffer,
    admission_exponents: IntegerBuffer,
    diagnostic: IntegerBuffer,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    relation_primes: IntegerBuffer,
    ramification: IntegerBuffer,
    relation: IntegerBuffer,
    relation_state: IntegerBuffer,
    relation_basis: IntegerBuffer,
    relation_records: IntegerBuffer,
    relation_hashes: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    progress: Int64Buffer,
    preparation_rounded_embedding: IntegerBuffer,
    preparation_embedding: IntegerBuffer,
    preparation_original: IntegerBuffer,
    preparation_basis: IntegerBuffer,
    preparation_transform: IntegerBuffer,
    preparation_flags: IntegerBuffer,
    preparation_rank_diagnostic: IntegerBuffer,
    preparation_selection: IntegerBuffer,
    preparation_stages: IntegerBuffer,
    preparation_flatter_input: IntegerBuffer,
    preparation_current: IntegerBuffer,
    preparation_flatter_transform: IntegerBuffer,
    preparation_total_work: IntegerBuffer,
    preparation_step_t: IntegerBuffer,
    preparation_step_s: IntegerBuffer,
    preparation_product: IntegerBuffer,
    preparation_next_basis: IntegerBuffer,
    preparation_y: IntegerBuffer,
    preparation_diagnostic: IntegerBuffer,
    preparation_r1: IntegerBuffer,
    preparation_r2: IntegerBuffer,
    preparation_r3: IntegerBuffer,
    preparation_t1: IntegerBuffer,
    preparation_t2: IntegerBuffer,
    preparation_t3: IntegerBuffer,
    preparation_integers: IntegerBuffer,
    preparation_inverse: IntegerBuffer,
    preparation_first: IntegerBuffer,
    preparation_second: IntegerBuffer,
    preparation_final: IntegerBuffer,
    preparation_rounded: IntegerBuffer,
    preparation_mu: Float64Buffer,
    preparation_r: Float64Buffer,
    preparation_s: Float64Buffer,
    preparation_approximate: Float64Buffer,
    preparation_exponents: IntegerBuffer,
    preparation_float_gram: Float64Buffer,
    preparation_gram: IntegerBuffer,
    preparation_mu_exponents: IntegerBuffer,
    preparation_r_exponents: IntegerBuffer,
    preparation_s_exponents: IntegerBuffer,
    preparation_alpha: IntegerBuffer,
    preparation_column_exponents: IntegerBuffer,
    preparation_float_scratch: Float64Buffer,
    preparation_temporary: Float64Buffer,
    preparation_state: Int64Buffer,
    search_ideals: IntegerBuffer,
    packet_ids: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    schedule: Int64Buffer,
    basis_table: IntegerBuffer,
    packet_primes: IntegerBuffer,
    packet_generators: IntegerBuffer,
    packet_inert: IntegerBuffer,
    hnf_generator: IntegerBuffer,
    hnf_matrix: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_pivots: IntegerBuffer,
    power_ideal: IntegerBuffer,
    power_alpha: IntegerBuffer,
    power_metadata: IntegerBuffer,
    power_primitive: IntegerBuffer,
    power_temporary: IntegerBuffer,
    power_diagnostic: IntegerBuffer,
    power_multiplication: IntegerBuffer,
    power_work: IntegerBuffer,
    power_triangular: IntegerBuffer,
    power_moduli: IntegerBuffer,
    product_primitive: IntegerBuffer,
    product_matrix: IntegerBuffer,
    outer_state: Int64Buffer,
    outer_minidx: IntegerBuffer,
    outer_present: IntegerBuffer,
    outer_live: IntegerBuffer,
    outer_perm: IntegerBuffer,
    outer_multiplier: IntegerBuffer,
    log_completed: IntegerBuffer,
    log_embeddings: IntegerBuffer,
    log_coordinates: IntegerBuffer,
    log_column: IntegerBuffer,
    log_cache: IntegerBuffer,
    log_pi_cache: IntegerBuffer,
    log_a: IntegerBuffer,
    log_b: IntegerBuffer,
    log_p: IntegerBuffer,
    log_q: IntegerBuffer,
    log_stack: IntegerBuffer,
    initial_primes: IntegerBuffer,
    initial_offsets: IntegerBuffer,
    initial_counts: IntegerBuffer,
    initial_complete: IntegerBuffer,
    hnf_original: Int64Buffer,
    hnf_perm: Int64Buffer,
    hnf_mat: Int64Buffer,
    hnf_dense: IntegerBuffer,
    hnf_transform: IntegerBuffer,
    hnf_vmax: Int64Buffer,
    hnf_found: Int64Buffer,
    hnf_sparse_state: Int64Buffer,
    hnf_bottom: IntegerBuffer,
    hnf_updated_dense: IntegerBuffer,
    hnf_extra: IntegerBuffer,
    hnf_cleanup_state: Int64Buffer,
    hnf_rank_matrix: IntegerBuffer,
    hnf_occupied: IntegerBuffer,
    hnf_rank_pivots: IntegerBuffer,
    hnf_best: IntegerBuffer,
    hnf_profile: IntegerBuffer,
    hnf_rank_state: IntegerBuffer,
    hnf_perm_work: Int64Buffer,
    hnf_matbnew: IntegerBuffer,
    hnf_dep: IntegerBuffer,
    hnf_b: IntegerBuffer,
    hnf_assembly_state: Int64Buffer,
    hnf_transformed_logs: IntegerBuffer,
    hnf_full_h: IntegerBuffer,
    hnf_hnf_transform: IntegerBuffer,
    hnf_lam: IntegerBuffer,
    hnf_d: IntegerBuffer,
    hnf_hnf_state: Int64Buffer,
    hnf_full_dep: IntegerBuffer,
    hnf_work_b: IntegerBuffer,
    hnf_work_c: IntegerBuffer,
    hnf_diagonal: Int64Buffer,
    hnf_result_h: IntegerBuffer,
    hnf_result_dep: IntegerBuffer,
    hnf_result_b: IntegerBuffer,
    hnf_result_c: IntegerBuffer,
    hnf_final_state: Int64Buffer,
    hnf_state: Int64Buffer,
    chain_state: Int64Buffer,
    accept_inverse_hr: IntegerBuffer,
    accept_logs: IntegerBuffer,
    accept_class_number: IntegerBuffer,
    accept_zeta_factor: IntegerBuffer,
    accept_post_hnf_state: Int64Buffer,
    accept_prepared: IntegerBuffer,
    accept_selected: Int64Buffer,
    accept_prep_state: Int64Buffer,
    accept_rank_work: IntegerBuffer,
    accept_rank_occupied: Int64Buffer,
    accept_rank_pivots: Int64Buffer,
    accept_rank_state: Int64Buffer,
    accept_integer_input: IntegerBuffer,
    accept_integer_work: IntegerBuffer,
    accept_integer_occupied: IntegerBuffer,
    accept_integer_pivots: IntegerBuffer,
    accept_integer_best: IntegerBuffer,
    accept_integer_state: IntegerBuffer,
    accept_basis: IntegerBuffer,
    accept_minor: IntegerBuffer,
    accept_det_work: IntegerBuffer,
    accept_det_result: IntegerBuffer,
    accept_det_pivots: Int64Buffer,
    accept_det_state: Int64Buffer,
    accept_inverse_work: IntegerBuffer,
    accept_inverse_rhs: IntegerBuffer,
    accept_inverse: IntegerBuffer,
    accept_inverse_pivots: Int64Buffer,
    accept_inverse_state: Int64Buffer,
    accept_product: IntegerBuffer,
    accept_inverse_slice: IntegerBuffer,
    accept_multiple: IntegerBuffer,
    accept_coordinates: IntegerBuffer,
    accept_multiple_state: Int64Buffer,
    accept_rational_work: IntegerBuffer,
    accept_lattice: IntegerBuffer,
    accept_hnf_work: IntegerBuffer,
    accept_hnf_column: IntegerBuffer,
    accept_hnf_output: IntegerBuffer,
    accept_hnf_state: Int64Buffer,
    accept_regulator: IntegerBuffer,
    accept_relations: IntegerBuffer,
    accept_denominator: IntegerBuffer,
    accept_reconstruction_state: Int64Buffer,
    accept_hnf_row_pivots: Int64Buffer,
    accept_hnf_heights: Int64Buffer,
    accept_acceptance_state: Int64Buffer,
    smith_work: IntegerBuffer,
    smith_column: IntegerBuffer,
    smith_invariants: IntegerBuffer,
    smith_class_number: IntegerBuffer,
    smith_state: Int64Buffer,
    class_invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    attempt_state: Int64Buffer,
    hnf_cup_arena: IntegerBuffer,
    hnf_cup_frames: IntegerBuffer,
    hnf_cup_solve_state: Int64Buffer,
    hnf_cup_state: Int64Buffer,
    analytic_discriminant: int,
    analytic_roots_of_unity: int,
    analytic_log_discriminant: Float64Buffer,
    analytic_primes: IntegerBuffer,
    analytic_offsets: IntegerBuffer,
    analytic_counts: IntegerBuffer,
    analytic_degrees: IntegerBuffer,
    analytic_multiplicities: IntegerBuffer,
    analytic_coefficients: Float64Buffer,
    analytic_table: Float64Buffer,
    analytic_tail: Float64Buffer,
    analytic_logarithms: Float64Buffer,
    analytic_log_inverse_residue: Float64Buffer,
    analytic_inverse_residue: IntegerBuffer,
    analytic_exp_cache: IntegerBuffer,
    analytic_pi_cache: IntegerBuffer,
    analytic_a: IntegerBuffer,
    analytic_b: IntegerBuffer,
    analytic_p: IntegerBuffer,
    analytic_q: IntegerBuffer,
    analytic_stack: IntegerBuffer,
    analytic_state: Int64Buffer,
    prep_polynomial: IntegerBuffer,
    prep_invzk: IntegerBuffer,
    prep_zk: IntegerBuffer,
    prep_zk_degrees: IntegerBuffer,
    prep_index: int,
    prep_zkden: int,
    prep_degree_workspace: IntegerBuffer,
    prep_factor_degrees: IntegerBuffer,
    prep_factor_exponents: IntegerBuffer,
    prep_group_degrees: IntegerBuffer,
    prep_group_counts: IntegerBuffer,
    prep_local_state: IntegerBuffer,
    prep_degree_state: IntegerBuffer,
    prep_full_offsets: IntegerBuffer,
    prep_full_counts: IntegerBuffer,
    prep_full_degrees: IntegerBuffer,
    prep_base_norms: IntegerBuffer,
    prep_selected_primes: IntegerBuffer,
    prep_prime_offsets: IntegerBuffer,
    prep_prime_counts: IntegerBuffer,
    prep_complete_groups: IntegerBuffer,
    prep_selected_indices: IntegerBuffer,
    prep_base_state: IntegerBuffer,
    prep_bad: IntegerBuffer,
    prep_sub_order: IntegerBuffer,
    prep_sub_scratch: IntegerBuffer,
    prep_sub_stack: IntegerBuffer,
    prep_sub_chosen: IntegerBuffer,
    prep_sub_rejected: IntegerBuffer,
    prep_sub_state: IntegerBuffer,
    prep_state: IntegerBuffer,
    prep_base_configuration: Float64Buffer,
    prep_base_constants_logs: Float64Buffer,
    prep_base_sums: Float64Buffer,
    prep_base_factor_logs: Float64Buffer,
    prep_sub_configuration: Float64Buffer,
    prep_kummer_random_state: IntegerBuffer,
    prep_kummer_factorwork: IntegerBuffer,
    prep_kummer_factor: IntegerBuffer,
    prep_kummer_diagnostic: IntegerBuffer,
    prep_kummer_minpoly_diagnostic: IntegerBuffer,
    prep_kummer_polywork: IntegerBuffer,
    prep_kummer_u: IntegerBuffer,
    prep_kummer_t: IntegerBuffer,
    prep_kummer_rational: IntegerBuffer,
    prep_kummer_primitive: IntegerBuffer,
    prep_kummer_column: IntegerBuffer,
    prep_kummer_resultant_work: IntegerBuffer,
    prep_kummer_resultant_trace: IntegerBuffer,
    prep_kummer_u_output: IntegerBuffer,
    prep_kummer_tau_output: IntegerBuffer,
    prep_kummer_descriptor_state: IntegerBuffer,
    prep_kummer_unsorted: IntegerBuffer,
    prep_kummer_generators: IntegerBuffer,
    prep_kummer_residue_degrees: IntegerBuffer,
    prep_kummer_order: IntegerBuffer,
    prep_kummer_sort_diagnostic: IntegerBuffer,
    prep_kummer_decomposition_output: IntegerBuffer,
    prep_kummer_decomposition_state: IntegerBuffer,
    prep_kummer_catalog_primes: IntegerBuffer,
    prep_kummer_catalog_e: IntegerBuffer,
    prep_kummer_catalog_f: IntegerBuffer,
    prep_kummer_catalog_inert: IntegerBuffer,
    prep_kummer_catalog_generators: IntegerBuffer,
    prep_kummer_catalog_tau: IntegerBuffer,
    prep_kummer_requested_counts: IntegerBuffer,
    prep_kummer_state: IntegerBuffer,
) -> int:
    """Generate every initial catalog/policy inside one translated entry.

    All owners are externally preallocated and initially zero except prepared
    nf/runtime inputs. No initial class, relation, ideal or policy answer is
    consumed. Backing capacity is not logical length: borrowed exact prefixes
    are constructed from generated KC/KCZ. Owners must be disjoint, except the
    internal views and their backing owners, which are used sequentially.

    This entry is explicitly restricted to a prepared totally real cubic.
    No general automorphism/cyclotomic-unit prelude, retry or honesty branch is
    implemented. Eager degree-cache fill and analytic preparation ordering are
    diagnostic boundaries, not a claim of full Buchall scheduling parity.

    prep_state=[phase,action,KC,KCZ,subfactor_count,groups,factors,descriptors].
    Exceptions after initial guards leave a partial attempt and publication=0;
    terminal repeats inspect only attempt_state and never rebuild preparation.
    """
    if len(attempt_state) < 4:
        raise ValueError("short resident generated attempt state")
    if attempt_state[0] == 4:
        return int(attempt_state[1])
    if attempt_state[0] != 0:
        raise ValueError("cannot reuse a partial resident generated attempt")
    if len(chain_state) < 4 or chain_state[0] != 0:
        raise ValueError("resident generated attempt requires fresh relation stage")
    if len(class_number) < 1 or len(prep_state) < 8:
        raise ValueError("short resident generated result/state owner")
    if prep_state[0] != 0:
        raise ValueError("cannot reuse a partial resident preparation")
    if n != 3 or admission_real_count != 3 or precision != 192:
        raise ValueError("resident generated fixed real cubic frontier")
    if len(prep_polynomial) != 4:
        raise ValueError("resident generated cubic polynomial shape")
    pa0 = prep_polynomial[0]
    pa1 = prep_polynomial[1]
    pa2 = prep_polynomial[2]
    pa3 = prep_polynomial[3]
    derived_discriminant = (
        pa2 * pa2 * pa1 * pa1
        - 4 * pa3 * pa1 * pa1 * pa1
        - 4 * pa2 * pa2 * pa2 * pa0
        - 27 * pa3 * pa3 * pa0 * pa0
        + 18 * pa3 * pa2 * pa1 * pa0
    )
    if (
        prep_index < 1
        or pa3 != 1
        or derived_discriminant <= 0
        or analytic_discriminant * prep_index * prep_index != derived_discriminant
        or analytic_roots_of_unity != 2
    ):
        raise ValueError("resident generated real-cubic metadata frontier")
    if (
        len(prep_base_configuration) < 3
        or len(prep_base_state) < 7
        or len(prep_sub_configuration) < 1
        or len(prep_sub_state) < 3
    ):
        raise ValueError("short resident generated policy owner")
    attempt_state[0] = 1
    attempt_state[1] = -1
    attempt_state[2] = 0
    attempt_state[3] = 0
    for i in range(8):
        prep_state[i] = 0
    prep_state[0] = 1
    prime_count = int(len(analytic_primes))
    status = pari_prime_degree_catalog(
        prep_polynomial,
        n,
        prep_index,
        analytic_primes,
        prime_count,
        prep_degree_workspace,
        prep_factor_degrees,
        prep_factor_exponents,
        prep_group_degrees,
        prep_group_counts,
        prep_local_state,
        analytic_offsets,
        analytic_counts,
        analytic_degrees,
        analytic_multiplicities,
        prep_full_offsets,
        prep_full_counts,
        prep_full_degrees,
        prep_degree_state,
    )
    if status != 0:
        raise ValueError("resident degree catalog frontier")
    prep_state[5] = prep_degree_state[2]
    prep_state[6] = prep_degree_state[3]
    prep_state[0] = 2
    logd = pari_discriminant_log(analytic_discriminant)
    prep_base_configuration[0] = logd
    prep_base_configuration[1] = 0.0
    prep_base_configuration[2] = 0.0
    c1, c2, kc, kcz, kcz2, kc2, product = pari_prepared_initial_base(
        n,
        admission_real_count,
        prep_base_configuration,
        analytic_primes,
        analytic_offsets,
        analytic_counts,
        analytic_degrees,
        analytic_multiplicities,
        prep_full_offsets,
        prep_full_counts,
        prep_full_degrees,
        prep_base_norms,
        prep_base_constants_logs,
        prep_base_sums,
        prep_base_factor_logs,
        prep_selected_primes,
        prep_prime_offsets,
        prep_prime_counts,
        prep_complete_groups,
        prep_selected_indices,
    )
    prep_base_state[0] = c1
    prep_base_state[1] = c2
    prep_base_state[2] = kc
    prep_base_state[3] = kcz
    prep_base_state[4] = kcz2
    prep_base_state[5] = kc2
    prep_base_state[6] = product
    prep_state[2] = kc
    prep_state[3] = kcz
    if kcz != kcz2:
        raise ValueError("resident initial honesty dispatch frontier")
    if len(class_invariants) < kc:
        raise ValueError("short resident class invariant backing owner")
    prep_state[0] = 3
    pari_random_seed(prep_kummer_random_state, 1)
    written = pari_initial_kummer_catalog(
        analytic_primes,
        analytic_offsets,
        analytic_counts,
        analytic_degrees,
        analytic_multiplicities,
        prep_full_offsets,
        prime_count,
        c2,
        prep_polynomial,
        prep_invzk,
        prep_zk,
        prep_zk_degrees,
        basis_table,
        n,
        prep_index,
        prep_zkden,
        prep_kummer_random_state,
        prep_kummer_factorwork,
        prep_kummer_factor,
        prep_kummer_diagnostic,
        prep_kummer_minpoly_diagnostic,
        prep_kummer_polywork,
        prep_kummer_u,
        prep_kummer_t,
        prep_kummer_rational,
        prep_kummer_primitive,
        prep_kummer_column,
        prep_kummer_resultant_work,
        prep_kummer_resultant_trace,
        prep_kummer_u_output,
        prep_kummer_tau_output,
        prep_kummer_descriptor_state,
        prep_kummer_unsorted,
        prep_kummer_generators,
        prep_kummer_residue_degrees,
        prep_kummer_order,
        prep_kummer_sort_diagnostic,
        prep_kummer_decomposition_output,
        prep_kummer_decomposition_state,
        prep_kummer_catalog_primes,
        prep_kummer_catalog_e,
        prep_kummer_catalog_f,
        prep_kummer_catalog_inert,
        prep_kummer_catalog_generators,
        prep_kummer_catalog_tau,
        prep_kummer_requested_counts,
        prep_kummer_state,
    )
    if written != kc:
        raise ValueError("resident selected descriptor count mismatch")
    prep_state[7] = written
    prep_state[0] = 4
    catalog_count = int(prep_degree_state[3])
    pari_selected_ideal_packets(
        basis_table,
        prep_kummer_catalog_primes,
        prep_kummer_catalog_f,
        prep_kummer_catalog_inert,
        prep_kummer_catalog_generators,
        catalog_count,
        prep_selected_indices,
        kc,
        n,
        hnf_generator,
        hnf_matrix,
        hnf_work,
        hnf_pivots,
        admission_ideal,
        packet_ideals,
        packet_norms,
    )
    pari_selected_ideal_metadata(
        prep_kummer_catalog_primes,
        prep_kummer_catalog_e,
        prep_kummer_catalog_f,
        prep_kummer_catalog_inert,
        prep_kummer_catalog_tau,
        catalog_count,
        prep_selected_indices,
        kc,
        n,
        relation_primes,
        admission_group_e,
        admission_group_f,
        admission_group_inert,
        admission_group_tau,
    )
    if (
        len(initial_primes) < kcz
        or len(initial_offsets) < kcz
        or len(initial_counts) < kcz
        or len(initial_complete) < kcz
    ):
        raise ValueError("short resident active prime group owners")
    if len(admission_prime_offsets) <= c2 or len(admission_prime_counts) <= c2:
        raise ValueError("short resident dense prime index owners")
    if (
        len(packet_ids) < kc
        or len(ramification) < kc
        or len(search_ideals) < kc
        or len(hnf_perm) < kc
    ):
        raise ValueError("short resident selected logical owners")
    for i in range(c2 + 1):
        admission_prime_offsets[i] = -1
        admission_prime_counts[i] = 0
    for i in range(kcz):
        prime = prep_selected_primes[i]
        initial_primes[i] = prime
        initial_offsets[i] = prep_prime_offsets[prime]
        initial_counts[i] = prep_prime_counts[prime]
        initial_complete[i] = prep_complete_groups[prime]
        admission_prime_offsets[prime] = prep_prime_offsets[prime]
        admission_prime_counts[prime] = prep_prime_counts[prime]
    for i in range(kc):
        packet_ids[i] = i + 1
        ramification[i] = admission_group_e[i]
    initial_primes_view: IntegerBuffer = integer_buffer_view(initial_primes, 0, kcz)
    initial_offsets_view: IntegerBuffer = integer_buffer_view(initial_offsets, 0, kcz)
    initial_counts_view: IntegerBuffer = integer_buffer_view(initial_counts, 0, kcz)
    initial_complete_view: IntegerBuffer = integer_buffer_view(initial_complete, 0, kcz)
    packet_ids_view: IntegerBuffer = integer_buffer_view(packet_ids, 0, kc)
    packet_norms_view: IntegerBuffer = integer_buffer_view(packet_norms, 0, kc)
    ramification_view: IntegerBuffer = integer_buffer_view(ramification, 0, kc)
    relation_primes_view: IntegerBuffer = integer_buffer_view(relation_primes, 0, kc)
    admission_group_f_view: IntegerBuffer = integer_buffer_view(
        admission_group_f, 0, kc
    )
    relation_view: IntegerBuffer = integer_buffer_view(relation, 0, kc)
    bad_view: IntegerBuffer = integer_buffer_view(prep_bad, 0, kc)
    prep_state[0] = 5
    pari_bad_subfactor_flags(
        initial_offsets_view,
        initial_counts_view,
        initial_complete_view,
        kcz,
        kc,
        prep_bad,
    )
    prep_sub_configuration[0] = pari_subfactor_product(n, 0, logd, c2)
    subcount, sublimit, sublimit2 = pari_prepared_subfactor_base(
        packet_norms_view,
        bad_view,
        prep_sub_configuration,
        3,
        prep_sub_order,
        prep_sub_scratch,
        prep_sub_stack,
        prep_sub_chosen,
        prep_sub_rejected,
        search_ideals,
    )
    prep_sub_state[0] = subcount
    prep_sub_state[1] = sublimit
    prep_sub_state[2] = sublimit2
    prep_state[4] = subcount
    for i in range(kc):
        hnf_perm[i] = search_ideals[i]
    scale = pari_small_norm_scale(n)
    additional = 5 + (n + admission_real_count) // 2 - 1
    target = kc + additional
    prep_state[0] = 6
    attempt_state[0] = 0
    action = pari_analytic_class_group_attempt(
        matrix,
        ideal,
        n,
        precision,
        scale,
        1,
        reduction,
        vectors,
        betas,
        norms,
        column,
        float_q,
        float_v,
        bound,
        cache,
        a,
        b,
        p,
        q,
        stack,
        x,
        y,
        z,
        inc,
        state,
        cursor_output,
        element,
        counters,
        admission_matrix_m,
        admission_matrix_p,
        admission_matrix_e,
        admission_embedding_m,
        admission_embedding_p,
        admission_embedding_e,
        admission_real_count,
        admission_ideal,
        2,
        product,
        admission_primes,
        admission_products,
        admission_factorlimit,
        admission_prime_limit,
        admission_rational_factors,
        admission_rational_exponents,
        admission_prime_offsets,
        admission_prime_counts,
        admission_group_tau,
        admission_group_e,
        admission_group_f_view,
        admission_group_inert,
        admission_tau,
        admission_x,
        admission_y,
        admission_spare,
        admission_stack,
        admission_primitive,
        admission_columns,
        admission_values,
        admission_temporary,
        admission_indices,
        admission_exponents,
        diagnostic,
        4,
        1,
        0,
        0,
        subfactor,
        extra,
        -1,
        relation_primes_view,
        ramification_view,
        relation_view,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        relation_scratch,
        generators,
        progress,
        preparation_rounded_embedding,
        preparation_embedding,
        preparation_original,
        preparation_basis,
        preparation_transform,
        preparation_flags,
        preparation_rank_diagnostic,
        preparation_selection,
        preparation_stages,
        preparation_flatter_input,
        preparation_current,
        preparation_flatter_transform,
        preparation_total_work,
        preparation_step_t,
        preparation_step_s,
        preparation_product,
        preparation_next_basis,
        preparation_y,
        preparation_diagnostic,
        preparation_r1,
        preparation_r2,
        preparation_r3,
        preparation_t1,
        preparation_t2,
        preparation_t3,
        preparation_integers,
        preparation_inverse,
        preparation_first,
        preparation_second,
        preparation_final,
        preparation_rounded,
        preparation_mu,
        preparation_r,
        preparation_s,
        preparation_approximate,
        preparation_exponents,
        preparation_float_gram,
        preparation_gram,
        preparation_mu_exponents,
        preparation_r_exponents,
        preparation_s_exponents,
        preparation_alpha,
        preparation_column_exponents,
        preparation_float_scratch,
        preparation_temporary,
        preparation_state,
        search_ideals,
        kc,
        packet_ids_view,
        packet_ideals,
        packet_norms_view,
        schedule,
        0,
        basis_table,
        packet_primes,
        packet_generators,
        packet_inert,
        hnf_generator,
        hnf_matrix,
        hnf_work,
        hnf_pivots,
        power_ideal,
        power_alpha,
        power_metadata,
        power_primitive,
        power_temporary,
        power_diagnostic,
        power_multiplication,
        power_work,
        power_triangular,
        power_moduli,
        product_primitive,
        product_matrix,
        0,
        0,
        outer_state,
        outer_minidx,
        outer_present,
        outer_live,
        outer_perm,
        outer_multiplier,
        precision,
        log_completed,
        log_embeddings,
        log_coordinates,
        log_column,
        log_cache,
        log_pi_cache,
        log_a,
        log_b,
        log_p,
        log_q,
        log_stack,
        additional,
        target,
        initial_primes_view,
        initial_offsets_view,
        initial_counts_view,
        initial_complete_view,
        subcount,
        hnf_original,
        hnf_perm,
        hnf_mat,
        hnf_dense,
        hnf_transform,
        hnf_vmax,
        hnf_found,
        hnf_sparse_state,
        hnf_bottom,
        hnf_updated_dense,
        hnf_extra,
        hnf_cleanup_state,
        hnf_rank_matrix,
        hnf_occupied,
        hnf_rank_pivots,
        hnf_best,
        hnf_profile,
        hnf_rank_state,
        hnf_perm_work,
        hnf_matbnew,
        hnf_dep,
        hnf_b,
        hnf_assembly_state,
        hnf_transformed_logs,
        hnf_full_h,
        hnf_hnf_transform,
        hnf_lam,
        hnf_d,
        hnf_hnf_state,
        hnf_full_dep,
        hnf_work_b,
        hnf_work_c,
        hnf_diagonal,
        hnf_result_h,
        hnf_result_dep,
        hnf_result_b,
        hnf_result_c,
        hnf_final_state,
        hnf_state,
        chain_state,
        accept_inverse_hr,
        accept_logs,
        accept_class_number,
        accept_zeta_factor,
        accept_post_hnf_state,
        accept_prepared,
        accept_selected,
        accept_prep_state,
        accept_rank_work,
        accept_rank_occupied,
        accept_rank_pivots,
        accept_rank_state,
        accept_integer_input,
        accept_integer_work,
        accept_integer_occupied,
        accept_integer_pivots,
        accept_integer_best,
        accept_integer_state,
        accept_basis,
        accept_minor,
        accept_det_work,
        accept_det_result,
        accept_det_pivots,
        accept_det_state,
        accept_inverse_work,
        accept_inverse_rhs,
        accept_inverse,
        accept_inverse_pivots,
        accept_inverse_state,
        accept_product,
        accept_inverse_slice,
        accept_multiple,
        accept_coordinates,
        accept_multiple_state,
        accept_rational_work,
        accept_lattice,
        accept_hnf_work,
        accept_hnf_column,
        accept_hnf_output,
        accept_hnf_state,
        accept_regulator,
        accept_relations,
        accept_denominator,
        accept_reconstruction_state,
        accept_hnf_row_pivots,
        accept_hnf_heights,
        True,
        accept_acceptance_state,
        smith_work,
        smith_column,
        smith_invariants,
        smith_class_number,
        smith_state,
        class_invariants,
        class_number,
        attempt_state,
        hnf_cup_arena,
        hnf_cup_frames,
        hnf_cup_solve_state,
        hnf_cup_state,
        analytic_discriminant,
        analytic_roots_of_unity,
        analytic_log_discriminant,
        analytic_primes,
        analytic_offsets,
        analytic_counts,
        analytic_degrees,
        analytic_multiplicities,
        analytic_coefficients,
        analytic_table,
        analytic_tail,
        analytic_logarithms,
        analytic_log_inverse_residue,
        analytic_inverse_residue,
        analytic_exp_cache,
        analytic_pi_cache,
        analytic_a,
        analytic_b,
        analytic_p,
        analytic_q,
        analytic_stack,
        analytic_state,
    )
    prep_state[0] = 7
    prep_state[1] = action
    return action
