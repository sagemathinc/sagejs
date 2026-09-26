"""PARI 2.17.4 real-precision operations needed by its base-case exponential.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared triples use the same mantissa/precision/exponent contract as short_product.
"""

from math import log2, sqrt

from sagejs.native import checked_float64, checked_uint64, native, uint64

from .short_product import (
    pari_positive_real_sum,
    pari_real_word_division,
    pari_short_product,
    pari_word_integer_real_sum,
)


@native
def pari_leading_word_log2(word: uint64) -> float:
    """Use dbllog2r's rounded unsigned-word to binary64 conversion."""
    return log2(float(word))


@native
def pari_exp_schedule_sqrt(value: float) -> float:
    return sqrt(value)


@native
def pari_real_resize(
    mantissa: int, precision: int, exponent: int, target: int
) -> tuple[int, int, int]:
    """Translate rtor/affrr: pad on growth, round away on a leading guard bit.

    This is not ties-to-even rounding. A zero's exponent is reduced to at most
    minus the target precision, exactly as affrr. Zero triples retain precision
    zero; their allocation length is not represented by this value interchange.
    """
    if target < 64 or target > 154112 or target % 64 != 0:
        raise ValueError("unsupported target real precision")
    if mantissa == 0:
        if exponent > -target:
            exponent = -target
        return 0, 0, exponent
    if precision < 64 or precision > 154112 or precision % 64 != 0:
        raise ValueError("unsupported source real precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("real resize requires a full mantissa")
    if precision <= target:
        magnitude <<= target - precision
    else:
        shift = precision - target
        magnitude = (magnitude + (1 << (shift - 1))) >> shift
        if magnitude.bit_length() > target:
            magnitude >>= 1
            exponent += 1
    if mantissa < 0:
        magnitude = -magnitude
    return magnitude, target, exponent


@native
def pari_real_truncate(
    mantissa: int, precision: int, exponent: int, target: int
) -> tuple[int, int, int]:
    """Translate a shrinking setprec without affrr's rounding.

    Growing a header without restoring retained allocation words is not a
    value operation and is deliberately rejected. The exponential must retain
    its full X value separately when changing temporary working precision.
    """
    if target < 64 or target > precision or precision > 154112:
        raise ValueError("unsupported truncating real precision")
    if precision % 64 != 0 or target % 64 != 0:
        raise ValueError("real precision requires whole words")
    if abs(mantissa).bit_length() != precision:
        raise ValueError("real truncation requires a nonzero full mantissa")
    magnitude = abs(mantissa) >> (precision - target)
    if mantissa < 0:
        magnitude = -magnitude
    return magnitude, target, exponent


@native
def pari_real_reciprocal(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Represent invr_basecase's quotient and upstream leading-word rounding.

    Exact integer division replaces the low-level quotient-word loop. This is
    an explicit arithmetic-leaf substitution, not a language-only cost claim.
    Keep the distinct one-word division path and non-ties-to-even rounding.
    """
    if mantissa == 0:
        raise ZeroDivisionError("zero reciprocal")
    if precision < 64 or precision > 154112 or precision % 64 != 0:
        raise ValueError("unsupported reciprocal precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("reciprocal requires a full mantissa")
    result_exponent = -exponent
    if precision == 64:
        numerator = 1 << 127
        if magnitude == 1 << 63:
            numerator >>= 1
        else:
            result_exponent -= 1
        quotient = numerator // magnitude
        if numerator % magnitude > magnitude >> 1:
            quotient += 1
        if quotient.bit_length() > 64:
            quotient = 1 << 63
            result_exponent += 1
    else:
        numerator = 1 << (2 * precision - 1)
        quotient = numerator // magnitude
        remainder = numerator % magnitude
        leading_remainder = remainder >> (precision - 64)
        leading_divisor = magnitude >> (precision - 64)
        if leading_remainder > leading_divisor >> 1:
            quotient += 1
        if quotient.bit_length() == precision:
            result_exponent -= 1
        elif quotient.bit_length() == precision + 1:
            quotient >>= 1
        else:
            quotient = 1 << (precision - 1)
            result_exponent += 1
    if mantissa < 0:
        quotient = -quotient
    return quotient, precision, result_exponent


@native
def pari_exp1r_abs(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Translate trans1.c exp1r_abs, including precision-changing Horner steps.

    This computes exp(abs(x))-1 for a nonzero prepared real. Range reduction
    and the mpexp entry remain separate dependencies. Working precisions are
    limited to the coordinated 154,112-bit internal boundary, never clamped.
    """
    if precision < 64 or precision > 154112 or precision % 64 != 0:
        raise ValueError("unsupported exponential precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("exponential requires a nonzero full mantissa")
    if exponent < -154112 or exponent > 10000:
        raise ValueError("unsupported exponential exponent")
    if precision + exponent <= 0:
        return magnitude, precision, exponent
    b = precision
    big_b = b // 3 + 64 + 4096 // b
    d = checked_float64(exponent) / 2.0
    m = int(d + pari_exp_schedule_sqrt(d * d + checked_float64(big_b)))
    if checked_float64(m) < checked_float64(-exponent) * 0.1:
        m = 0
    leading = checked_uint64(magnitude >> (precision - 64))
    log_x = pari_leading_word_log2(leading) + checked_float64(exponent - 63)
    d = checked_float64(m) - log_x - 1.0 / 0.69314718055994530942
    while d <= 0.0:
        d += 1.0
        m += 1
    working = precision + ((m + 63) // 64) * 64
    if working > 154112:
        raise ValueError("exponential working precision exceeds arithmetic boundary")
    b += m
    n = int(checked_float64(b) / d)
    if n == 1:
        n = int(checked_float64(b) / (d + log2(checked_float64(n) + 1.0)))
    while checked_float64(n) * (d + log2(checked_float64(n) + 1.0)) < checked_float64(
        b
    ):
        n += 1
    xm, xp, xe = pari_real_resize(magnitude, precision, exponent, working)
    xe -= m
    pm = xm
    pp = xp
    pe = xe
    if n != 1:
        s = 0
        length = ((int(d + checked_float64(n) + 16.0) + 63) // 64) * 64
        i = n
        while i >= 2:
            if length > xp and n == 2 and m == 0 and xp == 64 and length == 128:
                # Upstream grows X's header into the adjacent y header here.
                # X/2 is exact: its leading word is unchanged. The subsequent
                # 64-bit addition of one uses no bits of this extra word
                # (xe <= -48), and final multiplication restores 64-bit X.
                # Allocate a zero guard explicitly rather than read neighbors.
                if xe > -48:
                    raise ValueError("unsupported exponential guard growth")
                tm, tp, te = pari_real_resize(xm, xp, xe, length)
            else:
                tm, tp, te = pari_real_truncate(xm, xp, xe, length)
            qm, qp, qe = pari_real_word_division(i, tm, tp, te)
            delta = s - qe
            s = delta % 64
            length += (delta // 64) * 64
            if length > working:
                length = working
            if i != n:
                qm, qp, qe = pari_short_product(qm, qp, qe, pm, pp, pe)
            qm, qp, qe = pari_positive_real_sum(
                1 << (length - 1), length, 0, qm, qp, qe
            )
            pm, pp, pe = pari_real_resize(qm, qp, qe, length)
            i -= 1
        pm, pp, pe = pari_short_product(xm, xp, xe, pm, pp, pe)
    i = 1
    while i <= m:
        if pp > working:
            pm, pp, pe = pari_real_truncate(pm, pp, pe, working)
        if pe < -working:
            pe += 1
        else:
            qm, qp, qe = pari_word_integer_real_sum(2, pm, pp, pe)
            pm, pp, pe = pari_short_product(pm, pp, pe, qm, qp, qe)
        i += 1
    target = precision
    if pp < target:
        target = pp
    return pari_real_resize(pm, pp, pe, target)
