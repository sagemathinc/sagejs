"""PARI 2.17.4 real-precision operations needed by its base-case exponential.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Prepared triples use the same mantissa/precision/exponent contract as short_product.
"""

from sagejs.native import native


@native
def pari_real_resize(
    mantissa: int, precision: int, exponent: int, target: int
) -> tuple[int, int, int]:
    """Translate rtor/affrr: pad on growth, round away on a leading guard bit.

    This is not ties-to-even rounding. A zero's exponent is reduced to at most
    minus the target precision, exactly as affrr. Zero triples retain precision
    zero; their allocation length is not represented by this value interchange.
    """
    if target < 64 or target > 2048 or target % 64 != 0:
        raise ValueError("unsupported target real precision")
    if mantissa == 0:
        if exponent > -target:
            exponent = -target
        return 0, 0, exponent
    if precision < 64 or precision > 2048 or precision % 64 != 0:
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
    if target < 64 or target > precision or precision > 2048:
        raise ValueError("unsupported truncating real precision")
    if precision % 64 != 0 or target % 64 != 0:
        raise ValueError("real precision requires whole words")
    if abs(mantissa).bit_length() != precision:
        raise ValueError("real truncation requires a nonzero full mantissa")
    magnitude = abs(mantissa) >> (precision - target)
    if mantissa < 0:
        magnitude = -magnitude
    return magnitude, target, exponent
