"""Bounded private row-6 rank-two unit suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The public ordinary-Python composer remains the readability and validation
oracle.  This private native cut expresses its mathematical work with one
closed scalar manifest, explicit input/output buffers, and fixed automatic
workspaces.  No mapping-valued owner or dynamically allocated list enters the
isolated graph.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    float64_workspace,
    int64_workspace,
    integer_workspace,
    native,
)

from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
)
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


@native
def pari_row6_phase6_resident_unit_private(
    columns: int,
    precision: int,
    unit_rank: int,
    accepted_arch: IntegerBuffer,
    accepted_signs: Int64Buffer,
    phase_pi: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    preparation_embedding: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    final_transform: IntegerBuffer,
    bridge_transform: IntegerBuffer,
    getfu_factor: IntegerBuffer,
    clean_logs_output: IntegerBuffer,
    sign_phases_output: Int64Buffer,
    c5_state_output: Int64Buffer,
    c5_trace_output: Float64Buffer,
    factor_state_output: Int64Buffer,
    c6_state_output: Int64Buffer,
    unit_state: Int64Buffer,
) -> int:
    """Compute row 6's compact flag-zero unit evidence without host objects."""
    arch_work: IntegerBuffer = integer_workspace(147, 16)
    u1: IntegerBuffer = integer_workspace(14, 16)
    u2: IntegerBuffer = integer_workspace(4, 16)
    bridge_transform_work: IntegerBuffer = integer_workspace(14, 16)
    first_arch: IntegerBuffer = integer_workspace(42, 16)
    p_triples: IntegerBuffer = integer_workspace(18, 16)
    au: IntegerBuffer = integer_workspace(42, 16)
    clean_logs: IntegerBuffer = integer_workspace(18, 16)
    signs: Int64Buffer = int64_workspace(6)
    c5_state: Int64Buffer = int64_workspace(5)
    c5_trace: Float64Buffer = float64_workspace(5)
    integer_state: IntegerBuffer = integer_workspace(5, 16)
    integer_basis: IntegerBuffer = integer_workspace(14, 16)
    integer_transform: IntegerBuffer = integer_workspace(49, 16)
    integer_gram: IntegerBuffer = integer_workspace(49, 16)
    integer_mu: Float64Buffer = float64_workspace(49)
    integer_mu_exponents: IntegerBuffer = integer_workspace(49, 16)
    integer_r: Float64Buffer = float64_workspace(49)
    integer_r_exponents: IntegerBuffer = integer_workspace(49, 16)
    integer_s: Float64Buffer = float64_workspace(7)
    integer_s_exponents: IntegerBuffer = integer_workspace(7, 16)
    integer_approximate: Float64Buffer = float64_workspace(14)
    integer_float_gram: Float64Buffer = float64_workspace(49)
    integer_alpha: IntegerBuffer = integer_workspace(7, 16)
    integer_column: IntegerBuffer = integer_workspace(7, 16)
    integer_column_exponents: IntegerBuffer = integer_workspace(7, 16)
    integer_normalized: Float64Buffer = float64_workspace(7)
    integer_temporary: Float64Buffer = float64_workspace(7)
    integer_dpe_scratch: Float64Buffer = float64_workspace(7)
    integer_scratch: IntegerBuffer = integer_workspace(7, 16)
    real_integers: IntegerBuffer = integer_workspace(6, 16)
    real_form: IntegerBuffer = integer_workspace(3, 16)
    real_basis: IntegerBuffer = integer_workspace(6, 16)
    real_transform: IntegerBuffer = integer_workspace(4, 16)
    real_gram: IntegerBuffer = integer_workspace(4, 16)
    real_mu: Float64Buffer = float64_workspace(4)
    real_mu_exponents: IntegerBuffer = integer_workspace(4, 16)
    real_r: Float64Buffer = float64_workspace(4)
    real_r_exponents: IntegerBuffer = integer_workspace(4, 16)
    real_s: Float64Buffer = float64_workspace(2)
    real_s_exponents: IntegerBuffer = integer_workspace(2, 16)
    real_approximate: Float64Buffer = float64_workspace(6)
    real_float_gram: Float64Buffer = float64_workspace(4)
    real_alpha: IntegerBuffer = integer_workspace(2, 16)
    real_column: IntegerBuffer = integer_workspace(3, 16)
    real_column_exponents: IntegerBuffer = integer_workspace(3, 16)
    real_normalized: Float64Buffer = float64_workspace(3)
    real_temporary: Float64Buffer = float64_workspace(3)
    real_dpe_scratch: Float64Buffer = float64_workspace(3)
    real_scratch: IntegerBuffer = integer_workspace(3, 16)
    real_state: IntegerBuffer = integer_workspace(2, 16)

    factor_work: IntegerBuffer = integer_workspace(4, 16)
    matep: IntegerBuffer = integer_workspace(18, 16)
    factor_basis: IntegerBuffer = integer_workspace(6, 16)
    factor_transform: IntegerBuffer = integer_workspace(4, 16)
    factor_state: Int64Buffer = int64_workspace(2)
    factor_mu: Float64Buffer = float64_workspace(4)
    factor_mu_exponents: IntegerBuffer = integer_workspace(4, 16)
    factor_r: Float64Buffer = float64_workspace(4)
    factor_r_exponents: IntegerBuffer = integer_workspace(4, 16)
    factor_s: Float64Buffer = float64_workspace(2)
    factor_s_exponents: IntegerBuffer = integer_workspace(2, 16)
    factor_approximate: Float64Buffer = float64_workspace(6)
    factor_float_gram: Float64Buffer = float64_workspace(4)
    factor_alpha: IntegerBuffer = integer_workspace(2, 16)
    factor_column: IntegerBuffer = integer_workspace(3, 16)
    factor_column_exponents: IntegerBuffer = integer_workspace(2, 16)
    factor_normalized: Float64Buffer = float64_workspace(3)
    factor_temporary: Float64Buffer = float64_workspace(3)
    factor_exact_gram: IntegerBuffer = integer_workspace(4, 16)

    embedding_work: IntegerBuffer = integer_workspace(27, 16)
    getfu_matep: IntegerBuffer = integer_workspace(18, 16)
    transformed_arch: IntegerBuffer = integer_workspace(18, 16)
    transformed_clean: IntegerBuffer = integer_workspace(18, 16)
    transformed_phases: Int64Buffer = int64_workspace(6)
    exponential_values: IntegerBuffer = integer_workspace(18, 16)
    solve_work: IntegerBuffer = integer_workspace(27, 16)
    solve_rhs: IntegerBuffer = integer_workspace(18, 16)
    solved: IntegerBuffer = integer_workspace(18, 16)
    rounded: IntegerBuffer = integer_workspace(6, 16)
    multiplication: IntegerBuffer = integer_workspace(9, 16)
    inverse: IntegerBuffer = integer_workspace(3, 16)
    candidate_units: IntegerBuffer = integer_workspace(6, 16)
    normalized_factor: IntegerBuffer = integer_workspace(4, 16)
    output_units: IntegerBuffer = integer_workspace(6, 16)
    output_logs: IntegerBuffer = integer_workspace(18, 16)
    output_phases: Int64Buffer = int64_workspace(6)
    output_factor: IntegerBuffer = integer_workspace(4, 16)
    c6_state: Int64Buffer = int64_workspace(8)
    pivots: Int64Buffer = int64_workspace(3)
    exp_cache: IntegerBuffer = integer_workspace(64, 16)
    exp_a: IntegerBuffer = integer_workspace(64, 16)
    exp_b: IntegerBuffer = integer_workspace(64, 16)
    exp_p: IntegerBuffer = integer_workspace(64, 16)
    exp_q: IntegerBuffer = integer_workspace(64, 16)
    exp_stack: IntegerBuffer = integer_workspace(128, 16)

    if (
        columns < 1
        or columns > 7
        or precision < 64
        or unit_rank != 2
        or len(accepted_arch) < 21 * columns
        or len(accepted_signs) < 3 * columns
        or len(phase_pi) != 3
        or len(relation_lattice) != 14
        or len(expected_regulator) != 3
        or len(preparation_embedding) != 27
        or len(multiplication_basis) != 27
        or len(final_transform) < 14
        or len(bridge_transform) < 14
        or len(getfu_factor) < 4
        or len(clean_logs_output) < 18
        or len(sign_phases_output) < 6
        or len(c5_state_output) < 5
        or len(c5_trace_output) < 5
        or len(factor_state_output) < 2
        or len(c6_state_output) < 8
        or len(unit_state) < 8
    ):
        raise ValueError("unsupported row-6 resident unit boundary")

    for i in range(8):
        unit_state[i] = 0
    unit_state[0] = -1
    for i in range(21 * columns):
        arch_work[i] = accepted_arch[i]
    for column in range(columns):
        for place in range(3):
            at = 21 * column + 7 * place + 4
            if accepted_signs[3 * column + place] == 1:
                for part in range(3):
                    arch_work[at + part] = phase_pi[part]
            elif accepted_signs[3 * column + place] == 0:
                arch_work[at] = 0
                arch_work[at + 1] = -1
                arch_work[at + 2] = 0
            else:
                raise ValueError("row-6 accepted sign is not a bit")

    status = pari_cubic_unit_bridge_prepare(
        arch_work,
        relation_lattice,
        columns,
        expected_regulator,
        u1,
        u2,
        bridge_transform_work,
        first_arch,
        p_triples,
        au,
        clean_logs,
        signs,
        c5_state,
        c5_trace,
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
    )
    unit_state[1] = status
    if status != 0:
        unit_state[0] = status
        return status

    status = pari_cubic_getfu_factor_rank_two(
        clean_logs,
        factor_work,
        matep,
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
    )
    unit_state[2] = status
    if status != 0:
        unit_state[0] = status
        return status

    # Prepared storage is place-major; getfu expects column-major 3 by 3.
    for basis_index in range(3):
        for place in range(3):
            for part in range(3):
                embedding_work[3 * (3 * basis_index + place) + part] = (
                    preparation_embedding[3 * (3 * place + basis_index) + part]
                )

    status = pari_getfu_signed_real_cubic(
        clean_logs,
        signs,
        factor_work,
        embedding_work,
        multiplication_basis,
        precision,
        precision,
        getfu_matep,
        transformed_arch,
        transformed_clean,
        transformed_phases,
        exponential_values,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidate_units,
        normalized_factor,
        output_units,
        output_logs,
        output_phases,
        output_factor,
        c6_state,
        pivots,
        exp_cache,
        exp_a,
        exp_b,
        exp_p,
        exp_q,
        exp_stack,
    )
    unit_state[3] = status
    if status != 2 or c6_state[0] != 2:
        unit_state[0] = 20 + status
        return 20 + status

    status = pari_cubic_unit_compose_provenance(
        bridge_transform_work, columns, factor_work, final_transform
    )
    unit_state[4] = status
    if status != 0:
        unit_state[0] = 30 + status
        return 30 + status

    for i in range(14):
        bridge_transform[i] = bridge_transform_work[i]
    for i in range(4):
        getfu_factor[i] = factor_work[i]
    for i in range(18):
        clean_logs_output[i] = clean_logs[i]
    for i in range(6):
        sign_phases_output[i] = signs[i]
    for i in range(5):
        c5_state_output[i] = c5_state[i]
        c5_trace_output[i] = c5_trace[i]
    for i in range(2):
        factor_state_output[i] = factor_state[i]
    for i in range(8):
        c6_state_output[i] = c6_state[i]
    unit_state[0] = 0
    unit_state[5] = columns
    unit_state[6] = 2
    unit_state[7] = precision
    return 0


__all__ = ["pari_row6_phase6_resident_unit_private"]
