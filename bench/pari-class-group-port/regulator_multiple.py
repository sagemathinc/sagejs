"""PARI 2.17.4 compute_multiple_of_R, prepared real logarithm boundary.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This computes a regulator multiple and approximate unit coordinates, not
the final regulator or the analytic class/unit completeness decision.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native
from .regulator_preparation import (
    pari_regulator_column_preparation,
    pari_validate_regulator_scalars,
)
from .regulator_pivots import pari_regulator_pivots
from .regulator_determinant import pari_regulator_determinant
from .regulator_inverse import pari_regulator_inverse
from .regulator_matrix_product import pari_regulator_matrix_product
from .regulator_scalar import pari_regulator_scalar_add
from .regulator_approx_zero import pari_regulator_exponent
from .short_product import pari_real_integer_division


@native
def pari_regulator_multiple(
    logs: IntegerBuffer,
    rows: int,
    columns: int,
    degree: int,
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
    state: Int64Buffer,
) -> int:
    """State: status, need, correct bits, ptL kind (0=NULL,1=one,2=matrix).

    Status 0 succeeds; 1 rank defect; 2 tiny/zero determinant; 3 inconsistent
    minor; 4 inverse/residual precision failure. Negative status denotes an
    unported arithmetic dispatch, never a mathematical decision. Input need
    and bits are retained wherever upstream does not assign their pointers.
    Every workspace owner is disjoint; only success publishes multiple and
    coordinates. Native arithmetic capacity exceptions remain exceptions.
    """
    if rows < 2 or rows > 4 or columns < 0 or degree < rows or degree > 2 * rows:
        raise ValueError("unsupported regulator multiple shape")
    size = rows * (columns + 1)
    square = rows * rows
    if (
        len(prepared) < 3 * size
        or len(selected) < columns + 1
        or len(prep_state) < 3
        or len(rank_work) < 3 * size
        or len(rank_occupied) < rows
        or len(rank_pivots) < columns + 1
        or len(rank_state) < 3
        or len(integer_input) < size
        or len(integer_work) < size
        or len(integer_occupied) < rows
        or len(integer_pivots) < columns + 1
        or len(integer_best) < columns + 1
        or len(integer_state) < 10
        or len(basis) < 3 * square
        or len(minor) < 3 * square
        or len(det_work) < 3 * square
        or len(det_result) < 3
        or len(det_pivots) < rows
        or len(det_state) < 5
        or len(inverse_work) < 3 * square
        or len(inverse_rhs) < 3 * square
        or len(inverse) < 3 * square
        or len(inverse_pivots) < rows
        or len(inverse_state) < 3
        or len(product) < 3 * square
        or len(inverse_slice) < 3 * square
        or len(multiple) < 3
        or len(coordinates) < 3 * (rows - 1) * columns
        or len(state) < 4
    ):
        raise ValueError("short regulator multiple workspace")
    pari_validate_regulator_scalars(logs, rows * columns)
    for i in range(rows * columns):
        if logs[3 * i + 1] == -1 and logs[3 * i] != 0:
            raise ValueError("nonzero exact regulator logarithm")
        if logs[3 * i + 1] > 2304:
            raise ValueError("regulator logarithm exceeds division window")
    # Validate the complete prepared-log domain before changing any owner.
    pari_regulator_column_preparation(
        logs, rows, columns, degree, prepared, selected, prep_state
    )
    state[0] = -1
    state[3] = 1
    if prep_state[1] != 0:
        state[3] = 0
    kept = prep_state[0]
    status = pari_regulator_pivots(
        prepared,
        rows,
        kept,
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
    )
    if status != 0:
        state[0] = -2
        return -2
    rank = kept - rank_state[0]
    if rank != rows:
        state[1] = rows - rank
        state[0] = 1
        return 1
    target = 0
    for j in range(kept):
        if rank_pivots[j] != 0:
            for i in range(3 * rows):
                basis[3 * target * rows + i] = prepared[3 * j * rows + i]
            target += 1
    status = pari_regulator_determinant(
        basis, rows, det_work, det_result, det_pivots, det_state
    )
    if status != 0 or det_result[1] < 0:
        state[0] = -3
        return -3
    km, kp, ke = pari_real_integer_division(
        degree, det_result[0], det_result[1], det_result[2]
    )
    if km == 0 or ke < -3:
        state[1] = 0
        state[0] = 2
        return 2
    for j in range(1, rows):
        for i in range(1, rows):
            for k in range(3):
                minor[3 * ((j - 1) * (rows - 1) + i - 1) + k] = basis[
                    3 * (j * rows + i) + k
                ]
    status = pari_regulator_determinant(
        minor, rows - 1, det_work, det_result, det_pivots, det_state
    )
    if status != 0:
        state[0] = -3
        return -3
    km = abs(km)
    dm, dp, de = abs(det_result[0]), det_result[1], det_result[2]
    em, ep, ee = pari_regulator_scalar_add(dm, dp, de, -km, kp, ke)
    if pari_regulator_exponent(em, ep, ee) - pari_regulator_exponent(dm, dp, de) > -20:
        state[3] = 0
        state[0] = 3
        return 3
    status = pari_regulator_inverse(
        basis, rows, inverse_work, inverse_rhs, inverse, inverse_pivots, inverse_state
    )
    if status < 0:
        state[0] = -4
        return -4
    if status == 1:
        state[3] = 0
        state[0] = 4
        return 4
    status = pari_regulator_matrix_product(inverse, basis, rows, rows, rows, product)
    if status != 0:
        state[0] = -5
        return -5
    exponent = -(1 << 61)
    for j in range(rows):
        for i in range(rows):
            at = 3 * (j * rows + i)
            em, ep, ee = product[at], product[at + 1], product[at + 2]
            if i == j:
                em, ep, ee = pari_regulator_scalar_add(em, ep, ee, -1, -1, 0)
            current = pari_regulator_exponent(em, ep, ee)
            if current > exponent:
                exponent = current
    state[2] = -exponent
    if state[2] < 16:
        state[3] = 0
        state[0] = 4
        return 4
    for j in range(rows):
        for i in range(1, rows):
            for k in range(3):
                inverse_slice[3 * (j * (rows - 1) + i - 1) + k] = inverse[
                    3 * (j * rows + i) + k
                ]
    status = pari_regulator_matrix_product(
        inverse_slice, logs, rows - 1, rows, columns, coordinates
    )
    if status != 0:
        state[0] = -5
        return -5
    multiple[0] = km
    multiple[1] = kp
    multiple[2] = ke
    state[0] = 0
    state[3] = 2
    return 0
