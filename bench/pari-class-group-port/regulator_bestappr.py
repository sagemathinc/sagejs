"""PARI 2.17.4 real bestappr_Q/bestappr_real continued fractions.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This preserves rounded-real recurrence; it is not exact rationalization of
the represented real followed by a different continued-fraction algorithm.
"""

from sagejs.native import native
from .integer_real_sum import pari_integer_real_sum
from .integer_real_product import pari_integer_real_product
from .real_conversion import pari_integer_to_real
from .regulator_scalar import (
    pari_regulator_scalar_divide,
    pari_regulator_qmake,
    pari_regulator_qdiv,
)


@native
def pari_regulator_bestappr_fraction(
    n: int, d: int, bound: int
) -> tuple[int, int, int]:
    """bestappr_frac for a nonzero reduced fraction and positive bound."""
    if bound <= 0 or d <= 1:
        raise ValueError("invalid fraction approximation input")
    if d <= bound:
        return n, -2, d
    yn, yd = n, d
    p1, p0 = 1, n // d
    q1, q0 = 0, 1
    n %= d
    while True:
        n, d = d, n
        a = n // d
        if a > bound:
            a = (bound - q1) // q0
            value = a * p0 + p1
            p1, p0 = p0, value
            value = a * q0 + q1
            q1, q0 = q0, value
            if abs(q1 * (q0 * yn - yd * p0)) < abs(q0 * (q1 * yn - yd * p1)):
                p1, q1 = p0, q0
            break
        value = a * p0 + p1
        p1, p0 = p0, value
        value = a * q0 + q1
        q1, q0 = q0, value
        if q0 > bound:
            break
        n -= a * d
        if n == 0:
            p1, q1 = p0, q0
            break
    return pari_regulator_qdiv(p1, q1)


@native
def pari_regulator_abs_real_compare(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> int:
    """abscmprr: zero sign, exponent, then padded mantissa words."""
    if am == 0:
        if bm == 0:
            return 0
        return -1
    if bm == 0:
        return 1
    if ae < be:
        return -1
    if ae > be:
        return 1
    am, bm = abs(am), abs(bm)
    if ap < bp:
        am <<= bp - ap
    elif bp < ap:
        bm <<= ap - bp
    if am < bm:
        return -1
    if am > bm:
        return 1
    return 0


@native
def pari_regulator_bestappr_real(
    m: int, p: int, e: int, bound: int
) -> tuple[int, int, int, int]:
    """Positive integer bound; status1 is upstream NULL (insufficient bits).

    Output is (status, numerator, scalar tag, denominator-or-zero). Only
    real input is admitted here; matrix and exact/fraction dispatch remain
    separate. Arithmetic precision frontiers raise rather than inventing a
    best approximation.
    """
    if bound <= 0:
        raise ValueError("bestappr bound must be positive")
    if m == 0:
        if p != 0:
            raise ValueError("invalid bestappr real zero")
        return 0, 0, -1, 0
    if p < 64 or p > 154048 or p % 64 != 0 or abs(m).bit_length() != p:
        raise ValueError("invalid bestappr real")
    if p <= e:
        return 1, 0, -1, 0
    ym, yp, ye = m, p, e
    p1 = 1
    a = m >> (p - 1 - e)
    p0 = a
    q1, q0 = 0, 1
    m, p, e = pari_integer_real_sum(-a, m, p, e)
    if m == 0:
        return 0, a, -1, 0
    km, kp, ke = pari_integer_to_real(bound, p)
    while True:
        m, p, e = pari_regulator_scalar_divide(1, -1, 0, m, p, e)
        # Both operands are strictly positive; cmprr agrees with abscmprr.
        if pari_regulator_abs_real_compare(m, p, e, km, kp, ke) > 0:
            a = (bound - q1) // q0
            value = a * p0 + p1
            p1, p0 = p0, value
            value = a * q0 + q1
            q1, q0 = q0, value
            am, ap, ae = pari_integer_real_product(q0, ym, yp, ye)
            am, ap, ae = pari_integer_real_sum(-p0, am, ap, ae)
            am, ap, ae = pari_integer_real_product(q1, am, ap, ae)
            bm, bp, be = pari_integer_real_product(q1, ym, yp, ye)
            bm, bp, be = pari_integer_real_sum(-p1, bm, bp, be)
            bm, bp, be = pari_integer_real_product(q0, bm, bp, be)
            if pari_regulator_abs_real_compare(am, ap, ae, bm, bp, be) < 0:
                p1, q1 = p0, q0
            break
        needed = 64 * ((e + 64) // 64)
        if needed > p:
            p1, q1 = p0, q0
            break
        a = m >> (p - 1 - e)
        value = a * p0 + p1
        p1, p0 = p0, value
        value = a * q0 + q1
        q1, q0 = q0, value
        if q0 > bound:
            break
        m, p, e = pari_integer_real_sum(-a, m, p, e)
        if m == 0:
            p1, q1 = p0, q0
            break
    numerator, tag, denominator = pari_regulator_qmake(p1, q1)
    return 0, numerator, tag, denominator
