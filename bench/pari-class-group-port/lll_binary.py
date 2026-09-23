"""PARI 2.17.4 Qfb.c reduction used by lll.c's two-dimensional shortcut.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Forms beyond QFBRED_LIMIT require the unported recursive upstream algorithm.
"""

from sagejs.native import native


@native
def pari_binary_reduce(
    a: int, b: int, c: int
) -> tuple[int, int, int, int, int, int, int]:
    """qfbredsl2_imag_basecase, returning (a,b,c,u1,u2,v1,v2)."""
    discriminant = b * b - 4 * a * c
    if a <= 0 or discriminant >= 0:
        raise ValueError("binary reduction requires a positive definite form")
    largest = a.bit_length() - 1
    if abs(b).bit_length() - 1 > largest:
        largest = abs(b).bit_length() - 1
    if c.bit_length() - 1 > largest:
        largest = c.bit_length() - 1
    if 2 * largest - (abs(discriminant).bit_length() - 1) > 9000:
        raise ValueError("recursive PARI binary reduction is not translated")
    original_b = b
    original_c = c
    u1 = 1
    u2 = 0
    if abs(b) > a:
        # dvmdii_round: b = q*2a + r with -a < r <= a.
        q = (b + a - 1) // (2 * a)
        r = b - q * 2 * a
        c -= q * ((b + r) >> 1)
        b = r
        u2 -= q * u1
    elif b == -a:
        b = -b
        u2 = 1
    while a > c:
        a, c = c, a
        b = -b
        u1, u2 = u2, -u1
        q = (b + a - 1) // (2 * a)
        r = b - q * 2 * a
        c -= q * ((b + r) >> 1)
        b = r
        u2 -= q * u1
    if a == c and b < 0:
        b = -b
        u1, u2 = u2, -u1
    z = (b - original_b) >> 1
    v1 = (z * u1 - a * u2) // original_c
    z -= b
    v2 = (z * u2 + c * u1) // original_c
    return a, b, c, u1, u2, v1, v2


@native
def pari_lll_binary(
    x00: int, x01: int, x10: int, x11: int
) -> tuple[int, int, int, int]:
    """ZM2_lll_norms for nonsingular 2x2 integer bases and LLL_IM only."""
    a = x00 * x00 + x10 * x10
    b = 2 * (x00 * x01 + x10 * x11)
    c = x01 * x01 + x11 * x11
    a, b, c, u1, u2, v1, v2 = pari_binary_reduce(a, b, c)
    return u1, u2, v1, v2
