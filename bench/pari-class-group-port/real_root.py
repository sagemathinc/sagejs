"""PARI 2.17.4 trans1.c higher real roots for enumeration bounds.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Preserve logarithm/exponential initialization and cubic Newton precision steps.
"""

from sagejs.native import IntegerBuffer, checked_float64, native

from .exponential import pari_real_resize
from .exponential_entry import pari_prepared_exp
from .float_conversion import pari_float_to_real, pari_real_to_float
from .real_division import pari_real_division
from .real_logarithm import pari_real_logarithm_64
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_real_word_division,
    pari_short_product,
    pari_short_square,
    pari_signed_real_sum,
    pari_word_integer_real_product,
)


@native
def pari_root_precision_mask(bits: int) -> int:
    a = bits
    mask = 0
    power = 3
    while a > 1:
        c = a % 3
        if c != 0:
            mask += 3 - c
        a = (a + 2) // 3
        if a == 1:
            return mask + power
        mask *= 3
        power *= 3
    raise ValueError("root precision mask requires at least two bits")


@native
def pari_root_power(m: int, p: int, e: int, n: int) -> tuple[int, int, int]:
    """powru's left-to-right binary powering, restricted to the root degrees."""
    if n < 1 or n > 10:
        raise ValueError("unsupported root power")
    rm, rp, re = m, p, e
    if n == 1:
        return rm, rp, re
    bit = 1 << (n.bit_length() - 2)
    while bit != 0:
        rm, rp, re = pari_short_square(rm, rp, re)
        if (n // bit) % 2 != 0:
            rm, rp, re = pari_short_product(rm, rp, re, m, p, e)
        bit >>= 1
    return rm, rp, re


@native
def pari_real_root_abs(
    mantissa: int,
    precision: int,
    exponent: int,
    degree: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """sqrtnr_abs for positive degrees through ten, without host root values."""
    if degree < 1 or degree > 10 or precision < 64 or precision > 384:
        raise ValueError("unsupported real root degree or precision")
    magnitude = abs(mantissa)
    if precision % 64 != 0 or magnitude.bit_length() != precision:
        raise ValueError("real root requires a full whole-word mantissa")
    if degree == 1:
        return magnitude, precision, exponent
    if degree == 2:
        return pari_real_square_root_abs(magnitude, precision, exponent)
    shift = exponent // degree
    if exponent < 0:
        shift = -((-exponent) // degree)
    reduced_exponent = exponent - degree * shift
    xm, xp, xe = pari_real_resize(magnitude, precision, reduced_exponent, 64)
    xm, xp, xe = pari_real_logarithm_64(xm, xe, cache, a, b, p, q, stack)
    xm, xp, xe = pari_real_word_division(degree, xm, xp, xe)
    xm, xp, xe = pari_prepared_exp(xm, xp, xe, cache, a, b, p, q, stack)
    if precision == 64:
        return xm, xp, xe + shift
    x = pari_real_to_float(xm, xp, xe)
    k = checked_float64(degree)
    correction = (k * k - 1.0) / (12.0 * x * x)
    cm, cp, extra = pari_float_to_real(correction)
    mask = pari_root_precision_mask(precision + 63)
    old = 1
    next_accuracy = old * 3 - mask % 3
    while next_accuracy <= 64:
        mask //= 3
        old = next_accuracy
        next_accuracy = old * 3 - mask % 3
    while mask != 1:
        next_accuracy = old * 3 - mask % 3
        mask //= 3
        working = ((next_accuracy + extra + 63) // 64) * 64
        bm, bp, be = pari_real_resize(magnitude, precision, reduced_exponent, working)
        xm, xp, xe = pari_real_resize(xm, xp, xe, working)
        ym, yp, ye = pari_root_power(xm, xp, xe, degree)
        ym, yp, ye = pari_signed_real_sum(ym, yp, ye, -bm, bp, be)
        dm, dp, de = pari_word_integer_real_product(degree + 1, ym, yp, ye)
        bm, bp, be = pari_word_integer_real_product(2 * degree, bm, bp, be)
        dm, dp, de = pari_signed_real_sum(dm, dp, de, bm, bp, be)
        zm, zp, ze = pari_real_division(ym, yp, ye, dm, dp, de)
        ze += 1
        zm, zp, ze = pari_short_product(xm, xp, xe, zm, zp, ze)
        xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -zm, zp, ze)
        old = next_accuracy
    xe += shift
    if xp > precision:
        return pari_real_resize(xm, xp, xe, precision)
    return xm, xp, xe
