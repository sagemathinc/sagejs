"""PARI 2.17.4 non-AGM real logarithm and one-word root initializer.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate trans1.c:logr_abs and logr_aux, retaining their precision schedule.
The supported 64--384-bit range includes the prepared-field precision.
This is the real absolute logarithm, not a replacement for complex `glog`.
"""

from sagejs.native import IntegerBuffer, checked_float64, checked_uint64, native

from .exponential import (
    pari_exp_schedule_sqrt,
    pari_leading_word_log2,
    pari_real_resize,
    pari_real_truncate,
)
from .logarithm_constant import pari_log2_constant
from .real_division import pari_real_division
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_real_word_division,
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_logarithm_series(m: int, p: int, e: int) -> tuple[int, int, int]:
    """logr_aux: the odd-power series with increasing working precision."""
    if m == 0:
        raise ValueError("logarithm series requires nonzero input")
    leading = checked_uint64(abs(m) >> (p - 64))
    d = -2.0 * (pari_leading_word_log2(leading) + checked_float64(e - 63))
    if d <= 0.0:
        raise ValueError("logarithm series input outside contraction range")
    k = int(2.0 * (checked_float64(p) / d))
    if k % 2 == 0:
        k += 1
    if k >= 3:
        ym, yp, ye = pari_short_square(m, p, e)
        accumulated = 0
        increment = int(d)
        length = ((increment + 63) // 64) * 64
        if length > p:
            raise ValueError("logarithm initial series precision exceeds allocation")
        sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
        sm, sp, se = pari_real_resize(sm, sp, se, length)
        k -= 2
        while k >= 1:
            tm, tp, te = pari_real_truncate(ym, yp, ye, length)
            tm, tp, te = pari_short_product(sm, sp, se, tm, tp, te)
            if k == 1:
                tm, tp, te = pari_word_integer_real_sum(1, tm, tp, te)
                return pari_short_product(m, p, e, tm, tp, te)
            accumulated += increment
            length += (accumulated // 64) * 64
            accumulated %= 64
            if length > p:
                length = p
            sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
            sm, sp, se = pari_signed_real_sum(sm, sp, se, tm, tp, te)
            sm, sp, se = pari_real_resize(sm, sp, se, length)
            k -= 2
    return m, p, e


@native
def pari_real_logarithm_multiword(
    mantissa: int,
    precision: int,
    exponent: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Follow upstream word scanning, cancellation and root/series schedule.

    Work buffers are disjoint; `cache` is the resident log(2) cache.
    Higher precision fails rather than substituting for the AGM branch.
    """
    if precision < 64 or precision > 384 or precision % 64 != 0:
        raise ValueError("unsupported non-AGM logarithm precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("logarithm requires a full nonzero mantissa")
    if exponent < -10000 or exponent > 10000:
        raise ValueError("unsupported logarithm initializer exponent")
    ex = exponent
    leading = magnitude >> (precision - 64)
    if leading > (((1 << 64) - 1) // 3) * 2:
        ex += 1
        tail = ((1 << precision) - 1) - magnitude
    else:
        tail = magnitude - (1 << (precision - 1))
    if tail == 0:
        if ex == 0:
            return 0, 0, -precision
        lm, lp, le = pari_log2_constant(precision, cache, a, b, p, q, stack)
        return pari_word_integer_real_product(ex, lm, lp, le)
    accuracy = precision - tail.bit_length()
    skipped = (accuracy // 64) * 64
    working = precision + 64
    bits = working - skipped
    target = precision
    if ex == 0:
        target -= skipped
    d = -checked_float64(accuracy) / 2.0
    roots = int(d + pari_exp_schedule_sqrt(d * d + checked_float64(bits // 6)))
    if roots > bits - accuracy:
        roots = bits - accuracy
    if checked_float64(roots) < 0.2 * checked_float64(accuracy):
        roots = 0
    else:
        working += ((roots + 63) // 64) * 64
    xm, xp, xe = pari_real_resize(magnitude, precision, exponent, working)
    xe -= ex
    for i in range(roots):
        xm, xp, xe = pari_real_square_root_abs(xm, xp, xe)
    nm, np, ne = pari_word_integer_real_sum(-1, xm, xp, xe)
    dm, dp, de = pari_word_integer_real_sum(1, xm, xp, xe)
    ym, yp, ye = pari_real_division(nm, np, ne, dm, dp, de)
    ym, yp, ye = pari_logarithm_series(ym, yp, ye)
    ye += roots + 1
    if ex != 0:
        lm, lp, le = pari_log2_constant(precision + 64, cache, a, b, p, q, stack)
        lm, lp, le = pari_word_integer_real_product(ex, lm, lp, le)
        ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    return pari_real_resize(ym, yp, ye, target)


@native
def pari_real_logarithm_64(
    mantissa: int,
    exponent: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Use the shared logarithm at sqrtnr_abs's one-word initialization."""
    return pari_real_logarithm_multiword(
        mantissa, 64, exponent, cache, a, b, p, q, stack
    )
