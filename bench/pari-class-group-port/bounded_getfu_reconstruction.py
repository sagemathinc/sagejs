"""Bounded multiple-right-hand-side integer reconstruction for `getfu`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The row-specific `getfu` cuts solve the same mathematical problem with
different fixed dimensions: recover integral-basis coordinates from several
archimedean right-hand sides.  This module isolates that shared operation.
Packed scalar triples have the representation used by `regulator_scalar`;
matrices and right-hand sides are column-major.

The public output is transactional.  Singular systems, weak rounding, and
coordinates outside the declared bit bound return a status without changing
`output`.  Shape and representation violations raise before any arithmetic.
The ordinary Python body is also the source compiled by the native backends.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .regulator_approx_zero import pari_regulator_pivot_max_unchecked
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_divide,
    pari_regulator_scalar_multiply,
    pari_validate_regulator_values,
)
from .short_product import pari_round_real


MAX_GETFU_DIMENSION = 8
MAX_GETFU_RIGHT_HAND_SIDES = 8
MAX_GETFU_SCALARS = MAX_GETFU_DIMENSION * MAX_GETFU_DIMENSION
MAX_GETFU_RHS_SCALARS = MAX_GETFU_DIMENSION * MAX_GETFU_RIGHT_HAND_SIDES


@native
def pari_bounded_getfu_multiple_rhs_reconstruct(
    matrix: IntegerBuffer,
    rhs: IntegerBuffer,
    dimension: int,
    rhs_count: int,
    minimum_accuracy_bits: int,
    maximum_scalar_bits: int,
    maximum_coordinate_bits: int,
    work: IntegerBuffer,
    reduced_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
    state: Int64Buffer,
) -> int:
    """Solve and reconstruct at most eight integral coordinate columns.

    Return zero on success, one for a singular packed-scalar system, two when
    the worst real rounding error does not prove `minimum_accuracy_bits`, and
    three when a reconstructed coordinate exceeds `maximum_coordinate_bits`.
    `state` is `(status, dimension, rhs count, worst error, columns done)`.

    Exact integer solutions have effectively infinite rounding accuracy.
    Fractions are accepted only when the solve has reduced them to integers;
    a residual nonintegral fraction receives status two.  This is deliberately
    fail-closed: callers needing another approximation must raise precision and
    retry the preceding archimedean computation.
    """

    if dimension < 1 or dimension > MAX_GETFU_DIMENSION:
        raise ValueError(
            "getfu reconstruction dimension is outside the bounded corridor"
        )
    if rhs_count < 1 or rhs_count > MAX_GETFU_RIGHT_HAND_SIDES:
        raise ValueError(
            "getfu reconstruction RHS count is outside the bounded corridor"
        )
    if minimum_accuracy_bits < 1 or minimum_accuracy_bits > 4096:
        raise ValueError("invalid getfu reconstruction accuracy bound")
    if maximum_scalar_bits < 64 or maximum_scalar_bits > 154112:
        raise ValueError("invalid getfu scalar bit bound")
    if maximum_coordinate_bits < 1 or maximum_coordinate_bits > 154112:
        raise ValueError("invalid getfu coordinate bit bound")

    matrix_count = dimension * dimension
    rhs_scalars = dimension * rhs_count
    matrix_cells = 3 * matrix_count
    rhs_cells = 3 * rhs_scalars
    if (
        len(matrix) < matrix_cells
        or len(rhs) < rhs_cells
        or len(work) < matrix_cells
        or len(reduced_rhs) < rhs_cells
        or len(solved) < rhs_cells
        or len(rounded) < rhs_scalars
        or len(output) < rhs_scalars
        or len(pivots) < dimension
        or len(state) < 5
    ):
        raise ValueError("short bounded getfu reconstruction workspace")

    pari_validate_regulator_values(matrix, matrix_count)
    pari_validate_regulator_values(rhs, rhs_scalars)
    for index in range(matrix_count):
        at = 3 * index
        if abs(matrix[at]).bit_length() > maximum_scalar_bits:
            raise ValueError("getfu matrix scalar exceeds declared bit bound")
    for index in range(rhs_scalars):
        at = 3 * index
        if abs(rhs[at]).bit_length() > maximum_scalar_bits:
            raise ValueError("getfu RHS scalar exceeds declared bit bound")

    for index in range(5):
        state[index] = 0
    state[0] = -9
    state[1] = dimension
    state[2] = rhs_count
    state[3] = -(1 << 61)
    for index in range(matrix_cells):
        work[index] = matrix[index]
    for index in range(rhs_cells):
        reduced_rhs[index] = rhs[index]

    # Source-order Gaussian elimination.  ``matrix`` remains the immutable
    # scale reference used by PARI's approximate-zero pivot rule.
    for column in range(dimension):
        row = (
            pari_regulator_pivot_max_unchecked(
                work, matrix, dimension, column + 1, pivots, False
            )
            - 1
        )
        pivots[column] = row + 1
        if row == dimension:
            state[0] = 1
            return 1
        if row != column:
            for other_column in range(column, dimension):
                for cell in range(3):
                    left = 3 * (other_column * dimension + column) + cell
                    right = 3 * (other_column * dimension + row) + cell
                    saved = work[left]
                    work[left] = work[right]
                    work[right] = saved
            for rhs_column in range(rhs_count):
                for cell in range(3):
                    left = 3 * (rhs_column * dimension + column) + cell
                    right = 3 * (rhs_column * dimension + row) + cell
                    saved = reduced_rhs[left]
                    reduced_rhs[left] = reduced_rhs[right]
                    reduced_rhs[right] = saved
        pivot = 3 * (column * dimension + column)
        if column < dimension - 1:
            for row_index in range(column + 1, dimension):
                at = 3 * (column * dimension + row_index)
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
                for other_column in range(column + 1, dimension):
                    target = 3 * (other_column * dimension + row_index)
                    source = 3 * (other_column * dimension + column)
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
                for rhs_column in range(rhs_count):
                    target = 3 * (rhs_column * dimension + row_index)
                    source = 3 * (rhs_column * dimension + column)
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

    for rhs_column in range(rhs_count):
        for row_index in range(dimension - 1, -1, -1):
            at = 3 * (rhs_column * dimension + row_index)
            mm = reduced_rhs[at]
            mp = reduced_rhs[at + 1]
            me = reduced_rhs[at + 2]
            for other_column in range(row_index + 1, dimension):
                coefficient = 3 * (other_column * dimension + row_index)
                previous = 3 * (rhs_column * dimension + other_column)
                tm, tp, te = pari_regulator_scalar_multiply(
                    work[coefficient],
                    work[coefficient + 1],
                    work[coefficient + 2],
                    reduced_rhs[previous],
                    reduced_rhs[previous + 1],
                    reduced_rhs[previous + 2],
                )
                mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
            diagonal = 3 * (row_index * dimension + row_index)
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

    worst_error = -(1 << 61)
    for index in range(rhs_scalars):
        at = 3 * index
        for cell in range(3):
            solved[at + cell] = reduced_rhs[at + cell]
        m = solved[at]
        p = solved[at + 1]
        e = solved[at + 2]
        error = -(1 << 61)
        if p == -1:
            value = m
        elif p == -2:
            if m % e != 0:
                state[0] = 2
                state[3] = 0
                return 2
            value = m // e
        else:
            value, error = pari_round_real(m, p - 1 - e, e)
        if error > worst_error:
            worst_error = error
        if error > -minimum_accuracy_bits:
            state[0] = 2
            state[3] = worst_error
            return 2
        if abs(value).bit_length() > maximum_coordinate_bits:
            state[0] = 3
            state[3] = worst_error
            return 3
        rounded[index] = value

    # Publish only after every coordinate passes every reconstruction gate.
    for index in range(rhs_scalars):
        output[index] = rounded[index]
    state[0] = 0
    state[3] = worst_error
    state[4] = rhs_count
    return 0


__all__ = ["pari_bounded_getfu_multiple_rhs_reconstruct"]
