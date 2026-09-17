"""PARI 2.17.4 `getfu` leaf for prepared totally real cubic data.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is deliberately not a general unit-group implementation.  It translates
the rank-two, real-only suffix used by the first cubic correspondence fields:
`fixarch`, real `lll`, exponentiation, the 3 by 3 real embedding solve,
integer reconstruction, and PARI's exact unit/inverse normalization tests.
Its prepared logs must have trivial sign phase (the oracle uses doubled unit
logs).  The relation-to-unit lattice reduction, characteristic-two sign phase,
and mixed-signature complex path remain separate boundaries.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .exponential_entry import pari_prepared_exp
from .lll_dpe_pass import pari_lll_dpe
from .lll_fast import pari_lll_fast
from .lll_rescale import pari_lll_rescale
from .regulator_approx_zero import (
    pari_regulator_exponent,
    pari_regulator_pivot_max_unchecked,
)
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_divide,
    pari_regulator_scalar_multiply,
    pari_validate_regulator_values,
)
from .short_product import pari_round_real


@native
def pari_getfu_cubic_real_solve(
    matrix: IntegerBuffer,
    rhs: IntegerBuffer,
    work: IntegerBuffer,
    reduced_rhs: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
) -> int:
    """Source-order `RgM_solve_basecase` for a real 3x3 matrix, two RHS.

    Packed scalars use the regulator triple representation.  Return zero on
    success and one for PARI's approximate-zero/singular pivot result.
    `output` is published only after both back substitutions succeed.
    """
    if (
        len(matrix) < 27
        or len(rhs) < 18
        or len(work) < 27
        or len(reduced_rhs) < 18
        or len(output) < 18
        or len(pivots) < 3
    ):
        raise ValueError("short cubic real-solve workspace")
    pari_validate_regulator_values(matrix, 9)
    pari_validate_regulator_values(rhs, 6)
    for i in range(27):
        work[i] = matrix[i]
    for i in range(18):
        reduced_rhs[i] = rhs[i]
    for column in range(3):
        row = (
            pari_regulator_pivot_max_unchecked(
                work, matrix, 3, column + 1, pivots, False
            )
            - 1
        )
        pivots[column] = row + 1
        if row == 3:
            return 1
        if row != column:
            for j in range(column, 3):
                for t in range(3):
                    left = 3 * (j * 3 + column) + t
                    right = 3 * (j * 3 + row) + t
                    saved = work[left]
                    work[left] = work[right]
                    work[right] = saved
            for j in range(2):
                for t in range(3):
                    left = 3 * (j * 3 + column) + t
                    right = 3 * (j * 3 + row) + t
                    saved = reduced_rhs[left]
                    reduced_rhs[left] = reduced_rhs[right]
                    reduced_rhs[right] = saved
        pivot = 3 * (column * 3 + column)
        if column < 2:
            for row_index in range(column + 1, 3):
                at = 3 * (column * 3 + row_index)
                if work[at] == 0:
                    continue
                mm, mp, me = pari_regulator_scalar_divide(
                    work[at],
                    work[at + 1],
                    work[at + 2],
                    work[pivot],
                    work[pivot + 1],
                    work[pivot + 2],
                )
                for j in range(column + 1, 3):
                    target = 3 * (j * 3 + row_index)
                    source = 3 * (j * 3 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm,
                        mp,
                        me,
                        work[source],
                        work[source + 1],
                        work[source + 2],
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        work[target],
                        work[target + 1],
                        work[target + 2],
                        -tm,
                        tp,
                        te,
                    )
                    work[target] = tm
                    work[target + 1] = tp
                    work[target + 2] = te
                for j in range(2):
                    target = 3 * (j * 3 + row_index)
                    source = 3 * (j * 3 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm,
                        mp,
                        me,
                        reduced_rhs[source],
                        reduced_rhs[source + 1],
                        reduced_rhs[source + 2],
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        reduced_rhs[target],
                        reduced_rhs[target + 1],
                        reduced_rhs[target + 2],
                        -tm,
                        tp,
                        te,
                    )
                    reduced_rhs[target] = tm
                    reduced_rhs[target + 1] = tp
                    reduced_rhs[target + 2] = te
    for rhs_column in range(2):
        for row_index in range(2, -1, -1):
            at = 3 * (rhs_column * 3 + row_index)
            mm = reduced_rhs[at]
            mp = reduced_rhs[at + 1]
            me = reduced_rhs[at + 2]
            for j in range(row_index + 1, 3):
                coefficient = 3 * (j * 3 + row_index)
                solved = 3 * (rhs_column * 3 + j)
                tm, tp, te = pari_regulator_scalar_multiply(
                    work[coefficient],
                    work[coefficient + 1],
                    work[coefficient + 2],
                    reduced_rhs[solved],
                    reduced_rhs[solved + 1],
                    reduced_rhs[solved + 2],
                )
                mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
            diagonal = 3 * (row_index * 3 + row_index)
            mm, mp, me = pari_regulator_scalar_divide(
                mm,
                mp,
                me,
                work[diagonal],
                work[diagonal + 1],
                work[diagonal + 2],
            )
            reduced_rhs[at] = mm
            reduced_rhs[at + 1] = mp
            reduced_rhs[at + 2] = me
    for i in range(18):
        output[i] = reduced_rhs[i]
    return 0


@native
def pari_getfu_cubic_unit_inverse(
    unit: IntegerBuffer,
    unit_offset: int,
    multiplication_basis: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
) -> int:
    """Authenticate one integral-basis column and form its integral inverse.

    Return 0 for a nonunit, 1 for a unit, and 2 for PARI's scalar-vector
    rejection.  `multiplication_basis` is three column-major 3x3 matrices,
    one for multiplication by each integral-basis vector.
    """
    if (
        unit_offset < 0
        or len(unit) < unit_offset + 3
        or len(multiplication_basis) < 27
        or len(multiplication) < 9
        or len(inverse) < 3
    ):
        raise ValueError("short cubic unit-authentication workspace")
    for i in range(9):
        value = 0
        for j in range(3):
            value += unit[unit_offset + j] * multiplication_basis[j * 9 + i]
        multiplication[i] = value
    determinant = (
        multiplication[0]
        * (
            multiplication[4] * multiplication[8]
            - multiplication[7] * multiplication[5]
        )
        - multiplication[3]
        * (
            multiplication[1] * multiplication[8]
            - multiplication[7] * multiplication[2]
        )
        + multiplication[6]
        * (
            multiplication[1] * multiplication[5]
            - multiplication[4] * multiplication[2]
        )
    )
    if determinant != 1 and determinant != -1:
        return 0
    if unit[unit_offset + 1] == 0 and unit[unit_offset + 2] == 0:
        return 2
    inverse[0] = (
        multiplication[4] * multiplication[8] - multiplication[7] * multiplication[5]
    ) // determinant
    inverse[1] = (
        multiplication[2] * multiplication[7] - multiplication[1] * multiplication[8]
    ) // determinant
    inverse[2] = (
        multiplication[1] * multiplication[5] - multiplication[2] * multiplication[4]
    ) // determinant
    for row in range(3):
        product = 0
        for column in range(3):
            product += multiplication[3 * column + row] * inverse[column]
        expected = 0
        if row == 0:
            expected = 1
        if product != expected:
            return 0
    return 1


@native
def pari_getfu_real_cubic(
    clean_logs: IntegerBuffer,
    embedding_matrix: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    precision: int,
    matep: IntegerBuffer,
    lll_basis: IntegerBuffer,
    transform: IntegerBuffer,
    transformed_logs: IntegerBuffer,
    exponential_values: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs: IntegerBuffer,
    state: Int64Buffer,
    pivots: Int64Buffer,
    mu: Float64Buffer,
    r: Float64Buffer,
    s: Float64Buffer,
    approximate: Float64Buffer,
    exponents: IntegerBuffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    exact_gram: IntegerBuffer,
    mu_exponents: IntegerBuffer,
    r_exponents: IntegerBuffer,
    s_exponents: IntegerBuffer,
    exp_cache: IntegerBuffer,
    exp_a: IntegerBuffer,
    exp_b: IntegerBuffer,
    exp_p: IntegerBuffer,
    exp_q: IntegerBuffer,
    exp_stack: IntegerBuffer,
) -> int:
    """Execute prepared sign-free all-real cubic `getfu` with matched stops.

    Return 0 on success, 3 for `fupb_PRECI`, 2 for `fupb_LARGE` and
    negative values only for explicit untranslated LLL/compiler frontiers.
    State: return, fast zeros, DPE zeros, max real exponent, rounding error,
    inverse-choice mask, completed exact unit checks, solve status.
    """
    if precision < 64 or precision > 2240 or precision % 64 != 0:
        raise ValueError("unsupported cubic getfu precision")
    if (
        len(clean_logs) < 18
        or len(embedding_matrix) < 27
        or len(multiplication_basis) < 27
        or len(matep) < 18
        or len(lll_basis) < 6
        or len(transform) < 4
        or len(transformed_logs) < 18
        or len(exponential_values) < 18
        or len(solve_work) < 27
        or len(solve_rhs) < 18
        or len(solved) < 18
        or len(rounded) < 6
        or len(multiplication) < 9
        or len(inverse) < 3
        or len(candidate_units) < 6
        or len(output_units) < 6
        or len(output_logs) < 18
        or len(state) < 8
        or len(pivots) < 3
    ):
        raise ValueError("short cubic getfu workspace")
    pari_validate_regulator_values(clean_logs, 6)
    pari_validate_regulator_values(embedding_matrix, 9)
    for i in range(8):
        state[i] = 0
    state[0] = -9
    # fixarch: s = -sum(Aj)/3, all three places are real.
    for j in range(2):
        base = 9 * j
        sm, sp, se = clean_logs[base], clean_logs[base + 1], clean_logs[base + 2]
        for i in range(1, 3):
            at = base + 3 * i
            sm, sp, se = pari_regulator_scalar_add(
                sm,
                sp,
                se,
                clean_logs[at],
                clean_logs[at + 1],
                clean_logs[at + 2],
            )
        sm, sp, se = pari_regulator_scalar_divide(-sm, sp, se, 3, -1, 0)
        for i in range(3):
            at = base + 3 * i
            mm, mp, me = pari_regulator_scalar_add(
                clean_logs[at],
                clean_logs[at + 1],
                clean_logs[at + 2],
                sm,
                sp,
                se,
            )
            matep[at] = mm
            matep[at + 1] = mp
            matep[at + 2] = me
    nonzero_log = False
    for i in range(6):
        if matep[3 * i] != 0:
            nonzero_log = True
    if not nonzero_log:
        state[0] = 3
        state[1] = 2
        state[2] = 2
        return 3
    pari_lll_rescale(matep, lll_basis)
    transform[0] = 1
    transform[1] = 0
    transform[2] = 0
    transform[3] = 1
    fast = pari_lll_fast(
        lll_basis,
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
        exponents,
        float_gram,
        alpha,
        column,
        column_exponents,
        normalized,
        temporary,
    )
    state[1] = fast
    if fast < 0:
        state[0] = -1
        return -1
    dpe = pari_lll_dpe(
        exact_gram,
        lll_basis,
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
    state[2] = dpe
    if dpe < 0:
        state[0] = -2
        return -2
    if dpe != 0:
        state[0] = 3
        return 3
    # Fixed 3x2 by 2x2 product.  Keep the packed-real arithmetic schedule
    # explicit: the general matrix helper deliberately rejects exact-only
    # matrices, while PARI's getfu accepts both exact and inexact log inputs.
    for j in range(2):
        for i in range(3):
            left = 3 * i
            mm, mp, me = pari_regulator_scalar_multiply(
                matep[left],
                matep[left + 1],
                matep[left + 2],
                transform[2 * j],
                -1,
                0,
            )
            left += 9
            tm, tp, te = pari_regulator_scalar_multiply(
                matep[left],
                matep[left + 1],
                matep[left + 2],
                transform[2 * j + 1],
                -1,
                0,
            )
            mm, mp, me = pari_regulator_scalar_add(mm, mp, me, tm, tp, te)
            at = 9 * j + 3 * i
            transformed_logs[at] = mm
            transformed_logs[at + 1] = mp
            transformed_logs[at + 2] = me
    maximum_exponent = -(1 << 61)
    for i in range(6):
        at = 3 * i
        exponent = pari_regulator_exponent(
            transformed_logs[at], transformed_logs[at + 1], transformed_logs[at + 2]
        )
        if transformed_logs[at] != 0 and exponent > maximum_exponent:
            maximum_exponent = exponent
        if exponent > 20:
            state[0] = 2
            state[3] = maximum_exponent
            return 2
    state[3] = maximum_exponent
    for i in range(6):
        at = 3 * i
        mm, mp, me = pari_prepared_exp(
            transformed_logs[at],
            transformed_logs[at + 1],
            transformed_logs[at + 2],
            exp_cache,
            exp_a,
            exp_b,
            exp_p,
            exp_q,
            exp_stack,
        )
        exponential_values[at] = mm
        exponential_values[at + 1] = mp
        exponential_values[at + 2] = me
    solve_status = pari_getfu_cubic_real_solve(
        embedding_matrix,
        exponential_values,
        solve_work,
        solve_rhs,
        solved,
        pivots,
    )
    state[7] = solve_status
    if solve_status != 0:
        state[0] = 3
        return 3
    worst_error = -(1 << 61)
    for i in range(6):
        at = 3 * i
        if solved[at + 1] < 0:
            rounded[i] = solved[at]
            error = -(1 << 61)
        else:
            rounded_value, error = pari_round_real(
                solved[at], solved[at + 1] - 1 - solved[at + 2], solved[at + 2]
            )
            rounded[i] = rounded_value
        if error > worst_error:
            worst_error = error
    state[4] = worst_error
    if worst_error >= 0:
        state[0] = 3
        return 3
    for i in range(6):
        candidate_units[i] = rounded[i]
    # Stage A*U, but do not publish it until both exact unit checks succeed.
    for j in range(2):
        for i in range(3):
            left = 3 * i
            mm, mp, me = pari_regulator_scalar_multiply(
                clean_logs[left],
                clean_logs[left + 1],
                clean_logs[left + 2],
                transform[2 * j],
                -1,
                0,
            )
            left += 9
            tm, tp, te = pari_regulator_scalar_multiply(
                clean_logs[left],
                clean_logs[left + 1],
                clean_logs[left + 2],
                transform[2 * j + 1],
                -1,
                0,
            )
            mm, mp, me = pari_regulator_scalar_add(mm, mp, me, tm, tp, te)
            at = 9 * j + 3 * i
            transformed_logs[at] = mm
            transformed_logs[at + 1] = mp
            transformed_logs[at + 2] = me
    inverse_mask = 0
    for j in range(2):
        check = pari_getfu_cubic_unit_inverse(
            candidate_units, 3 * j, multiplication_basis, multiplication, inverse
        )
        if check != 1:
            state[0] = 3
            return 3
        direct_norm = 0
        inverse_norm = 0
        for i in range(3):
            direct_norm += candidate_units[3 * j + i] * candidate_units[3 * j + i]
            inverse_norm += inverse[i] * inverse[i]
        if inverse_norm < direct_norm:
            inverse_mask += 1 << j
            for i in range(3):
                candidate_units[3 * j + i] = inverse[i]
            for i in range(3):
                transformed_logs[9 * j + 3 * i] = -transformed_logs[9 * j + 3 * i]
        state[6] = j + 1
    for i in range(6):
        output_units[i] = candidate_units[i]
    for i in range(18):
        output_logs[i] = transformed_logs[i]
    state[5] = inverse_mask
    state[0] = 0
    return 0
