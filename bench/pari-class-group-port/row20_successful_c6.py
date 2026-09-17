"""Authenticated row-20 signature ``(1, 2)`` C3--C6 unit path.

PARI 2.17.4 algorithm, copyright (C) The PARI group;
GPL-2.0-or-later.

The arithmetic input stops at the prepared number field, the exact HNF
logarithms, and the accepted rank-two relation lattice.  In particular, the
``fundamental_units`` event is not an input.  Its ``U``, ``A``, and ``fu``
members are read only after the connected computation returns, as a pristine
comparison oracle.
"""

from collections.abc import Mapping, Sequence
import hashlib
import json
import re
from typing import Any

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .getfu_mixed_complex import pari_mixed_complex_exp
from .integer_real_product import pari_integer_real_product
from .log_matrix_transform import pari_log_matrix_transform, pari_validate_log_entries
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
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
from .short_product import (
    pari_real_integer_division,
    pari_round_real,
    pari_short_product,
    pari_signed_real_sum,
)
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)


W0_SHA256 = "6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468"
OUTPUT_SCHEMA = "sagejs.pari-class-group/row20-successful-c6-v1"
FIELD_ID = "5.1.1000000.1"
PRECISION = 192
DEGREE = 5
PLACES = 3
RANK = 2
RELATION_COLUMNS = 7


@native
def pari_cleanarchunit_mixed_quintic(
    source: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    precision: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Apply ``cleanarchunit`` for degree five and signature ``(1, 2)``."""

    if precision != 192:
        raise ValueError("row-20 cleanarchunit requires 192-bit precision")
    if (
        len(source) < 42
        or len(expected_regulator) < 3
        or len(scratch) < 42
        or len(output) < 42
        or len(state) < 6
    ):
        raise ValueError("short mixed-quintic cleanarchunit storage")
    pari_validate_log_entries(source, 6)
    for index in range(6):
        state[index] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -(1 << 61)
    state[4] = -(1 << 61)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    for column in range(2):
        base = 21 * column
        sm, sp, se = source[base + 1], source[base + 2], source[base + 3]
        for row in range(1, 3):
            at = base + 7 * row
            sm, sp, se = pari_signed_real_sum(
                sm, sp, se, source[at + 1], source[at + 2], source[at + 3]
            )
        norm_exponent = pari_regulator_exponent(sm, sp, se)
        if norm_exponent > state[3]:
            state[3] = norm_exponent
        if norm_exponent > -10:
            state[0] = 1
            return 1
        for row in range(3):
            at = base + 7 * row
            for cell in range(7):
                scratch[at + cell] = source[at + cell]
            xm, xp, xe = source[at + 4], source[at + 5], source[at + 6]
            if xm != 0:
                scale = -3
                period_exponent = pe + 1
                if row >= 1:
                    scale = -4
                    period_exponent = pe + 2
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, scale)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    state[5] = row
                    return 1
                shift = qp - qe - 1
                if shift >= 0:
                    quotient = qm // (1 << shift)
                else:
                    quotient = qm << -shift
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(
                        quotient, pm, pp, period_exponent
                    )
                    xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
                scratch[at + 4] = xm
                scratch[at + 5] = xp
                scratch[at + 6] = xe
                if xm == 0:
                    scratch[at] = 1
                    scratch[at + 4] = 0
                    scratch[at + 5] = -1
                    scratch[at + 6] = 0
        state[1] = column + 1
    am, ap, ae = pari_regulator_scalar_multiply(
        scratch[1], scratch[2], scratch[3], scratch[29], scratch[30], scratch[31]
    )
    bm, bp, be = pari_regulator_scalar_multiply(
        scratch[22], scratch[23], scratch[24], scratch[8], scratch[9], scratch[10]
    )
    dm, dp, de = pari_regulator_scalar_add(am, ap, ae, -bm, bp, be)
    if dm < 0:
        dm = -dm
    dm, dp, de = pari_regulator_scalar_add(
        dm, dp, de, -expected_regulator[0], expected_regulator[1], expected_regulator[2]
    )
    state[4] = pari_regulator_exponent(dm, dp, de)
    if state[4] > -1:
        state[0] = 2
        return 2
    for index in range(42):
        output[index] = scratch[index]
    state[0] = 0
    state[2] = 2
    return 0


@native
def pari_prepare_getfu_mixed_quintic(
    clean: IntegerBuffer,
    factor: IntegerBuffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    factored_clean: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
) -> int:
    """Build degree-five ``fixarch(A)`` and apply a rank-two factor."""

    if (
        len(clean) < 42
        or len(factor) < 4
        or len(matep) < 42
        or len(arch) < 42
        or len(factored_clean) < 42
        or len(arch_real) < 18
        or len(arch_imag) < 18
        or len(clean_real) < 18
        or len(clean_imag) < 18
    ):
        raise ValueError("short mixed-quintic getfu preparation storage")
    pari_validate_log_entries(clean, 6)
    determinant = factor[0] * factor[3] - factor[1] * factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("mixed-quintic getfu factor must be unimodular")
    for column in range(2):
        base = 21 * column
        sm, sp, se = clean[base + 1], clean[base + 2], clean[base + 3]
        for row in range(1, 3):
            at = base + 7 * row
            sm, sp, se = pari_regulator_scalar_add(
                sm, sp, se, clean[at + 1], clean[at + 2], clean[at + 3]
            )
        sm, sp, se = pari_real_integer_division(-5, sm, sp, se)
        for row in range(3):
            at = base + 7 * row
            xm, xp, xe = clean[at + 1], clean[at + 2], clean[at + 3]
            im, ip, ie = clean[at + 4], clean[at + 5], clean[at + 6]
            if row >= 1:
                xm, xp, xe = pari_real_integer_division(2, xm, xp, xe)
                im, ip, ie = pari_real_integer_division(2, im, ip, ie)
            rm, rp, re = pari_regulator_scalar_add(xm, xp, xe, sm, sp, se)
            matep[at] = clean[at]
            matep[at + 1] = rm
            matep[at + 2] = rp
            matep[at + 3] = re
            matep[at + 4] = im
            matep[at + 5] = ip
            matep[at + 6] = ie
    pari_log_matrix_transform(matep, factor, 3, 2, 2, False, arch)
    pari_log_matrix_transform(clean, factor, 3, 2, 2, False, factored_clean)
    for index in range(6):
        packed = 7 * index
        triple = 3 * index
        arch_real[triple] = arch[packed + 1]
        arch_real[triple + 1] = arch[packed + 2]
        arch_real[triple + 2] = arch[packed + 3]
        arch_imag[triple] = arch[packed + 4]
        arch_imag[triple + 1] = arch[packed + 5]
        arch_imag[triple + 2] = arch[packed + 6]
        clean_real[triple] = factored_clean[packed + 1]
        clean_real[triple + 1] = factored_clean[packed + 2]
        clean_real[triple + 2] = factored_clean[packed + 3]
        clean_imag[triple] = factored_clean[packed + 4]
        clean_imag[triple + 1] = factored_clean[packed + 5]
        clean_imag[triple + 2] = factored_clean[packed + 6]
    return 0


@native
def pari_getfu_quintic_realimag_solve(
    matrix: IntegerBuffer,
    rhs: IntegerBuffer,
    work: IntegerBuffer,
    reduced_rhs: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
) -> int:
    """Source-order 5 by 5 real/imag solve with two right-hand sides."""

    if (
        len(matrix) < 75
        or len(rhs) < 30
        or len(work) < 75
        or len(reduced_rhs) < 30
        or len(output) < 30
        or len(pivots) < 5
    ):
        raise ValueError("short quintic realimag solve workspace")
    pari_validate_regulator_values(matrix, 25)
    pari_validate_regulator_values(rhs, 10)
    for index in range(75):
        work[index] = matrix[index]
    for index in range(30):
        reduced_rhs[index] = rhs[index]
    for column in range(5):
        row = (
            pari_regulator_pivot_max_unchecked(
                work, matrix, 5, column + 1, pivots, False
            )
            - 1
        )
        pivots[column] = row + 1
        if row == 5:
            return 1
        if row != column:
            for other_column in range(column, 5):
                for cell in range(3):
                    left = 3 * (other_column * 5 + column) + cell
                    right = 3 * (other_column * 5 + row) + cell
                    saved = work[left]
                    work[left] = work[right]
                    work[right] = saved
            for rhs_column in range(2):
                for cell in range(3):
                    left = 3 * (rhs_column * 5 + column) + cell
                    right = 3 * (rhs_column * 5 + row) + cell
                    saved = reduced_rhs[left]
                    reduced_rhs[left] = reduced_rhs[right]
                    reduced_rhs[right] = saved
        pivot = 3 * (column * 5 + column)
        if column < 4:
            for row_index in range(column + 1, 5):
                at = 3 * (column * 5 + row_index)
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
                for other_column in range(column + 1, 5):
                    target = 3 * (other_column * 5 + row_index)
                    source = 3 * (other_column * 5 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm, mp, me, work[source], work[source + 1], work[source + 2]
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        work[target], work[target + 1], work[target + 2], -tm, tp, te
                    )
                    work[target] = tm
                    work[target + 1] = tp
                    work[target + 2] = te
                for rhs_column in range(2):
                    target = 3 * (rhs_column * 5 + row_index)
                    source = 3 * (rhs_column * 5 + column)
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
        for row_index in range(4, -1, -1):
            at = 3 * (rhs_column * 5 + row_index)
            mm, mp, me = reduced_rhs[at], reduced_rhs[at + 1], reduced_rhs[at + 2]
            for other_column in range(row_index + 1, 5):
                coefficient = 3 * (other_column * 5 + row_index)
                solved = 3 * (rhs_column * 5 + other_column)
                tm, tp, te = pari_regulator_scalar_multiply(
                    work[coefficient],
                    work[coefficient + 1],
                    work[coefficient + 2],
                    reduced_rhs[solved],
                    reduced_rhs[solved + 1],
                    reduced_rhs[solved + 2],
                )
                mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
            diagonal = 3 * (row_index * 5 + row_index)
            mm, mp, me = pari_regulator_scalar_divide(
                mm, mp, me, work[diagonal], work[diagonal + 1], work[diagonal + 2]
            )
            reduced_rhs[at] = mm
            reduced_rhs[at + 1] = mp
            reduced_rhs[at + 2] = me
    for index in range(30):
        output[index] = reduced_rhs[index]
    return 0


@native
def pari_det3_row20(
    a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int, i: int
) -> int:
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


@native
def pari_det4_row20(
    a: int,
    b: int,
    c: int,
    d: int,
    e: int,
    f: int,
    g: int,
    h: int,
    i: int,
    j: int,
    k: int,
    l: int,
    m: int,
    n: int,
    o: int,
    p: int,
) -> int:
    return (
        a * pari_det3_row20(f, g, h, j, k, l, n, o, p)
        - b * pari_det3_row20(e, g, h, i, k, l, m, o, p)
        + c * pari_det3_row20(e, f, h, i, j, l, m, n, p)
        - d * pari_det3_row20(e, f, g, i, j, k, m, n, o)
    )


@native
def pari_minor4_row20(matrix: IntegerBuffer, skipped_column: int) -> int:
    """First-row cofactor minor of a column-major 5 by 5 matrix."""

    if len(matrix) < 25 or skipped_column < 0 or skipped_column >= 5:
        raise ValueError("invalid row-20 minor")
    c0 = 0
    c1 = 1
    c2 = 2
    c3 = 3
    if skipped_column == 0:
        c0, c1, c2, c3 = 1, 2, 3, 4
    elif skipped_column == 1:
        c0, c1, c2, c3 = 0, 2, 3, 4
    elif skipped_column == 2:
        c0, c1, c2, c3 = 0, 1, 3, 4
    elif skipped_column == 3:
        c0, c1, c2, c3 = 0, 1, 2, 4
    return pari_det4_row20(
        matrix[5 * c0 + 1],
        matrix[5 * c1 + 1],
        matrix[5 * c2 + 1],
        matrix[5 * c3 + 1],
        matrix[5 * c0 + 2],
        matrix[5 * c1 + 2],
        matrix[5 * c2 + 2],
        matrix[5 * c3 + 2],
        matrix[5 * c0 + 3],
        matrix[5 * c1 + 3],
        matrix[5 * c2 + 3],
        matrix[5 * c3 + 3],
        matrix[5 * c0 + 4],
        matrix[5 * c1 + 4],
        matrix[5 * c2 + 4],
        matrix[5 * c3 + 4],
    )


@native
def pari_getfu_quintic_unit_inverse(
    unit: IntegerBuffer,
    unit_offset: int,
    multiplication_basis: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
) -> int:
    """Authenticate a quintic integral-basis unit and publish its inverse."""

    if (
        unit_offset < 0
        or len(unit) < unit_offset + 5
        or len(multiplication_basis) < 125
        or len(multiplication) < 25
        or len(inverse) < 5
    ):
        raise ValueError("short quintic unit-authentication workspace")
    for index in range(25):
        value = 0
        for basis_index in range(5):
            value += (
                unit[unit_offset + basis_index]
                * multiplication_basis[25 * basis_index + index]
            )
        multiplication[index] = value
    determinant = 0
    for column in range(5):
        cofactor = pari_minor4_row20(multiplication, column)
        if column % 2 == 1:
            cofactor = -cofactor
        inverse[column] = cofactor
        determinant += multiplication[5 * column] * cofactor
    if determinant != 1 and determinant != -1:
        return 0
    scalar = True
    for index in range(1, 5):
        if unit[unit_offset + index] != 0:
            scalar = False
    if scalar:
        return 2
    for index in range(5):
        inverse[index] //= determinant
    for row in range(5):
        product = 0
        for column in range(5):
            product += multiplication[5 * column + row] * inverse[column]
        expected = 0
        if row == 0:
            expected = 1
        if product != expected:
            return 0
    return 1


@native
def pari_getfu_mixed_quintic(
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
    output_units: IntegerBuffer,
    output_logs_real: IntegerBuffer,
    output_logs_imag: IntegerBuffer,
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
    """Run the connected successful signature ``(1, 2)`` C6 suffix."""

    if precision != 192:
        raise ValueError("row-20 getfu requires 192-bit precision")
    if (
        len(arch_real) < 18
        or len(arch_imag) < 18
        or len(clean_real) < 18
        or len(clean_imag) < 18
        or len(factor) < 4
        or len(embedding_real) < 45
        or len(embedding_imag) < 45
        or len(multiplication_basis) < 125
        or len(exponential_real) < 18
        or len(exponential_imag) < 18
        or len(split_matrix) < 75
        or len(split_rhs) < 30
        or len(solve_work) < 75
        or len(solve_rhs) < 30
        or len(solved) < 30
        or len(rounded) < 10
        or len(multiplication) < 25
        or len(inverse) < 5
        or len(candidate_units) < 10
        or len(output_units) < 10
        or len(output_logs_real) < 18
        or len(output_logs_imag) < 18
        or len(state) < 8
        or len(pivots) < 5
        or len(exp_cache) < 3
        or len(pi_cache) < 3
        or len(a) < 512
        or len(b) < 512
        or len(p) < 512
        or len(q) < 512
        or len(stack) < 91
    ):
        raise ValueError("short mixed-quintic getfu workspace")
    pari_validate_regulator_values(arch_real, 6)
    pari_validate_regulator_values(arch_imag, 6)
    pari_validate_regulator_values(embedding_real, 15)
    pari_validate_regulator_values(embedding_imag, 15)
    determinant = factor[0] * factor[3] - factor[1] * factor[2]
    if determinant != 1 and determinant != -1:
        raise ValueError("mixed-quintic factor must be unimodular")
    for index in range(8):
        state[index] = 0
    state[0] = -9
    state[7] = determinant
    maximum_real = -(1 << 61)
    phase_accuracy = -(1 << 61)
    for index in range(6):
        at = 3 * index
        exponent = pari_regulator_exponent(
            arch_real[at], arch_real[at + 1], arch_real[at + 2]
        )
        if exponent > maximum_real:
            maximum_real = exponent
        if exponent > 20:
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
    for index in range(6):
        at = 3 * index
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
    for column in range(5):
        for row in range(3):
            source = 3 * (column * 3 + row)
            real_row = 2 * row - 1
            if row == 0:
                real_row = 0
            target = 3 * (column * 5 + real_row)
            for cell in range(3):
                split_matrix[target + cell] = embedding_real[source + cell]
            if row >= 1:
                target = 3 * (column * 5 + 2 * row)
                for cell in range(3):
                    split_matrix[target + cell] = embedding_imag[source + cell]
    for column in range(2):
        for row in range(3):
            source = 3 * (column * 3 + row)
            real_row = 2 * row - 1
            if row == 0:
                real_row = 0
            target = 3 * (column * 5 + real_row)
            for cell in range(3):
                split_rhs[target + cell] = exponential_real[source + cell]
            if row >= 1:
                target = 3 * (column * 5 + 2 * row)
                for cell in range(3):
                    split_rhs[target + cell] = exponential_imag[source + cell]
    solve_status = pari_getfu_quintic_realimag_solve(
        split_matrix, split_rhs, solve_work, solve_rhs, solved, pivots
    )
    state[3] = solve_status
    if solve_status != 0:
        state[0] = 3
        return 3
    worst_error = -(1 << 61)
    for index in range(10):
        at = 3 * index
        if solved[at + 1] < 0:
            rounded[index] = solved[at]
            error = -(1 << 61)
        else:
            value, error = pari_round_real(
                solved[at], solved[at + 1] - 1 - solved[at + 2], solved[at + 2]
            )
            rounded[index] = value
        if error > worst_error:
            worst_error = error
    state[4] = worst_error
    if worst_error >= 0:
        state[0] = 3
        return 3
    for index in range(10):
        candidate_units[index] = rounded[index]
    inverse_mask = 0
    for column in range(2):
        check = pari_getfu_quintic_unit_inverse(
            candidate_units, 5 * column, multiplication_basis, multiplication, inverse
        )
        if check != 1:
            state[0] = 3
            return 3
        direct_norm = 0
        inverse_norm = 0
        for index in range(5):
            direct_norm += candidate_units[5 * column + index] ** 2
            inverse_norm += inverse[index] ** 2
        if inverse_norm < direct_norm:
            inverse_mask += 1 << column
            for index in range(5):
                candidate_units[5 * column + index] = inverse[index]
        state[6] = column + 1
    for index in range(10):
        output_units[index] = candidate_units[index]
    for column in range(2):
        sign = 1
        if inverse_mask & (1 << column):
            sign = -1
        for row in range(3):
            source = 3 * (3 * column + row)
            output_logs_real[source] = sign * clean_real[source]
            output_logs_real[source + 1] = clean_real[source + 1]
            output_logs_real[source + 2] = clean_real[source + 2]
            output_logs_imag[source] = sign * clean_imag[source]
            output_logs_imag[source + 1] = clean_imag[source + 1]
            output_logs_imag[source + 2] = clean_imag[source + 2]
    state[5] = inverse_mask
    state[0] = 0
    return 0


class Row20Failure(ValueError):
    """The authenticated row-20 boundary or arithmetic failed closed."""


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row20Failure(name + " is not an object")
    return value


def _packed_real(value: Mapping[str, Any]) -> list[int]:
    if value.get("kind") == "integer":
        return [int(value["value"]), -1, 0]
    if value.get("kind") != "real":
        raise Row20Failure("expected a real exported scalar")
    return [int(value["mantissa"]), int(value["precision"]), int(value["exponent"])]


def _packed_scalar(value: Mapping[str, Any]) -> list[int]:
    if value.get("kind") == "complex":
        return [2, *_packed_real(value["real"]), *_packed_real(value["imag"])]
    return [1, *_packed_real(value), 0, -1, 0]


def _packed_matrix(value: Any) -> list[int]:
    matrix = _mapping(value, "packed matrix")
    if matrix.get("kind") != "matrix":
        raise Row20Failure("packed value is not a matrix")
    return [
        cell
        for column in matrix["values"]
        for entry in column["values"]
        for cell in _packed_scalar(entry)
    ]


def _integer_matrix(value: Any) -> list[int]:
    matrix = _mapping(value, "integer matrix")
    if matrix.get("kind") != "matrix":
        raise Row20Failure("integer value is not a matrix")
    return [
        int(entry["value"]) for column in matrix["values"] for entry in column["values"]
    ]


def _event(bundle: Mapping[str, Any], name: str) -> Mapping[str, Any]:
    events = bundle.get("events")
    if not isinstance(events, list):
        raise Row20Failure("W0 has no event stream")
    matches = [
        entry
        for entry in events
        if isinstance(entry, Mapping) and entry.get("event") == name
    ]
    if len(matches) != 1:
        raise Row20Failure("W0 has the wrong " + name + " event count")
    return matches[0]


def _canonical_digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _determinant(matrix: Sequence[int], size: int) -> int:
    work = [
        [int(matrix[size * column + row]) for column in range(size)]
        for row in range(size)
    ]
    sign = 1
    previous = 1
    for column in range(size - 1):
        pivot = column
        while pivot < size and work[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            return 0
        if pivot != column:
            work[pivot], work[column] = work[column], work[pivot]
            sign = -sign
        value = work[column][column]
        for row in range(column + 1, size):
            for other_column in range(column + 1, size):
                numerator = (
                    work[row][other_column] * value
                    - work[row][column] * work[column][other_column]
                )
                if numerator % previous != 0:
                    raise Row20Failure("nonexact determinant division")
                work[row][other_column] = numerator // previous
        previous = value
    return sign * work[size - 1][size - 1]


def _exact_unit_replay(unit: Sequence[int], tensor: Sequence[int]) -> dict[str, Any]:
    multiplication = _zeros(25)
    inverse = _zeros(5)
    status = pari_getfu_quintic_unit_inverse(
        list(unit), 0, list(tensor), multiplication, inverse
    )
    if status != 1:
        raise Row20Failure("cold exact unit replay failed")
    norm = _determinant(multiplication, 5)
    product = _zeros(5)
    for left in range(5):
        for right in range(5):
            coefficient = unit[left] * inverse[right]
            for row in range(5):
                product[row] += coefficient * tensor[25 * left + 5 * right + row]
    if product != [1, 0, 0, 0, 0] or norm not in (-1, 1):
        raise Row20Failure("unit does not generate the unit principal ideal")
    return {
        "norm": str(norm),
        "inverseBasis": [str(value) for value in inverse],
        "principalIdealProductBasis": [str(value) for value in product],
    }


def _power_basis(
    unit: Sequence[int], prepared: Mapping[str, Any]
) -> list[dict[str, str]]:
    denominator = int(prepared["zkden"])
    basis = [int(value) for value in prepared["zk"]]
    result = []
    for row in range(5):
        numerator = sum(basis[5 * column + row] * unit[column] for column in range(5))
        common = denominator
        a = abs(numerator)
        b = common
        while b:
            a, b = b, a % b
        divisor = a
        numerator //= divisor
        common //= divisor
        result.append({"numerator": str(numerator), "denominator": str(common)})
    return result


def _real_lll(triples: list[int]) -> list[int]:
    factor = _zeros(4)
    status = pari_unit_real_lattice_rank_two(
        triples,
        3,
        _zeros(6),
        factor,
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
    )
    if status != 0:
        raise Row20Failure("rank-two real LLL failed")
    return factor


def compose_authenticated_row20(
    bundle: Mapping[str, Any], w0_sha256: str
) -> dict[str, Any]:
    """Compute row 20 through successful C6, then consult the pristine oracle."""

    pristine = _mapping(bundle, "row-20 W0")
    if w0_sha256 != W0_SHA256 or re.fullmatch(r"[0-9a-f]{64}", w0_sha256) is None:
        raise Row20Failure("wrong row-20 W0 authority")
    field = _mapping(pristine.get("field"), "field")
    if (
        field.get("panelIndex") != 20
        or field.get("id") != FIELD_ID
        or field.get("degree") != 5
        or field.get("signature") != [1, 2]
        or field.get("unitRank") != 2
        or field.get("coefficients") != ["-12", "-5", "0", "0", "0", "1"]
    ):
        raise Row20Failure("row-20 field identity changed")
    hnf = _event(pristine, "hnf")
    acceptance = _event(pristine, "acceptance")
    if (
        hnf.get("relations") != 14
        or hnf.get("precision") != 192
        or hnf.get("B") != [0, 7]
        or hnf.get("C") != [3, 14]
        or acceptance.get("code") != 0
        or acceptance.get("h") != "1"
    ):
        raise Row20Failure("source C3-C5 boundary changed")
    exact_logs = _packed_matrix(hnf.get("exactC"))
    if len(exact_logs) != 14 * 3 * 7:
        raise Row20Failure("exact HNF log owner has the wrong shape")
    packed_a = exact_logs[: RELATION_COLUMNS * PLACES * 7]
    relation_lattice = _integer_matrix(acceptance.get("lattice"))
    if len(relation_lattice) != 14:
        raise Row20Failure("accepted lattice has the wrong shape")
    regulator = _packed_real(_mapping(acceptance.get("exactR"), "accepted regulator"))

    columns = RELATION_COLUMNS
    square = columns * columns
    u1 = _zeros(2 * columns)
    integer_state = _zeros(5)
    status = pari_unit_integer_lattice_rank_two(
        relation_lattice,
        columns,
        u1,
        integer_state,
        _zeros(2 * columns),
        _zeros(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(columns),
        _zeros(columns),
        _floats(2 * columns),
        _floats(square),
        _zeros(columns),
        _zeros(columns),
        _zeros(columns),
        _floats(columns),
        _floats(columns),
        _floats(columns),
        _zeros(columns),
    )
    if status != 0 or integer_state[:4] != [5, 5, 2, 0]:
        raise Row20Failure("source-derived integer LLL changed")
    first_logs = _zeros(42)
    pari_log_matrix_transform(packed_a, u1, 3, columns, 2, False, first_logs)
    triples = _zeros(18)
    for row in range(3):
        for column in range(2):
            source = 7 * (column * 3 + row) + 1
            target = 3 * (row * 2 + column)
            for cell in range(3):
                triples[target + cell] = first_logs[source + cell]
    u2 = _real_lll(triples)
    composed = _zeros(14)
    pari_unit_compose_rank_two(u1, columns, u2, composed)
    au = _zeros(42)
    pari_log_matrix_transform(packed_a, composed, 3, columns, 2, False, au)
    clean = _zeros(42)
    clean_state = _zeros(6)
    status = pari_cleanarchunit_mixed_quintic(
        au,
        regulator,
        192,
        _zeros(3),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(2048),
        _zeros(42),
        clean,
        clean_state,
    )
    if status != 0:
        raise Row20Failure(
            "source-derived quintic cleanarch failed: " + str(clean_state)
        )
    identity = [1, 0, 0, 1]
    matep = _zeros(42)
    arch = _zeros(42)
    candidate_a = _zeros(42)
    arch_real = _zeros(18)
    arch_imag = _zeros(18)
    clean_real = _zeros(18)
    clean_imag = _zeros(18)
    pari_prepare_getfu_mixed_quintic(
        clean,
        identity,
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    for row in range(3):
        for column in range(2):
            source = 7 * (column * 3 + row) + 1
            target = 3 * (row * 2 + column)
            for cell in range(3):
                triples[target + cell] = matep[source + cell]
    factor = _real_lll(triples)
    factor[1], factor[2] = factor[2], factor[1]
    pari_prepare_getfu_mixed_quintic(
        clean,
        factor,
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )

    prepared = _mapping(pristine.get("prepared"), "prepared field")
    embedding = prepared.get("embeddingM")
    tensor_values = prepared.get("multiplicationTensor")
    if not isinstance(embedding, list) or len(embedding) != 25:
        raise Row20Failure("prepared embedding has the wrong shape")
    if not isinstance(tensor_values, list) or len(tensor_values) != 125:
        raise Row20Failure("prepared multiplication tensor has the wrong shape")
    embedding_real: list[int] = []
    embedding_imag: list[int] = []
    for column in range(5):
        embedding_real.extend(
            _packed_real(_mapping(embedding[column], "real embedding"))
        )
        embedding_imag.extend([0, -1, 0])
        for real_row, imaginary_row in ((1, 2), (3, 4)):
            embedding_real.extend(
                _packed_real(
                    _mapping(embedding[5 * real_row + column], "complex real embedding")
                )
            )
            embedding_imag.extend(
                _packed_real(
                    _mapping(
                        embedding[5 * imaginary_row + column],
                        "complex imaginary embedding",
                    )
                )
            )
    tensor = [int(value) for value in tensor_values]
    units = _zeros(10)
    final_logs_real = _zeros(18)
    final_logs_imag = _zeros(18)
    c6_state = _zeros(8)
    status = pari_getfu_mixed_quintic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        factor,
        embedding_real,
        embedding_imag,
        tensor,
        192,
        _zeros(18),
        _zeros(18),
        _zeros(75),
        _zeros(30),
        _zeros(75),
        _zeros(30),
        _zeros(30),
        _zeros(10),
        _zeros(25),
        _zeros(5),
        _zeros(10),
        units,
        final_logs_real,
        final_logs_imag,
        c6_state,
        _zeros(5),
        _zeros(3),
        _zeros(3),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(91),
    )
    if status != 0 or c6_state[6] != 2:
        raise Row20Failure("successful row-20 C6 changed: " + str(c6_state))

    exact_unit_proofs = []
    for column in range(2):
        unit = units[5 * column : 5 * column + 5]
        proof = _exact_unit_replay(unit, tensor)
        proof["integralBasis"] = [str(value) for value in unit]
        proof["powerBasis"] = _power_basis(unit, prepared)
        proof["sevenRawGeneratorExponents"] = [
            str(composed[7 * column + row]) for row in range(7)
        ]
        exact_unit_proofs.append(proof)

    # Comparison-only oracle boundary. No member of this event was available
    # to any arithmetic call above.
    reference = _event(pristine, "fundamental_units")
    expected_u = _integer_matrix(reference.get("U"))
    expected_a = _packed_matrix(reference.get("A"))
    if composed != expected_u:
        raise Row20Failure("computed compact transform differs from pristine W0")
    # Convert the two reference polynomials only after C6 has independently
    # published its integral-basis coefficients.
    fu = _mapping(reference.get("fu"), "reference fu")
    if fu.get("kind") != "vector" or len(fu.get("values", [])) != 2:
        raise Row20Failure("reference fu has the wrong shape")
    inverse_basis = [
        int(_mapping(value, "invzk entry")["value"]) for value in prepared["invzk"]
    ]
    expected_units: list[int] = []
    for polynomial in fu["values"]:
        coefficients = []
        for coefficient in polynomial["coefficients"]:
            if coefficient["kind"] == "integer":
                coefficients.append((int(coefficient["value"]), 1))
            elif coefficient["kind"] == "pair-4":
                coefficients.append(
                    (
                        int(coefficient["left"]["value"]),
                        int(coefficient["right"]["value"]),
                    )
                )
            else:
                raise Row20Failure("reference fu coefficient is unsupported")
        for row in range(5):
            numerator = 0
            denominator = 1
            for column in range(5):
                left_n = numerator * coefficients[column][1]
                right_n = (
                    inverse_basis[5 * column + row]
                    * coefficients[column][0]
                    * denominator
                )
                numerator = left_n + right_n
                denominator *= coefficients[column][1]
            if numerator % denominator != 0:
                raise Row20Failure("reference fu is not integral in the prepared basis")
            expected_units.append(numerator // denominator)
    if units != expected_units:
        raise Row20Failure("computed exact units differ from pristine W0")
    expected_final_a = list(candidate_a)
    for row in range(3):
        expected_final_a[7 * row + 1] = -expected_final_a[7 * row + 1]
        expected_final_a[7 * row + 4] = -expected_final_a[7 * row + 4]
    if expected_final_a != expected_a or c6_state[5] != 1:
        raise Row20Failure(
            "computed normalized compact logarithms differ from pristine W0"
        )

    source_owner = {
        "hnf": {
            "relations": hnf["relations"],
            "B": hnf["B"],
            "C": hnf["C"],
            "exactC": hnf["exactC"],
        },
        "acceptance": {
            "code": acceptance["code"],
            "h": acceptance["h"],
            "exactR": acceptance["exactR"],
            "lattice": acceptance["lattice"],
        },
    }
    return {
        "schema": OUTPUT_SCHEMA,
        "field": dict(field),
        "precision": 192,
        "status": "success",
        "exactUnitsPublished": True,
        "unitTransformShape": [7, 2],
        "unitTransform": [str(value) for value in composed],
        "getfuFactorShape": [2, 2],
        "getfuFactor": [str(value) for value in factor],
        "exactUnitBasisShape": [5, 2],
        "exactUnitBasis": [str(value) for value in units],
        "exactUnitProofs": exact_unit_proofs,
        "normalizedArchimedeanShape": [3, 2],
        "normalizedArchimedean": [str(value) for value in expected_final_a],
        "c5State": {
            "integerLll": integer_state,
            "cleanarch": clean_state,
        },
        "c6State": c6_state,
        "ancestry": {
            "pristineW0Sha256": w0_sha256,
            "sourceC3C5Sha256": _canonical_digest(source_owner),
            "preparedSha256": _canonical_digest(prepared),
        },
        "provenance": {
            "source": "PARI-2.17.4-buch2.c fundamental-unit path",
            "arithmeticInputs": [
                "prepared.embeddingM",
                "prepared.multiplicationTensor",
                "hnf.exactC[0:7]",
                "acceptance.lattice",
                "acceptance.exactR",
            ],
            "referenceFuImported": False,
            "referenceReadAfterComputation": True,
            "comparisonFields": [
                "fundamental_units.U",
                "fundamental_units.A",
                "fundamental_units.fu",
            ],
            "factorback": "two columns through seven source-derived raw logarithmic generators",
            "basisConversion": "prepared.zk / prepared.zkden maps integral-basis coefficients to the power basis",
        },
    }


__all__ = [
    "OUTPUT_SCHEMA",
    "Row20Failure",
    "W0_SHA256",
    "compose_authenticated_row20",
    "pari_cleanarchunit_mixed_quintic",
    "pari_getfu_mixed_quintic",
    "pari_getfu_quintic_realimag_solve",
    "pari_getfu_quintic_unit_inverse",
    "pari_prepare_getfu_mixed_quintic",
]
