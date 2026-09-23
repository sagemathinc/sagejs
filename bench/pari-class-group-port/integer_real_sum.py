"""PARI 2.17.4 addir_sign for arbitrary-size exact integer operands.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Preserve the precision selection before itor and the existing addrr port.
"""

from sagejs.native import native

from .real_conversion import pari_integer_to_real
from .short_product import pari_signed_real_sum


@native
def pari_integer_real_sum(
    integer: int, mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Add with upstream precision/error semantics, not exact final rounding.

    Conversions retain one guard word inside the reviewed packed-real corridor.
    The zero integer is an identity, including the real zero's error exponent.
    """
    if integer == 0:
        return mantissa, precision, exponent
    gap = exponent - (abs(integer).bit_length() - 1)
    if mantissa == 0:
        if gap >= 0:
            return mantissa, precision, exponent
        return pari_integer_to_real(integer, 64 * ((-gap + 63) // 64))
    if (
        precision < 64
        or precision > 154048
        or precision % 64 != 0
        or abs(mantissa).bit_length() != precision
    ):
        raise ValueError("unsupported integer-real sum input")
    if gap > 0:
        converted_precision = precision - 64 * (gap // 64)
        if converted_precision < 64:
            return mantissa, precision, exponent
    else:
        converted_precision = precision + 64 * ((-gap + 63) // 64)
    im, ip, ie = pari_integer_to_real(integer, converted_precision)
    return pari_signed_real_sum(im, ip, ie, mantissa, precision, exponent)
