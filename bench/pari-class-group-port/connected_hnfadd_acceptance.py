"""One resident append/HNF/regulator attempt in the PARI 2.17.4 schedule.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared appended logs are original embeddings, not transformed HNF columns.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .hnfadd import pari_hnfadd
from .post_hnf_regulator_inputs import pari_post_hnf_regulator_inputs
from .regulator_acceptance import pari_regulator_acceptance


@native
def pari_connected_hnfadd_acceptance(
    h: IntegerBuffer,
    h_rows: int,
    dep: IntegerBuffer,
    b: IntegerBuffer,
    b_columns: int,
    logs: IntegerBuffer,
    total_columns: int,
    log_rows: int,
    perm: Int64Buffer,
    rows: int,
    new_relations: Int64Buffer,
    new_columns: int,
    new_logs: IntegerBuffer,
    top: IntegerBuffer,
    exact_product: IntegerBuffer,
    log_product: IntegerBuffer,
    adjusted_logs: IntegerBuffer,
    joined: IntegerBuffer,
    joined_logs: IntegerBuffer,
    rank_matrix: IntegerBuffer,
    occupied: IntegerBuffer,
    pivots: IntegerBuffer,
    best: IntegerBuffer,
    profile: IntegerBuffer,
    rank_state: IntegerBuffer,
    perm_work: Int64Buffer,
    matb: IntegerBuffer,
    new_dep: IntegerBuffer,
    permuted_b: IntegerBuffer,
    full_h: IntegerBuffer,
    transform: IntegerBuffer,
    lam: IntegerBuffer,
    d: IntegerBuffer,
    hnf_state: Int64Buffer,
    full_dep: IntegerBuffer,
    work_b: IntegerBuffer,
    work_c: IntegerBuffer,
    diagonal: Int64Buffer,
    final_c: IntegerBuffer,
    result_h: IntegerBuffer,
    result_dep: IntegerBuffer,
    result_b: IntegerBuffer,
    result_c: IntegerBuffer,
    final_state: Int64Buffer,
    state: Int64Buffer,
    accept_degree: int,
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
    accept_cache_changed: bool,
    accept_acceptance_state: Int64Buffer,
    attempt_state: Int64Buffer,
) -> int:
    """Append once; preserve the caller's source retry policy and old-cache state.

    Return 1 for empty append (all owners untouched), -100 for dimension need,
    otherwise raw HNF frontier or acceptance action. attempt_state contains
    [stage, status, source need, new total columns], stages 1 HNF, 2 dimension,
    3 acceptance. HNF outputs remain useful after regulator rejection; original
    H/dep/B/C owners are never overwritten. Caller owns the mutable permutation.
    Publish/swap resident HNF owners only when stage >= 2. Acceptance regulator
    and relations buffers are candidate owners; preserve previously published
    results separately. No saved lambda/L is fabricated or reused as a result.

    new_logs holds exactly the original weighted embedding suffix for the new
    relation columns, seven fields per place, column-major. All workspace owners
    are disjoint. Late validation/arithmetic failures may change scratch. No
    retry, precision reset, field answer, or certification is supplied here.
    """
    if new_columns == 0:
        return 1
    if len(attempt_state) < 4 or len(accept_multiple_state) < 4:
        raise ValueError("short connected append state")
    attempt_state[0] = 1
    attempt_state[1] = -1
    attempt_state[2] = -1
    attempt_state[3] = total_columns + new_columns
    status = pari_hnfadd(
        h,
        h_rows,
        dep,
        b,
        b_columns,
        logs,
        total_columns,
        log_rows,
        perm,
        rows,
        new_relations,
        new_columns,
        new_logs,
        top,
        exact_product,
        log_product,
        adjusted_logs,
        joined,
        joined_logs,
        rank_matrix,
        occupied,
        pivots,
        best,
        profile,
        rank_state,
        perm_work,
        matb,
        new_dep,
        permuted_b,
        full_h,
        transform,
        lam,
        d,
        hnf_state,
        full_dep,
        work_b,
        work_c,
        diagonal,
        final_c,
        result_h,
        result_dep,
        result_b,
        result_c,
        final_state,
        state,
    )
    attempt_state[1] = status
    if status != 0:
        return status
    attempt_state[0] = 2
    need = pari_post_hnf_regulator_inputs(
        rows,
        state[0],
        state[2],
        state[7],
        log_rows,
        result_h,
        result_c,
        accept_inverse_hr,
        accept_logs,
        accept_class_number,
        accept_zeta_factor,
        accept_post_hnf_state,
    )
    attempt_state[2] = need
    if need != 0:
        attempt_state[1] = -100
        return -100
    # Source need was recomputed from the new HNF dimensions before compute_R.
    # Successful regulator-multiple leaves this in/out value unchanged.
    accept_multiple_state[1] = 0
    attempt_state[0] = 3
    status = pari_regulator_acceptance(
        accept_logs,
        log_rows,
        state[7] - state[2] - state[0],
        accept_degree,
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
        accept_zeta_factor,
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
        accept_cache_changed,
        accept_acceptance_state,
    )
    attempt_state[1] = status
    attempt_state[2] = accept_multiple_state[1]
    return status
