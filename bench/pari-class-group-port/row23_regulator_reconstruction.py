"""PARI 2.17.4 compute_R for prepared positive regulator/zeta factors.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Upstream heuristic acceptance bounds are assumed for this experiment;
success is NOT an independently certified class/unit group result.
"""

from math import gcd
from sagejs.native import IntegerBuffer, Int64Buffer, native
from .regulator_scalar import (
    pari_validate_regulator_values,
    pari_regulator_scalar_add,
    pari_regulator_scalar_multiply,
    pari_regulator_qdiv,
)
from .regulator_bestappr import (
    pari_regulator_bestappr_real,
    pari_regulator_bestappr_fraction,
)
from .regulator_approx_zero import pari_regulator_exponent
from .regulator_hnf import pari_regulator_hnf
from .regulator_hnf_wide import pari_regulator_hnf_wide
from .short_product import pari_short_product
from .float_conversion import pari_real_to_float


@native
def pari_row23_regulator_denominator_lcm(x: int, y: int) -> int:
    """Positive-input `lcmii`, including incoming-operand division order."""
    common = gcd(x, y)
    if common == y:
        return x
    if common != 1:
        y //= common
    return x * y


@native
def pari_row23_regulator_denominator_power(value: int, rank: int) -> int:
    """Positive `powiu` restricted to ranks 1–4.

    Word-sized products currently use the exact integer backend, a declared
    representation substitution; the word fast paths and product order remain
    explicit. This helper is not a qualified performance comparison.
    """
    if value.bit_length() <= 64:
        if value == 1:
            return 1
        if value == 2:
            return 1 << rank
        if rank == 1:
            return value
        if rank == 2 and value < (1 << 32):
            return value * value
        if rank == 3 and value <= 2642245:
            return value * value * value
        if rank == 4 and value < (1 << 16):
            square = value * value
            return square * square
    if rank == 1:
        return value
    square = value * value
    if rank == 2:
        return square
    if rank == 3:
        return square * value
    return square * square


@native
def pari_row23_regulator_bad_check(m: int, p: int, e: int) -> int:
    """fupb_NONE=0, fupb_RELAT=1, fupb_PRECI=3; positive real input."""
    if e < -1:
        return 3
    if e == -1 and pari_real_to_float(m, p, e) < 0.75:
        return 3
    if e > 0:
        return 1
    if e == 0 and pari_real_to_float(m, p, e) > 1.3:
        return 1
    return 0


@native
def pari_row23_regulator_reconstruction(
    coordinates: IntegerBuffer,
    rows: int,
    columns: int,
    multiple: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    rational_work: IntegerBuffer,
    integer_work: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    regulator: IntegerBuffer,
    relations: IntegerBuffer,
    denominator: IntegerBuffer,
    state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
) -> int:
    """Return source reason0/1/3 with both source HNF width dispatches.

    State: reason, last phase, approximation accuracy bits, HNF rank.
    Denominator is diagnostic; regulator/relations publish only on success.
    All owners are disjoint. Arithmetic failures may leave scratch changed.
    Unit rank zero and nonpositive input factors are outside this entry.
    """
    if rows < 1 or rows > 4 or columns < 1:
        raise ValueError("unsupported regulator reconstruction shape")
    size = rows * columns
    if (
        len(rational_work) < 3 * size
        or len(integer_work) < size
        or len(hnf_work) < size
        or len(hnf_column) < rows
        or len(hnf_output) < size
        or len(hnf_state) < 12
        or len(regulator) < 3
        or len(relations) < size
        or len(denominator) < 1
        or len(state) < 4
    ):
        raise ValueError("short regulator reconstruction workspace")
    if columns > 7 and (
        len(hnf_state) < 15 or len(hnf_row_pivots) < rows or len(hnf_heights) < columns
    ):
        raise ValueError("short wide regulator reconstruction workspace")
    pari_validate_regulator_values(coordinates, size)
    pari_validate_regulator_values(multiple, 1)
    pari_validate_regulator_values(zeta_factor, 1)
    if (
        multiple[0] <= 0
        or multiple[1] < 64
        or zeta_factor[0] <= 0
        or zeta_factor[1] < 64
    ):
        raise ValueError("regulator reconstruction requires positive real factors")
    for i in range(4):
        state[i] = 0
    state[0] = 3
    dm, dp, de = pari_short_product(
        multiple[0],
        multiple[1],
        multiple[2],
        zeta_factor[0],
        zeta_factor[1],
        zeta_factor[2],
    )
    de += 1
    if de < 0 and pari_real_to_float(dm, dp, de) < 0.95:
        return 3
    if de > 1856:
        raise ValueError("bestappr denominator bound exceeds prototype window")
    if de >= dp - 1:
        floor_bound = dm << (de - dp + 1)
    else:
        floor_bound = dm >> (dp - 1 - de)
    bound = floor_bound
    if bound == 0:
        bound = 1
    state[1] = 1
    for i in range(size):
        at = 3 * i
        m, p, e = coordinates[at], coordinates[at + 1], coordinates[at + 2]
        if p == -2:
            m, p, e = pari_regulator_bestappr_fraction(m, e, bound)
        elif p >= 0:
            status, m, p, e = pari_regulator_bestappr_real(m, p, e, bound)
            if status != 0:
                return 3
        rational_work[at] = m
        rational_work[at + 1] = p
        rational_work[at + 2] = e
    den = 1
    # Q_denom first folds each column, then folds the column denominators.
    for j in range(columns):
        column_den = 1
        for i in range(rows):
            at = 3 * (j * rows + i)
            d = 1
            if rational_work[at + 1] == -2:
                d = rational_work[at + 2]
            if i == 0:
                column_den = d
            elif d != 1:
                column_den = pari_row23_regulator_denominator_lcm(column_den, d)
        if j == 0:
            den = column_den
        elif column_den != 1:
            den = pari_row23_regulator_denominator_lcm(den, column_den)
    denominator[0] = den
    state[1] = 2
    if den > floor_bound:
        return 3
    error_exponent = -(1 << 61)
    for i in range(size):
        at = 3 * i
        m, p, e = pari_regulator_scalar_add(
            rational_work[at],
            rational_work[at + 1],
            rational_work[at + 2],
            -coordinates[at],
            coordinates[at + 1],
            coordinates[at + 2],
        )
        value = pari_regulator_exponent(m, p, e)
        if value > error_exponent:
            error_exponent = value
    bits = -error_exponent
    state[2] = bits
    lattice_exponent = -(1 << 61)
    for i in range(size):
        at = 3 * i
        factor = den
        if rational_work[at + 1] == -2:
            factor //= rational_work[at + 2]
        value = rational_work[at] * factor
        integer_work[i] = value
        if value != 0 and abs(value).bit_length() - 1 > lattice_exponent:
            lattice_exponent = abs(value).bit_length() - 1
    if lattice_exponent + den.bit_length() - 1 > bits - 32:
        return 3
    state[1] = 3
    if columns <= 7:
        status = pari_regulator_hnf(
            integer_work, rows, columns, hnf_work, hnf_column, hnf_output, hnf_state
        )
    else:
        status = pari_regulator_hnf_wide(
            integer_work,
            rows,
            columns,
            hnf_work,
            hnf_column,
            hnf_row_pivots,
            hnf_heights,
            hnf_output,
            hnf_state,
        )
    if status != 0:
        state[0] = -1
        return -1
    rank = hnf_state[1]
    state[3] = rank
    if rank == 0 or rank != rows:
        return 3
    determinant = hnf_output[0]
    for i in range(1, rank):
        determinant *= hnf_output[i * rows + i]
    power = pari_row23_regulator_denominator_power(den, rank)
    fm, fp, fe = pari_regulator_qdiv(determinant, power)
    rm, rp, re = pari_regulator_scalar_multiply(
        multiple[0], multiple[1], multiple[2], fm, fp, fe
    )
    state[1] = 4
    if pari_regulator_exponent(rm, rp, re) < -3:
        return 3
    cm, cp, ce = pari_regulator_scalar_multiply(
        rm, rp, re, zeta_factor[0], zeta_factor[1], zeta_factor[2]
    )
    reason = pari_row23_regulator_bad_check(cm, cp, ce)
    state[1] = 5
    state[0] = reason
    if reason != 0:
        return reason
    regulator[0] = rm
    regulator[1] = rp
    regulator[2] = re
    for i in range(size):
        relations[i] = integer_work[i]
    return 0
