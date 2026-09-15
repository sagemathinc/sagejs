"""Bézout adapter for the PARI HNF experiment's multiword boundary.

PARI 2.17.4 `kernel/gmp/gcdext.c:bezout` orders absolute operands before
calling GMP and restores input signs afterwards. This diagnostic uses the
exact Euclidean recurrence from Sage.js's `_cubic_extended_gcd` for that leaf.
It is written locally because importing that module requires the Sage.js FFI
runtime even in CPython. This arithmetic-backend substitution must remain
separate from claims about the cost of a faithful source translation.
This is explicitly not a translation or cost model of GMP's mpn_gcdext.
Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import native
from .hnf_word_arithmetic import pari_word_bezout


@native
def pari_hnf_bezout(left: int, right: int) -> tuple[int, int, int]:
    """Retain the word path; use exact Euclid for the multiword arithmetic leaf."""
    a = abs(left)
    b = abs(right)
    if a < 18446744073709551616 and b < 18446744073709551616:
        return pari_word_bezout(left, right)
    swapped = a < b
    if swapped:
        a, b = b, a
        left, right = right, left
    d = a
    remainder = b
    u = 1
    next_u = 0
    v = 0
    next_v = 1
    while remainder != 0:
        quotient = d // remainder
        d, remainder = remainder, d - quotient * remainder
        u, next_u = next_u, u - quotient * next_u
        v, next_v = next_v, v - quotient * next_v
    if left < 0:
        u = -u
    if right < 0:
        v = -v
    if swapped:
        return (d, v, u)
    return (d, u, v)
