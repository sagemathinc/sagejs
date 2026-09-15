"""PARI 2.17.4 generic real/rational scalar dispatch for regulator matrices.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Triples encode real mantissa/precision/exponent, exact integers with p=-1,
and reduced fractions with p=-2 and the positive denominator in e. Operands
are distinct values: PARI pointer-identity square optimizations are excluded.
The real division window is bounded; no Newton reciprocal is substituted.
"""

from math import gcd
from sagejs.native import IntegerBuffer, native

from .integer_real_product import pari_integer_real_product
from .integer_real_sum import pari_integer_real_sum
from .real_conversion import pari_integer_to_real, pari_rational_to_real
from .real_division import pari_real_division
from .short_product import (
    pari_short_product,
    pari_signed_real_sum,
    pari_real_integer_division,
)


@native
def pari_validate_regulator_values(values: IntegerBuffer, count: int) -> int:
    if count < 0 or len(values) < 3 * count:
        raise ValueError("short regulator scalar input")
    for i in range(count):
        m, p, e = values[3 * i], values[3 * i + 1], values[3 * i + 2]
        if p == -1:
            if e != 0:
                raise ValueError("invalid exact integer")
        elif p == -2:
            if m == 0 or e <= 1 or gcd(m, e) != 1:
                raise ValueError("invalid reduced fraction")
        elif m == 0:
            if p != 0:
                raise ValueError("invalid real zero")
        elif p < 64 or p > 1856 or p % 64 != 0 or abs(m).bit_length() != p:
            raise ValueError("invalid regulator real")
    return 0


@native
def pari_regulator_qmake(n: int, d: int) -> tuple[int, int, int]:
    """Construct already-coprime numerator/denominator (no extra gcd)."""
    if d == 0:
        raise ZeroDivisionError("zero rational denominator")
    if d < 0:
        n, d = -n, -d
    if n == 0 or d == 1:
        return n, -1, 0
    return n, -2, d


@native
def pari_regulator_qdiv(n: int, d: int) -> tuple[int, int, int]:
    if d == 0:
        raise ZeroDivisionError("zero rational denominator")
    g = gcd(n, d)
    return pari_regulator_qmake(n // g, d // g)


@native
def pari_regulator_fraction_sum(n: int, d: int, v: int, w: int) -> tuple[int, int, int]:
    """gen1.c addsub_frac/addsub_frac_i, preserving denominator branches."""
    if d == w:
        return pari_regulator_qdiv(n + v, d)
    if d < w:
        q, r = w // d, w % d
        if r == 0:
            a, p, b = pari_regulator_qdiv(q * n + v, d)
            if p == -1:
                return pari_regulator_qmake(a, q)
            return pari_regulator_qmake(a, b * q)
        delta = gcd(d, r)
    else:
        q, r = d // w, d % w
        if r == 0:
            a, p, b = pari_regulator_qdiv(n + q * v, w)
            if p == -1:
                return pari_regulator_qmake(a, q)
            return pari_regulator_qmake(a, b * q)
        delta = gcd(w, r)
    if delta == 1:
        return pari_regulator_qmake(n * w + v * d, d * w)
    d, w = d // delta, w // delta
    n = n * w + v * d
    q = abs(n) // delta
    if n < 0:
        q = -q
    r = n - q * delta
    if r == 0:
        return pari_regulator_qmake(q, d * w)
    g = gcd(delta, r)
    if g != 1:
        n, delta = n // g, delta // g
    return pari_regulator_qmake(n, d * w * delta)


@native
def pari_regulator_scalar_add(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> tuple[int, int, int]:
    if ap == -1:
        if bp == -1:
            return am + bm, -1, 0
        if bp == -2:
            return pari_regulator_qmake(bm + be * am, be)
        return pari_integer_real_sum(am, bm, bp, be)
    if bp == -1:
        if ap == -2:
            return pari_regulator_qmake(am + ae * bm, ae)
        return pari_integer_real_sum(bm, am, ap, ae)
    if ap == -2 and bp == -2:
        return pari_regulator_fraction_sum(am, ae, bm, be)
    if ap >= 0 and bp >= 0:
        return pari_signed_real_sum(am, ap, ae, bm, bp, be)
    if ap == -2:
        am, bm, ap, bp, ae, be = bm, am, bp, ap, be, ae
    if am == 0:
        bits = abs(bm).bit_length() - be.bit_length() - ae
        if bits <= 0:
            return am, ap, ae
        return pari_rational_to_real(bm, be, 64 * ((bits + 63) // 64))
    am, ap, ae = pari_integer_real_product(be, am, ap, ae)
    am, ap, ae = pari_integer_real_sum(bm, am, ap, ae)
    return pari_real_integer_division(be, am, ap, ae)


@native
def pari_regulator_scalar_multiply(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> tuple[int, int, int]:
    if ap >= 0 and bp >= 0:
        return pari_short_product(am, ap, ae, bm, bp, be)
    if ap >= 0:
        am, bm, ap, bp, ae, be = bm, am, bp, ap, be, ae
    if ap == -1:
        if bp == -1:
            return am * bm, -1, 0
        if am == 0:
            return 0, -1, 0
        if bp == -2:
            g = gcd(am, be)
            return pari_regulator_qmake((am // g) * bm, be // g)
        return pari_integer_real_product(am, bm, bp, be)
    if bp == -1:
        if bm == 0:
            return 0, -1, 0
        g = gcd(bm, ae)
        return pari_regulator_qmake((bm // g) * am, ae // g)
    if bp == -2:
        g, h = gcd(am, be), gcd(ae, bm)
        return pari_regulator_qmake((am // g) * (bm // h), (ae // h) * (be // g))
    if abs(am) == 1:
        bm, bp, be = pari_real_integer_division(ae, bm, bp, be)
        if am < 0:
            bm = -bm
        return bm, bp, be
    bm, bp, be = pari_integer_real_product(am, bm, bp, be)
    return pari_real_integer_division(ae, bm, bp, be)


@native
def pari_regulator_divir(n: int, m: int, p: int, e: int) -> tuple[int, int, int]:
    """Raw divir, distinct from gdiv's integer +/-1 inverse shortcut."""
    if m == 0:
        raise ZeroDivisionError("zero real denominator")
    if p < 64 or p > 1856 or p % 64 != 0:
        raise ValueError("division outside basecase window")
    if n == 0:
        return 0, 0, -p - e
    if abs(n).bit_length() <= 64:
        nm, np, ne = pari_integer_to_real(abs(n), p + 64)
        nm, np, ne = pari_real_division(nm, np, ne, m, p, e)
        if n < 0:
            nm = -nm
        return nm, np, ne
    nm, np, ne = pari_integer_to_real(n, p + 64)
    return pari_real_division(nm, np, ne, m, p, e)


@native
def pari_regulator_scalar_divide(
    am: int, ap: int, ae: int, bm: int, bp: int, be: int
) -> tuple[int, int, int]:
    if bm == 0:
        raise ZeroDivisionError("zero scalar denominator")
    if ap == -1:
        if bp == -1:
            return pari_regulator_qdiv(am, bm)
        if am == 0:
            return 0, -1, 0
        if bp == -2:
            g = gcd(am, bm)
            return pari_regulator_qmake((am // g) * be, bm // g)
        if abs(am) == 1:
            if bp < 64 or bp > 1856 or bp % 64 != 0:
                raise ValueError("reciprocal outside basecase window")
            if am < 0:
                bm = -bm
            return pari_real_division(1 << (bp + 63), bp + 64, 0, bm, bp, be)
        return pari_regulator_divir(am, bm, bp, be)
    if ap == -2:
        if bp == -1:
            g = gcd(am, bm)
            return pari_regulator_qmake(am // g, ae * (bm // g))
        if bp == -2:
            g, h = gcd(am, bm), gcd(ae, be)
            return pari_regulator_qmake((am // g) * (be // h), (ae // h) * (bm // g))
        bm, bp, be = pari_integer_real_product(ae, bm, bp, be)
        return pari_regulator_divir(am, bm, bp, be)
    if bp == -1:
        return pari_real_integer_division(bm, am, ap, ae)
    if bp == -2:
        am, ap, ae = pari_integer_real_product(be, am, ap, ae)
        return pari_real_integer_division(bm, am, ap, ae)
    return pari_real_division(am, ap, ae, bm, bp, be)
