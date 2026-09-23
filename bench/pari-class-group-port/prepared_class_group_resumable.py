"""Prepared native class-group collection/reconstruction retry corridor.

PARI 2.17.4 algorithm, copyright (C) The PARI group; GPL-2.0-or-later.
Prepared nf/factor-base descriptors and analytic inverse hR enter, never
relations, HNF results, regulator answers or retry decisions. This first
closure supports initial acceptance and reconstruction-RELAT retries with
native-computed empty W and full B. Other driver branches stop explicitly.
Original embedding columns remain separate from transformed HNF C. Live HNF
output copying replaces PARI's owner publication; that representation cost is
explicit. No equal-work timing or fundamental-unit-map claim is made here.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native
from .relation_insertion import pari_initialize_owned_relations
from .collected_log_embeddings import pari_collect_and_log_relations
from .hnfspec_complete import pari_hnfspec_complete
from .post_hnf_acceptance import pari_post_hnf_acceptance
from .collector_next_pass import pari_prepare_next_small_norm_pass
from .connected_hnfadd_acceptance import pari_connected_hnfadd_acceptance
from .class_invariant_output import pari_class_invariant_output
from .relation_owner_capacity import (
    pari_relation_capacity_report,
    pari_relation_capacity_sufficient,
)


@native
def _pari_resumable_stop(state: Int64Buffer, action: int) -> int:
    state[1] = action
    state[0] = 4
    return action


@native
def _pari_prepare_relation_search(
    permutation: Int64Buffer,
    rows: int,
    h_rows: int,
    need: int,
    squash_index: int,
    search_ideals: IntegerBuffer,
    outer_permutation: IntegerBuffer,
) -> tuple[int, int]:
    """Prepare source `F.L_jid` after one HNF dimension decision.

    Positive need uses the sorted leading physical rows.  A dimension-ready
    state retains the complete permutation, with the source squash rotation
    applied to its nonzero H block.  Return the live search length and next
    squash index.  Orbit trimming remains in the connected outer scheduler.
    """
    if rows < 1 or h_rows < 0 or h_rows > rows or need < 0 or need > rows:
        raise ValueError("invalid resident relation-search dimensions")
    if (
        len(permutation) < rows
        or len(search_ideals) < rows
        or len(outer_permutation) < rows
    ):
        raise ValueError("short resident relation-search owner")
    for i in range(rows):
        search_ideals[i] = int(permutation[i])
        outer_permutation[i] = int(permutation[i])
    if need > 0:
        # `vecsmall_sort(vecslice(F.perm, 1, need))`.
        for i in range(1, need):
            value = search_ideals[i]
            j = i
            while j > 0 and search_ideals[j - 1] > value:
                search_ideals[j] = search_ideals[j - 1]
                j -= 1
            search_ideals[j] = value
        return need, squash_index
    if h_rows > 1 and squash_index % h_rows != 0:
        for i in range(h_rows):
            search_ideals[i] = int(permutation[(i + squash_index) % h_rows])
    return rows, squash_index + 1


@native
def _pari_publish_appended_hnf(
    rows: int,
    places: int,
    append_state: Int64Buffer,
    append_h: IntegerBuffer,
    append_dep: IntegerBuffer,
    append_b: IntegerBuffer,
    append_c: IntegerBuffer,
    resident_state: Int64Buffer,
    resident_h: IntegerBuffer,
    resident_dep: IntegerBuffer,
    resident_b: IntegerBuffer,
    resident_c: IntegerBuffer,
) -> int:
    """Publish every live HNF owner after a successful append transaction."""
    if len(append_state) < 9 or len(resident_state) < 9:
        raise ValueError("short appended HNF state")
    h_rows = int(append_state[0])
    b_columns = int(append_state[2])
    columns = int(append_state[7])
    if (
        rows < 0
        or places < 1
        or h_rows < 0
        or b_columns < 0
        or h_rows + b_columns > rows
        or columns < h_rows + b_columns
    ):
        raise ValueError("invalid appended HNF dimensions")
    dep_rows = rows - b_columns - h_rows
    lig = rows - b_columns
    if (
        len(append_h) < h_rows * h_rows
        or len(resident_h) < h_rows * h_rows
        or len(append_dep) < dep_rows * h_rows
        or len(resident_dep) < dep_rows * h_rows
        or len(append_b) < lig * b_columns
        or len(resident_b) < lig * b_columns
        or len(append_c) < 7 * places * columns
        or len(resident_c) < 7 * places * columns
    ):
        raise ValueError("short appended HNF publication owner")
    for i in range(h_rows * h_rows):
        resident_h[i] = append_h[i]
    for i in range(dep_rows * h_rows):
        resident_dep[i] = append_dep[i]
    for i in range(lig * b_columns):
        resident_b[i] = append_b[i]
    copied = 7 * places * columns
    for i in range(copied):
        resident_c[i] = append_c[i]
    for i in range(9):
        resident_state[i] = append_state[i]
    return copied


@native
def pari_prepared_class_group_resumable(
    matrix: IntegerBuffer,
    ideal: IntegerBuffer,
    n: int,
    precision: int,
    scale: float,
    track_small: int,
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
    admission_mode: int,
    admission_factor_product: int,
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
    nrelid: int,
    track_fact: int,
    jid0: int,
    e0: int,
    subfactor: IntegerBuffer,
    extra: IntegerBuffer,
    extra_count: int,
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
    search_count: int,
    packet_ids: IntegerBuffer,
    packet_ideals: IntegerBuffer,
    packet_norms: IntegerBuffer,
    schedule: Int64Buffer,
    construct_primes: int,
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
    outer_ru: int,
    outer_state: Int64Buffer,
    outer_minidx: IntegerBuffer,
    outer_present: IntegerBuffer,
    outer_live: IntegerBuffer,
    outer_perm: IntegerBuffer,
    outer_multiplier: IntegerBuffer,
    log_precision: int,
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
    initial_additional: int,
    initial_primes: IntegerBuffer,
    initial_offsets: IntegerBuffer,
    initial_counts: IntegerBuffer,
    initial_complete: IntegerBuffer,
    hnf_k0: int,
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
    hnf_cup_arena: IntegerBuffer,
    hnf_cup_frames: IntegerBuffer,
    hnf_cup_solve_state: Int64Buffer,
    hnf_cup_state: Int64Buffer,
    append_new_relations: Int64Buffer,
    append_new_logs: IntegerBuffer,
    append_top: IntegerBuffer,
    append_exact_product: IntegerBuffer,
    append_log_product: IntegerBuffer,
    append_adjusted_logs: IntegerBuffer,
    append_joined: IntegerBuffer,
    append_joined_logs: IntegerBuffer,
    append_rank_matrix: IntegerBuffer,
    append_occupied: IntegerBuffer,
    append_pivots: IntegerBuffer,
    append_best: IntegerBuffer,
    append_profile: IntegerBuffer,
    append_rank_state: IntegerBuffer,
    append_perm_work: Int64Buffer,
    append_matb: IntegerBuffer,
    append_new_dep: IntegerBuffer,
    append_permuted_b: IntegerBuffer,
    append_full_h: IntegerBuffer,
    append_transform: IntegerBuffer,
    append_lam: IntegerBuffer,
    append_d: IntegerBuffer,
    append_hnf_state: Int64Buffer,
    append_full_dep: IntegerBuffer,
    append_work_b: IntegerBuffer,
    append_work_c: IntegerBuffer,
    append_diagonal: Int64Buffer,
    append_final_c: IntegerBuffer,
    append_result_h: IntegerBuffer,
    append_result_dep: IntegerBuffer,
    append_result_b: IntegerBuffer,
    append_result_c: IntegerBuffer,
    append_final_state: Int64Buffer,
    append_state: Int64Buffer,
    append_attempt_state: Int64Buffer,
    pass_limit: int,
    automorphism_count: int,
    relation_prime_count: int,
    checking_prime_count: int,
    driver_state: Int64Buffer,
    driver_trace: Int64Buffer,
    capacity_state: Int64Buffer,
) -> int:
    """Run at most pass_limit actual passes, publishing only on acceptance.

    Driver state: phase, action, pass count, old_cache, published, invariant
    count, copied transformed-C entries, last. Trace has five words per pass:
    last, acceptance action, selected j, small_fail, fail_limit. Phase4 is
    terminal/idempotent; exceptions retain a nonterminal phase, not resumable
    partial arithmetic. Dimension need, empty collection, changed H/B shape,
    and acceptance actions 3/4/5 are resident retry states. -200 is pass cap;
    -202 rejects inconsistent acceptance retry state; -203 automorphisms; -204
    owner growth; -206 honesty. -207 is a gated outer pass requiring unported
    driver control.
    Native acceptance actions/other negative frontiers retain their meaning.
    Scratch owners and public outputs must be disjoint and fresh as documented
    by their constituent kernels. Public outputs remain untouched on failure.
    """
    if len(driver_state) < 8 or pass_limit < 1 or len(driver_trace) < 5 * pass_limit:
        raise ValueError("short resumable driver state or pass budget")
    if driver_state[0] == 4:
        return int(driver_state[1])
    if driver_state[0] != 0:
        raise ValueError("cannot reuse partial resumable driver")
    rows = int(len(relation))
    places = (n + admission_real_count) // 2
    live_target = rows + initial_additional
    record_reserve = 10 * live_target + 50
    pari_relation_capacity_report(
        rows,
        n,
        places,
        live_target,
        record_reserve,
        0,
        pass_limit,
        1,
        capacity_state,
    )
    if (
        pari_relation_capacity_sufficient(
            rows,
            n,
            places,
            live_target,
            record_reserve,
            0,
            pass_limit,
            relation_state,
            relation_basis,
            relation_records,
            relation_hashes,
            relation_metadata,
            relation,
            relation_scratch,
            generators,
            log_completed,
            log_embeddings,
            log_coordinates,
            log_column,
            search_ideals,
            outer_state,
            outer_minidx,
            outer_present,
            outer_live,
            outer_perm,
            outer_multiplier,
            append_new_relations,
            append_new_logs,
            class_invariants,
            driver_state,
            driver_trace,
        )
        == 0
    ):
        return -204
    if len(outer_state) < 19 or len(log_completed) < 1 or log_completed[0] != 0:
        raise ValueError("resumable driver requires fresh collection owners")
    if len(class_number) < 1 or len(class_invariants) < rows:
        raise ValueError("short class output owners")
    if relation_prime_count < 1 or checking_prime_count < relation_prime_count:
        raise ValueError("invalid factor-base honesty counts")
    driver_state[4] = 0
    driver_state[5] = 0
    driver_state[7] = 0
    if automorphism_count != 1:
        return _pari_resumable_stop(driver_state, -203)
    if checking_prime_count > relation_prime_count:
        return _pari_resumable_stop(driver_state, -206)
    driver_state[0] = 1
    driver_state[2] = 0
    driver_state[3] = 0
    driver_state[4] = 0
    driver_state[5] = 0
    driver_state[6] = 0
    initial_count = pari_initialize_owned_relations(
        initial_additional,
        initial_primes,
        initial_offsets,
        initial_counts,
        initial_complete,
        ramification,
        relation_state,
        relation_basis,
        relation_records,
        relation_hashes,
        relation_metadata,
        relation,
        relation_scratch,
        n,
        generators,
    )
    need = relation_state[5] - relation_state[0]
    if need <= 0 or relation_state[0] + need + automorphism_count >= relation_state[1]:
        required = relation_state[0] + need + automorphism_count
        if required < 1:
            required = 1
        append_need = need
        if append_need < 0:
            append_need = 0
        reserve = 2 * required
        pari_relation_capacity_report(
            rows,
            n,
            places,
            required,
            reserve,
            append_need,
            pass_limit,
            2,
            capacity_state,
        )
        return _pari_resumable_stop(driver_state, -204)
    for i in range(19):
        outer_state[i] = 0
    outer_state[0] = need
    outer_state[1] = nrelid
    outer_state[4] = rows + 1
    outer_ru = places
    for i in range(rows):
        outer_multiplier[i] = 0
        outer_perm[i] = hnf_perm[i]
    action = pari_collect_and_log_relations(
        matrix,
        ideal,
        n,
        precision,
        scale,
        track_small,
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
        admission_mode,
        admission_factor_product,
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
        nrelid,
        track_fact,
        jid0,
        e0,
        subfactor,
        extra,
        extra_count,
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
        search_count,
        packet_ids,
        packet_ideals,
        packet_norms,
        schedule,
        construct_primes,
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
        1,
        outer_ru,
        outer_state,
        outer_minidx,
        outer_present,
        outer_live,
        outer_perm,
        outer_multiplier,
        log_precision,
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
        initial_count,
    )
    if action != 0:
        return _pari_resumable_stop(driver_state, action)
    if outer_state[17] == 3:
        return _pari_resumable_stop(driver_state, -207)
    columns = int(relation_state[0])
    driver_state[2] = 1
    driver_state[7] = columns
    for i in range(rows * columns):
        hnf_original[i] = int(relation_records[i])
    action = pari_hnfspec_complete(
        hnf_original,
        rows,
        columns,
        hnf_perm,
        hnf_k0,
        log_embeddings,
        (n + admission_real_count) // 2,
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
        hnf_cup_arena,
        hnf_cup_frames,
        hnf_cup_solve_state,
        hnf_cup_state,
    )
    if action != 0:
        return _pari_resumable_stop(driver_state, action)
    relation_state[4] = columns
    current_h = int(hnf_state[0])
    current_b = int(hnf_state[2])
    current_columns = int(hnf_state[7])
    need = rows - current_h - current_b
    unit_defect = places - 1 - (current_columns - current_h - current_b)
    if unit_defect > 0:
        need += unit_defect
        if need > rows:
            need = rows
    search_count, squash_index = _pari_prepare_relation_search(
        hnf_perm,
        rows,
        current_h,
        need,
        0,
        search_ideals,
        outer_perm,
    )
    action = 3
    # Source first !A transition occurs BEFORE extracting A/computing R.
    if need == 0:
        outer_state[3] = 0
        outer_state[4] = rows // 32
        if outer_state[4] < 10:
            outer_state[4] = 10
        outer_state[14] = 1
    driver_state[0] = 3
    cache_changed = columns != driver_state[3]
    if need == 0:
        accept_multiple_state[1] = 0
        action = pari_post_hnf_acceptance(
            int(len(relation)),
            int(hnf_state[0]),
            int(hnf_state[2]),
            int(hnf_state[7]),
            (n + admission_real_count) // 2,
            n,
            hnf_result_h,
            hnf_result_c,
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
            cache_changed,
            accept_acceptance_state,
        )
    if accept_acceptance_state[0] == 2:
        driver_state[3] = columns
    if action == 3 and need == 0:
        need = int(accept_multiple_state[1])
    if action == 4 or action == 5:
        outer_state[15] = 1
    driver_trace[0] = columns
    driver_trace[1] = action
    driver_trace[2] = outer_state[12]
    driver_trace[3] = outer_state[3]
    driver_trace[4] = outer_state[4]
    while action == 3 or action == 4 or action == 5:
        if driver_state[2] >= pass_limit:
            return _pari_resumable_stop(driver_state, -200)
        if action == 4 or action == 5:
            if accept_multiple_state[0] != 0 or accept_multiple_state[3] == 0:
                return _pari_resumable_stop(driver_state, -202)
            need = int(accept_multiple_state[1])
        if need < 1:
            return _pari_resumable_stop(driver_state, -202)
        action = pari_prepare_next_small_norm_pass(
            need,
            int(outer_state[14]),
            int(outer_state[15]),
            current_h,
            automorphism_count,
            outer_state,
            relation_state,
            schedule,
            log_completed,
        )
        if action != 0:
            outstanding = relation_state[5] - relation_state[0]
            required = need
            if required < outstanding:
                required = outstanding
            required += relation_state[0] + automorphism_count
            if outer_state[15] != 0:
                required += current_h
            pari_relation_capacity_report(
                rows,
                n,
                places,
                required,
                2 * required,
                need,
                pass_limit,
                2,
                capacity_state,
            )
            return _pari_resumable_stop(driver_state, -204)
        driver_state[0] = 2
        action = pari_collect_and_log_relations(
            matrix,
            ideal,
            n,
            precision,
            scale,
            track_small,
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
            admission_mode,
            admission_factor_product,
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
            nrelid,
            track_fact,
            jid0,
            e0,
            subfactor,
            extra,
            extra_count,
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
            search_count,
            packet_ids,
            packet_ideals,
            packet_norms,
            schedule,
            construct_primes,
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
            1,
            outer_ru,
            outer_state,
            outer_minidx,
            outer_present,
            outer_live,
            outer_perm,
            outer_multiplier,
            log_precision,
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
            initial_count,
        )
        if action != 0:
            return _pari_resumable_stop(driver_state, action)
        if outer_state[17] == 3:
            return _pari_resumable_stop(driver_state, -207)
        columns = int(relation_state[0])
        old_columns = int(relation_state[4])
        new_columns = columns - old_columns
        driver_state[7] = columns
        driver_state[2] += 1
        if new_columns <= 0:
            # Source `!W` restoration: retain old_need and retry the same
            # dependent-row slice.  No HNF or acceptance owner changes.
            action = 3
            trace_offset = 5 * (driver_state[2] - 1)
            driver_trace[trace_offset] = columns
            driver_trace[trace_offset + 1] = action
            driver_trace[trace_offset + 2] = outer_state[12]
            driver_trace[trace_offset + 3] = outer_state[3]
            driver_trace[trace_offset + 4] = outer_state[4]
            continue
        if (
            len(append_new_relations) < rows * new_columns
            or len(append_new_logs) < 7 * places * new_columns
        ):
            pari_relation_capacity_report(
                rows,
                n,
                places,
                columns,
                relation_state[1],
                new_columns,
                pass_limit,
                3,
                capacity_state,
            )
            return _pari_resumable_stop(driver_state, -204)
        for i in range(rows * new_columns):
            append_new_relations[i] = int(relation_records[old_columns * rows + i])
        for i in range(7 * places * new_columns):
            append_new_logs[i] = log_embeddings[7 * places * old_columns + i]
        cache_changed = columns != driver_state[3]
        driver_state[0] = 3
        action = pari_connected_hnfadd_acceptance(
            hnf_result_h,
            current_h,
            hnf_result_dep,
            hnf_result_b,
            current_b,
            hnf_result_c,
            current_columns,
            places,
            hnf_perm,
            rows,
            append_new_relations,
            new_columns,
            append_new_logs,
            append_top,
            append_exact_product,
            append_log_product,
            append_adjusted_logs,
            append_joined,
            append_joined_logs,
            append_rank_matrix,
            append_occupied,
            append_pivots,
            append_best,
            append_profile,
            append_rank_state,
            append_perm_work,
            append_matb,
            append_new_dep,
            append_permuted_b,
            append_full_h,
            append_transform,
            append_lam,
            append_d,
            append_hnf_state,
            append_full_dep,
            append_work_b,
            append_work_c,
            append_diagonal,
            append_final_c,
            append_result_h,
            append_result_dep,
            append_result_b,
            append_result_c,
            append_final_state,
            append_state,
            n,
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
            cache_changed,
            accept_acceptance_state,
            append_attempt_state,
        )
        if append_attempt_state[0] < 2:
            return _pari_resumable_stop(driver_state, action)
        current_h = int(append_state[0])
        current_b = int(append_state[2])
        current_columns = int(append_state[7])
        driver_state[6] += _pari_publish_appended_hnf(
            rows,
            places,
            append_state,
            append_result_h,
            append_result_dep,
            append_result_b,
            append_result_c,
            hnf_state,
            hnf_result_h,
            hnf_result_dep,
            hnf_result_b,
            hnf_result_c,
        )
        relation_state[4] = columns
        if append_attempt_state[0] == 3 and accept_acceptance_state[0] == 2:
            driver_state[3] = columns
        need = rows - current_h - current_b
        unit_defect = places - 1 - (current_columns - current_h - current_b)
        if unit_defect > 0:
            need += unit_defect
            if need > rows:
                need = rows
        search_count, squash_index = _pari_prepare_relation_search(
            hnf_perm,
            rows,
            current_h,
            need,
            squash_index,
            search_ideals,
            outer_perm,
        )
        if append_attempt_state[0] == 2:
            # `pari_connected_hnfadd_acceptance` uses -100 to expose the
            # source dimension frontier.  It is an internal collect action in
            # the resident driver, not a terminal status.
            action = 3
        else:
            outer_state[14] = 1
            if action == 4 or action == 5:
                outer_state[15] = 1
            else:
                outer_state[15] = 0
                if action == 3:
                    need = int(accept_multiple_state[1])
        trace_offset = 5 * (driver_state[2] - 1)
        driver_trace[trace_offset] = columns
        driver_trace[trace_offset + 1] = action
        driver_trace[trace_offset + 2] = outer_state[12]
        driver_trace[trace_offset + 3] = outer_state[3]
        driver_trace[trace_offset + 4] = outer_state[4]
    if action != 0:
        return _pari_resumable_stop(driver_state, action)
    action = pari_class_invariant_output(
        hnf_result_h,
        current_h,
        smith_work,
        smith_column,
        smith_invariants,
        smith_class_number,
        smith_state,
    )
    if action != 0:
        return _pari_resumable_stop(driver_state, action)
    count = int(smith_state[1])
    for i in range(count):
        class_invariants[i] = smith_invariants[i]
    class_number[0] = smith_class_number[0]
    driver_state[4] = 1
    driver_state[5] = count
    return _pari_resumable_stop(driver_state, 0)
