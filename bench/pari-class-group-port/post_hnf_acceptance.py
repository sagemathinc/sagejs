"""Connected post-HNF dimension gate and PARI regulator acceptance.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Experimental diagnostic boundary, not a complete class-group computation.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .post_hnf_regulator_inputs import pari_post_hnf_regulator_inputs
from .regulator_acceptance import pari_regulator_acceptance


@native
def pari_post_hnf_acceptance(
    factor_count: int,
    h_rows: int,
    b_columns: int,
    c_columns: int,
    places: int,
    degree: int,
    h: IntegerBuffer,
    c: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    logs: IntegerBuffer,
    class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    post_hnf_state: Int64Buffer,
    prepared: IntegerBuffer,
    selected: Int64Buffer,
    prep_state: Int64Buffer,
    rank_work: IntegerBuffer,
    rank_occupied: Int64Buffer,
    rank_pivots: Int64Buffer,
    rank_state: Int64Buffer,
    integer_input: IntegerBuffer,
    integer_work: IntegerBuffer,
    integer_occupied: IntegerBuffer,
    integer_pivots: IntegerBuffer,
    integer_best: IntegerBuffer,
    integer_state: IntegerBuffer,
    basis: IntegerBuffer,
    minor: IntegerBuffer,
    det_work: IntegerBuffer,
    det_result: IntegerBuffer,
    det_pivots: Int64Buffer,
    det_state: Int64Buffer,
    inverse_work: IntegerBuffer,
    inverse_rhs: IntegerBuffer,
    inverse: IntegerBuffer,
    inverse_pivots: Int64Buffer,
    inverse_state: Int64Buffer,
    product: IntegerBuffer,
    inverse_slice: IntegerBuffer,
    multiple: IntegerBuffer,
    coordinates: IntegerBuffer,
    multiple_state: Int64Buffer,
    rational_work: IntegerBuffer,
    lattice: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    regulator: IntegerBuffer,
    relations: IntegerBuffer,
    denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    cache_changed: bool,
    acceptance_state: Int64Buffer,
) -> int:
    """Return -100 for dimension need, otherwise the acceptance action.

    The source need is in post_hnf_state[0]; -100 is only a stage marker.
    class_number is a tentative determinant, never a certified output.
    Eager h*invhr preparation preserves the diagnostic input bridge's
    documented placement difference: this is not equal-work timing.
    Owners must be disjoint; acceptance owners are untouched on rank exits.
    """
    need = pari_post_hnf_regulator_inputs(
        factor_count,
        h_rows,
        b_columns,
        c_columns,
        places,
        h,
        c,
        inverse_hr,
        logs,
        class_number,
        zeta_factor,
        post_hnf_state,
    )
    if need != 0:
        return -100
    return pari_regulator_acceptance(
        logs,
        places,
        c_columns - b_columns - h_rows,
        degree,
        prepared,
        selected,
        prep_state,
        rank_work,
        rank_occupied,
        rank_pivots,
        rank_state,
        integer_input,
        integer_work,
        integer_occupied,
        integer_pivots,
        integer_best,
        integer_state,
        basis,
        minor,
        det_work,
        det_result,
        det_pivots,
        det_state,
        inverse_work,
        inverse_rhs,
        inverse,
        inverse_pivots,
        inverse_state,
        product,
        inverse_slice,
        multiple,
        coordinates,
        multiple_state,
        zeta_factor,
        rational_work,
        lattice,
        hnf_work,
        hnf_column,
        hnf_output,
        hnf_state,
        regulator,
        relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
        cache_changed,
        acceptance_state,
    )
