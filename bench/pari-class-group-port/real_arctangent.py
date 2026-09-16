"""PARI 2.17.4 `trans2.c:mpatan` below its AGM crossover.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This preserves binary64 term selection and the changing real-word schedule.
"""

from math import atan, log2

from sagejs.native import IntegerBuffer, checked_float64, native

from .exponential import (
    pari_exp_schedule_sqrt,
    pari_real_reciprocal,
    pari_real_resize,
    pari_real_truncate,
)
from .float_conversion import pari_real_to_float
from .pi_constant import pari_pi_constant
from .real_division import pari_real_division
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_real_word_division,
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_sum,
)


@native
def pari_atan_schedule_alpha(value: float) -> float:
    """Use the same binary64 libm formula as the upstream scheduler."""
    return log2(3.141592653589793 / atan(value))


@native
def pari_real_arctangent(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Follow mpatan's halving, alternating series and reciprocal branch.

    Disjoint workspaces are shared with the resident pi constructor. Higher
    precision/large positive exponents reject instead of entering an unported
    AGM or exceeding the existing constant/arithmetic allocation boundary.
    """
    if mantissa == 0:
        return 0, 0, exponent
    if precision < 64 or precision > 384 or precision % 64 != 0:
        raise ValueError("unsupported non-AGM arctangent precision")
    if abs(mantissa).bit_length() != precision:
        raise ValueError("arctangent requires a full mantissa")
    if exponent < -10000 or exponent > 512:
        raise ValueError("unsupported arctangent exponent")
    if exponent == 0 and abs(mantissa) == 1 << (precision - 1):
        cm, cp, ce = pari_pi_constant(precision + 64, pi_cache, a, b, p, q, stack)
        if mantissa < 0:
            cm = -cm
        return cm, cp, ce - 2
    target = precision
    inverse = exponent >= 0
    if exponent > 0:
        target += ((exponent + 63) // 64) * 64
    xm, xp, xe = pari_real_resize(abs(mantissa), precision, exponent, precision + 64)
    if inverse:
        xm, xp, xe = pari_real_reciprocal(xm, xp, xe)
    if xe < -100:
        alpha = 1.65149612947 - checked_float64(xe)
    else:
        alpha = pari_atan_schedule_alpha(pari_real_to_float(xm, xp, xe))
    beta = checked_float64(precision // 2)
    delta = 1.0 + beta - alpha / 2.0
    if delta <= 0.0:
        terms = 1
        halvings = 0
    else:
        fi = alpha - 2.0
        if delta >= fi * fi:
            t = 1.0 + pari_exp_schedule_sqrt(delta)
            terms = int(t)
            halvings = int(t - fi)
        else:
            terms = int(1.0 + beta / fi)
            halvings = 0
    working = precision + ((halvings + 63) // 64) * 64
    xm, xp, xe = pari_real_resize(xm, xp, xe, working)
    for i in range(halvings):
        sm, sp, se = pari_short_square(xm, xp, xe)
        sm, sp, se = pari_word_integer_real_sum(1, sm, sp, se)
        sm, sp, se = pari_real_truncate(sm, sp, se, working)
        sm, sp, se = pari_real_square_root_abs(sm, sp, se)
        sm, sp, se = pari_word_integer_real_sum(1, sm, sp, se)
        sm, sp, se = pari_real_truncate(sm, sp, se, working)
        tm, tp, te = pari_real_division(xm, xp, xe, sm, sp, se)
        xm, xp, xe = pari_real_resize(tm, tp, te, working)
    sm, sp, se = pari_short_square(xm, xp, xe)
    length = 128
    if working < length:
        length = working
    vm, vp, ve = pari_real_word_division(2 * terms + 1, 1 << (length - 1), length, 0)
    remainder = 0
    i = terms
    while i > 1:
        tm, tp, te = pari_real_truncate(sm, sp, se, length)
        tm, tp, te = pari_short_product(vm, vp, ve, tm, tp, te)
        accumulated = remainder - se
        length += (accumulated // 64) * 64
        remainder = accumulated % 64
        if length > working:
            length = working
        um, up, ue = pari_real_word_division(2 * i - 1, 1 << (length - 1), length, 0)
        vm, vp, ve = pari_signed_real_sum(um, up, ue, -tm, tp, te)
        vm, vp, ve = pari_real_resize(vm, vp, ve, length)
        i -= 1
    tm, tp, te = pari_short_product(vm, vp, ve, sm, sp, se)
    vm, vp, ve = pari_signed_real_sum(1 << (working - 1), working, 0, -tm, tp, te)
    vm, vp, ve = pari_short_product(xm, xp, xe, vm, vp, ve)
    ve += halvings
    if inverse:
        cm, cp, ce = pari_pi_constant(target, pi_cache, a, b, p, q, stack)
        vm, vp, ve = pari_signed_real_sum(cm, cp, ce - 1, -vm, vp, ve)
    if mantissa < 0:
        vm = -vm
    # affrr_fixlg shrinks the destination header to the source length; it
    # does not invent precision by padding a shorter computed result.
    if vp != 0 and vp < target:
        target = vp
    return pari_real_resize(vm, vp, ve, target)
