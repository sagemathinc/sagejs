"""PARI 2.17.4 GMP real square-root preparation for Householder QR.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
The limb rounding follows src/kernel/gmp/mp.c:sqrtr_abs. Exact math.isqrt and
an explicit remainder substitute for mpn_sqrtrem. The separate remainder square
is still extra work compared with the upstream fused primitive.
"""

from math import isqrt

from sagejs.native import native


@native
def pari_sqrtrem_integer(value: int) -> tuple[int, int]:
    """Exact arithmetic leaf substitution, returning floor-root and remainder."""
    if value < 0:
        raise ValueError("negative integer square root")
    root = isqrt(value)
    return root, value - root * root


@native
def pari_real_square_root_abs(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Translate sqrtr_abs on nonzero real triples, including guard-word rules.

    The even-exponent branch retains an extra root word. Its exceptional
    guard comparison uses the retained root, exactly as the GMP kernel does.
    Precision is capped locally at the coordinated getfu working boundary.
    """
    if precision < 64 or precision > 4352 or precision % 64 != 0:
        raise ValueError("unsupported square root precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("square root requires a nonzero full mantissa")
    if exponent % 2 != 0:
        root, remainder = pari_sqrtrem_integer(magnitude << precision)
        if remainder > root:
            root += 1
    else:
        root, remainder = pari_sqrtrem_integer(magnitude << (precision + 127))
        guard = root % (1 << 64)
        root >>= 64
        if guard >= 1 << 63 or (guard == (1 << 63) - 1 and remainder > root):
            root += 1
    return root, precision, exponent // 2
