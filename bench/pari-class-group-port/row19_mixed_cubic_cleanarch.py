"""Exact PARI 2.17.4 `cleanarch` specialization for row 19.

Row 19 is a mixed cubic with signature `(1, 1)`.  Packed logarithm
entries have two rows: one real place and one complex place.  This is the
source-order specialization of `buch2.c:cleanarch` used immediately before
`class_group_gen`; it is deliberately separate from unit cleanup.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .integer_real_product import pari_integer_real_product
from .log_matrix_transform import pari_log_scalar_sum, pari_validate_log_entries
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .short_product import (
    pari_real_integer_division,
    pari_short_product,
    pari_signed_real_sum,
)


@native
def pari_cleanarch_mixed_cubic_row19(
    source: IntegerBuffer,
    columns: int,
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
    """Normalize row-19 class logs transactionally.

    This is `cleanarch(Ce, 3, NULL, PREC)` for `R1 = 1` and `RU = 2`.
    `state` contains status, completed columns, published columns, and the
    greatest source exponent.  A failed argument-reduction precision check
    publishes no output.
    """
    if columns < 0 or precision < 64:
        raise ValueError("invalid row-19 cleanarch dimensions")
    size = 14 * columns
    if (
        len(source) < size
        or len(scratch) < size
        or len(output) < size
        or len(state) < 4
    ):
        raise ValueError("short row-19 cleanarch storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -(1 << 62)
    pari_validate_log_entries(source, 2 * columns)
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    one = 1 << (pp - 1)
    im, ip, ie = pari_real_division(one, pp, 0, pm, pp, pe)
    pi2m, pi2p, pi2e = pm, pp, pe + 1
    pi4m, pi4p, pi4e = pm, pp, pe + 2
    for column in range(columns):
        base = 14 * column
        # RgV_sum(real_i(x)), in row order, then gdivgs(..., -3).
        sm = source[base + 1]
        sp = source[base + 2]
        se = source[base + 3]
        sm, sp, se = pari_log_scalar_sum(
            sm,
            sp,
            se,
            source[base + 8],
            source[base + 9],
            source[base + 10],
        )
        sm, sp, se = pari_real_integer_division(-3, sm, sp, se)
        for row in range(2):
            at = base + 7 * row
            shift_m, shift_p, shift_e = sm, sp, se
            period_m, period_p, period_e = pi2m, pi2p, pi2e
            reciprocal_e = -3  # setexpo(1/pi, -3): 1/(2*pi)
            if row == 1:
                shift_e += 1
                period_m, period_p, period_e = pi4m, pi4p, pi4e
                reciprocal_e = -4  # 1/(4*pi)
            rm, rp, re = pari_log_scalar_sum(
                source[at + 1],
                source[at + 2],
                source[at + 3],
                shift_m,
                shift_p,
                shift_e,
            )
            xm = source[at + 4]
            xp = source[at + 5]
            xe = source[at + 6]
            if xm != 0:
                qm, qp, qe = pari_short_product(xm, xp, xe, im, ip, reciprocal_e)
                if qe >= 0 and ((qe + 64) // 64) * 64 > qp:
                    state[0] = 1
                    return 1
                bits = qp - qe - 1
                if bits >= 0:
                    quotient = qm // (1 << bits)
                else:
                    quotient = qm << -bits
                if quotient != 0:
                    tm, tp, te = pari_integer_real_product(
                        quotient, period_m, period_p, period_e
                    )
                    xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -tm, tp, te)
            scratch[at] = 2
            scratch[at + 1] = rm
            scratch[at + 2] = rp
            scratch[at + 3] = re
            scratch[at + 4] = xm
            scratch[at + 5] = xp
            scratch[at + 6] = xe
            if xm == 0:
                scratch[at] = 1
                scratch[at + 4] = 0
                scratch[at + 5] = -1
                scratch[at + 6] = 0
            if rm != 0 and re > state[3]:
                state[3] = re
            if xm != 0 and xe > state[3]:
                state[3] = xe
        state[1] = column + 1
    for index in range(size):
        output[index] = scratch[index]
    state[0] = 0
    state[2] = columns
    return 0


__all__ = ["pari_cleanarch_mixed_cubic_row19"]
