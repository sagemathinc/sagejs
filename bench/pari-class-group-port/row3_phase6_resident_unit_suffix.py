"""Resident rank-two `getfu(LARGE)` suffix for prepared panel row 3."""

from sagejs.native import (
    Float64Buffer,
    IntegerBuffer,
    Int64Buffer,
    float64_workspace,
    integer_workspace,
    int64_workspace,
    native,
)

from .float_conversion import pari_real_to_float
from .log_matrix_transform import pari_log_matrix_transform
from .regulator_scalar import pari_regulator_scalar_add, pari_regulator_scalar_multiply
from .field3_unit_transform_retention import _pari_reverse_hnffinal_selection
from .unit_bridge_cubic import pari_cubic_unit_bridge_prepare
from .unit_reconstruction_cubic import pari_getfu_real_cubic


@native
def pari_row3_phase6_resident_unit_suffix(
    relation_records: IntegerBuffer,
    kernel_logs: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    regulator: IntegerBuffer,
    embedding: IntegerBuffer,
    tensor: IntegerBuffer,
    cleanup_transform: IntegerBuffer,
    assembly_state: Int64Buffer,
    hnf_transform: IntegerBuffer,
    full_h: IntegerBuffer,
    full_dep: IntegerBuffer,
    trailing: IntegerBuffer,
    diagonal: Int64Buffer,
    factored_transform: IntegerBuffer,
    raw_unit_provenance: IntegerBuffer,
    selected: IntegerBuffer,
    reverse_work: IntegerBuffer,
    reverse_bwork: IntegerBuffer,
    raw_targets: IntegerBuffer,
    getfu_state: Int64Buffer,
    provenance_state: Int64Buffer,
) -> int:
    """Retain both units as exact products of seven kernel generators."""
    u1: IntegerBuffer = integer_workspace(14, 16)
    u2: IntegerBuffer = integer_workspace(4, 16)
    transform: IntegerBuffer = integer_workspace(14, 16)
    first_arch: IntegerBuffer = integer_workspace(42, 16)
    p_triples: IntegerBuffer = integer_workspace(18, 16)
    au: IntegerBuffer = integer_workspace(42, 16)
    clean: IntegerBuffer = integer_workspace(18, 16)
    signs: Int64Buffer = int64_workspace(6)
    bridge_state: Int64Buffer = int64_workspace(5)
    trace: Float64Buffer = float64_workspace(5)
    ii_state: IntegerBuffer = integer_workspace(5, 16)
    ii_basis: IntegerBuffer = integer_workspace(14, 16)
    ii_transform: IntegerBuffer = integer_workspace(49, 16)
    ii_gram: IntegerBuffer = integer_workspace(49, 16)
    ii_mu: Float64Buffer = float64_workspace(49)
    ii_mu_e: IntegerBuffer = integer_workspace(49, 16)
    ii_r: Float64Buffer = float64_workspace(49)
    ii_r_e: IntegerBuffer = integer_workspace(49, 16)
    ii_s: Float64Buffer = float64_workspace(7)
    ii_s_e: IntegerBuffer = integer_workspace(7, 16)
    ii_approx: Float64Buffer = float64_workspace(14)
    ii_float_gram: Float64Buffer = float64_workspace(49)
    ii_alpha: IntegerBuffer = integer_workspace(7, 16)
    ii_column: IntegerBuffer = integer_workspace(7, 16)
    ii_column_e: IntegerBuffer = integer_workspace(7, 16)
    ii_normalized: Float64Buffer = float64_workspace(7)
    ii_temporary: Float64Buffer = float64_workspace(7)
    ii_dpe: Float64Buffer = float64_workspace(7)
    ii_scratch: IntegerBuffer = integer_workspace(7, 16)
    ri_integers: IntegerBuffer = integer_workspace(6, 16)
    ri_form: IntegerBuffer = integer_workspace(3, 16)
    ri_basis: IntegerBuffer = integer_workspace(6, 16)
    ri_transform: IntegerBuffer = integer_workspace(4, 16)
    ri_gram: IntegerBuffer = integer_workspace(4, 16)
    ri_mu: Float64Buffer = float64_workspace(4)
    ri_mu_e: IntegerBuffer = integer_workspace(4, 16)
    ri_r: Float64Buffer = float64_workspace(4)
    ri_r_e: IntegerBuffer = integer_workspace(4, 16)
    ri_s: Float64Buffer = float64_workspace(2)
    ri_s_e: IntegerBuffer = integer_workspace(2, 16)
    ri_approx: Float64Buffer = float64_workspace(6)
    ri_float_gram: Float64Buffer = float64_workspace(4)
    ri_alpha: IntegerBuffer = integer_workspace(2, 16)
    ri_column: IntegerBuffer = integer_workspace(3, 16)
    ri_column_e: IntegerBuffer = integer_workspace(3, 16)
    ri_normalized: Float64Buffer = float64_workspace(3)
    ri_temporary: Float64Buffer = float64_workspace(3)
    ri_dpe: Float64Buffer = float64_workspace(3)
    ri_scratch: IntegerBuffer = integer_workspace(3, 16)
    ri_state: IntegerBuffer = integer_workspace(2, 16)
    factor: IntegerBuffer = integer_workspace(4, 16)
    matep: IntegerBuffer = integer_workspace(18, 16)
    lll_basis: IntegerBuffer = integer_workspace(6, 16)
    transformed: IntegerBuffer = integer_workspace(18, 16)
    exponentials: IntegerBuffer = integer_workspace(18, 16)
    solve_work: IntegerBuffer = integer_workspace(27, 16)
    solve_rhs: IntegerBuffer = integer_workspace(18, 16)
    solved: IntegerBuffer = integer_workspace(18, 16)
    rounded: IntegerBuffer = integer_workspace(6, 16)
    multiplication: IntegerBuffer = integer_workspace(9, 16)
    inverse: IntegerBuffer = integer_workspace(3, 16)
    candidates: IntegerBuffer = integer_workspace(6, 16)
    output_units: IntegerBuffer = integer_workspace(6, 16)
    output_logs: IntegerBuffer = integer_workspace(18, 16)
    pivots: Int64Buffer = int64_workspace(3)
    gu_mu: Float64Buffer = float64_workspace(4)
    gu_r: Float64Buffer = float64_workspace(4)
    gu_s: Float64Buffer = float64_workspace(2)
    gu_approx: Float64Buffer = float64_workspace(6)
    gu_e: IntegerBuffer = integer_workspace(2, 16)
    gu_float_gram: Float64Buffer = float64_workspace(4)
    gu_alpha: IntegerBuffer = integer_workspace(2, 16)
    gu_column: IntegerBuffer = integer_workspace(3, 16)
    gu_column_e: IntegerBuffer = integer_workspace(3, 16)
    gu_normalized: Float64Buffer = float64_workspace(3)
    gu_temporary: Float64Buffer = float64_workspace(3)
    gu_exact_gram: IntegerBuffer = integer_workspace(4, 16)
    gu_mu_e: IntegerBuffer = integer_workspace(4, 16)
    gu_r_e: IntegerBuffer = integer_workspace(4, 16)
    gu_s_e: IntegerBuffer = integer_workspace(2, 16)
    exp_cache: IntegerBuffer = integer_workspace(128, 16)
    exp_a: IntegerBuffer = integer_workspace(128, 16)
    exp_b: IntegerBuffer = integer_workspace(128, 16)
    exp_p: IntegerBuffer = integer_workspace(128, 16)
    exp_q: IntegerBuffer = integer_workspace(128, 16)
    exp_stack: IntegerBuffer = integer_workspace(128, 16)
    if len(kernel_logs) < 147 or len(relation_lattice) < 14:
        raise ValueError("short row-3 resident unit source")
    bridge = pari_cubic_unit_bridge_prepare(
        kernel_logs,
        relation_lattice,
        7,
        regulator,
        u1,
        u2,
        transform,
        first_arch,
        p_triples,
        au,
        clean,
        signs,
        bridge_state,
        trace,
        ii_state,
        ii_basis,
        ii_transform,
        ii_gram,
        ii_mu,
        ii_mu_e,
        ii_r,
        ii_r_e,
        ii_s,
        ii_s_e,
        ii_approx,
        ii_float_gram,
        ii_alpha,
        ii_column,
        ii_column_e,
        ii_normalized,
        ii_temporary,
        ii_dpe,
        ii_scratch,
        ri_integers,
        ri_form,
        ri_basis,
        ri_transform,
        ri_gram,
        ri_mu,
        ri_mu_e,
        ri_r,
        ri_r_e,
        ri_s,
        ri_s_e,
        ri_approx,
        ri_float_gram,
        ri_alpha,
        ri_column,
        ri_column_e,
        ri_normalized,
        ri_temporary,
        ri_dpe,
        ri_scratch,
        ri_state,
    )
    if (
        bridge != 4
        or bridge_state[0] != 0
        or bridge_state[1] != 0
        or bridge_state[2] != 2
    ):
        return 1
    if abs(u2[0] * u2[3] - u2[1] * u2[2]) != 1:
        return 2
    pari_log_matrix_transform(kernel_logs, transform, 3, 7, 2, False, au)
    for unit in range(2):
        sm = 0
        sp = -1
        se = 0
        for place in range(3):
            source = 7 * (unit * 3 + place) + 1
            target = 3 * (unit * 3 + place)
            clean[target] = au[source]
            clean[target + 1] = au[source + 1]
            clean[target + 2] = au[source + 2]
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, au[source], au[source + 1], au[source + 2]
            )
        if abs(pari_real_to_float(sm, sp, se)) >= 0.001953125:
            return 3
    am, ap, ae = pari_regulator_scalar_multiply(
        clean[0], clean[1], clean[2], clean[12], clean[13], clean[14]
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        clean[9], clean[10], clean[11], clean[3], clean[4], clean[5]
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    computed = abs(pari_real_to_float(dm, dp, de))
    expected = pari_real_to_float(regulator[0], regulator[1], regulator[2])
    if abs(computed - expected) >= 0.5:
        return 4
    status = pari_getfu_real_cubic(
        clean,
        embedding,
        tensor,
        192,
        matep,
        lll_basis,
        factor,
        transformed,
        exponentials,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidates,
        output_units,
        output_logs,
        getfu_state,
        pivots,
        gu_mu,
        gu_r,
        gu_s,
        gu_approx,
        gu_e,
        gu_float_gram,
        gu_alpha,
        gu_column,
        gu_column_e,
        gu_normalized,
        gu_temporary,
        gu_exact_gram,
        gu_mu_e,
        gu_r_e,
        gu_s_e,
        exp_cache,
        exp_a,
        exp_b,
        exp_p,
        exp_q,
        exp_stack,
    )
    if status != 2 or getfu_state[0] != 2 or getfu_state[3] <= 20:
        return 5
    for unit in range(2):
        for row in range(7):
            factored_transform[unit * 7 + row] = (
                transform[row] * factor[unit * 2]
                + transform[7 + row] * factor[unit * 2 + 1]
            )
    # Pull the seven exact relation-kernel columns backwards through the same
    # terminal HNF transformation.  The final two selected columns are class
    # columns; retaining them in the bounded reverse operation keeps this
    # mechanically identical to the independently replayed presentation.
    columns = 675
    rows = 668
    targets = 9
    for i in range(columns * targets):
        selected[i] = 0
        raw_targets[i] = 0
    for target in range(targets):
        selected[target * columns + target] = 1
    if assembly_state[0] != 71 or assembly_state[2] != 78 or assembly_state[4] != 597:
        return 6
    _pari_reverse_hnffinal_selection(
        selected,
        columns,
        targets,
        71,
        0,
        78,
        597,
        hnf_transform,
        0,
        full_h,
        0,
        full_dep,
        0,
        trailing,
        0,
        diagonal,
        0,
        reverse_work,
        reverse_bwork,
    )
    for target in range(targets):
        for source in range(columns):
            value = 0
            for cleaned in range(columns):
                value += (
                    cleanup_transform[cleaned * columns + source]
                    * selected[target * columns + cleaned]
                )
            raw_targets[target * columns + source] = value
    # For this authenticated corridor the seven kernel columns are precisely
    # the first seven selected columns.  Prove that fact again before using it.
    for target in range(7):
        for row in range(rows):
            value = 0
            for source in range(columns):
                value += (
                    relation_records[source * rows + row]
                    * raw_targets[target * columns + source]
                )
            if value != 0:
                return 7
    for unit in range(2):
        for source in range(columns):
            value = 0
            for kernel in range(7):
                value += (
                    factored_transform[unit * 7 + kernel]
                    * raw_targets[kernel * columns + source]
                )
            raw_unit_provenance[unit * columns + source] = value
    provenance_state[0] = rows
    provenance_state[1] = columns
    provenance_state[2] = 7
    provenance_state[3] = 2
    provenance_state[4] = columns * 2
    return 0


__all__ = ["pari_row3_phase6_resident_unit_suffix"]
