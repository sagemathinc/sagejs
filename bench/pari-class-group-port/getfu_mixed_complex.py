"""PARI 2.17.4 real sine/cosine prerequisite for mixed `getfu`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the connected `trans1.c:mpcosm1`, `mpaut`, and `mpsincos` graph used
when `buch2.c:getfu` exponentiates a mixed-signature logarithm matrix. Packed
triples retain PARI's mantissa precision and zero-error exponent. Caller-owned
constant and arithmetic workspaces replace PARI stack ownership.
"""

from math import log2, sqrt

from sagejs.native import IntegerBuffer, checked_float64, checked_uint64, native

from .exponential import (
    pari_leading_word_log2,
    pari_real_resize,
    pari_real_truncate,
)
from .float_conversion import pari_real_to_float
from .exponential_entry import pari_prepared_exp
from .pi_constant import pari_pi_constant
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
def pari_cosine_schedule_sqrt(value: float) -> float:
    return sqrt(value)


@native
def pari_cosine_reduction_quotient(value: float) -> int:
    """The `a <= 30` nearest multiple of pi/2 in `mpcosm1`."""
    shifted = value / (3.14159265358979323846 / 2.0) + 0.5
    quotient = int(shifted)
    if shifted < 0.0 and shifted != checked_float64(quotient):
        quotient -= 1
    return quotient


@native
def pari_mpcosm1(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int]:
    """Return `(cos(x)-1, mod8)` through PARI's non-AGM source graph.

    The prepared quartic corridor has exponents below 31, so the large-
    argument quotient branch is deliberately rejected rather than replaced.
    """
    if mantissa == 0:
        return 0, 0, 2 * exponent - 1, 0
    if (
        precision < 64
        or precision > 153088
        or precision % 64 != 0
        or abs(mantissa).bit_length() != precision
    ):
        raise ValueError("unsupported mpcosm1 input")
    if exponent > 30:
        raise ValueError("large mpcosm1 quotient branch is outside the prepared cut")
    original_precision = precision
    original_mantissa = mantissa
    original_exponent = exponent
    quadrant = 0
    if exponent >= 0:
        quotient = pari_cosine_reduction_quotient(
            pari_real_to_float(mantissa, precision, exponent)
        )
        if quotient != 0:
            pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
            pm, pp, pe = pari_word_integer_real_product(quotient, pm, pp, pe - 1)
            xm, xp, xe = pari_signed_real_sum(
                mantissa, precision, exponent, -pm, pp, pe
            )
            reduced_exponent = xe
            if exponent - reduced_exponent >= 7:
                target = precision + ((exponent - reduced_exponent + 63) // 64) * 64
                if target > 154112:
                    raise ValueError("mpcosm1 reduction precision exceeds boundary")
                pm, pp, pe = pari_pi_constant(target, pi_cache, a, b, p, q, stack)
                pm, pp, pe = pari_word_integer_real_product(quotient, pm, pp, pe - 1)
                xm, xp, xe = pari_real_resize(
                    original_mantissa,
                    original_precision,
                    original_exponent,
                    target,
                )
                xm, xp, xe = pari_signed_real_sum(xm, xp, xe, -pm, pp, pe)
                reduced_exponent = xe
            mantissa, precision, exponent = xm, xp, xe
            if mantissa == 0 and reduced_exponent >= 0:
                raise ValueError("mpcosm1 argument reduction lost all precision")
            quadrant = quotient % 4
    mod8 = quadrant
    if mantissa < 0:
        mod8 += 4
    if mantissa == 0:
        return 0, 0, 2 * exponent - 1, mod8
    bits = original_precision
    if bits + 2 * exponent <= 0:
        ym, yp, ye = pari_short_square(mantissa, precision, exponent)
        return -ym, yp, ye - 1, mod8

    big_b = bits // 6 + 32 + 2048 // bits
    d = checked_float64(exponent) / 2.0
    roots = int(d + pari_cosine_schedule_sqrt(d * d + checked_float64(big_b)))
    if checked_float64(roots) < checked_float64(-exponent) * 0.1:
        roots = 0
    working = original_precision + ((roots + 63) // 64) * 64
    if working > 154112:
        raise ValueError("mpcosm1 working precision exceeds boundary")
    bits += roots
    leading = checked_uint64(abs(mantissa) >> (precision - 64))
    logarithm = pari_leading_word_log2(leading) + checked_float64(exponent - 63)
    d = 2.0 * (checked_float64(roots) - logarithm - 1.0 / 0.69314718055994530942)
    terms = int(checked_float64(bits) / d)
    if terms > 1:
        terms = int(checked_float64(bits) / (d + log2(checked_float64(terms) + 1.0)))
    while checked_float64(terms) * (
        d + log2(checked_float64(terms) + 1.0)
    ) < checked_float64(bits):
        terms += 1

    xm, xp, xe = pari_real_resize(mantissa, precision, exponent, working)
    xe -= roots
    if xm < 0:
        xm = -xm
    x2m, x2p, x2e = pari_short_square(xm, xp, xe)
    if terms == 1:
        um, up, ue = -x2m, x2p, x2e - 1
    else:
        accumulated = 0
        length = ((int(d + checked_float64(terms) + 16.0) + 63) // 64) * 64
        if length > working:
            length = working
        um, up, ue = 1 << (length - 1), length, 0
        i = terms
        while i >= 2:
            tm, tp, te = pari_real_truncate(x2m, x2p, x2e, length)
            tm, tp, te = pari_real_word_division((2 * i - 1) * (2 * i), tm, tp, te)
            delta = accumulated - te
            accumulated = delta % 64
            length += (delta // 64) * 64
            if length > working:
                length = working
            if i != terms:
                tm, tp, te = pari_short_product(tm, tp, te, um, up, ue)
            one = 1 << (length - 1)
            tm, tp, te = pari_signed_real_sum(one, length, 0, -tm, tp, te)
            um, up, ue = pari_real_resize(tm, tp, te, length)
            i -= 1
        ue -= 1
        um = -um
        x2m, x2p, x2e = pari_real_resize(x2m, x2p, x2e, working)
        um, up, ue = pari_short_product(x2m, x2p, x2e, um, up, ue)
    for i in range(roots):
        qm, qp, qe = pari_short_square(um, up, ue)
        ue += 1
        um, up, ue = pari_signed_real_sum(um, up, ue, qm, qp, qe)
        ue += 1
    um, up, ue = pari_real_resize(um, up, ue, original_precision)
    return um, up, ue, mod8


@native
def pari_mpaut(mantissa: int, precision: int, exponent: int) -> tuple[int, int, int]:
    """`sqrt(abs(x*(x+2)))`, mapping `cos(x)-1` to `abs(sin(x))`."""
    tm, tp, te = pari_word_integer_real_sum(2, mantissa, precision, exponent)
    tm, tp, te = pari_short_product(mantissa, precision, exponent, tm, tp, te)
    if tm == 0:
        return 0, 0, te >> 1
    return pari_real_square_root_abs(tm, tp, te)


@native
def pari_mpsincos(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int]:
    """Return packed `(sin(x), cos(x))` through `mpsincos`."""
    if mantissa == 0:
        if exponent >= 0:
            return 0, 0, exponent, 0, 0, exponent
        cosine_precision = ((-exponent + 63) // 64) * 64
        if cosine_precision > 154112:
            raise ValueError("zero cosine precision exceeds boundary")
        return (
            0,
            0,
            exponent,
            1 << (cosine_precision - 1),
            cosine_precision,
            0,
        )
    zm, zp, ze, mod8 = pari_mpcosm1(
        mantissa, precision, exponent, pi_cache, a, b, p, q, stack
    )
    if mod8 == 0:
        cm, cp, ce = pari_word_integer_real_sum(1, zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
    elif mod8 == 1:
        sm, sp, se = pari_word_integer_real_sum(1, zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm = -cm
    elif mod8 == 2:
        cm, cp, ce = pari_word_integer_real_sum(-1, -zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
        sm = -sm
    elif mod8 == 3:
        sm, sp, se = pari_word_integer_real_sum(-1, -zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
    elif mod8 == 4:
        cm, cp, ce = pari_word_integer_real_sum(1, zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
        sm = -sm
    elif mod8 == 5:
        sm, sp, se = pari_word_integer_real_sum(1, zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
    elif mod8 == 6:
        cm, cp, ce = pari_word_integer_real_sum(-1, -zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
    else:
        sm, sp, se = pari_word_integer_real_sum(-1, -zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm = -cm
    return sm, sp, se, cm, cp, ce


@native
def pari_mpsincosm1(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int]:
    """Return packed `(sin(x), cos(x)-1)` through `mpsincosm1`."""
    if mantissa == 0:
        return 0, 0, exponent, 0, 0, 2 * exponent - 1
    zm, zp, ze, mod8 = pari_mpcosm1(
        mantissa, precision, exponent, pi_cache, a, b, p, q, stack
    )
    if mod8 == 0:
        cm, cp, ce = zm, zp, ze
        sm, sp, se = pari_mpaut(zm, zp, ze)
    elif mod8 == 1:
        sm, sp, se = pari_word_integer_real_sum(1, zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm, cp, ce = pari_word_integer_real_sum(1, cm, cp, ce)
        cm = -cm
    elif mod8 == 2:
        cm, cp, ce = pari_word_integer_real_sum(-2, -zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
        sm = -sm
    elif mod8 == 3:
        sm, sp, se = pari_word_integer_real_sum(-1, -zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm, cp, ce = pari_word_integer_real_sum(-1, cm, cp, ce)
    elif mod8 == 4:
        cm, cp, ce = zm, zp, ze
        sm, sp, se = pari_mpaut(zm, zp, ze)
        sm = -sm
    elif mod8 == 5:
        sm, sp, se = pari_word_integer_real_sum(1, zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm, cp, ce = pari_word_integer_real_sum(-1, cm, cp, ce)
    elif mod8 == 6:
        cm, cp, ce = pari_word_integer_real_sum(-2, -zm, zp, ze)
        sm, sp, se = pari_mpaut(zm, zp, ze)
    else:
        sm, sp, se = pari_word_integer_real_sum(-1, -zm, zp, ze)
        cm, cp, ce = pari_mpaut(zm, zp, ze)
        cm, cp, ce = pari_word_integer_real_sum(-1, -cm, cp, ce)
    return sm, sp, se, cm, cp, ce


@native
def pari_mixed_complex_exp(
    real_mantissa: int,
    real_precision: int,
    real_exponent: int,
    imag_mantissa: int,
    imag_precision: int,
    imag_exponent: int,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int, int, int, int]:
    """The real-component `cxexp` branch used by mixed `getfu`."""
    if imag_mantissa == 0 and imag_precision == -1:
        em, ep, ee = pari_prepared_exp(
            real_mantissa,
            real_precision,
            real_exponent,
            exp_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        return em, ep, ee, 0, -1, 0
    sm, sp, se, cm, cp, ce = pari_mpsincos(
        imag_mantissa,
        imag_precision,
        imag_exponent,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    if real_mantissa == 0:
        return cm, cp, ce, sm, sp, se
    em, ep, ee = pari_prepared_exp(
        real_mantissa,
        real_precision,
        real_exponent,
        exp_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    rm, rp, re = pari_short_product(em, ep, ee, cm, cp, ce)
    im, ip, ie = pari_short_product(em, ep, ee, sm, sp, se)
    return rm, rp, re, im, ip, ie
