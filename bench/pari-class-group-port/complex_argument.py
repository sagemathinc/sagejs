"""PARI 2.17.4 `trans2.c:mparg` on explicit real components.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is the real-component leaf of `garg`, not a replacement `atan2` formula.
"""

from sagejs.native import IntegerBuffer, native

from .pi_constant import pari_pi_constant
from .real_arctangent import pari_real_arctangent
from .real_division import pari_real_division
from .short_product import pari_signed_real_sum


@native
def pari_real_components_argument(
    mx: int,
    px: int,
    ex: int,
    my: int,
    py: int,
    ey: int,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Preserve the axis, exponent comparison and quadrant branches of mparg.

    Each nonzero component is a full 64..448-bit mantissa. Zero components
    carry their upstream absolute-error exponent and no mantissa precision.
    Both zero is excluded by the upstream caller. Inherited arctangent and
    constant construction limits remain explicit experimental boundaries.
    """
    if mx == 0 and my == 0:
        raise ValueError("argument of zero")
    if (mx == 0 and px != 0) or (my == 0 and py != 0):
        raise ValueError("zero components carry no mantissa precision")
    if mx != 0:
        if px < 64 or px > 448 or px % 64 != 0 or abs(mx).bit_length() != px:
            raise ValueError("unsupported real-component precision")
    if my != 0:
        if py < 64 or py > 448 or py % 64 != 0 or abs(my).bit_length() != py:
            raise ValueError("unsupported imaginary-component precision")
    if my == 0:
        if mx > 0:
            return 0, 0, ey - ex
        return pari_pi_constant(px, pi_cache, a, b, p, q, stack)
    precision = py
    if px > precision:
        precision = px
    if mx == 0:
        cm, cp, ce = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
        if my < 0:
            cm = -cm
        return cm, cp, ce - 1
    if ex - ey > -2:
        zm, zp, ze = pari_real_division(my, py, ey, mx, px, ex)
        zm, zp, ze = pari_real_arctangent(zm, zp, ze, pi_cache, a, b, p, q, stack)
        if mx > 0:
            return zm, zp, ze
        cm, cp, ce = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
        if my < 0:
            cm = -cm
        return pari_signed_real_sum(zm, zp, ze, cm, cp, ce)
    zm, zp, ze = pari_real_division(mx, px, ex, my, py, ey)
    zm, zp, ze = pari_real_arctangent(zm, zp, ze, pi_cache, a, b, p, q, stack)
    cm, cp, ce = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    if my < 0:
        cm = -cm
    return pari_signed_real_sum(-zm, zp, ze, cm, cp, ce - 1)
