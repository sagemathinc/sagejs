"""One-call prepared cubic class/unit computation with internal publication.

This experimental root keeps the live candidate, exact class witness, live
precision retry, exact real-cubic torsion, and fixed-shape result publication
in one native ABI.  It establishes internal correspondence for the prepared
`h = 1` sentinel, but deliberately does not claim public completion: general
saturation and a stable public result contract remain outside this experiment.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .live_h1_class_witness_suffix import pari_live_h1_class_witness_suffix
from .unified_full_h1_root import pari_live_retrying_h1_suffix
from .unified_live_h1_root import pari_unified_live_h1_root


MISSING_LIVE_PRECISION_SUFFIX = 4
INVALID_LIVE_DIMENSIONS = 5


@native
def pari_authenticate_h1_live_dimensions(
    unified_state: Int64Buffer,
    bridge_state: Int64Buffer,
    hnf_state: Int64Buffer,
    hnf_assembly_state: Int64Buffer,
) -> int:
    """Authenticate the logical shapes produced by the resident prefix.

    No successful-field dimension is an argument.  The equalities below bind
    the assembly's active relation block to the independently published HNF,
    bridge, and unified-prefix states.  A caller may allocate larger backing
    buffers, but padding cannot become a logical matrix dimension.
    """
    if (
        len(unified_state) < 12
        or len(bridge_state) < 16
        or len(hnf_state) < 9
        or len(hnf_assembly_state) < 6
    ):
        raise ValueError("short h1 dimension authority")
    relation_count = hnf_state[7]
    class_rows = hnf_assembly_state[0]
    dependent_rows = hnf_assembly_state[1]
    active_columns = hnf_assembly_state[2]
    b_rows = hnf_assembly_state[3]
    deferred_columns = hnf_assembly_state[4]
    compact_factor_count = hnf_state[1]
    if (
        unified_state[0] != 0
        or unified_state[3] != 1
        or bridge_state[0] != 0
        or hnf_state[0] != 0
        or relation_count < 1
        or class_rows < 1
        or dependent_rows < 0
        or active_columns < class_rows
        or deferred_columns < 0
        or compact_factor_count < 1
        or hnf_assembly_state[5] != 0
        or class_rows + dependent_rows != hnf_state[5]
        or b_rows != hnf_state[5]
        or active_columns + deferred_columns != relation_count
        or hnf_state[2] + compact_factor_count != relation_count
        or bridge_state[5] != compact_factor_count
        or bridge_state[8] != relation_count
        or bridge_state[9] != hnf_state[5]
        or bridge_state[12] != 2
        or bridge_state[13] != compact_factor_count
        or unified_state[5] != compact_factor_count
        or unified_state[6] != relation_count
        or unified_state[7] != hnf_state[5]
        or unified_state[10] != bridge_state[12]
        or unified_state[11] != compact_factor_count
    ):
        return 1
    return 0


@native
def pari_exact_real_cubic_torsion(
    polynomial: IntegerBuffer,
    torsion_order: IntegerBuffer,
    torsion_generator: IntegerBuffer,
    torsion_state: Int64Buffer,
) -> int:
    """Derive `mu(K) = {+1, -1}` from an irreducible real cubic.

    `torsion_state` is status, degree, positive-discriminant flag, tested
    rational roots, torsion order, and transactional publication flag.
    Component outputs are written only after every exact check succeeds.
    """
    if (
        len(polynomial) < 4
        or len(torsion_order) < 1
        or len(torsion_generator) < 3
        or len(torsion_state) < 6
    ):
        raise ValueError("short real-cubic torsion owner")
    a0 = polynomial[0]
    a1 = polynomial[1]
    a2 = polynomial[2]
    a3 = polynomial[3]
    if a3 != 1 or a0 == 0:
        return 1
    discriminant = (
        a2 * a2 * a1 * a1
        - 4 * a3 * a1 * a1 * a1
        - 4 * a2 * a2 * a2 * a0
        - 27 * a3 * a3 * a0 * a0
        + 18 * a3 * a2 * a1 * a0
    )
    if discriminant <= 0:
        return 2
    constant = a0
    if constant < 0:
        constant = -constant
    if constant > 1000000000000:
        return 3
    divisor = 1
    tested = 0
    while divisor * divisor <= constant:
        if constant % divisor == 0:
            positive = ((divisor + a2) * divisor + a1) * divisor + a0
            negative = ((-divisor + a2) * -divisor + a1) * -divisor + a0
            tested += 2
            if positive == 0 or negative == 0:
                return 4
            quotient = constant // divisor
            if quotient != divisor:
                positive = ((quotient + a2) * quotient + a1) * quotient + a0
                negative = ((-quotient + a2) * -quotient + a1) * -quotient + a0
                tested += 2
                if positive == 0 or negative == 0:
                    return 4
        divisor += 1

    # A positive cubic discriminant gives a real embedding.  Roots of unity
    # inject into R, hence are +/-1.  The exact element -1 has order two and,
    # in odd degree, norm -1.
    torsion_order[0] = 2
    torsion_generator[0] = -1
    torsion_generator[1] = 0
    torsion_generator[2] = 0
    torsion_state[0] = 0
    torsion_state[1] = 3
    torsion_state[2] = 1
    torsion_state[3] = tested
    torsion_state[4] = 2
    torsion_state[5] = 1
    return 0


@native
def pari_unified_complete_h1_root(
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
    unified_state: Int64Buffer,
    unit_transform: IntegerBuffer,
    getfu_factor: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    cleaned_arch: IntegerBuffer,
    bridge_state: Int64Buffer,
    u1: IntegerBuffer,
    u2: IntegerBuffer,
    first_arch: IntegerBuffer,
    p_triples: IntegerBuffer,
    au: IntegerBuffer,
    clean_logs: IntegerBuffer,
    signs: Int64Buffer,
    unit_state: Int64Buffer,
    unit_trace: Float64Buffer,
    integer_state: IntegerBuffer,
    integer_basis: IntegerBuffer,
    integer_transform: IntegerBuffer,
    integer_gram: IntegerBuffer,
    integer_mu: Float64Buffer,
    integer_mu_exponents: IntegerBuffer,
    integer_r: Float64Buffer,
    integer_r_exponents: IntegerBuffer,
    integer_s: Float64Buffer,
    integer_s_exponents: IntegerBuffer,
    integer_approximate: Float64Buffer,
    integer_float_gram: Float64Buffer,
    integer_alpha: IntegerBuffer,
    integer_column: IntegerBuffer,
    integer_column_exponents: IntegerBuffer,
    integer_normalized: Float64Buffer,
    integer_temporary: Float64Buffer,
    integer_dpe_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    real_integers: IntegerBuffer,
    real_form: IntegerBuffer,
    real_basis: IntegerBuffer,
    real_transform: IntegerBuffer,
    real_gram: IntegerBuffer,
    real_mu: Float64Buffer,
    real_mu_exponents: IntegerBuffer,
    real_r: Float64Buffer,
    real_r_exponents: IntegerBuffer,
    real_s: Float64Buffer,
    real_s_exponents: IntegerBuffer,
    real_approximate: Float64Buffer,
    real_float_gram: Float64Buffer,
    real_alpha: IntegerBuffer,
    real_column: IntegerBuffer,
    real_column_exponents: IntegerBuffer,
    real_normalized: Float64Buffer,
    real_temporary: Float64Buffer,
    real_dpe_scratch: Float64Buffer,
    real_scratch: IntegerBuffer,
    real_state: IntegerBuffer,
    factor_matep: IntegerBuffer,
    factor_basis: IntegerBuffer,
    factor_transform: IntegerBuffer,
    factor_state: Int64Buffer,
    factor_mu: Float64Buffer,
    factor_mu_exponents: IntegerBuffer,
    factor_r: Float64Buffer,
    factor_r_exponents: IntegerBuffer,
    factor_s: Float64Buffer,
    factor_s_exponents: IntegerBuffer,
    factor_approximate: Float64Buffer,
    factor_float_gram: Float64Buffer,
    factor_alpha: IntegerBuffer,
    factor_column: IntegerBuffer,
    factor_column_exponents: IntegerBuffer,
    factor_normalized: Float64Buffer,
    factor_temporary: Float64Buffer,
    factor_exact_gram: IntegerBuffer,
    clean_pi_cache: IntegerBuffer,
    clean_a: IntegerBuffer,
    clean_b: IntegerBuffer,
    clean_p: IntegerBuffer,
    clean_q: IntegerBuffer,
    clean_stack: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_state: Int64Buffer,
    driver_state: Int64Buffer,
    class_hnf_transform_inverse: IntegerBuffer,
    class_hnf_inverse_augmented: IntegerBuffer,
    class_hnf_inverse_state: Int64Buffer,
    class_relation_to_presentation_scratch: IntegerBuffer,
    class_presentation_to_relation_scratch: IntegerBuffer,
    class_relation_witness_state: Int64Buffer,
    class_presentation_scratch: IntegerBuffer,
    class_smith_scratch: IntegerBuffer,
    class_left_scratch: IntegerBuffer,
    class_left_inverse_scratch: IntegerBuffer,
    class_right_scratch: IntegerBuffer,
    class_ur_scratch: IntegerBuffer,
    class_y_scratch: IntegerBuffer,
    class_uir_scratch: IntegerBuffer,
    class_x_scratch: IntegerBuffer,
    class_m1_scratch: IntegerBuffer,
    class_m2_scratch: IntegerBuffer,
    class_invariants_scratch: IntegerBuffer,
    class_class_number_scratch: IntegerBuffer,
    class_smith_column_scratch: IntegerBuffer,
    class_right_inverse_scratch: IntegerBuffer,
    class_smith_augmented_scratch: IntegerBuffer,
    class_left_inverse_state: Int64Buffer,
    class_right_inverse_state: Int64Buffer,
    class_first_division_state: Int64Buffer,
    class_second_division_state: Int64Buffer,
    class_smith_state: Int64Buffer,
    class_binding_state: Int64Buffer,
    class_published_presentation: IntegerBuffer,
    class_published_smith: IntegerBuffer,
    class_published_left: IntegerBuffer,
    class_published_left_inverse: IntegerBuffer,
    class_published_right: IntegerBuffer,
    class_published_right_inverse: IntegerBuffer,
    class_published_relation_to_presentation: IntegerBuffer,
    class_published_presentation_to_relation: IntegerBuffer,
    class_published_state: Int64Buffer,
    precision_kernel_relation_map: IntegerBuffer,
    precision_retained_relation_map: IntegerBuffer,
    precision_kernel_factors: IntegerBuffer,
    precision_exact_units_integral: IntegerBuffer,
    precision_exact_units_power: IntegerBuffer,
    precision_exact_norms: IntegerBuffer,
    precision_root_m: IntegerBuffer,
    precision_root_p: IntegerBuffer,
    precision_root_e: IntegerBuffer,
    precision_embedding_m: IntegerBuffer,
    precision_embedding_p: IntegerBuffer,
    precision_embedding_e: IntegerBuffer,
    precision_embedding_state: Int64Buffer,
    precision_atom_logs: IntegerBuffer,
    precision_transformed_logs: IntegerBuffer,
    precision_clean_scratch: IntegerBuffer,
    precision_clean_result: IntegerBuffer,
    precision_rebuilt_logs: IntegerBuffer,
    precision_phase_scratch: IntegerBuffer,
    precision_rebuilt_phases: IntegerBuffer,
    precision_log_cache: IntegerBuffer,
    precision_pi_cache: IntegerBuffer,
    precision_transcendental_a: IntegerBuffer,
    precision_transcendental_b: IntegerBuffer,
    precision_transcendental_p: IntegerBuffer,
    precision_transcendental_q: IntegerBuffer,
    precision_transcendental_stack: IntegerBuffer,
    precision_clean_state: Int64Buffer,
    precision_precision_state: Int64Buffer,
    precision_determinant_values: IntegerBuffer,
    precision_determinant_work: IntegerBuffer,
    precision_determinant_output: IntegerBuffer,
    precision_determinant_pivots: Int64Buffer,
    precision_determinant_state: Int64Buffer,
    precision_authority_state: Int64Buffer,
    precision_resource_cap: int,
    precision_resident_root_m: IntegerBuffer,
    precision_resident_root_p: IntegerBuffer,
    precision_resident_root_e: IntegerBuffer,
    precision_staged_retry_relations: IntegerBuffer,
    precision_embedding_packed: IntegerBuffer,
    precision_getfu_clean_logs: IntegerBuffer,
    precision_getfu_clean_phases: Int64Buffer,
    precision_getfu_factor: IntegerBuffer,
    precision_getfu_matep: IntegerBuffer,
    precision_getfu_transformed_arch: IntegerBuffer,
    precision_getfu_transformed_clean: IntegerBuffer,
    precision_getfu_transformed_phases: Int64Buffer,
    precision_getfu_exponentials: IntegerBuffer,
    precision_getfu_solve_work: IntegerBuffer,
    precision_getfu_solve_rhs: IntegerBuffer,
    precision_getfu_solved: IntegerBuffer,
    precision_getfu_rounded: IntegerBuffer,
    precision_getfu_multiplication: IntegerBuffer,
    precision_getfu_inverse: IntegerBuffer,
    precision_getfu_candidate_units: IntegerBuffer,
    precision_getfu_normalized_factor: IntegerBuffer,
    precision_staged_getfu_units: IntegerBuffer,
    precision_staged_getfu_logs: IntegerBuffer,
    precision_staged_getfu_phases: Int64Buffer,
    precision_staged_getfu_factor: IntegerBuffer,
    precision_getfu_state: Int64Buffer,
    precision_getfu_pivots: Int64Buffer,
    precision_getfu_exp_cache: IntegerBuffer,
    precision_getfu_exp_a: IntegerBuffer,
    precision_getfu_exp_b: IntegerBuffer,
    precision_getfu_exp_p: IntegerBuffer,
    precision_getfu_exp_q: IntegerBuffer,
    precision_getfu_exp_stack: IntegerBuffer,
    precision_retry_state: Int64Buffer,
    precision_published_retained_relations: IntegerBuffer,
    precision_published_logs: IntegerBuffer,
    precision_published_phases: Int64Buffer,
    torsion_order: IntegerBuffer,
    torsion_generator: IntegerBuffer,
    torsion_state: Int64Buffer,
    final_polynomial: IntegerBuffer,
    final_presentation: IntegerBuffer,
    final_smith: IntegerBuffer,
    final_left: IntegerBuffer,
    final_left_inverse: IntegerBuffer,
    final_right: IntegerBuffer,
    final_right_inverse: IntegerBuffer,
    final_relation_to_presentation: IntegerBuffer,
    final_presentation_to_relation: IntegerBuffer,
    final_compact_provenance: IntegerBuffer,
    final_retained_relation_map: IntegerBuffer,
    final_exact_units: IntegerBuffer,
    final_exact_norms: IntegerBuffer,
    final_regulator: IntegerBuffer,
    final_torsion_order: IntegerBuffer,
    final_torsion_generator: IntegerBuffer,
    final_invariants: IntegerBuffer,
    final_state: Int64Buffer,
) -> int:
    """Compute and atomically publish the prepared `h = 1` internal result.

    `final_state` is status, prefix status, class-witness status, torsion
    status, precision-suffix status, missing stage, accepted relation count,
    presentation dimension, class number, invariant count, unit rank, torsion
    order, internal correspondence complete, published final cells, final
    publication, and public completion.

    Every mathematical owner is produced below this native call.  The resource
    cap is caller policy, not answer data.  A successful final state is written
    last, after the prefix, class witness, precision retry, relation-to-unit
    replay, regulator, and torsion stages all publish successfully.
    """
    # Only fixed protocol headers are checked before the live prefix runs.
    # Mathematical workspaces are checked against dimensions authenticated
    # from that prefix below; observed successful-field sizes never become an
    # admission oracle here.
    if (
        len(final_state) < 16
        or precision_resource_cap < precision
        or precision_resource_cap % 64 != 0
    ):
        raise ValueError("short unified complete h1 owner")
    if final_state[14] == 1:
        if final_state[0] != 0 or final_state[12] != 1:
            raise ValueError("inconsistent published complete h1 state")
        return 0
    if final_state[0] != 0:
        raise ValueError("partial unified complete h1 state")

    # Validate answer-shaped analytic scalars against the neutral polynomial
    # before the resident computation consumes them.
    if len(prep_polynomial) < 4:
        raise ValueError("short prepared polynomial")
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
        n != 3
        or precision != 192
        or admission_real_count != 3
        or pa3 != 1
        or derived_discriminant <= 0
        or analytic_discriminant != derived_discriminant
        or analytic_roots_of_unity != 2
    ):
        raise ValueError("prepared cubic analytic scalars are inconsistent")

    for index in range(16):
        final_state[index] = 0
    final_state[0] = -1
    final_state[1] = -1
    final_state[2] = -1
    final_state[3] = -1
    final_state[4] = -1

    prefix_status = pari_unified_live_h1_root(
        matrix,
        ideal,
        n,
        precision,
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
        admission_group_f,
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
        subfactor,
        extra,
        relation_primes,
        ramification,
        relation,
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
        packet_ids,
        packet_ideals,
        packet_norms,
        schedule,
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
        outer_state,
        outer_minidx,
        outer_present,
        outer_live,
        outer_perm,
        outer_multiplier,
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
        initial_primes,
        initial_offsets,
        initial_counts,
        initial_complete,
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
        prep_polynomial,
        prep_invzk,
        prep_zk,
        prep_zk_degrees,
        prep_index,
        prep_zkden,
        prep_degree_workspace,
        prep_factor_degrees,
        prep_factor_exponents,
        prep_group_degrees,
        prep_group_counts,
        prep_local_state,
        prep_degree_state,
        prep_full_offsets,
        prep_full_counts,
        prep_full_degrees,
        prep_base_norms,
        prep_selected_primes,
        prep_prime_offsets,
        prep_prime_counts,
        prep_complete_groups,
        prep_selected_indices,
        prep_base_state,
        prep_bad,
        prep_sub_order,
        prep_sub_scratch,
        prep_sub_stack,
        prep_sub_chosen,
        prep_sub_rejected,
        prep_sub_state,
        prep_state,
        prep_base_configuration,
        prep_base_constants_logs,
        prep_base_sums,
        prep_base_factor_logs,
        prep_sub_configuration,
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
        unified_state,
        unit_transform,
        getfu_factor,
        compact_provenance,
        cleaned_arch,
        bridge_state,
        u1,
        u2,
        first_arch,
        p_triples,
        au,
        clean_logs,
        signs,
        unit_state,
        unit_trace,
        integer_state,
        integer_basis,
        integer_transform,
        integer_gram,
        integer_mu,
        integer_mu_exponents,
        integer_r,
        integer_r_exponents,
        integer_s,
        integer_s_exponents,
        integer_approximate,
        integer_float_gram,
        integer_alpha,
        integer_column,
        integer_column_exponents,
        integer_normalized,
        integer_temporary,
        integer_dpe_scratch,
        integer_scratch,
        real_integers,
        real_form,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_scratch,
        real_scratch,
        real_state,
        factor_matep,
        factor_basis,
        factor_transform,
        factor_state,
        factor_mu,
        factor_mu_exponents,
        factor_r,
        factor_r_exponents,
        factor_s,
        factor_s_exponents,
        factor_approximate,
        factor_float_gram,
        factor_alpha,
        factor_column,
        factor_column_exponents,
        factor_normalized,
        factor_temporary,
        factor_exact_gram,
        clean_pi_cache,
        clean_a,
        clean_b,
        clean_p,
        clean_q,
        clean_stack,
        clean_scratch,
        clean_state,
        driver_state,
    )
    final_state[1] = prefix_status
    if prefix_status != 0 or unified_state[0] != 0 or unified_state[3] != 1:
        final_state[0] = 1
        final_state[5] = 1
        return 1

    dimension_status = pari_authenticate_h1_live_dimensions(
        unified_state, bridge_state, hnf_state, hnf_assembly_state
    )
    if dimension_status != 0:
        final_state[0] = INVALID_LIVE_DIMENSIONS
        final_state[5] = INVALID_LIVE_DIMENSIONS
        return INVALID_LIVE_DIMENSIONS
    relation_count = bridge_state[8]
    class_rows = hnf_assembly_state[0]
    class_columns = hnf_assembly_state[2]
    compact_factor_count = bridge_state[13]
    unit_rank = bridge_state[12]
    presentation_size = class_rows * class_rows
    relation_presentation_size = class_rows * class_columns
    compact_size = unit_rank * compact_factor_count
    retained_size = unit_rank * relation_count
    unit_size = n * unit_rank
    if (
        len(final_polynomial) < n + 1
        or len(final_presentation) < presentation_size
        or len(final_smith) < presentation_size
        or len(final_left) < presentation_size
        or len(final_left_inverse) < presentation_size
        or len(final_right) < presentation_size
        or len(final_right_inverse) < presentation_size
        or len(final_relation_to_presentation) < relation_presentation_size
        or len(final_presentation_to_relation) < relation_presentation_size
        or len(final_compact_provenance) < compact_size
        or len(final_retained_relation_map) < retained_size
        or len(final_exact_units) < unit_size
        or len(final_exact_norms) < unit_rank
        or len(final_regulator) < 3
        or len(final_torsion_order) < 1
        or len(final_torsion_generator) < n
        or len(final_invariants) < class_rows
    ):
        raise ValueError("short derived-shape final h1 owner")

    class_status = pari_live_h1_class_witness_suffix(
        hnf_matbnew,
        class_rows,
        class_columns,
        hnf_full_h,
        hnf_hnf_transform,
        class_hnf_transform_inverse,
        class_hnf_inverse_augmented,
        class_hnf_inverse_state,
        class_relation_to_presentation_scratch,
        class_presentation_to_relation_scratch,
        class_relation_witness_state,
        class_presentation_scratch,
        class_smith_scratch,
        class_left_scratch,
        class_left_inverse_scratch,
        class_right_scratch,
        class_ur_scratch,
        class_y_scratch,
        class_uir_scratch,
        class_x_scratch,
        class_m1_scratch,
        class_m2_scratch,
        class_invariants_scratch,
        class_class_number_scratch,
        class_smith_column_scratch,
        class_right_inverse_scratch,
        class_smith_augmented_scratch,
        class_left_inverse_state,
        class_right_inverse_state,
        class_first_division_state,
        class_second_division_state,
        class_smith_state,
        class_binding_state,
        class_published_presentation,
        class_published_smith,
        class_published_left,
        class_published_left_inverse,
        class_published_right,
        class_published_right_inverse,
        class_published_relation_to_presentation,
        class_published_presentation_to_relation,
        class_published_state,
    )
    final_state[2] = class_status
    if (
        class_status != 0
        or class_published_state[0] != 0
        or class_published_state[1] != class_rows
        or class_published_state[2] != class_columns
        or class_published_state[4] != relation_presentation_size
        or class_published_state[6] != presentation_size
    ):
        final_state[0] = 2
        final_state[5] = 2
        return 2

    # The resident preparation stores rows [1, x, b_2] at each of the three
    # real embeddings.  Snapshot the x row into private exact-real owners;
    # precision reconstruction overwrites its distinct output owners.
    for embedding in range(3):
        source = 9 * embedding + 3
        precision_resident_root_m[embedding] = preparation_embedding[source]
        precision_resident_root_p[embedding] = preparation_embedding[source + 1]
        precision_resident_root_e[embedding] = preparation_embedding[source + 2]

    precision_status = pari_live_retrying_h1_suffix(
        precision_resident_root_m,
        precision_resident_root_p,
        precision_resident_root_e,
        basis_table,
        generators,
        hnf_transform,
        hnf_hnf_transform,
        compact_provenance,
        compact_provenance,
        getfu_factor,
        n,
        relation_count,
        relation_count,
        class_columns,
        class_columns,
        compact_factor_count,
        compact_factor_count,
        unit_rank,
        precision,
        precision_resource_cap,
        0,
        precision_kernel_relation_map,
        precision_retained_relation_map,
        precision_staged_retry_relations,
        precision_kernel_factors,
        precision_exact_units_integral,
        precision_root_m,
        precision_root_p,
        precision_root_e,
        precision_embedding_m,
        precision_embedding_p,
        precision_embedding_e,
        precision_embedding_packed,
        precision_embedding_state,
        precision_atom_logs,
        precision_transformed_logs,
        precision_clean_scratch,
        precision_clean_result,
        precision_rebuilt_logs,
        precision_phase_scratch,
        precision_rebuilt_phases,
        precision_log_cache,
        precision_pi_cache,
        precision_transcendental_a,
        precision_transcendental_b,
        precision_transcendental_p,
        precision_transcendental_q,
        precision_transcendental_stack,
        precision_clean_state,
        precision_precision_state,
        precision_getfu_clean_logs,
        precision_getfu_clean_phases,
        precision_getfu_factor,
        precision_getfu_matep,
        precision_getfu_transformed_arch,
        precision_getfu_transformed_clean,
        precision_getfu_transformed_phases,
        precision_getfu_exponentials,
        precision_getfu_solve_work,
        precision_getfu_solve_rhs,
        precision_getfu_solved,
        precision_getfu_rounded,
        precision_getfu_multiplication,
        precision_getfu_inverse,
        precision_getfu_candidate_units,
        precision_getfu_normalized_factor,
        precision_staged_getfu_units,
        precision_staged_getfu_logs,
        precision_staged_getfu_phases,
        precision_staged_getfu_factor,
        precision_getfu_state,
        precision_getfu_pivots,
        precision_getfu_exp_cache,
        precision_getfu_exp_a,
        precision_getfu_exp_b,
        precision_getfu_exp_p,
        precision_getfu_exp_q,
        precision_getfu_exp_stack,
        precision_determinant_values,
        precision_determinant_work,
        precision_determinant_output,
        precision_determinant_pivots,
        precision_determinant_state,
        precision_retry_state,
        precision_published_retained_relations,
        precision_exact_units_power,
        precision_exact_norms,
        precision_published_logs,
        precision_published_phases,
        precision_determinant_output,
        precision_authority_state,
    )
    final_state[4] = precision_status
    if precision_status != 0 or precision_authority_state[14] != 1:
        final_state[0] = MISSING_LIVE_PRECISION_SUFFIX
        final_state[5] = MISSING_LIVE_PRECISION_SUFFIX
        final_state[6] = bridge_state[8]
        final_state[7] = class_published_state[1]
        final_state[8] = class_published_state[8]
        final_state[9] = class_published_state[9]
        final_state[10] = bridge_state[12]
        return MISSING_LIVE_PRECISION_SUFFIX

    exact_torsion_status = pari_exact_real_cubic_torsion(
        prep_polynomial,
        torsion_order,
        torsion_generator,
        torsion_state,
    )
    final_state[3] = exact_torsion_status
    if exact_torsion_status != 0 or torsion_state[5] != 1:
        final_state[0] = 3
        final_state[5] = 3
        return 3

    # Publish every fixed-shape owner only after all components succeed.  No
    # operation below can fail because capacities were preflighted above; the
    # final state and publication bit are committed last.
    for index in range(n + 1):
        final_polynomial[index] = prep_polynomial[index]
    for index in range(presentation_size):
        final_presentation[index] = class_published_presentation[index]
        final_smith[index] = class_published_smith[index]
        final_left[index] = class_published_left[index]
        final_left_inverse[index] = class_published_left_inverse[index]
        final_right[index] = class_published_right[index]
        final_right_inverse[index] = class_published_right_inverse[index]
    for index in range(relation_presentation_size):
        final_relation_to_presentation[index] = (
            class_published_relation_to_presentation[index]
        )
        final_presentation_to_relation[index] = (
            class_published_presentation_to_relation[index]
        )
    for index in range(compact_size):
        final_compact_provenance[index] = compact_provenance[index]
    for index in range(retained_size):
        final_retained_relation_map[index] = precision_published_retained_relations[
            index
        ]
    for index in range(unit_size):
        final_exact_units[index] = precision_exact_units_power[index]
    for index in range(unit_rank):
        final_exact_norms[index] = precision_exact_norms[index]
    for index in range(3):
        final_regulator[index] = precision_determinant_output[index]
        final_torsion_generator[index] = torsion_generator[index]
    final_torsion_order[0] = torsion_order[0]
    for index in range(class_rows):
        # The class group is trivial, so its logical invariant count is zero;
        # clear the fixed-capacity owner instead of preserving caller bytes.
        final_invariants[index] = 0

    final_state[0] = 0
    final_state[5] = 0
    final_state[6] = bridge_state[8]
    final_state[7] = class_published_state[1]
    final_state[8] = class_published_state[8]
    final_state[9] = class_published_state[9]
    final_state[10] = bridge_state[12]
    final_state[11] = torsion_order[0]
    final_state[12] = 1
    final_state[13] = (
        n
        + 1
        + 6 * presentation_size
        + 2 * relation_presentation_size
        + compact_size
        + retained_size
        + unit_size
        + unit_rank
        + 3
        + 1
        + n
        + class_rows
    )
    final_state[14] = 1
    final_state[15] = 0
    return 0


__all__ = [
    "pari_authenticate_h1_live_dimensions",
    "pari_exact_real_cubic_torsion",
    "pari_unified_complete_h1_root",
]
