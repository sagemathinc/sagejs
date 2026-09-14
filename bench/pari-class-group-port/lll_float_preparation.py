"""PARI 2.17.4 binary64 LLL integer conversion.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Corresponds to `lll.c:itodbl_exp`; column scaling remains a separate dependency.
"""

from sagejs.native import Float64Buffer, native

from .float_conversion import pari_real_to_float
from .real_conversion import pari_integer_to_real


@native
def pari_lll_integer_to_double(value: int, normalized: Float64Buffer) -> int:
    """Store the normalized double and return PARI's pre-normalization exponent.

    Preserve both rounding steps: `itor(x, DEFAULTPREC)` first rounds to a
    64-bit PARI real, then `rtodbl` rounds that stored mantissa to binary64.
    Direct integer-to-double conversion is not an equivalent substitution.
    Zero retains `itor`'s exponent metadata, -64, even though its double is zero.
    """
    mantissa, precision, exponent = pari_integer_to_real(value, 64)
    normalized[0] = pari_real_to_float(mantissa, precision, 0)
    return exponent
