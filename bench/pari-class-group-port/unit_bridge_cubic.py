"""Compose PARI 2.17.4's accepted real-cubic unit boundaries.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow equal-bound bridge for the frozen totally-real cubic.  It
starts with the resident seven-field logarithm columns and reconstructed
relation lattice, performs the two unit-lattice reductions, preserves the
real-place sign phases, and prepares PARI's rank-two `getfu` factor.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .float_conversion import pari_real_to_float
from .lll_dpe_pass import pari_lll_dpe
from .lll_fast import pari_lll_fast
from .lll_rescale import pari_lll_rescale
from .log_matrix_transform import pari_log_matrix_transform, pari_validate_log_entries
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_divide,
    pari_regulator_scalar_multiply,
    pari_validate_regulator_values,
)
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)


@native
def pari_cubic_unit_bridge_prepare(
    accepted_arch: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    columns: int,
    expected_regulator: IntegerBuffer,
    u1: IntegerBuffer,
    u2: IntegerBuffer,
    unit_transform: IntegerBuffer,
    first_arch: IntegerBuffer,
    p_triples: IntegerBuffer,
    au: IntegerBuffer,
    clean_logs: IntegerBuffer,
    signs: Int64Buffer,
    state: Int64Buffer,
    trace: Float64Buffer,
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
) -> int:
    """Prepare clean real logs, signs and relation provenance for `getfu`.

    Seven-field logarithm matrices and exact transforms are column-major.
    `p_triples` is the row-major 3 by 2 real projection expected by the
    floating LLL cut.  Return 1/2 for integer/real LLL failure, 3 for bad unit
    log norm, 4 for a non-integral real-place phase, and 5 for regulator
    disagreement.  Public outputs are stage-local diagnostic owners.
    """
    rows = 3
    if columns < 2 or columns >= 199:
        raise ValueError("unsupported cubic unit bridge width")
    if (
        len(accepted_arch) < 7 * rows * columns
        or len(relation_lattice) < 2 * columns
        or len(expected_regulator) < 3
        or len(u1) < 2 * columns
        or len(u2) < 4
        or len(unit_transform) < 2 * columns
        or len(first_arch) < 7 * rows * 2
        or len(p_triples) < 18
        or len(au) < 42
        or len(clean_logs) < 18
        or len(signs) < 6
        or len(state) < 5
        or len(trace) < 5
    ):
        raise ValueError("short cubic unit bridge storage")
    pari_validate_log_entries(accepted_arch, rows * columns)
    pari_validate_regulator_values(expected_regulator, 1)
    for i in range(5):
        state[i] = -1
        trace[i] = 0.0
    status = pari_unit_integer_lattice_rank_two(
        relation_lattice,
        columns,
        u1,
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
    )
    state[0] = status
    if status != 0:
        return 1
    pari_log_matrix_transform(accepted_arch, u1, rows, columns, 2, False, first_arch)
    for i in range(rows):
        for j in range(2):
            source = 7 * (j * rows + i) + 1
            target = 3 * (i * 2 + j)
            p_triples[target] = first_arch[source]
            p_triples[target + 1] = first_arch[source + 1]
            p_triples[target + 2] = first_arch[source + 2]
    status = pari_unit_real_lattice_rank_two(
        p_triples,
        rows,
        real_integers,
        u2,
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
    state[1] = status
    if status != 0:
        return 2
    pari_unit_compose_rank_two(u1, columns, u2, unit_transform)
    pari_log_matrix_transform(
        accepted_arch, unit_transform, rows, columns, 2, False, au
    )
    pi = 3.141592653589793
    maximum_phase_error = 0.0
    for j in range(2):
        base = 7 * (j * rows)
        sm = au[base + 1]
        sp = au[base + 2]
        se = au[base + 3]
        for i in range(1, rows):
            at = 7 * (j * rows + i) + 1
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, au[at], au[at + 1], au[at + 2]
            )
        sum_value = pari_real_to_float(sm, sp, se)
        trace[j] = sum_value
        if abs(sum_value) >= 0.001953125:
            state[2] = 1
            return 3
        for i in range(rows):
            source = 7 * (j * rows + i)
            target = 3 * (j * rows + i)
            clean_logs[target] = au[source + 1]
            clean_logs[target + 1] = au[source + 2]
            clean_logs[target + 2] = au[source + 3]
            phase = pari_real_to_float(au[source + 4], au[source + 5], au[source + 6])
            ratio = phase / pi
            if ratio >= 0.0:
                multiple = int(ratio + 0.5)
            else:
                multiple = int(ratio - 0.5)
            error = abs(ratio - float(multiple))
            if error > maximum_phase_error:
                maximum_phase_error = error
            if error >= 1.0e-9:
                state[2] = 2
                trace[4] = maximum_phase_error
                return 4
            if multiple % 2 == 0:
                signs[j * rows + i] = 0
            else:
                signs[j * rows + i] = 1
    am, ap, ae = pari_regulator_scalar_multiply(
        clean_logs[0],
        clean_logs[1],
        clean_logs[2],
        clean_logs[12],
        clean_logs[13],
        clean_logs[14],
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        clean_logs[9],
        clean_logs[10],
        clean_logs[11],
        clean_logs[3],
        clean_logs[4],
        clean_logs[5],
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    regulator = abs(pari_real_to_float(dm, dp, de))
    expected = pari_real_to_float(
        expected_regulator[0], expected_regulator[1], expected_regulator[2]
    )
    trace[2] = regulator
    trace[3] = regulator - expected
    trace[4] = maximum_phase_error
    if abs(regulator - expected) >= 0.5:
        state[2] = 3
        return 5
    state[2] = 0
    state[3] = 2
    state[4] = columns
    return 0


@native
def pari_cubic_getfu_factor_rank_two(
    clean_logs: IntegerBuffer,
    factor: IntegerBuffer,
    matep: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    state: Int64Buffer,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    approximate: Float64Buffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    exact_gram: IntegerBuffer,
) -> int:
    """Return PARI's pre-normalization `lll(real_i(matep))` factor.

    This closes the only transformation which the signed `getfu` leaf
    deliberately receives as a prepared input.  State is the fast and DPE
    zero counts.  A nonzero return is a precision/rank frontier.
    """
    if (
        len(clean_logs) < 18
        or len(factor) < 4
        or len(matep) < 18
        or len(basis) < 6
        or len(transform) < 4
        or len(state) < 2
    ):
        raise ValueError("short cubic getfu-factor storage")
    pari_validate_regulator_values(clean_logs, 6)
    for j in range(2):
        base = 9 * j
        sm = clean_logs[base]
        sp = clean_logs[base + 1]
        se = clean_logs[base + 2]
        for i in range(1, 3):
            at = base + 3 * i
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, clean_logs[at], clean_logs[at + 1], clean_logs[at + 2]
            )
        sm, sp, se = pari_regulator_scalar_divide(-sm, sp, se, 3, -1, 0)
        for i in range(3):
            at = base + 3 * i
            mm, mp, me = pari_regulator_scalar_add(
                clean_logs[at], clean_logs[at + 1], clean_logs[at + 2], sm, sp, se
            )
            matep[at] = mm
            matep[at + 1] = mp
            matep[at + 2] = me
    pari_lll_rescale(matep, basis)
    transform[0] = 1
    transform[1] = 0
    transform[2] = 0
    transform[3] = 1
    state[0] = pari_lll_fast(
        basis,
        transform,
        3,
        2,
        2,
        0.99,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        column_exponents,
        float_gram,
        alpha,
        column,
        exact_gram,
        normalized,
        temporary,
    )
    if state[0] < 0:
        return 1
    state[1] = pari_lll_dpe(
        exact_gram,
        basis,
        transform,
        3,
        2,
        2,
        True,
        0.99,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        column,
        normalized,
    )
    if state[1] != 0:
        return 1
    for i in range(4):
        factor[i] = transform[i]
    return 0


@native
def pari_cubic_unit_compose_provenance(
    outer: IntegerBuffer,
    rows: int,
    getfu_factor: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compose accepted-column exponents with normalized `getfu` factor."""
    if (
        rows < 1
        or len(outer) < 2 * rows
        or len(getfu_factor) < 4
        or len(output) < 2 * rows
    ):
        raise ValueError("short cubic unit provenance storage")
    determinant = getfu_factor[0] * getfu_factor[3] - getfu_factor[1] * getfu_factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("non-unimodular cubic getfu factor")
    for j in range(2):
        for i in range(rows):
            output[j * rows + i] = (
                outer[i] * getfu_factor[2 * j]
                + outer[rows + i] * getfu_factor[2 * j + 1]
            )
    return 0
