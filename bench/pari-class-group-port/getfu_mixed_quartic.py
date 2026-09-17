"""PARI 2.17.4 mixed-quartic `getfu` reconstruction suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This connected cut starts at the factored rank-two logarithm lattice selected
by `buch2.c:getfu`.  It preserves `RgM_expbitprec`, complex exponentiation,
`RgM_solve_realimag`, integer reconstruction, `zk_inv`, and the final T2-norm
choice for signature `(2, 1)` quartics.  Packed triples and caller-owned work
storage retain the same source-transparent dynamic/native implementation.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .getfu_mixed_complex import pari_mixed_complex_exp
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
def pari_getfu_quartic_realimag_solve(
    matrix: IntegerBuffer,
    rhs: IntegerBuffer,
    work: IntegerBuffer,
    reduced_rhs: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
) -> int:
    """Source-order 4x4 `RgM_solve` after `split_realimag`, for two RHS."""
    if (
        len(matrix) < 48
        or len(rhs) < 24
        or len(work) < 48
        or len(reduced_rhs) < 24
        or len(output) < 24
        or len(pivots) < 4
    ):
        raise ValueError("short quartic realimag solve workspace")
    pari_validate_regulator_values(matrix, 16)
    pari_validate_regulator_values(rhs, 8)
    for i in range(48):
        work[i] = matrix[i]
    for i in range(24):
        reduced_rhs[i] = rhs[i]
    for column in range(4):
        row = (
            pari_regulator_pivot_max_unchecked(
                work, matrix, 4, column + 1, pivots, False
            )
            - 1
        )
        pivots[column] = row + 1
        if row == 4:
            return 1
        if row != column:
            for j in range(column, 4):
                for t in range(3):
                    left = 3 * (j * 4 + column) + t
                    right = 3 * (j * 4 + row) + t
                    saved = work[left]
                    work[left] = work[right]
                    work[right] = saved
            for j in range(2):
                for t in range(3):
                    left = 3 * (j * 4 + column) + t
                    right = 3 * (j * 4 + row) + t
                    saved = reduced_rhs[left]
                    reduced_rhs[left] = reduced_rhs[right]
                    reduced_rhs[right] = saved
        pivot = 3 * (column * 4 + column)
        if column < 3:
            for row_index in range(column + 1, 4):
                at = 3 * (column * 4 + row_index)
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
                for j in range(column + 1, 4):
                    target = 3 * (j * 4 + row_index)
                    source = 3 * (j * 4 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm,
                        mp,
                        me,
                        work[source],
                        work[source + 1],
                        work[source + 2],
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        work[target], work[target + 1], work[target + 2], -tm, tp, te
                    )
                    work[target] = tm
                    work[target + 1] = tp
                    work[target + 2] = te
                for j in range(2):
                    target = 3 * (j * 4 + row_index)
                    source = 3 * (j * 4 + column)
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
        for row_index in range(3, -1, -1):
            at = 3 * (rhs_column * 4 + row_index)
            mm, mp, me = reduced_rhs[at], reduced_rhs[at + 1], reduced_rhs[at + 2]
            for j in range(row_index + 1, 4):
                coefficient = 3 * (j * 4 + row_index)
                solved = 3 * (rhs_column * 4 + j)
                tm, tp, te = pari_regulator_scalar_multiply(
                    work[coefficient],
                    work[coefficient + 1],
                    work[coefficient + 2],
                    reduced_rhs[solved],
                    reduced_rhs[solved + 1],
                    reduced_rhs[solved + 2],
                )
                mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
            diagonal = 3 * (row_index * 4 + row_index)
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
    for i in range(24):
        output[i] = reduced_rhs[i]
    return 0


@native
def pari_det3_quartic(
    a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int, i: int
) -> int:
    return a * (e * i - h * f) - d * (b * i - h * c) + g * (b * f - e * c)


@native
def pari_getfu_quartic_unit_inverse(
    unit: IntegerBuffer,
    unit_offset: int,
    multiplication_basis: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
) -> int:
    """Authenticate a quartic integral-basis unit and return its inverse."""
    if (
        unit_offset < 0
        or len(unit) < unit_offset + 4
        or len(multiplication_basis) < 64
        or len(multiplication) < 16
        or len(inverse) < 4
    ):
        raise ValueError("short quartic unit-authentication workspace")
    for i in range(16):
        value = 0
        for j in range(4):
            value += unit[unit_offset + j] * multiplication_basis[16 * j + i]
        multiplication[i] = value
    inverse[0] = pari_det3_quartic(
        multiplication[5],
        multiplication[6],
        multiplication[7],
        multiplication[9],
        multiplication[10],
        multiplication[11],
        multiplication[13],
        multiplication[14],
        multiplication[15],
    )
    inverse[1] = -pari_det3_quartic(
        multiplication[1],
        multiplication[2],
        multiplication[3],
        multiplication[9],
        multiplication[10],
        multiplication[11],
        multiplication[13],
        multiplication[14],
        multiplication[15],
    )
    inverse[2] = pari_det3_quartic(
        multiplication[1],
        multiplication[2],
        multiplication[3],
        multiplication[5],
        multiplication[6],
        multiplication[7],
        multiplication[13],
        multiplication[14],
        multiplication[15],
    )
    inverse[3] = -pari_det3_quartic(
        multiplication[1],
        multiplication[2],
        multiplication[3],
        multiplication[5],
        multiplication[6],
        multiplication[7],
        multiplication[9],
        multiplication[10],
        multiplication[11],
    )
    determinant = 0
    for column in range(4):
        determinant += multiplication[4 * column] * inverse[column]
    if determinant != 1 and determinant != -1:
        return 0
    if (
        unit[unit_offset + 1] == 0
        and unit[unit_offset + 2] == 0
        and unit[unit_offset + 3] == 0
    ):
        return 2
    for i in range(4):
        inverse[i] //= determinant
    for row in range(4):
        product = 0
        for column in range(4):
            product += multiplication[4 * column + row] * inverse[column]
        expected = 0
        if row == 0:
            expected = 1
        if product != expected:
            return 0
    return 1


@native
def pari_getfu_mixed_quartic(
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    factor: IntegerBuffer,
    embedding_real: IntegerBuffer,
    embedding_imag: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    precision: int,
    exponential_real: IntegerBuffer,
    exponential_imag: IntegerBuffer,
    split_matrix: IntegerBuffer,
    split_rhs: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    normalized_factor: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs_real: IntegerBuffer,
    output_logs_imag: IntegerBuffer,
    output_factor: IntegerBuffer,
    state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Run the connected signature `(2,1)` quartic reconstruction suffix."""
    if precision < 64 or precision > 768 or precision % 64 != 0:
        raise ValueError("unsupported mixed quartic getfu precision")
    if (
        len(arch_real) < 18
        or len(arch_imag) < 18
        or len(clean_real) < 18
        or len(clean_imag) < 18
        or len(factor) < 4
        or len(embedding_real) < 36
        or len(embedding_imag) < 36
        or len(multiplication_basis) < 64
        or len(exponential_real) < 18
        or len(exponential_imag) < 18
        or len(split_matrix) < 48
        or len(split_rhs) < 24
        or len(solve_work) < 48
        or len(solve_rhs) < 24
        or len(solved) < 24
        or len(rounded) < 8
        or len(multiplication) < 16
        or len(inverse) < 4
        or len(candidate_units) < 8
        or len(normalized_factor) < 4
        or len(output_units) < 8
        or len(output_logs_real) < 18
        or len(output_logs_imag) < 18
        or len(output_factor) < 4
        or len(state) < 8
        or len(pivots) < 4
    ):
        raise ValueError("short mixed quartic getfu workspace")
    pari_validate_regulator_values(arch_real, 6)
    pari_validate_regulator_values(arch_imag, 6)
    pari_validate_regulator_values(clean_real, 6)
    pari_validate_regulator_values(clean_imag, 6)
    pari_validate_regulator_values(embedding_real, 12)
    pari_validate_regulator_values(embedding_imag, 12)
    determinant = factor[0] * factor[3] - factor[1] * factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("mixed quartic factor must be unimodular")
    for i in range(8):
        state[i] = 0
    state[0] = -9
    state[7] = determinant
    maximum_real = -(1 << 61)
    phase_accuracy = -(1 << 61)
    for i in range(6):
        at = 3 * i
        real_exponent = pari_regulator_exponent(
            arch_real[at], arch_real[at + 1], arch_real[at + 2]
        )
        if real_exponent > maximum_real:
            maximum_real = real_exponent
        if real_exponent > 20:
            state[0] = 2
            state[1] = maximum_real
            return 2
        if arch_imag[at + 1] >= 0:
            accuracy = arch_imag[at + 2] + 5 - arch_imag[at + 1]
            if accuracy > phase_accuracy:
                phase_accuracy = accuracy
    state[1] = maximum_real
    state[2] = phase_accuracy
    if phase_accuracy >= 0:
        state[0] = 3
        return 3

    for i in range(6):
        at = 3 * i
        rm, rp, re, im, ip, ie = pari_mixed_complex_exp(
            arch_real[at],
            arch_real[at + 1],
            arch_real[at + 2],
            arch_imag[at],
            arch_imag[at + 1],
            arch_imag[at + 2],
            exp_cache,
            pi_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        exponential_real[at] = rm
        exponential_real[at + 1] = rp
        exponential_real[at + 2] = re
        exponential_imag[at] = im
        exponential_imag[at + 1] = ip
        exponential_imag[at + 2] = ie
    # split_realimag: two real rows, then real and imaginary parts of row 3.
    for column in range(4):
        for row in range(3):
            source = 3 * (column * 3 + row)
            target = 3 * (column * 4 + row)
            for t in range(3):
                split_matrix[target + t] = embedding_real[source + t]
        source = 3 * (column * 3 + 2)
        target = 3 * (column * 4 + 3)
        for t in range(3):
            split_matrix[target + t] = embedding_imag[source + t]
    for column in range(2):
        for row in range(3):
            source = 3 * (column * 3 + row)
            target = 3 * (column * 4 + row)
            for t in range(3):
                split_rhs[target + t] = exponential_real[source + t]
        source = 3 * (column * 3 + 2)
        target = 3 * (column * 4 + 3)
        for t in range(3):
            split_rhs[target + t] = exponential_imag[source + t]
    solve_status = pari_getfu_quartic_realimag_solve(
        split_matrix, split_rhs, solve_work, solve_rhs, solved, pivots
    )
    state[3] = solve_status
    if solve_status != 0:
        state[0] = 3
        return 3
    worst_error = -(1 << 61)
    for i in range(8):
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
    for i in range(8):
        candidate_units[i] = rounded[i]
    for i in range(4):
        normalized_factor[i] = factor[i]
    inverse_mask = 0
    for column in range(2):
        check = pari_getfu_quartic_unit_inverse(
            candidate_units,
            4 * column,
            multiplication_basis,
            multiplication,
            inverse,
        )
        if check != 1:
            state[0] = 3
            return 3
        direct_norm = 0
        inverse_norm = 0
        for i in range(4):
            direct_norm += candidate_units[4 * column + i] ** 2
            inverse_norm += inverse[i] ** 2
        if inverse_norm < direct_norm:
            inverse_mask += 1 << column
            for i in range(4):
                candidate_units[4 * column + i] = inverse[i]
            normalized_factor[2 * column] = -normalized_factor[2 * column]
            normalized_factor[2 * column + 1] = -normalized_factor[2 * column + 1]
        state[6] = column + 1
    for i in range(8):
        output_units[i] = candidate_units[i]
    for column in range(2):
        sign = 1
        if inverse_mask & (1 << column):
            sign = -1
        for i in range(9):
            output_logs_real[9 * column + i] = sign * clean_real[9 * column + i]
            output_logs_imag[9 * column + i] = sign * clean_imag[9 * column + i]
    for i in range(4):
        output_factor[i] = normalized_factor[i]
    state[5] = inverse_mask
    state[0] = 0
    return 0
