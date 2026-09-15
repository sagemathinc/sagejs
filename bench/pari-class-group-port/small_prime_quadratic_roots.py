"""PARI 2.17.4 degree-at-most-two `FpX_roots` odd-prime source corridor.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: FpX_factor.c Flx_roots_pre/Flx_quad_root, arith1.c Fl_sqrt_pre_i,
Fl_powu_pre/Fl_2powu_pre and nonsquare1_Fl. The nonzero-PI power schedule
is retained even for small p. Reciprocal-based Fl_mul_pre/Fl_sqr_pre are
explicitly mapped to exact product modulo p, not claimed instruction-identical.
Deterministic nonsquare candidates 2,3,5,7 are supported; the prime iterator
11..1967 is an explicit frontier. Both required primes 3 and 37 use 2.
"""

from sagejs.native import IntegerBuffer, native

from .flx_small_factor import pari_flx_small_krouu_odd
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_pow_pre(x: int, exponent: int, p: int) -> int:
    """Nonzero-PI Fl_powu_pre, including its distinct base-two schedule."""
    if exponent < 0 or p < 3 or p > 3037000493 or x < 0 or x >= p:
        raise ValueError("unsupported small prime modular power domain")
    if exponent <= 1:
        if exponent == 1:
            return x
        return 1
    if x <= 2:
        if x != 2:
            return x
        y = 2
        bit = 1
        while bit <= exponent // 2:
            bit *= 2
        bit //= 2
        while bit != 0:
            y = y * y % p
            if (exponent // bit) % 2 != 0:
                y += y
                if y >= p:
                    y -= p
            bit //= 2
        return y
    y = 1
    z = x
    n = exponent
    while True:
        if n % 2 != 0:
            y = y * z % p
        n //= 2
        if n == 0:
            return y
        z = z * z % p


@native
def pari_small_prime_nonsquare(p: int) -> int:
    """nonsquare1_Fl's first four candidates; caller requires prime p=1 mod 4.

    This is the precondition established by the sqrt caller's e>1 branch,
    not a general nonsquare finder for every odd prime.
    """
    if p % 8 != 1:
        return 2
    q = p % 3
    if q == 2:
        return 3
    if q == 0:
        raise ValueError("nonprime quadratic roots modulus")
    q = p % 5
    if q == 2 or q == 3:
        return 5
    if q == 0:
        raise ValueError("nonprime quadratic roots modulus")
    q = p % 7
    if q != 4 and q >= 3:
        return 7
    if q == 0:
        raise ValueError("nonprime quadratic roots modulus")
    raise ValueError("quadratic roots nonsquare prime iterator frontier")


@native
def pari_small_prime_sqrt_pre(a: int, p: int) -> int:
    """Fl_sqrt_pre_i(a,0,p,PI), with -1 replacing ULONG_MAX failure."""
    if p < 3 or p > 3037000493 or p % 2 == 0 or a < 0 or a >= p:
        raise ValueError("unsupported small prime square root domain")
    if a == 0:
        return 0
    q = p - 1
    e = 0
    while q % 2 == 0:
        q //= 2
        e += 1
    if e == 1:
        v = pari_small_prime_pow_pre(a, (p + 1) // 4, p)
        if v * v % p != a:
            return -1
        if v > p - v:
            v = p - v
        return v
    p1 = pari_small_prime_pow_pre(a, q // 2, p)
    if p1 == 0:
        return 0
    v = a * p1 % p
    w = v * p1 % p
    y = pari_small_prime_pow_pre(pari_small_prime_nonsquare(p), q, p)
    while w != 1:
        p1 = w * w % p
        k = 1
        while p1 != 1 and k < e:
            p1 = p1 * p1 % p
            k += 1
        if k == e:
            return -1
        p1 = y
        for i in range(1, e - k):
            p1 = p1 * p1 % p
        y = p1 * p1 % p
        e = k
        w = y * w % p
        v = v * p1 % p
    if v > p - v:
        v = p - v
    return v


@native
def pari_small_prime_quadratic_roots(
    coefficients: IntegerBuffer, degree: int, p: int, roots: IntegerBuffer
) -> int:
    """Sorted distinct roots; ascending coefficients, disjoint output owner.

    Primehood is a caller precondition. The polynomial is reduced, trimmed,
    stripped of its x valuation, and normalized in that source order. The
    constant residual after stripping is the trivial singleton-zero branch
    of Flx_roots_pre's split setup. Zero polynomial raises before output writes.
    Output storage must hold two roots; entries beyond returned count unchanged.
    """
    if degree < 0 or degree > 2 or p < 3 or p > 3037000493 or p % 2 == 0:
        raise ValueError("unsupported small prime quadratic roots domain")
    if len(coefficients) < degree + 1 or len(roots) < 2:
        raise ValueError("insufficient small prime quadratic roots storage")
    c = coefficients[0] % p
    b = 0
    a = 0
    if degree >= 1:
        b = coefficients[1] % p
    if degree == 2:
        a = coefficients[2] % p
    if a == 0:
        degree = 1
        if b == 0:
            degree = 0
    if degree == 0:
        if c == 0:
            raise ValueError("roots of zero polynomial")
        return 0
    valuation = 0
    if c == 0:
        valuation = 1
        c = b
        b = a
        a = 0
        degree -= 1
        if c == 0:
            c = b
            degree -= 1
    if degree == 0:
        if c != 1:
            inverse = pari_word_mod_inverse(c, p)
        roots[0] = 0
        return 1
    if degree == 1:
        if b != 1:
            c = c * pari_word_mod_inverse(b, p) % p
        if valuation != 0:
            roots[0] = 0
            roots[1] = p - c
            return 2
        roots[0] = p - c
        return 1
    if a != 1:
        inverse = pari_word_mod_inverse(a, p)
        c = c * inverse % p
        b = b * inverse % p
    doubled = c + c
    if doubled >= p:
        doubled -= p
    four = doubled + doubled
    if four >= p:
        four -= p
    discriminant = b * b % p - four
    if discriminant < 0:
        discriminant += p
    if pari_flx_small_krouu_odd(discriminant, p) == -1:
        return 0
    s = pari_small_prime_sqrt_pre(discriminant, p)
    if s == -1:
        return 0
    r = s - b
    if r < 0:
        r += p
    if r % 2 != 0:
        r += p
    r //= 2
    s = b + r
    if s >= p:
        s -= p
    if s != 0:
        s = p - s
    if r < s:
        roots[0] = r
        roots[1] = s
        return 2
    if r > s:
        roots[0] = s
        roots[1] = r
        return 2
    roots[0] = s
    return 1
