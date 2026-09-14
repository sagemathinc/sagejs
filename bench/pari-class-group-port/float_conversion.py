"""PARI 2.17.4 64-bit rtodbl conversion semantics.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Construct the binary64 value arithmetically rather than aliasing C union bits.
"""

from math import pow

from sagejs.native import checked_float64, native


@native
def pari_real_to_float(mantissa: int, precision: int, exponent: int) -> float:
    """Preserve rtodbl's leading-word rounding and exceptional boundaries.

    Low mantissa words do not affect the conversion. The exponent -1023 case
    deliberately follows the upstream bit construction rather than a generic
    correctly-rounded conversion to subnormal binary64.
    """
    if mantissa == 0:
        return 0.0
    if precision < 64 or precision > 2048 or precision % 64 != 0:
        raise ValueError("unsupported real-to-float precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("real-to-float requires a full mantissa")
    if exponent < -1023:
        return 0.0
    leading = magnitude >> (precision - 64)
    fraction = (leading % (1 << 63)) + 1024
    if fraction >= 1 << 63:
        exponent += 1
        fraction = 0
    if exponent >= 1023:
        raise OverflowError("t_REAL->double conversion")
    fraction >>= 11
    if exponent == -1023:
        value = checked_float64(fraction) * 5e-324
    else:
        value = (1.0 + checked_float64(fraction) / 4503599627370496.0) * pow(
            2.0, checked_float64(exponent)
        )
    if mantissa < 0:
        value = -value
    return value
