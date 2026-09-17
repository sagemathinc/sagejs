"""PARI 2.17.4 modlog2 and mpexp base-case connected source path.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared real inputs and caller-owned scratch replace PARI GEN/stack storage.
"""

from sagejs.native import IntegerBuffer, native

from .float_conversion import pari_real_to_float
from .logarithm_constant import pari_log2_constant
from .exponential import pari_real_resize, pari_exp1r_abs, pari_real_reciprocal
from .short_product import (
    pari_word_integer_real_product,
    pari_signed_real_sum,
    pari_word_integer_real_sum,
)


@native
def pari_reduction_quotient(value: float) -> float:
    """Keep modlog2's binary64 quotient expression in one typed helper."""
    return (abs(value) + 0.69314718055994530942 / 2.0) / 0.69314718055994530942


@native
def pari_modlog2(
    mantissa: int,
    precision: int,
    exponent: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int]:
    """Return the centered remainder and integer shift; zero uses a sentinel."""
    if mantissa == 0 or precision < 64 or precision > 153088 or precision % 64 != 0:
        raise ValueError("unsupported exponential range reduction input")
    value = pari_real_to_float(mantissa, precision, exponent)
    quotient = pari_reduction_quotient(value)
    if quotient >= 9223372036854775808.0:
        raise OverflowError("exponential reduction shift overflow")
    shift = int(quotient)
    if value < 0.0:
        shift = -shift
    if shift == 0:
        return mantissa, precision, exponent, shift
    working = precision + 64
    lm, lp, le = pari_log2_constant(working, cache, a, b, p, q, stack)
    lm, lp, le = pari_word_integer_real_product(shift, lm, lp, le)
    xm, xp, xe = pari_real_resize(mantissa, precision, exponent, working)
    rm, rp, re = pari_signed_real_sum(xm, xp, xe, -lm, lp, le)
    if rm == 0:
        return 0, 0, 0, shift
    return rm, rp, re, shift


@native
def pari_prepared_exp(
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
    """Execute the connected mpexp base case without forcing result precision.

    Preserve mpexp0, range reduction, exp1r_abs, negative-remainder inversion,
    the power-of-two shift, and conditional removal of extra result precision.
    Existing arithmetic capacity failures remain explicit.
    """
    if mantissa == 0:
        if exponent >= 0:
            return 0, 0, exponent
        result_precision = ((-exponent + 63) // 64) * 64
        if result_precision > 153088:
            raise ValueError("zero exponential precision exceeds arithmetic boundary")
        return 1 << (result_precision - 1), result_precision, 0
    ym, yp, ye, shift = pari_modlog2(
        mantissa, precision, exponent, cache, a, b, p, q, stack
    )
    if ym == 0:
        return 1 << (precision - 1), precision, shift
    zm, zp, ze = pari_exp1r_abs(ym, yp, ye)
    zm, zp, ze = pari_word_integer_real_sum(1, zm, zp, ze)
    if ym < 0:
        zm, zp, ze = pari_real_reciprocal(zm, zp, ze)
    if shift != 0:
        ze += shift
        if zp > precision:
            zm, zp, ze = pari_real_resize(zm, zp, ze, precision)
    return zm, zp, ze
