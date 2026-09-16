# sagejs: native-bitwise
"""PARI 2.17.4 `Flx_roots_pre` degree <=4, prime 2 or odd prime <=37.

Odd-prime degree <=2 also delegates to the broader quadratic corridor.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Preserve valuation, cut_out_roots, square/nonsquare splitting and deterministic
x+k queue processing. No root enumeration replaces splitting: the only bulk
root publication is the exact source all-roots/square/nonsquare branch.
Nine-slot Flx primitives retain their documented representation differences.
A separate literal basecase remainder permits the source monomial x^18.
Quadratic scalar pre-reduction primitives use exact product modulo p as
documented in small_prime_quadratic_roots, with its source powering schedule.
"""

from sagejs.native import IntegerBuffer, native
from .f2x_small import _f2x_xor
from .flx_small import pari_flx_copy, pari_flx_normalize, pari_flx_gcd, pari_flx_div
from .flx_small_power import pari_flxq_powu
from .flx_small_factor import pari_flx_small_krouu_odd
from .small_prime_quadratic_roots import (
    pari_small_prime_sqrt_pre,
    pari_small_prime_nonsquare,
    pari_small_prime_quadratic_roots,
)
from .relation_cache import pari_word_mod_inverse


@native
def pari_small_prime_polynomial_roots_workspace_size() -> int:
    """12 nine-slot polynomials, 4 degrees, 4 roots, 90 scratch, 2*19 extended."""
    return 244


@native
def _roots_valrem(w: IntegerBuffer, a: int, degree: int) -> int:
    v = 0
    while v <= degree and w[a + v] == 0:
        v += 1
    for i in range(degree - v + 1):
        w[a + i] = w[a + i + v]
    for i in range(degree - v + 1, 9):
        w[a + i] = 0
    return degree - v


@native
def _roots_mod_xn(
    w: IntegerBuffer, a: int, degree: int, n: int, plus: int, p: int, out: int
) -> int:
    if degree < n:
        return pari_flx_copy(w, a, degree, out)
    for i in range(n):
        w[out + i] = w[a + i]
    j = 0
    sign = -1
    for i in range(n, degree + 1):
        if plus != 0 and sign == -1:
            value = w[out + j] - w[a + i]
            if value < 0:
                value += p
        else:
            value = w[out + j] + w[a + i]
            if value >= p:
                value -= p
        w[out + j] = value
        j += 1
        if j == n:
            j = 0
            sign = -sign
    for i in range(n, 9):
        w[out + i] = 0
    d = n - 1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return d


@native
def _roots_monomial_remainder(
    w: IntegerBuffer, exponent: int, b: int, degree: int, p: int, out: int
) -> int:
    """Literal Flx_divrem_basecase for x^exponent, 1<=degree<exponent<=18.

    Extended source dividend occupies206..224; quotient225..243. Source
    quotient recurrence and remainder recurrence are unchanged; tail stores
    initialize fixed-capacity owners instead of allocating variable GENs.
    """
    a = 206
    quot = 225
    for i in range(19):
        w[a + i] = 0
        w[quot + i] = 0
    w[a + exponent] = 1
    inv = 1
    if w[b + degree] != 1:
        inv = pari_word_mod_inverse(w[b + degree], p)
    dz = exponent - degree
    dy = degree - 1
    while dy >= 0 and w[b + dy] == 0:
        dy -= 1
    w[quot + dz] = inv * w[a + exponent] % p
    for i in range(exponent - 1, degree - 1, -1):
        total = p - w[a + i]
        j = i - dy
        while j <= i and j <= dz:
            total += w[quot + j] * w[b + i - j]
            if total >= 9223372036854775808:
                total %= p
            j += 1
        total %= p
        if total != 0:
            w[quot + i - degree] = (p - total) * inv % p
    for i in range(degree):
        total = w[quot] * w[b + i]
        j = i - dy
        if j < 1:
            j = 1
        while j <= i and j <= dz:
            total += w[quot + j] * w[b + i - j]
            if total >= 9223372036854775808:
                total %= p
            j += 1
        value = w[a + i] - total % p
        if value < 0:
            value += p
        w[out + i] = value
    for i in range(degree, 9):
        w[out + i] = 0
    d = degree - 1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return d


@native
def _roots_quad(w: IntegerBuffer, a: int, p: int, unknown: int) -> int:
    b = w[a + 1]
    c = w[a]
    c += c
    if c >= p:
        c -= p
    c += c
    if c >= p:
        c -= p
    d = b * b % p - c
    if d < 0:
        d += p
    if unknown != 0 and pari_flx_small_krouu_odd(d, p) == -1:
        return p
    s = pari_small_prime_sqrt_pre(d, p)
    if s < 0:
        return p
    r = s - b
    if r < 0:
        r += p
    if r % 2 != 0:
        r += p
    return r // 2


@native
def _roots_sort(w: IntegerBuffer, n: int) -> int:
    """perm.c vecsmall_sort: tiny counting sort or split1+2 / split2+2 merge."""
    if n <= 1:
        return 0
    maximum = -1
    for i in range(n):
        if w[112 + i] > maximum:
            maximum = w[112 + i]
            if maximum >= n + 1:
                maximum = -1
                break
    if maximum >= 0:
        for i in range(maximum + 1):
            w[116 + i] = 0
        for i in range(n):
            w[116 + w[112 + i]] += 1
        at = 0
        for i in range(maximum + 1):
            for j in range(w[116 + i]):
                w[112 + at] = i
                at += 1
        return 0
    if n == 2:
        if w[112] > w[113]:
            value = w[112]
            w[112] = w[113]
            w[113] = value
        return 0
    nx = n // 2
    for i in range(n):
        w[116 + i] = w[112 + i]
    if nx == 2 and w[116] > w[117]:
        value = w[116]
        w[116] = w[117]
        w[117] = value
    if w[116 + nx] > w[117 + nx]:
        value = w[116 + nx]
        w[116 + nx] = w[117 + nx]
        w[117 + nx] = value
    ix = 0
    iy = nx
    at = 0
    while ix < nx and iy < n:
        if w[116 + ix] <= w[116 + iy]:
            w[112 + at] = w[116 + ix]
            ix += 1
        else:
            w[112 + at] = w[116 + iy]
            iy += 1
        at += 1
    while ix < nx:
        w[112 + at] = w[116 + ix]
        ix += 1
        at += 1
    while iy < n:
        w[112 + at] = w[116 + iy]
        iy += 1
        at += 1
    return 0


@native
def pari_small_prime_polynomial_roots(
    coefficients: IntegerBuffer,
    degree: int,
    p: int,
    roots: IntegerBuffer,
    w: IntegerBuffer,
) -> int:
    """Sorted distinct roots, caller prime p; disjoint owners and atomic output.

    Working table queue capacity is four, bounded by degree. Return count;
    output tail unchanged. Larger primes are an explicit dependency frontier.
    """
    if degree < 0 or degree > 4 or p < 2 or (p != 2 and p % 2 == 0):
        raise ValueError("small polynomial roots degree/prime frontier")
    if len(coefficients) < degree + 1 or len(roots) < 4 or len(w) < 244:
        raise ValueError("insufficient small polynomial roots storage")
    if degree <= 2 and p != 2:
        return pari_small_prime_quadratic_roots(coefficients, degree, p, roots)
    if p > 37:
        raise ValueError("small polynomial roots degree/prime frontier")
    for i in range(9):
        w[i] = 0
    for i in range(degree + 1):
        w[i] = coefficients[i] % p
    while degree >= 0 and w[degree] == 0:
        degree -= 1
    if degree < 0:
        raise ValueError("roots of zero polynomial")
    if degree == 0:
        return 0
    done = 0
    sort_needed = 0
    if p == 2:
        parity = _f2x_xor(w[0], 1)
        for i in range(1, degree):
            parity = _f2x_xor(parity, w[i])
        if w[0] == 0:
            w[112] = 0
            done = 1
        if parity == 0:
            w[112 + done] = 1
            done += 1
    else:
        original_degree = degree
        degree = _roots_valrem(w, 0, degree)
        if degree != original_degree:
            w[112] = 0
            done = 1
        pari_flx_normalize(w, 0, degree, p, 54)
        pari_flx_copy(w, 54, degree, 0)
        if degree == 1:
            w[112 + done] = p - w[0]
            done += 1
        elif degree == 2:
            r = _roots_quad(w, 0, p, 1)
            if r != p:
                s = w[1] + r
                if s >= p:
                    s -= p
                if s != 0:
                    s = p - s
                if r > s:
                    r, s = s, r
                w[112 + done] = r
                done += 1
                if s != r:
                    w[112 + done] = s
                    done += 1
        elif degree != 0:
            dg = _roots_mod_xn(w, 0, degree, p - 1, 0, p, 9)
            todo = 0
            if dg < 0:
                first = 1
                if done != 0:
                    first = 0
                done = 0
                for i in range(first, p):
                    w[112 + done] = i
                    done += 1
            else:
                sort_needed = 1
                if degree >= p - 1:
                    dg = _roots_valrem(w, 9, dg)
                if dg != 0:
                    q = p // 2
                    # All admitted odd primes/degree3..4 take source small-p branch.
                    if p // 16 > dg:
                        raise ValueError("small polynomial roots large-p cut frontier")
                    dxt = -2
                    if dg < q:
                        dxt = _roots_monomial_remainder(w, q, 9, dg, p, 27)
                    for plus in range(2):
                        da = _roots_mod_xn(w, 9, dg, q, plus, p, 18)
                        if da < 0:
                            z = 1
                            if plus != 0:
                                if p % 4 == 3:
                                    z = p - 1
                                else:
                                    z = pari_small_prime_nonsquare(p)
                            w[112 + done] = z
                            done += 1
                            for i in range(2, q + 1):
                                r = i * i % p
                                if plus != 0:
                                    r = z * r % p
                                w[112 + done] = r
                                done += 1
                        else:
                            if dg >= q:
                                da = _roots_valrem(w, 18, da)
                            if da != 0:
                                if dxt != -2:
                                    dh = pari_flx_copy(w, 27, dxt, 36)
                                    if dh < 0:
                                        dh = 0
                                else:
                                    for i in range(9):
                                        w[36 + i] = 0
                                    w[36 + q] = 1
                                    dh = q
                                if plus == 0:
                                    w[36] += p - 1
                                else:
                                    w[36] += 1
                                if w[36] >= p:
                                    w[36] -= p
                                while dh >= 0 and w[36 + dh] == 0:
                                    dh -= 1
                                dh = pari_flx_gcd(w, 18, da, 36, dh, p, 45, 116)
                                if dh != 0:
                                    pari_flx_normalize(w, 45, dh, p, 72 + todo * 9)
                                    w[108 + todo] = dh
                                    todo += 1
                for i in range(9):
                    w[63 + i] = 0
                w[64] = 1
                k = 1
                while todo != 0:
                    if k >= p:
                        raise ValueError(
                            "small polynomial roots nonprime split failure"
                        )
                    w[63] = k
                    j = 0
                    limit = todo
                    while j < limit:
                        a = 72 + j * 9
                        da = w[108 + j]
                        if da <= 2:
                            if da == 1:
                                r = p - w[a]
                                s = r
                            else:
                                r = _roots_quad(w, a, p, 0)
                                if r == p:
                                    raise ValueError("nonprime quadratic split failure")
                                s = w[a + 1] + r
                                if s >= p:
                                    s -= p
                                if s != 0:
                                    s = p - s
                            w[112 + done] = r
                            done += 1
                            todo -= 1
                            pari_flx_copy(w, 72 + todo * 9, w[108 + todo], a)
                            w[108 + j] = w[108 + todo]
                            if da == 2:
                                w[112 + done] = s
                                done += 1
                            limit -= 1
                        else:
                            db = pari_flxq_powu(w, 63, 1, p // 2, a, da, p, 18, 116)
                            if db > 0:
                                w[18] += p - 1
                                if w[18] >= p:
                                    w[18] -= p
                                db = pari_flx_gcd(w, a, da, 18, db, p, 45, 116)
                                if db != 0:
                                    pari_flx_normalize(w, 45, db, p, 36)
                                    dc = pari_flx_div(w, a, da, 36, db, p, 54, 116)
                                    pari_flx_copy(w, 36, db, a)
                                    w[108 + j] = db
                                    pari_flx_copy(w, 54, dc, 72 + todo * 9)
                                    w[108 + todo] = dc
                                    todo += 1
                            j += 1
                    k += 1
    if sort_needed != 0:
        _roots_sort(w, done)
    for i in range(done):
        roots[i] = w[112 + i]
    return done
