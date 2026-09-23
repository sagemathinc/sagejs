"""Word-modulus arithmetic dependencies for PARI 2.17.4 composite HNF.

Copyright (C) 2000-2003 The PARI group. GPL-2.0-or-later, without warranty.
`kernel/gmp/gcdext.c:bezout` word branch and `kernel/none/gcdll.c:xxgcduu`,
then `base4.c:Fl_invgen/u_ppo` and `arith1.c:Fp_invgen` word branch.
Exact Python operations replace machine arithmetic; explicit reductions preserve
unsigned recurrence wrap. No equal arithmetic-backend cost is presumed.
"""

from math import gcd
from sagejs.native import native
from .relation_cache import pari_word_mod_inverse


@native
def pari_word_bezout(left: int, right: int) -> tuple[int, int, int]:
    """Return PARI's exact (g,u,v) choice for signed single-word operands."""
    a = abs(left)
    b = abs(right)
    if a >= 18446744073709551616 or b >= 18446744073709551616:
        raise ValueError("multiword Bezout remains an external dependency")
    swapped = a < b
    if swapped:
        a, b = b, a
        left, right = right, left
    if b == 0:
        u = 0
        if left > 0:
            u = 1
        elif left < 0:
            u = -1
        if swapped:
            return (a, 0, u)
        return (a, u, 0)
    if a == b:
        if right > 0:
            return (a, 0, 1)
        return (a, 0, -1)
    xu = 1
    xv1 = 1
    xu1 = 0
    xv = 0
    xs = 0
    result = 0
    while b > 1:
        a -= b
        if a >= b:
            q = 1 + a // b
            a %= b
            xv = (xv + q * xv1) % 18446744073709551616
            xu = (xu + q * xu1) % 18446744073709551616
        else:
            xv = (xv + xv1) % 18446744073709551616
            xu = (xu + xu1) % 18446744073709551616
        if a <= 1:
            xs = 1
            break
        b -= a
        if b >= a:
            q = 1 + b // a
            b %= a
            xv1 = (xv1 + q * xv) % 18446744073709551616
            xu1 = (xu1 + q * xu) % 18446744073709551616
        else:
            xv1 = (xv1 + xv) % 18446744073709551616
            xu1 = (xu1 + xu) % 18446744073709551616
    if xs != 0 and a == 1:
        xv1 = (xv1 + b * xv) % 18446744073709551616
        xu1 = (xu1 + b * xu) % 18446744073709551616
        xs = 0
        result = 1
    elif xs == 0 and b == 1:
        xv = (xv + a * xv1) % 18446744073709551616
        xu = (xu + a * xu1) % 18446744073709551616
        xs = 1
        result = 1
    if xs != 0:
        u = -xu1
        v = xv1
        if result == 0:
            result = b
    else:
        u = xu
        v = -xv
        if result == 0:
            result = a
    if left < 0:
        u = -u
    if right < 0:
        v = -v
    if swapped:
        return (result, v, u)
    return (result, u, v)


@native
def pari_word_inverse_generator(value: int, modulus: int) -> tuple[int, int]:
    """Return (gcd,value multiplier), matching Fp_invgen's word branch.

    For a nonzero residue the multiplier is a unit mod modulus, not merely a
    Bezout coefficient. The upstream zero-residue case returns (modulus,0).
    """
    if modulus < 2 or modulus >= 18446744073709551616:
        raise ValueError("unsupported inverse-generator modulus")
    value %= modulus
    if value == 0:
        return (modulus, 0)
    d, unused, v = pari_word_bezout(modulus, value)
    v %= modulus
    if d == 1:
        return (d, v)
    e = modulus // d
    d0 = d
    f = e
    while True:
        f = gcd(d0, f)
        if f == 1:
            break
        d0 //= f
    if d0 == 1:
        return (d, v)
    quotient = d // d0
    e = (e // gcd(e, quotient)) * quotient
    inverse = pari_word_mod_inverse(e % d0, d0)
    # u_chinese_post uses Fl_sub/Fl_add (single corrections), not a final
    # canonical remainder. v can exceed the smaller CRT modulus here.
    # Preserve that word behavior rather than choosing an equivalent unit.
    modulus_crt = e * d0
    delta = (1 - v) % 18446744073709551616
    if 1 < v:
        delta = (delta + modulus_crt) % 18446744073709551616
    term = (e * inverse * delta) % modulus_crt
    result = (v + term) % 18446744073709551616
    if result < v or result >= modulus_crt:
        result = (result - modulus_crt) % 18446744073709551616
    return (d, result)
