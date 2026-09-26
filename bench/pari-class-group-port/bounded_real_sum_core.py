"""Private bounded-real addition cores shared by compiled class-group paths.

The public checked boundaries remain in `short_product_bounded`.  These helpers
are reachable only after callers have established normalized mantissas and
bounded precision/exponent metadata.  Copyright (C) The PARI group.
GPL-2.0-or-later, without warranty.
"""

from sagejs.native import checked_int64, int64, native, native_inline


@native
def pari_bounded_word_integer_real_product(
    integer: int, mantissa: int, precision: int64, exponent: int64
) -> tuple[int, int64, int64]:
    """Multiply a prepared real by a signed one-word integer."""
    if integer == 0:
        return 0, checked_int64(-1), checked_int64(0)
    bits: int64 = checked_int64(abs(integer).bit_length())
    if bits > 64:
        raise ValueError("multiword integer-real product is not ported")
    if mantissa == 0:
        return 0, checked_int64(0), checked_int64(exponent + bits - 1)
    if integer == 1:
        return mantissa, precision, exponent
    if integer == -1:
        return -mantissa, precision, exponent
    product = abs(integer * mantissa)
    shift: int64 = checked_int64(product.bit_length()) - precision
    result = (product + (1 << (shift - 1))) >> shift
    exponent += shift
    if checked_int64(result.bit_length()) > precision:
        result >>= 1
        exponent += 1
    if (integer < 0 and mantissa > 0) or (integer > 0 and mantissa < 0):
        result = -result
    return result, precision, exponent


@native
def _pari_bounded_positive_real_sum_trusted(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """Nonnegative `addrr_sign` with bounded precision metadata."""
    if mx == 0:
        if my == 0 or ey <= ex:
            if ey > ex:
                ex = ey
            return 0, checked_int64(0), ex
        precision: int64 = 64 * ((ey - ex + 63) // 64)
        if precision > py:
            precision = py
        return my >> (py - precision), precision, ey
    if my == 0:
        if ex <= ey:
            return 0, checked_int64(0), ey
        precision: int64 = 64 * ((ex - ey + 63) // 64)
        if precision > px:
            precision = px
        return mx >> (px - precision), precision, ex
    if ex > ey:
        mx, my = my, mx
        px, py = py, px
        ex, ey = ey, ex
    gap: int64 = ey - ex
    words: int64 = gap // 64
    available: int64 = py // 64 - words
    if available <= 0:
        return my, py, ey
    precision: int64 = py
    if gap == 0:
        if px < precision:
            precision = px
    elif available > px // 64:
        precision = px + 64 * (words + 1)
        if gap % 64 < 4:
            precision -= 64
    bx: int64 = ex + 1 - px
    by: int64 = ey + 1 - py
    bottom: int64 = bx
    if by < bottom:
        bottom = by
    total = (mx << (bx - bottom)) + (my << (by - bottom))
    bits: int64 = checked_int64(total.bit_length())
    exponent: int64 = bottom + bits - 1
    if bits > precision:
        total >>= bits - precision
    else:
        total <<= precision - bits
    return total, precision, exponent


@native_inline
def _pari_bounded_signed_real_sum_trusted(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """Signed `addrr_sign` with bounded precision metadata."""
    if mx == 0 or my == 0 or (mx > 0 and my > 0) or (mx < 0 and my < 0):
        m, p, e = _pari_bounded_positive_real_sum_trusted(
            abs(mx), px, ex, abs(my), py, ey
        )
        if mx < 0 or my < 0:
            m = -m
        return m, p, e
    if ex > ey:
        mx, my = my, mx
        px, py = py, px
        ex, ey = ey, ex
    gap: int64 = ey - ex
    whole: int64 = gap // 64
    remainder: int64 = gap % 64
    if py // 64 - whole <= 0:
        return my, py, ey
    extended: int64 = 0
    precision: int64 = py
    if gap == 0:
        if px < precision:
            precision = px
    elif py // 64 - whole > px // 64:
        precision = px + 64 * (whole + 1)
        extended = 1
    shift: int64 = px + gap - precision
    if shift >= 0:
        a = abs(mx) >> shift
    else:
        a = abs(mx) << -shift
    b = abs(my) >> (py - precision)
    difference = b - a
    negative: int64 = 0
    if difference < 0:
        difference = -difference
        if mx < 0:
            negative = 1
    elif my < 0:
        negative = 1
    if difference == 0:
        return 0, checked_int64(0), ey + checked_int64(1) - precision
    canceled: int64 = precision - checked_int64(difference.bit_length())
    fraction: int64 = canceled % 64
    precision -= 64 * (canceled // 64)
    exponent: int64 = ey - canceled
    result = difference << fraction
    if extended != 0 and remainder - fraction < 5 and precision > 64:
        precision -= 64
        result = (result + (1 << 63)) >> 64
        if checked_int64(result.bit_length()) > precision:
            result >>= 1
            exponent += 1
    if negative:
        result = -result
    return result, precision, exponent
