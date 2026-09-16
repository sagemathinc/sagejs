"""PARI 2.17.4 `lll.c` extended-exponent arithmetic for the DPE LLL pass.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Upstream credits the dpe work of Patrick Pelissier and Paul Zimmermann.
The pinned 64-bit PARI ABI uses -LONG_MAX as the normalized zero exponent.
Tuples carry a binary64 significand and an exact integer exponent; no Python
tuple allocation occurs inside the compiled transitive call graph.
"""

from math import frexp, ldexp

from sagejs.native import Float64Buffer, native

from .lll_float_preparation import pari_lll_divide, pari_lll_integer_to_double


@native
def pari_dpe_normalize(value: float, exponent: int) -> tuple[float, int]:
    """`dpe_normalize`, preserving signed zero but replacing its exponent."""
    if value == 0.0:
        return value, -9223372036854775807
    mantissa, adjustment = frexp(value)
    return mantissa, exponent + adjustment


@native
def pari_dpe_integer(value: int, scratch: Float64Buffer) -> tuple[float, int]:
    """`affidpe`: retain its distinct zero exponent and two rounding steps."""
    exponent = pari_lll_integer_to_double(value, scratch)
    return scratch[0] * 0.5, exponent + 1


@native
def pari_dpe_multiply(x: float, xe: int, y: float, ye: int) -> tuple[float, int]:
    """`dpe_mulz`; the zero branch precedes exponent addition upstream."""
    value = x * y
    if value == 0.0:
        return value, -9223372036854775807
    mantissa, adjustment = frexp(value)
    return mantissa, xe + ye + adjustment


@native
def pari_dpe_divide(x: float, xe: int, y: float, ye: int) -> tuple[float, int]:
    """`dpe_divz`, using the already explicit C division policy."""
    value = pari_lll_divide(x, y)
    if value == 0.0:
        return value, -9223372036854775807
    mantissa, adjustment = frexp(value)
    return mantissa, xe - ye + adjustment


@native
def pari_dpe_add(x: float, xe: int, y: float, ye: int) -> tuple[float, int]:
    """`dpe_addz`: discard the smaller term only beyond the 53-bit gap."""
    if xe > ye + 53:
        return x, xe
    if ye > xe + 53:
        return y, ye
    difference = xe - ye
    if difference >= 0:
        value = x + ldexp(y, -difference)
        exponent = xe
    else:
        value = y + ldexp(x, difference)
        exponent = ye
    return pari_dpe_normalize(value, exponent)


@native
def pari_dpe_subtract(x: float, xe: int, y: float, ye: int) -> tuple[float, int]:
    """`dpe_subz`, preserving the upstream operand and rounding order."""
    if xe > ye + 53:
        return x, xe
    if ye > xe + 53:
        return -y, ye
    difference = xe - ye
    if difference >= 0:
        value = x - ldexp(y, -difference)
        exponent = xe
    else:
        value = ldexp(x, difference) - y
        exponent = ye
    return pari_dpe_normalize(value, exponent)


@native
def pari_dpe_subtract_product(
    x: float, xe: int, y: float, ye: int, z: float, ze: int
) -> tuple[float, int]:
    """`dpe_submulz`, retaining multiplication normalization before subtraction."""
    product, exponent = pari_dpe_multiply(y, ye, z, ze)
    return pari_dpe_subtract(x, xe, product, exponent)


@native
def pari_dpe_compare(x: float, xe: int, y: float, ye: int) -> int:
    """`dpe_cmp` returns the sign difference, which can be +/-2."""
    sx = 0
    sy = 0
    if x < 0.0:
        sx = -1
    elif x > 0.0:
        sx = 1
    if y < 0.0:
        sy = -1
    elif y > 0.0:
        sy = 1
    difference = sx - sy
    if difference != 0:
        return difference
    if xe > ye:
        if sx > 0:
            return 1
        return -1
    if ye > xe:
        if sx > 0:
            return -1
        return 1
    if x < y:
        return -1
    if x > y:
        return 1
    return 0
