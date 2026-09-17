"""PARI 2.17.4 real division for logarithm and root initialization.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Use exact backend integer quotients as an explicit division-leaf substitution.
Operand windows and the leading-remainder rounding remain PARI-specific.
"""

from sagejs.native import native
from .small_real_division import pari_small_real_division


@native
def pari_real_division(
    mx: int, px: int, ex: int, my: int, py: int, ey: int
) -> tuple[int, int, int]:
    if my == 0:
        raise ZeroDivisionError("zero real divisor")
    if mx == 0:
        return 0, 0, ex - ey
    if px < 64 or py < 64 or px > 4352 or py > 4352:
        raise ValueError("unsupported real division precision")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("real division requires whole words")
    a = abs(mx)
    b = abs(my)
    if a.bit_length() != px or b.bit_length() != py:
        raise ValueError("real division requires full mantissas")
    exponent = ex - ey
    if py == 64:
        # The one-word divisor path keeps two numerator words, then scales
        # before division; unlike the other branches it rounds after scaling.
        if px == 64:
            numerator = a << 64
        else:
            numerator = a >> (px - 128)
        if numerator >> 64 < b:
            exponent -= 1
        else:
            numerator >>= 1
        quotient, remainder = divmod(numerator, b)
        if remainder > b >> 1:
            quotient += 1
        if quotient.bit_length() > 64:
            quotient = 1 << 63
            exponent += 1
        precision = 64
    elif py < 256:
        quotient, precision, change = pari_small_real_division(a, px, b, py)
        exponent += change
    else:
        precision = px
        if py < precision:
            precision = py
        divisor_precision = precision + 64
        if py < divisor_precision:
            divisor_precision = py
        numerator_precision = precision + divisor_precision
        retained_precision = numerator_precision
        if px < retained_precision:
            retained_precision = px
        numerator = a >> (px - retained_precision)
        if retained_precision < numerator_precision:
            numerator <<= numerator_precision - retained_precision
        divisor = b >> (py - divisor_precision)
        quotient, remainder = divmod(numerator, divisor)
        if remainder >> (divisor_precision - 64) > divisor >> (divisor_precision - 63):
            quotient += 1
        if quotient.bit_length() <= precision:
            exponent -= 1
        elif quotient.bit_length() == precision + 1:
            quotient >>= 1
        else:
            quotient = 1 << (precision - 1)
            exponent += 1
    if (mx < 0) != (my < 0):
        quotient = -quotient
    return quotient, precision, exponent
