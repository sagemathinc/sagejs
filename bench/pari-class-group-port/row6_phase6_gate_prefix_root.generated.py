"""Connected row-6 prepared prefix through the first genuine HNF."""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    NativeWorkspaceArena,
    checked_int64,
    diagnostic_stage_switch,
    integer_buffer_view,
    native,
    uint64,
)
from .row6_prepared_factor_base_root import pari_row6_prepared_factor_base_root
from .row6_prepared_initial_relations import pari_row6_prepared_initial_relations
from .collected_log_embeddings import pari_collect_and_log_relations
from .hnfspec_complete import pari_hnfspec_complete
from .row14_next_pass import pari_row14_prepare_next_pass
from .hnfadd import pari_hnfadd
from .row6_phase6_gate_ancestry_private import pari_row6_phase6_gate_ancestry_private


@native
def pari_row6_phase6_gate_prefix_root(
    factor_polynomial: IntegerBuffer,
    factor_discriminant: int,
    factor_real_places: int,
    factor_complex_pairs: int,
    factor_precision: int,
    factor_equation_index: int,
    factor_roots_of_unity: int,
    factor_zkden: int,
    factor_invzk: IntegerBuffer,
    factor_zk: IntegerBuffer,
    factor_zk_degrees: IntegerBuffer,
    factor_basis_table: IntegerBuffer,
    factor_embedding_m: IntegerBuffer,
    factor_embedding_p: IntegerBuffer,
    factor_embedding_e: IntegerBuffer,
    factor_runtime_primes: IntegerBuffer,
    factor_runtime_products: IntegerBuffer,
    factor_factor_limit: int,
    factor_prime_limit: int,
    factor_index_work: IntegerBuffer,
    factor_degree_workspace: IntegerBuffer,
    factor_factor_degrees: IntegerBuffer,
    factor_factor_exponents: IntegerBuffer,
    factor_group_degrees: IntegerBuffer,
    factor_group_counts: IntegerBuffer,
    factor_local_state: IntegerBuffer,
    factor_pattern_offsets: IntegerBuffer,
    factor_pattern_counts: IntegerBuffer,
    factor_pattern_degrees: IntegerBuffer,
    factor_pattern_multiplicities: IntegerBuffer,
    factor_full_offsets: IntegerBuffer,
    factor_full_counts: IntegerBuffer,
    factor_full_degrees: IntegerBuffer,
    factor_degree_state: IntegerBuffer,
    factor_base_norms: IntegerBuffer,
    factor_base_configuration: Float64Buffer,
    factor_base_constants_logs: Float64Buffer,
    factor_base_sums: Float64Buffer,
    factor_base_factor_logs: Float64Buffer,
    factor_selected_primes: IntegerBuffer,
    factor_prime_offsets: IntegerBuffer,
    factor_prime_counts: IntegerBuffer,
    factor_complete_groups: IntegerBuffer,
    factor_selected_indices: IntegerBuffer,
    factor_base_state: IntegerBuffer,
    factor_random_state: IntegerBuffer,
    factor_kummer_factorwork: IntegerBuffer,
    factor_kummer_factor: IntegerBuffer,
    factor_kummer_diagnostic: IntegerBuffer,
    factor_kummer_minpoly_diagnostic: IntegerBuffer,
    factor_kummer_polywork: IntegerBuffer,
    factor_kummer_u: IntegerBuffer,
    factor_kummer_t: IntegerBuffer,
    factor_kummer_rational: IntegerBuffer,
    factor_kummer_primitive: IntegerBuffer,
    factor_kummer_column: IntegerBuffer,
    factor_kummer_resultant_work: IntegerBuffer,
    factor_kummer_resultant_trace: IntegerBuffer,
    factor_kummer_u_output: IntegerBuffer,
    factor_kummer_tau_output: IntegerBuffer,
    factor_kummer_descriptor_state: IntegerBuffer,
    factor_kummer_unsorted: IntegerBuffer,
    factor_kummer_generators: IntegerBuffer,
    factor_kummer_residue_degrees: IntegerBuffer,
    factor_kummer_order: IntegerBuffer,
    factor_kummer_sort_diagnostic: IntegerBuffer,
    factor_kummer_decomposition_output: IntegerBuffer,
    factor_kummer_decomposition_state: IntegerBuffer,
    factor_catalog_primes: IntegerBuffer,
    factor_catalog_e: IntegerBuffer,
    factor_catalog_f: IntegerBuffer,
    factor_catalog_inert: IntegerBuffer,
    factor_catalog_generators: IntegerBuffer,
    factor_catalog_tau: IntegerBuffer,
    factor_requested_counts: IntegerBuffer,
    factor_kummer_state: IntegerBuffer,
    factor_packet_generator: IntegerBuffer,
    factor_packet_multiplication: IntegerBuffer,
    factor_packet_work: IntegerBuffer,
    factor_packet_pivots: IntegerBuffer,
    factor_packet_ideal: IntegerBuffer,
    factor_packet_ideals: IntegerBuffer,
    factor_packet_norms: IntegerBuffer,
    factor_relation_primes: IntegerBuffer,
    factor_ramification: IntegerBuffer,
    factor_residue_degrees: IntegerBuffer,
    factor_inert_flags: IntegerBuffer,
    factor_selected_tau: IntegerBuffer,
    factor_initial_primes: IntegerBuffer,
    factor_initial_offsets: IntegerBuffer,
    factor_initial_counts: IntegerBuffer,
    factor_initial_complete: IntegerBuffer,
    factor_bad_flags: IntegerBuffer,
    factor_sub_configuration: Float64Buffer,
    factor_sub_order: IntegerBuffer,
    factor_sub_scratch: IntegerBuffer,
    factor_sub_stack: IntegerBuffer,
    factor_sub_chosen: IntegerBuffer,
    factor_sub_rejected: IntegerBuffer,
    factor_permutation: IntegerBuffer,
    factor_subfactor: IntegerBuffer,
    factor_minidx: IntegerBuffer,
    factor_root_state: IntegerBuffer,
    initial_relation_state: IntegerBuffer,
    initial_relation_basis: IntegerBuffer,
    initial_relation_records: IntegerBuffer,
    initial_relation_hashes: IntegerBuffer,
    initial_relation_metadata: IntegerBuffer,
    initial_relation: IntegerBuffer,
    initial_relation_scratch: IntegerBuffer,
    initial_relation_generators: IntegerBuffer,
    initial_root_state: IntegerBuffer,
    gate_matrix: IntegerBuffer,
    gate_ideal: IntegerBuffer,
    gate_n: int,
    gate_precision: int,
    gate_scale: float,
    gate_track_small: int,
    gate_reduction: IntegerBuffer,
    gate_vectors: IntegerBuffer,
    gate_betas: IntegerBuffer,
    gate_norms: IntegerBuffer,
    gate_column: IntegerBuffer,
    gate_float_q: Float64Buffer,
    gate_float_v: Float64Buffer,
    gate_bound: Float64Buffer,
    gate_cache: IntegerBuffer,
    gate_a: IntegerBuffer,
    gate_b: IntegerBuffer,
    gate_p: IntegerBuffer,
    gate_q: IntegerBuffer,
    gate_stack: IntegerBuffer,
    gate_x: Int64Buffer,
    gate_y: Float64Buffer,
    gate_z: Float64Buffer,
    gate_inc: Int64Buffer,
    gate_state: Int64Buffer,
    gate_cursor_output: Int64Buffer,
    gate_element: IntegerBuffer,
    gate_counters: Int64Buffer,
    gate_admission_matrix_m: IntegerBuffer,
    gate_admission_matrix_p: IntegerBuffer,
    gate_admission_matrix_e: IntegerBuffer,
    gate_admission_real_count: int,
    gate_admission_ideal: IntegerBuffer,
    gate_admission_mode: int,
    gate_admission_rational_factors: IntegerBuffer,
    gate_admission_rational_exponents: IntegerBuffer,
    gate_admission_prime_offsets: IntegerBuffer,
    gate_admission_prime_counts: IntegerBuffer,
    gate_admission_tau: IntegerBuffer,
    gate_admission_x: IntegerBuffer,
    gate_admission_y: IntegerBuffer,
    gate_admission_spare: IntegerBuffer,
    gate_admission_stack: IntegerBuffer,
    gate_admission_primitive: IntegerBuffer,
    gate_admission_columns: IntegerBuffer,
    gate_admission_values: IntegerBuffer,
    gate_admission_temporary: IntegerBuffer,
    gate_admission_indices: IntegerBuffer,
    gate_admission_exponents: IntegerBuffer,
    gate_diagnostic: IntegerBuffer,
    gate_nrelid: int,
    gate_track_fact: int,
    gate_jid0: int,
    gate_e0: int,
    gate_extra: IntegerBuffer,
    gate_extra_count: int,
    gate_progress: Int64Buffer,
    gate_preparation_rounded_embedding: IntegerBuffer,
    gate_preparation_embedding: IntegerBuffer,
    gate_preparation_original: IntegerBuffer,
    gate_preparation_basis: IntegerBuffer,
    gate_preparation_transform: IntegerBuffer,
    gate_preparation_flags: IntegerBuffer,
    gate_preparation_rank_diagnostic: IntegerBuffer,
    gate_preparation_selection: IntegerBuffer,
    gate_preparation_stages: IntegerBuffer,
    gate_preparation_flatter_input: IntegerBuffer,
    gate_preparation_current: IntegerBuffer,
    gate_preparation_flatter_transform: IntegerBuffer,
    gate_preparation_total_work: IntegerBuffer,
    gate_preparation_step_t: IntegerBuffer,
    gate_preparation_step_s: IntegerBuffer,
    gate_preparation_product: IntegerBuffer,
    gate_preparation_next_basis: IntegerBuffer,
    gate_preparation_y: IntegerBuffer,
    gate_preparation_diagnostic: IntegerBuffer,
    gate_preparation_r1: IntegerBuffer,
    gate_preparation_r2: IntegerBuffer,
    gate_preparation_r3: IntegerBuffer,
    gate_preparation_t1: IntegerBuffer,
    gate_preparation_t2: IntegerBuffer,
    gate_preparation_t3: IntegerBuffer,
    gate_preparation_integers: IntegerBuffer,
    gate_preparation_inverse: IntegerBuffer,
    gate_preparation_first: IntegerBuffer,
    gate_preparation_second: IntegerBuffer,
    gate_preparation_final: IntegerBuffer,
    gate_preparation_rounded: IntegerBuffer,
    gate_preparation_mu: Float64Buffer,
    gate_preparation_r: Float64Buffer,
    gate_preparation_s: Float64Buffer,
    gate_preparation_approximate: Float64Buffer,
    gate_preparation_exponents: IntegerBuffer,
    gate_preparation_float_gram: Float64Buffer,
    gate_preparation_gram: IntegerBuffer,
    gate_preparation_mu_exponents: IntegerBuffer,
    gate_preparation_r_exponents: IntegerBuffer,
    gate_preparation_s_exponents: IntegerBuffer,
    gate_preparation_alpha: IntegerBuffer,
    gate_preparation_column_exponents: IntegerBuffer,
    gate_preparation_float_scratch: Float64Buffer,
    gate_preparation_temporary: Float64Buffer,
    gate_preparation_state: Int64Buffer,
    gate_search_count: int,
    gate_packet_ids: IntegerBuffer,
    gate_schedule: Int64Buffer,
    gate_construct_primes: int,
    gate_packet_generators: IntegerBuffer,
    gate_hnf_generator: IntegerBuffer,
    gate_hnf_matrix: IntegerBuffer,
    gate_hnf_work: IntegerBuffer,
    gate_hnf_pivots: IntegerBuffer,
    gate_power_ideal: IntegerBuffer,
    gate_power_alpha: IntegerBuffer,
    gate_power_metadata: IntegerBuffer,
    gate_power_primitive: IntegerBuffer,
    gate_power_temporary: IntegerBuffer,
    gate_power_diagnostic: IntegerBuffer,
    gate_power_multiplication: IntegerBuffer,
    gate_power_work: IntegerBuffer,
    gate_power_triangular: IntegerBuffer,
    gate_power_moduli: IntegerBuffer,
    gate_product_primitive: IntegerBuffer,
    gate_product_matrix: IntegerBuffer,
    gate_outer_mode: int,
    gate_outer_ru: int,
    gate_outer_state: Int64Buffer,
    gate_outer_present: IntegerBuffer,
    gate_outer_live: IntegerBuffer,
    gate_outer_perm: IntegerBuffer,
    gate_outer_multiplier: IntegerBuffer,
    gate_log_precision: int,
    gate_log_completed: IntegerBuffer,
    gate_log_embeddings: IntegerBuffer,
    gate_log_coordinates: IntegerBuffer,
    gate_log_column: IntegerBuffer,
    gate_log_cache: IntegerBuffer,
    gate_log_pi_cache: IntegerBuffer,
    gate_log_a: IntegerBuffer,
    gate_log_b: IntegerBuffer,
    gate_log_p: IntegerBuffer,
    gate_log_q: IntegerBuffer,
    gate_log_stack: IntegerBuffer,
    gate_initial_hnf_original: Int64Buffer,
    gate_initial_hnf_perm: Int64Buffer,
    gate_initial_hnf_mat: Int64Buffer,
    gate_initial_hnf_vmax: Int64Buffer,
    gate_initial_hnf_found: Int64Buffer,
    gate_initial_hnf_sparse_state: Int64Buffer,
    gate_initial_hnf_cleanup_state: Int64Buffer,
    gate_initial_hnf_perm_work: Int64Buffer,
    gate_initial_hnf_assembly_state: Int64Buffer,
    gate_initial_hnf_hnf_state: Int64Buffer,
    gate_initial_hnf_diagonal: Int64Buffer,
    gate_initial_hnf_final_state: Int64Buffer,
    gate_initial_hnf_state: Int64Buffer,
    gate_initial_hnf_cup_solve_state: Int64Buffer,
    gate_initial_hnf_cup_state: Int64Buffer,
    gate_next_control: Int64Buffer,
    gate_append1_new_relations: Int64Buffer,
    gate_append1_perm_work: Int64Buffer,
    gate_append1_hnf_state: Int64Buffer,
    gate_append1_diagonal: Int64Buffer,
    gate_append1_final_state: Int64Buffer,
    gate_append1_state: Int64Buffer,
    gate_append2_new_relations: Int64Buffer,
    gate_append2_perm_work: Int64Buffer,
    gate_append2_hnf_state: Int64Buffer,
    gate_append2_diagonal: Int64Buffer,
    gate_append2_final_state: Int64Buffer,
    gate_append2_state: Int64Buffer,
    gate_ancestry_perm1: Int64Buffer,
    gate_ancestry_perm2: Int64Buffer,
    gate_ancestry_raw_to_all: IntegerBuffer,
    gate_ancestry_accepted_arch: IntegerBuffer,
    gate_ancestry_accepted_signs: Int64Buffer,
    gate_ancestry_phase_pi: IntegerBuffer,
    gate_ancestry_active_rows: Int64Buffer,
    gate_ancestry_state: Int64Buffer,
    gate_final_h: IntegerBuffer,
    gate_final_b: IntegerBuffer,
    gate_final_c: IntegerBuffer,
) -> int:
    """Run the authenticated prefix, relation pass, logs and first HNF."""
    diagnostic_stage_switch(0)
    count = pari_row6_prepared_factor_base_root(
        factor_polynomial,
        factor_discriminant,
        factor_real_places,
        factor_complex_pairs,
        factor_precision,
        factor_equation_index,
        factor_roots_of_unity,
        factor_zkden,
        factor_invzk,
        factor_zk,
        factor_zk_degrees,
        factor_basis_table,
        factor_embedding_m,
        factor_embedding_p,
        factor_embedding_e,
        factor_runtime_primes,
        factor_runtime_products,
        factor_factor_limit,
        factor_prime_limit,
        factor_index_work,
        factor_degree_workspace,
        factor_factor_degrees,
        factor_factor_exponents,
        factor_group_degrees,
        factor_group_counts,
        factor_local_state,
        factor_pattern_offsets,
        factor_pattern_counts,
        factor_pattern_degrees,
        factor_pattern_multiplicities,
        factor_full_offsets,
        factor_full_counts,
        factor_full_degrees,
        factor_degree_state,
        factor_base_norms,
        factor_base_configuration,
        factor_base_constants_logs,
        factor_base_sums,
        factor_base_factor_logs,
        factor_selected_primes,
        factor_prime_offsets,
        factor_prime_counts,
        factor_complete_groups,
        factor_selected_indices,
        factor_base_state,
        factor_random_state,
        factor_kummer_factorwork,
        factor_kummer_factor,
        factor_kummer_diagnostic,
        factor_kummer_minpoly_diagnostic,
        factor_kummer_polywork,
        factor_kummer_u,
        factor_kummer_t,
        factor_kummer_rational,
        factor_kummer_primitive,
        factor_kummer_column,
        factor_kummer_resultant_work,
        factor_kummer_resultant_trace,
        factor_kummer_u_output,
        factor_kummer_tau_output,
        factor_kummer_descriptor_state,
        factor_kummer_unsorted,
        factor_kummer_generators,
        factor_kummer_residue_degrees,
        factor_kummer_order,
        factor_kummer_sort_diagnostic,
        factor_kummer_decomposition_output,
        factor_kummer_decomposition_state,
        factor_catalog_primes,
        factor_catalog_e,
        factor_catalog_f,
        factor_catalog_inert,
        factor_catalog_generators,
        factor_catalog_tau,
        factor_requested_counts,
        factor_kummer_state,
        factor_packet_generator,
        factor_packet_multiplication,
        factor_packet_work,
        factor_packet_pivots,
        factor_packet_ideal,
        factor_packet_ideals,
        factor_packet_norms,
        factor_relation_primes,
        factor_ramification,
        factor_residue_degrees,
        factor_inert_flags,
        factor_selected_tau,
        factor_initial_primes,
        factor_initial_offsets,
        factor_initial_counts,
        factor_initial_complete,
        factor_bad_flags,
        factor_sub_configuration,
        factor_sub_order,
        factor_sub_scratch,
        factor_sub_stack,
        factor_sub_chosen,
        factor_sub_rejected,
        factor_permutation,
        factor_subfactor,
        factor_minidx,
        factor_root_state,
    )
    factor_count = int(factor_root_state[3])
    rational_group_count = int(factor_root_state[4])
    if count != factor_count or factor_count < 1:
        return 11
    unit_rank = factor_real_places + factor_complex_pairs - 1
    relation_target = factor_count + 5 + unit_rank
    relation_capacity = 10 * relation_target + 50
    initial_count = pari_row6_prepared_initial_relations(
        factor_polynomial,
        factor_discriminant,
        factor_real_places,
        factor_complex_pairs,
        factor_precision,
        factor_equation_index,
        factor_root_state,
        factor_random_state,
        integer_buffer_view(factor_initial_primes, 0, rational_group_count),
        integer_buffer_view(factor_initial_offsets, 0, rational_group_count),
        integer_buffer_view(factor_initial_counts, 0, rational_group_count),
        integer_buffer_view(factor_initial_complete, 0, rational_group_count),
        integer_buffer_view(factor_ramification, 0, factor_count),
        initial_relation_state,
        integer_buffer_view(initial_relation_basis, 0, factor_count * factor_count),
        integer_buffer_view(
            initial_relation_records, 0, relation_capacity * factor_count
        ),
        integer_buffer_view(initial_relation_hashes, 0, relation_capacity),
        integer_buffer_view(initial_relation_metadata, 0, relation_capacity * 3),
        integer_buffer_view(initial_relation, 0, factor_count),
        integer_buffer_view(initial_relation_scratch, 0, factor_count),
        integer_buffer_view(initial_relation_generators, 0, relation_capacity * 3),
        initial_root_state,
    )
    if initial_count < 1:
        return 12
    log_stride = 7 * (factor_real_places + factor_complex_pairs)
    initial_k0 = int(factor_root_state[7])
    with NativeWorkspaceArena(3000000000) as gate_workspace:
        gate_ancestry_current = gate_workspace.integer_buffer(
            uint64(relation_target), 64
        )
        gate_ancestry_old = gate_workspace.integer_buffer(uint64(relation_target), 64)
        gate_ancestry_joined = gate_workspace.integer_buffer(
            uint64(relation_target), 64
        )
        gate_ancestry_work = gate_workspace.integer_buffer(uint64(relation_target), 64)
        for i in range(19):
            gate_outer_state[i] = 0
        gate_outer_state[0] = relation_target - initial_count
        gate_outer_state[1] = int(factor_root_state[7])
        gate_outer_state[4] = factor_count + 1
        for i in range(len(gate_admission_prime_offsets)):
            gate_admission_prime_offsets[i] = -1
            gate_admission_prime_counts[i] = 0
        for i in range(rational_group_count):
            prime = int(factor_initial_primes[i])
            gate_admission_prime_offsets[prime] = factor_initial_offsets[i]
            gate_admission_prime_counts[prime] = factor_initial_counts[i]
        for i in range(factor_count):
            gate_packet_ids[i] = i + 1
            descriptor = int(factor_selected_indices[i])
            gate_packet_generators[3 * i] = factor_catalog_generators[3 * descriptor]
            gate_packet_generators[3 * i + 1] = factor_catalog_generators[
                3 * descriptor + 1
            ]
            gate_packet_generators[3 * i + 2] = factor_catalog_generators[
                3 * descriptor + 2
            ]
            gate_outer_perm[i] = factor_permutation[i]
        diagnostic_stage_switch(1)
        status = pari_collect_and_log_relations(
            gate_matrix,
            gate_ideal,
            gate_n,
            gate_precision,
            gate_scale,
            gate_track_small,
            gate_reduction,
            gate_vectors,
            gate_betas,
            gate_norms,
            gate_column,
            gate_float_q,
            gate_float_v,
            gate_bound,
            gate_cache,
            gate_a,
            gate_b,
            gate_p,
            gate_q,
            gate_stack,
            gate_x,
            gate_y,
            gate_z,
            gate_inc,
            gate_state,
            gate_cursor_output,
            gate_element,
            gate_counters,
            gate_admission_matrix_m,
            gate_admission_matrix_p,
            gate_admission_matrix_e,
            factor_embedding_m,
            factor_embedding_p,
            factor_embedding_e,
            gate_admission_real_count,
            gate_admission_ideal,
            gate_admission_mode,
            int(factor_base_state[6]),
            factor_runtime_primes,
            factor_runtime_products,
            factor_factor_limit,
            factor_prime_limit,
            gate_admission_rational_factors,
            gate_admission_rational_exponents,
            gate_admission_prime_offsets,
            gate_admission_prime_counts,
            integer_buffer_view(factor_selected_tau, 0, factor_count * 9),
            integer_buffer_view(factor_ramification, 0, factor_count),
            integer_buffer_view(factor_residue_degrees, 0, factor_count),
            integer_buffer_view(factor_inert_flags, 0, factor_count),
            gate_admission_tau,
            gate_admission_x,
            gate_admission_y,
            gate_admission_spare,
            gate_admission_stack,
            gate_admission_primitive,
            gate_admission_columns,
            gate_admission_values,
            gate_admission_temporary,
            gate_admission_indices,
            gate_admission_exponents,
            gate_diagnostic,
            gate_nrelid,
            gate_track_fact,
            gate_jid0,
            gate_e0,
            integer_buffer_view(factor_subfactor, 0, 4),
            gate_extra,
            gate_extra_count,
            integer_buffer_view(factor_relation_primes, 0, factor_count),
            integer_buffer_view(factor_ramification, 0, factor_count),
            integer_buffer_view(initial_relation, 0, factor_count),
            initial_relation_state,
            integer_buffer_view(initial_relation_basis, 0, factor_count * factor_count),
            integer_buffer_view(
                initial_relation_records, 0, relation_capacity * factor_count
            ),
            integer_buffer_view(initial_relation_hashes, 0, relation_capacity),
            integer_buffer_view(initial_relation_metadata, 0, relation_capacity * 3),
            integer_buffer_view(initial_relation_scratch, 0, factor_count),
            integer_buffer_view(initial_relation_generators, 0, relation_capacity * 3),
            gate_progress,
            gate_preparation_rounded_embedding,
            gate_preparation_embedding,
            gate_preparation_original,
            gate_preparation_basis,
            gate_preparation_transform,
            gate_preparation_flags,
            gate_preparation_rank_diagnostic,
            gate_preparation_selection,
            gate_preparation_stages,
            gate_preparation_flatter_input,
            gate_preparation_current,
            gate_preparation_flatter_transform,
            gate_preparation_total_work,
            gate_preparation_step_t,
            gate_preparation_step_s,
            gate_preparation_product,
            gate_preparation_next_basis,
            gate_preparation_y,
            gate_preparation_diagnostic,
            gate_preparation_r1,
            gate_preparation_r2,
            gate_preparation_r3,
            gate_preparation_t1,
            gate_preparation_t2,
            gate_preparation_t3,
            gate_preparation_integers,
            gate_preparation_inverse,
            gate_preparation_first,
            gate_preparation_second,
            gate_preparation_final,
            gate_preparation_rounded,
            gate_preparation_mu,
            gate_preparation_r,
            gate_preparation_s,
            gate_preparation_approximate,
            gate_preparation_exponents,
            gate_preparation_float_gram,
            gate_preparation_gram,
            gate_preparation_mu_exponents,
            gate_preparation_r_exponents,
            gate_preparation_s_exponents,
            gate_preparation_alpha,
            gate_preparation_column_exponents,
            gate_preparation_float_scratch,
            gate_preparation_temporary,
            gate_preparation_state,
            integer_buffer_view(factor_permutation, 0, factor_count),
            factor_count,
            integer_buffer_view(gate_packet_ids, 0, factor_count),
            integer_buffer_view(factor_packet_ideals, 0, factor_count * 9),
            integer_buffer_view(factor_packet_norms, 0, factor_count),
            gate_schedule,
            gate_construct_primes,
            factor_basis_table,
            integer_buffer_view(factor_relation_primes, 0, factor_count),
            gate_packet_generators,
            integer_buffer_view(factor_inert_flags, 0, factor_count),
            gate_hnf_generator,
            gate_hnf_matrix,
            gate_hnf_work,
            gate_hnf_pivots,
            gate_power_ideal,
            gate_power_alpha,
            gate_power_metadata,
            gate_power_primitive,
            gate_power_temporary,
            gate_power_diagnostic,
            gate_power_multiplication,
            gate_power_work,
            gate_power_triangular,
            gate_power_moduli,
            gate_product_primitive,
            gate_product_matrix,
            gate_outer_mode,
            gate_outer_ru,
            gate_outer_state,
            integer_buffer_view(factor_minidx, 0, factor_count),
            gate_outer_present,
            gate_outer_live,
            gate_outer_perm,
            gate_outer_multiplier,
            gate_log_precision,
            gate_log_completed,
            gate_log_embeddings,
            gate_log_coordinates,
            gate_log_column,
            gate_log_cache,
            gate_log_pi_cache,
            gate_log_a,
            gate_log_b,
            gate_log_p,
            gate_log_q,
            gate_log_stack,
            initial_count,
        )
        if status != 0 and status != 1:
            return 20 + status
        if initial_relation_state[0] != gate_log_completed[0]:
            return 30
        initial_columns = int(initial_relation_state[0])
        gate_initial_hnf_dense = gate_workspace.integer_buffer(
            uint64(initial_k0 * initial_columns), 6
        )
        gate_initial_hnf_transform = gate_workspace.integer_buffer(
            uint64(initial_columns * initial_columns), 16
        )
        gate_initial_hnf_bottom = gate_workspace.integer_buffer(
            uint64((factor_count - initial_k0) * initial_columns), 6
        )
        gate_initial_hnf_updated_dense = gate_workspace.integer_buffer(
            uint64(initial_k0 * initial_columns), 6
        )
        gate_initial_hnf_extra = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_rank_matrix = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_occupied = gate_workspace.integer_buffer(
            uint64(initial_columns), 6
        )
        gate_initial_hnf_pivots = gate_workspace.integer_buffer(uint64(factor_count), 6)
        gate_initial_hnf_best = gate_workspace.integer_buffer(uint64(factor_count), 6)
        gate_initial_hnf_profile = gate_workspace.integer_buffer(
            uint64(factor_count + 1), 6
        )
        gate_initial_hnf_rank_state = gate_workspace.integer_buffer(uint64(10), 6)
        gate_initial_hnf_matbnew = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_dep = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_b = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_transformed_logs = gate_workspace.integer_buffer(
            uint64(log_stride * initial_columns), 8
        )
        gate_initial_hnf_full_h = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 16
        )
        gate_initial_hnf_hnf_transform = gate_workspace.integer_buffer(
            uint64(initial_columns * initial_columns), 16
        )
        gate_initial_hnf_lam = gate_workspace.integer_buffer(
            uint64(initial_columns * initial_columns), 16
        )
        gate_initial_hnf_d = gate_workspace.integer_buffer(
            uint64(initial_columns + 1), 16
        )
        gate_initial_hnf_full_dep = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 16
        )
        gate_initial_hnf_work_b = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 16
        )
        gate_initial_hnf_work_c = gate_workspace.integer_buffer(
            uint64(log_stride * initial_columns), 8
        )
        gate_initial_hnf_result_h = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_result_dep = gate_workspace.integer_buffer(
            uint64(factor_count * initial_columns), 6
        )
        gate_initial_hnf_result_b = gate_workspace.integer_buffer(
            uint64(factor_count * (initial_columns + factor_count)), 6
        )
        gate_initial_hnf_result_c = gate_workspace.integer_buffer(
            uint64(log_stride * initial_columns), 8
        )
        gate_initial_hnf_cup_arena = gate_workspace.integer_buffer(uint64(8_000_000), 2)
        gate_initial_hnf_cup_frames = gate_workspace.integer_buffer(uint64(64), 2)
        for i in range(factor_count * initial_columns):
            gate_initial_hnf_original[i] = int(initial_relation_records[i])
        for i in range(factor_count):
            gate_initial_hnf_perm[i] = int(factor_permutation[i])
        diagnostic_stage_switch(2)
        status = pari_hnfspec_complete(
            gate_initial_hnf_original,
            checked_int64(factor_count),
            checked_int64(int(initial_relation_state[0])),
            gate_initial_hnf_perm,
            checked_int64(int(factor_root_state[7])),
            gate_log_embeddings,
            checked_int64(factor_real_places + factor_complex_pairs),
            gate_initial_hnf_mat,
            gate_initial_hnf_dense,
            gate_initial_hnf_transform,
            gate_initial_hnf_vmax,
            gate_initial_hnf_found,
            gate_initial_hnf_sparse_state,
            gate_initial_hnf_bottom,
            gate_initial_hnf_updated_dense,
            gate_initial_hnf_extra,
            gate_initial_hnf_cleanup_state,
            gate_initial_hnf_rank_matrix,
            gate_initial_hnf_occupied,
            gate_initial_hnf_pivots,
            gate_initial_hnf_best,
            gate_initial_hnf_profile,
            gate_initial_hnf_rank_state,
            gate_initial_hnf_perm_work,
            gate_initial_hnf_matbnew,
            gate_initial_hnf_dep,
            gate_initial_hnf_b,
            gate_initial_hnf_assembly_state,
            gate_initial_hnf_transformed_logs,
            gate_initial_hnf_full_h,
            gate_initial_hnf_hnf_transform,
            gate_initial_hnf_lam,
            gate_initial_hnf_d,
            gate_initial_hnf_hnf_state,
            gate_initial_hnf_full_dep,
            gate_initial_hnf_work_b,
            gate_initial_hnf_work_c,
            gate_initial_hnf_diagonal,
            gate_initial_hnf_result_h,
            gate_initial_hnf_result_dep,
            gate_initial_hnf_result_b,
            gate_initial_hnf_result_c,
            gate_initial_hnf_final_state,
            gate_initial_hnf_state,
            gate_initial_hnf_cup_arena,
            gate_initial_hnf_cup_frames,
            gate_initial_hnf_cup_solve_state,
            gate_initial_hnf_cup_state,
        )
        if status != 0:
            return 40 + status
        append_lig_ceiling = factor_count - int(gate_initial_hnf_state[2])
        initial_reverse_lig = int(gate_initial_hnf_assembly_state[0]) + int(
            gate_initial_hnf_assembly_state[1]
        )
        initial_reverse_tail = int(gate_initial_hnf_assembly_state[4])
        if append_lig_ceiling < 1 or append_lig_ceiling > 16:
            return 49
        if initial_reverse_lig < 1 or initial_reverse_lig > factor_count:
            return 50
        if initial_reverse_tail < 0 or initial_reverse_tail > factor_count:
            return 50
        if int(gate_initial_hnf_state[0]) < 1 or int(gate_initial_hnf_state[0]) > 16:
            return 51
        ancestry_trailing_length = initial_reverse_lig * initial_reverse_tail
        if ancestry_trailing_length < 16 * factor_count:
            ancestry_trailing_length = 16 * factor_count
        gate_ancestry_trailing_work = gate_workspace.integer_buffer(
            uint64(ancestry_trailing_length), 32
        )
        append_width_ceiling = 24
        gate_append_top = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * 8), 16
        )
        gate_append_exact_product = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * 8), 16
        )
        gate_append_log_product = gate_workspace.integer_buffer(
            uint64(log_stride * 8), 16
        )
        gate_append_adjusted_logs = gate_workspace.integer_buffer(
            uint64(log_stride * 8), 16
        )
        gate_append_joined = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append_joined_logs = gate_workspace.integer_buffer(
            uint64(log_stride * relation_target), 16
        )
        gate_append_rank_matrix = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append_occupied = gate_workspace.integer_buffer(
            uint64(append_width_ceiling), 16
        )
        gate_append_pivots = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling), 16
        )
        gate_append_best = gate_workspace.integer_buffer(uint64(append_lig_ceiling), 16)
        gate_append_profile = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling), 16
        )
        gate_append1_rank_state = gate_workspace.integer_buffer(uint64(10), 16)
        gate_append2_rank_state = gate_workspace.integer_buffer(uint64(10), 16)
        gate_append_matb = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append_new_dep = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append1_permuted_b = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * factor_count), 16
        )
        gate_append2_permuted_b = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * factor_count), 16
        )
        gate_append1_full_h = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append2_full_h = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append1_transform = gate_workspace.integer_buffer(
            uint64(append_width_ceiling * append_width_ceiling), 16
        )
        gate_append2_transform = gate_workspace.integer_buffer(
            uint64(append_width_ceiling * append_width_ceiling), 16
        )
        gate_append_lam = gate_workspace.integer_buffer(
            uint64(append_width_ceiling * append_width_ceiling), 16
        )
        gate_append_d = gate_workspace.integer_buffer(
            uint64(append_width_ceiling + 1), 16
        )
        gate_append1_full_dep = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append2_full_dep = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_width_ceiling), 16
        )
        gate_append_work_b = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * factor_count), 16
        )
        gate_append_work_c = gate_workspace.integer_buffer(
            uint64(log_stride * relation_target), 16
        )
        gate_append_final_c = gate_workspace.integer_buffer(
            uint64(log_stride * relation_target), 16
        )
        gate_append1_result_h = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_lig_ceiling), 16
        )
        gate_append2_result_h = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_lig_ceiling), 16
        )
        gate_append1_result_dep = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_lig_ceiling), 16
        )
        gate_append2_result_dep = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * append_lig_ceiling), 16
        )
        gate_append1_result_b = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * factor_count), 16
        )
        gate_append2_result_b = gate_workspace.integer_buffer(
            uint64(append_lig_ceiling * factor_count), 16
        )
        gate_append1_result_c = gate_workspace.integer_buffer(
            uint64(log_stride * relation_target), 16
        )
        gate_append2_result_c = gate_workspace.integer_buffer(
            uint64(log_stride * relation_target), 16
        )
        for i in range(factor_count):
            gate_ancestry_perm1[i] = gate_initial_hnf_perm[i]
        initial_relation_state[4] = initial_columns
        squash = 0
        checkpoint = 0
        diagnostic_stage_switch(3)
        for pass_index in range(13):
            if checkpoint == 0:
                current_h_rows = int(gate_initial_hnf_state[0])
                current_b_columns = int(gate_initial_hnf_state[2])
                current_total = int(gate_initial_hnf_state[7])
            else:
                current_h_rows = int(gate_append1_state[0])
                current_b_columns = int(gate_append1_state[2])
                current_total = int(gate_append1_state[7])
            need = factor_count - current_h_rows - current_b_columns
            if need <= 0:
                break
            status = pari_row14_prepare_next_pass(
                gate_initial_hnf_perm,
                factor_count,
                current_h_rows,
                need,
                squash,
                factor_permutation,
                gate_outer_perm,
                1,
                gate_outer_state,
                initial_relation_state,
                gate_schedule,
                gate_log_completed,
                gate_next_control,
            )
            if status != 0:
                return 60 + status
            squash = int(gate_next_control[1])
            status = pari_collect_and_log_relations(
                gate_matrix,
                gate_ideal,
                gate_n,
                gate_precision,
                gate_scale,
                gate_track_small,
                gate_reduction,
                gate_vectors,
                gate_betas,
                gate_norms,
                gate_column,
                gate_float_q,
                gate_float_v,
                gate_bound,
                gate_cache,
                gate_a,
                gate_b,
                gate_p,
                gate_q,
                gate_stack,
                gate_x,
                gate_y,
                gate_z,
                gate_inc,
                gate_state,
                gate_cursor_output,
                gate_element,
                gate_counters,
                gate_admission_matrix_m,
                gate_admission_matrix_p,
                gate_admission_matrix_e,
                factor_embedding_m,
                factor_embedding_p,
                factor_embedding_e,
                gate_admission_real_count,
                gate_admission_ideal,
                gate_admission_mode,
                int(factor_base_state[6]),
                factor_runtime_primes,
                factor_runtime_products,
                factor_factor_limit,
                factor_prime_limit,
                gate_admission_rational_factors,
                gate_admission_rational_exponents,
                gate_admission_prime_offsets,
                gate_admission_prime_counts,
                integer_buffer_view(factor_selected_tau, 0, factor_count * 9),
                integer_buffer_view(factor_ramification, 0, factor_count),
                integer_buffer_view(factor_residue_degrees, 0, factor_count),
                integer_buffer_view(factor_inert_flags, 0, factor_count),
                gate_admission_tau,
                gate_admission_x,
                gate_admission_y,
                gate_admission_spare,
                gate_admission_stack,
                gate_admission_primitive,
                gate_admission_columns,
                gate_admission_values,
                gate_admission_temporary,
                gate_admission_indices,
                gate_admission_exponents,
                gate_diagnostic,
                gate_nrelid,
                gate_track_fact,
                gate_jid0,
                gate_e0,
                integer_buffer_view(factor_subfactor, 0, 4),
                gate_extra,
                gate_extra_count,
                integer_buffer_view(factor_relation_primes, 0, factor_count),
                integer_buffer_view(factor_ramification, 0, factor_count),
                integer_buffer_view(initial_relation, 0, factor_count),
                initial_relation_state,
                integer_buffer_view(
                    initial_relation_basis, 0, factor_count * factor_count
                ),
                integer_buffer_view(
                    initial_relation_records, 0, relation_capacity * factor_count
                ),
                integer_buffer_view(initial_relation_hashes, 0, relation_capacity),
                integer_buffer_view(
                    initial_relation_metadata, 0, relation_capacity * 3
                ),
                integer_buffer_view(initial_relation_scratch, 0, factor_count),
                integer_buffer_view(
                    initial_relation_generators, 0, relation_capacity * 3
                ),
                gate_progress,
                gate_preparation_rounded_embedding,
                gate_preparation_embedding,
                gate_preparation_original,
                gate_preparation_basis,
                gate_preparation_transform,
                gate_preparation_flags,
                gate_preparation_rank_diagnostic,
                gate_preparation_selection,
                gate_preparation_stages,
                gate_preparation_flatter_input,
                gate_preparation_current,
                gate_preparation_flatter_transform,
                gate_preparation_total_work,
                gate_preparation_step_t,
                gate_preparation_step_s,
                gate_preparation_product,
                gate_preparation_next_basis,
                gate_preparation_y,
                gate_preparation_diagnostic,
                gate_preparation_r1,
                gate_preparation_r2,
                gate_preparation_r3,
                gate_preparation_t1,
                gate_preparation_t2,
                gate_preparation_t3,
                gate_preparation_integers,
                gate_preparation_inverse,
                gate_preparation_first,
                gate_preparation_second,
                gate_preparation_final,
                gate_preparation_rounded,
                gate_preparation_mu,
                gate_preparation_r,
                gate_preparation_s,
                gate_preparation_approximate,
                gate_preparation_exponents,
                gate_preparation_float_gram,
                gate_preparation_gram,
                gate_preparation_mu_exponents,
                gate_preparation_r_exponents,
                gate_preparation_s_exponents,
                gate_preparation_alpha,
                gate_preparation_column_exponents,
                gate_preparation_float_scratch,
                gate_preparation_temporary,
                gate_preparation_state,
                integer_buffer_view(factor_permutation, 0, factor_count),
                int(gate_next_control[0]),
                integer_buffer_view(gate_packet_ids, 0, factor_count),
                integer_buffer_view(factor_packet_ideals, 0, factor_count * 9),
                integer_buffer_view(factor_packet_norms, 0, factor_count),
                gate_schedule,
                gate_construct_primes,
                factor_basis_table,
                integer_buffer_view(factor_relation_primes, 0, factor_count),
                gate_packet_generators,
                integer_buffer_view(factor_inert_flags, 0, factor_count),
                gate_hnf_generator,
                gate_hnf_matrix,
                gate_hnf_work,
                gate_hnf_pivots,
                gate_power_ideal,
                gate_power_alpha,
                gate_power_metadata,
                gate_power_primitive,
                gate_power_temporary,
                gate_power_diagnostic,
                gate_power_multiplication,
                gate_power_work,
                gate_power_triangular,
                gate_power_moduli,
                gate_product_primitive,
                gate_product_matrix,
                gate_outer_mode,
                gate_outer_ru,
                gate_outer_state,
                integer_buffer_view(factor_minidx, 0, factor_count),
                gate_outer_present,
                gate_outer_live,
                gate_outer_perm,
                gate_outer_multiplier,
                gate_log_precision,
                gate_log_completed,
                gate_log_embeddings,
                gate_log_coordinates,
                gate_log_column,
                gate_log_cache,
                gate_log_pi_cache,
                gate_log_a,
                gate_log_b,
                gate_log_p,
                gate_log_q,
                gate_log_stack,
                initial_count,
            )
            if status != 0 and status != 1:
                return 70 + status
            columns = int(initial_relation_state[0])
            if columns == current_total:
                continue
            new_columns = columns - current_total
            if new_columns < 1 or new_columns > 8:
                return 89
            if checkpoint == 0:
                for i in range(factor_count * new_columns):
                    gate_append1_new_relations[i] = int(
                        initial_relation_records[factor_count * current_total + i]
                    )
                status = pari_hnfadd(
                    gate_initial_hnf_result_h,
                    current_h_rows,
                    gate_initial_hnf_result_dep,
                    gate_initial_hnf_result_b,
                    current_b_columns,
                    gate_initial_hnf_result_c,
                    current_total,
                    factor_real_places + factor_complex_pairs,
                    gate_initial_hnf_perm,
                    factor_count,
                    gate_append1_new_relations,
                    new_columns,
                    integer_buffer_view(
                        gate_log_embeddings,
                        log_stride * current_total,
                        log_stride * new_columns,
                    ),
                    gate_append_top,
                    gate_append_exact_product,
                    gate_append_log_product,
                    gate_append_adjusted_logs,
                    gate_append_joined,
                    gate_append_joined_logs,
                    gate_append_rank_matrix,
                    gate_append_occupied,
                    gate_append_pivots,
                    gate_append_best,
                    gate_append_profile,
                    gate_append1_rank_state,
                    gate_append1_perm_work,
                    gate_append_matb,
                    gate_append_new_dep,
                    gate_append1_permuted_b,
                    gate_append1_full_h,
                    gate_append1_transform,
                    gate_append_lam,
                    gate_append_d,
                    gate_append1_hnf_state,
                    gate_append1_full_dep,
                    gate_append_work_b,
                    gate_append_work_c,
                    gate_append1_diagonal,
                    gate_append_final_c,
                    gate_append1_result_h,
                    gate_append1_result_dep,
                    gate_append1_result_b,
                    gate_append1_result_c,
                    gate_append1_final_state,
                    gate_append1_state,
                )
                if status != 0:
                    return 90 + status
                if factor_count - int(gate_append1_state[2]) > append_lig_ceiling:
                    return 99
                if int(gate_append1_state[0]) > 16:
                    return 100
                initial_relation_state[4] = columns
                for i in range(factor_count):
                    gate_ancestry_perm2[i] = gate_initial_hnf_perm[i]
                checkpoint = 1
                if gate_append1_state[0] + gate_append1_state[2] >= factor_count:
                    break
            else:
                for i in range(factor_count * new_columns):
                    gate_append2_new_relations[i] = int(
                        initial_relation_records[factor_count * current_total + i]
                    )
                status = pari_hnfadd(
                    gate_append1_result_h,
                    current_h_rows,
                    gate_append1_result_dep,
                    gate_append1_result_b,
                    current_b_columns,
                    gate_append1_result_c,
                    current_total,
                    factor_real_places + factor_complex_pairs,
                    gate_initial_hnf_perm,
                    factor_count,
                    gate_append2_new_relations,
                    new_columns,
                    integer_buffer_view(
                        gate_log_embeddings,
                        log_stride * current_total,
                        log_stride * new_columns,
                    ),
                    gate_append_top,
                    gate_append_exact_product,
                    gate_append_log_product,
                    gate_append_adjusted_logs,
                    gate_append_joined,
                    gate_append_joined_logs,
                    gate_append_rank_matrix,
                    gate_append_occupied,
                    gate_append_pivots,
                    gate_append_best,
                    gate_append_profile,
                    gate_append2_rank_state,
                    gate_append2_perm_work,
                    gate_append_matb,
                    gate_append_new_dep,
                    gate_append2_permuted_b,
                    gate_append2_full_h,
                    gate_append2_transform,
                    gate_append_lam,
                    gate_append_d,
                    gate_append2_hnf_state,
                    gate_append2_full_dep,
                    gate_append_work_b,
                    gate_append_work_c,
                    gate_append2_diagonal,
                    gate_append_final_c,
                    gate_append2_result_h,
                    gate_append2_result_dep,
                    gate_append2_result_b,
                    gate_append2_result_c,
                    gate_append2_final_state,
                    gate_append2_state,
                )
                if status != 0:
                    return 110 + status
                if factor_count - int(gate_append2_state[2]) > append_lig_ceiling:
                    return 118
                if int(gate_append2_state[0]) > 16:
                    return 118
                initial_relation_state[4] = columns
                checkpoint = 2
                if gate_append2_state[0] + gate_append2_state[2] < factor_count:
                    return 119
                break
        initial_retained = checked_int64(int(gate_initial_hnf_sparse_state[0]) - 1)
        for word_index in range(initial_retained * initial_retained):
            gate_initial_hnf_mat[word_index] = checked_int64(
                gate_initial_hnf_transform[word_index]
            )
        diagnostic_stage_switch(4)
        status = pari_row6_phase6_gate_ancestry_private(
            initial_relation_records,
            gate_log_embeddings,
            factor_count,
            initial_columns,
            checkpoint,
            factor_real_places + factor_complex_pairs,
            gate_initial_hnf_state,
            gate_initial_hnf_assembly_state,
            gate_initial_hnf_mat,
            gate_initial_hnf_b,
            gate_initial_hnf_hnf_transform,
            gate_initial_hnf_full_h,
            gate_initial_hnf_full_dep,
            gate_initial_hnf_diagonal,
            gate_append1_rank_state,
            gate_append1_state,
            gate_append1_permuted_b,
            gate_append1_transform,
            gate_append1_full_h,
            gate_append1_full_dep,
            gate_append1_diagonal,
            gate_ancestry_perm1,
            gate_append2_rank_state,
            gate_append2_state,
            gate_append2_permuted_b,
            gate_append2_transform,
            gate_append2_full_h,
            gate_append2_full_dep,
            gate_append2_diagonal,
            gate_ancestry_perm2,
            gate_initial_hnf_result_c,
            gate_append1_result_c,
            gate_append2_result_c,
            gate_initial_hnf_perm,
            gate_ancestry_current,
            gate_ancestry_old,
            gate_ancestry_joined,
            gate_ancestry_work,
            gate_ancestry_trailing_work,
            gate_ancestry_raw_to_all,
            gate_ancestry_accepted_arch,
            gate_ancestry_accepted_signs,
            gate_ancestry_phase_pi,
            gate_ancestry_active_rows,
            gate_ancestry_state,
        )
        if status != 0:
            return 130 + status
        if checkpoint == 0:
            for i in range(9):
                gate_append2_state[i] = gate_initial_hnf_state[i]
            for i in range(gate_initial_hnf_state[0] * gate_initial_hnf_state[0]):
                gate_append2_result_h[i] = gate_initial_hnf_result_h[i]
            initial_lig = factor_count - int(gate_initial_hnf_state[2])
            for i in range(initial_lig * int(gate_initial_hnf_state[2])):
                gate_append2_result_b[i] = gate_initial_hnf_result_b[i]
            for i in range(log_stride * initial_columns):
                gate_append2_result_c[i] = gate_initial_hnf_result_c[i]
        elif checkpoint == 1:
            for i in range(9):
                gate_append2_state[i] = gate_append1_state[i]
            for i in range(gate_append1_state[0] * gate_append1_state[0]):
                gate_append2_result_h[i] = gate_append1_result_h[i]
            append1_lig = factor_count - int(gate_append1_state[2])
            for i in range(append1_lig * int(gate_append1_state[2])):
                gate_append2_result_b[i] = gate_append1_result_b[i]
            for i in range(log_stride * gate_append1_state[7]):
                gate_append2_result_c[i] = gate_append1_result_c[i]
        final_h_rows = int(gate_append2_state[0])
        final_b_columns = int(gate_append2_state[2])
        final_columns = int(gate_append2_state[7])
        final_lig = factor_count - final_b_columns
        if final_h_rows < 1 or final_h_rows > 16 or final_lig < 1 or final_lig > 16:
            return 131
        if len(gate_final_h) < 16 * 16:
            return 132
        if len(gate_final_b) < 16 * factor_count:
            return 133
        if len(gate_final_c) < log_stride * relation_target:
            return 134
        for i in range(final_h_rows * final_h_rows):
            gate_final_h[i] = gate_append2_result_h[i]
        for i in range(final_lig * final_b_columns):
            gate_final_b[i] = gate_append2_result_b[i]
        for i in range(log_stride * final_columns):
            gate_final_c[i] = gate_append2_result_c[i]
        return 0


__all__ = ["pari_row6_phase6_gate_prefix_root"]
