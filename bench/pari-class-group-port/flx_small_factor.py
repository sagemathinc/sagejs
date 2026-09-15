"""PARI 2.17.4 odd-prime degree factorization, polynomial degree at most four.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: `FpX_factor.c` Flx_factor_squarefree_pre, Flx_ddf_Shoup,
Flx_simplefact_Cantor, vddf_to_simplefact, Flx_degfact_2; `arith1.c`
krouu_s; `RgX.c` brent_kung_optpow. Preserve constant squarefree layers,
Frobenius calls, and Shoup power-table/evaluation schedule. This is not
root counting or a replacement factorization algorithm.
"""

from sagejs.native import IntegerBuffer, native

from .flx_small import (
    pari_flx_copy,
    pari_flx_normalize,
    pari_flx_deriv,
    pari_flx_deflate,
    pari_flx_sub,
    pari_flx_div,
    pari_flx_gcd,
)
from .flx_small_power import pari_flxq_powu, pari_flxq_powers, pari_flx_flxqv_eval


@native
def pari_flx_small_factor_workspace_size() -> int:
    """Eight work polynomials, four layers/degrees, and exact DDF spans."""
    return 12 * 9 + 4 + 19 * 9 + 2 + 3 + 2 + 4 + 90


@native
def pari_flx_small_krouu_odd(x: int, y: int) -> int:
    """Literal krouu_s with initial sign one and odd positive denominator."""
    sign = 1
    while x != 0:
        valuation = 0
        while x % 2 == 0:
            valuation += 1
            x >>= 1
        if valuation != 0:
            residue = y & 7
            if valuation % 2 != 0 and (residue == 3 or residue == 5):
                sign = -sign
        if x & y & 2:
            sign = -sign
        temporary = y % x
        y = x
        x = temporary
    if y == 1:
        return sign
    return 0


@native
def pari_flx_small_optpow(degree: int, number: int) -> int:
    """brent_kung_optpow(degree, number, 1), including strict tie choice."""
    best = 1
    cost = number * (degree - 1)
    for power in range(2, degree + 1):
        candidate = power - 1 + number * ((degree - 1) // power)
        if candidate < cost:
            best = power
            cost = candidate
    return best


@native
def pari_flx_small_sort_factor(
    w: IntegerBuffer,
    scratch: int,
    count: int,
    degrees: IntegerBuffer,
    exponents: IntegerBuffer,
) -> int:
    """bibli2.c gen_sortspec cases 1--3 and its 2+2 merge, then sort_factor.

    Compare degrees only, preserving the source stable tie order. Twelve
    scratch entries hold original degrees, exponents, and the permutation.
    Return the active count for the buffered native ABI, not a new vector.
    """
    for i in range(count):
        w[scratch + i] = degrees[i]
        w[scratch + 4 + i] = exponents[i]
    order = scratch + 8
    if count == 1:
        w[order] = 0
    elif count == 2:
        if degrees[0] <= degrees[1]:
            w[order] = 0
            w[order + 1] = 1
        else:
            w[order] = 1
            w[order + 1] = 0
    elif count == 3:
        p0 = 0
        p1 = 1
        p2 = 2
        if degrees[0] <= degrees[1]:
            if degrees[1] > degrees[2]:
                if degrees[0] <= degrees[2]:
                    p1 = 2
                    p2 = 1
                else:
                    p0 = 2
                    p1 = 0
                    p2 = 1
        else:
            if degrees[0] <= degrees[2]:
                p0 = 1
                p1 = 0
            elif degrees[1] <= degrees[2]:
                p0 = 1
                p1 = 2
                p2 = 0
            else:
                p0 = 2
                p1 = 1
                p2 = 0
        w[order] = p0
        w[order + 1] = p1
        w[order + 2] = p2
    elif count == 4:
        a0 = 0
        a1 = 1
        b0 = 2
        b1 = 3
        if degrees[0] > degrees[1]:
            a0 = 1
            a1 = 0
        if degrees[2] > degrees[3]:
            b0 = 3
            b1 = 2
        ix = 0
        iy = 0
        output = 0
        while ix < 2 and iy < 2:
            a = a0
            b = b0
            if ix == 1:
                a = a1
            if iy == 1:
                b = b1
            if degrees[a] <= degrees[b]:
                w[order + output] = a
                ix += 1
            else:
                w[order + output] = b
                iy += 1
            output += 1
        while ix < 2:
            a = a0
            if ix == 1:
                a = a1
            w[order + output] = a
            output += 1
            ix += 1
        while iy < 2:
            b = b0
            if iy == 1:
                b = b1
            w[order + output] = b
            output += 1
            iy += 1
    for i in range(count):
        index = w[order + i]
        degrees[i] = w[scratch + index]
        exponents[i] = w[scratch + 4 + index]
    return count


@native
def pari_flx_small_quotient(
    w: IntegerBuffer, a: int, da: int, b: int, db: int, p: int, out: int, rem: int
) -> int:
    """Source quotient-only division: do not compute an unused remainder.

    The squarefree and DDF identities establish exactness; independent oracle
    checks, not the candidate work schedule, validate those identities.
    """
    return pari_flx_div(w, a, da, b, db, p, out, rem)


@native
def pari_flx_small_ddf(w: IntegerBuffer, t: int, dt: int, p: int, scratch: int) -> int:
    """Shoup for dt<=4; return offset of four component-degree slots.

    Scratch has nineteen polynomial spans, baby/giant degree tables (2+3),
    two F degrees, four f degrees, and shared ninety-slot primitive scratch.
    Polynomial T remains disjoint and unchanged. Degree-zero holes still
    compute Frobenius before the source DDF early return.
    """
    x = scratch
    xp = scratch + 9
    baby = scratch + 18
    giant = scratch + 36
    second_giant = scratch + 63
    h = scratch + 72
    tr = scratch + 90
    factors = scratch + 99
    e = scratch + 117
    u = scratch + 126
    quotient = scratch + 135
    remainder = scratch + 144
    difference = scratch + 153
    temporary = scratch + 162
    baby_degrees = scratch + 171
    giant_degrees = scratch + 173
    factor_degrees = scratch + 176
    output_degrees = scratch + 178
    work = scratch + 182
    for i in range(9):
        w[x + i] = 0
    w[x + 1] = 1
    dxp = pari_flxq_powu(w, x, 1, p, t, dt, p, xp, work)
    for i in range(4):
        w[output_degrees + i] = 0
    if dt == 0:
        return output_degrees
    if dt == 1:
        w[output_degrees] = 1
        return output_degrees
    # B=dt//2, l=isqrt(B)=1 throughout this declared degree corridor.
    # ro=0 and expu(p)>0 for odd primes: source takes baby-table else branch.
    number = dt // 2
    baby_power = pari_flx_small_optpow(dt, 0)
    pari_flxq_powers(w, xp, dxp, baby_power, t, dt, p, baby, baby_degrees, work)
    giant_power = pari_flx_small_optpow(dt, number - 1)
    pari_flxq_powers(w, xp, dxp, giant_power, t, dt, p, giant, giant_degrees, work)
    dg2 = -1
    if number == 2:
        dg2 = pari_flx_flxqv_eval(
            w,
            giant + 9,
            w[giant_degrees + 1],
            giant,
            giant_degrees,
            giant_power,
            t,
            dt,
            p,
            second_giant,
            work,
        )
    for j in range(number):
        g = giant + 9
        dg = w[giant_degrees + 1]
        if j == 1:
            g = second_giant
            dg = dg2
        dh = pari_flx_sub(w, g, dg, x, 1, p, h + j * 9)
        w[factor_degrees + j] = dh  # Reused after the first gcd stage.
    dtr = pari_flx_copy(w, t, dt, tr)
    for j in range(number):
        du = pari_flx_gcd(w, tr, dtr, h + j * 9, w[factor_degrees + j], p, u, work)
        if du != 0:
            du = pari_flx_normalize(w, u, du, p, temporary)
            pari_flx_copy(w, temporary, du, u)
            dtr = pari_flx_small_quotient(w, tr, dtr, u, du, p, quotient, remainder)
            pari_flx_copy(w, quotient, dtr, tr)
        pari_flx_copy(w, u, du, factors + j * 9)
        w[factor_degrees + j] = du
    for j in range(number):
        de = pari_flx_copy(w, factors + j * 9, w[factor_degrees + j], e)
        g = giant + 9
        dg = w[giant_degrees + 1]
        if j == 1:
            g = second_giant
            dg = dg2
        dd = pari_flx_sub(w, g, dg, x, 1, p, difference)
        du = pari_flx_gcd(w, e, de, difference, dd, p, u, work)
        if du != 0:
            w[output_degrees + j] = du
            # Source performs the division even though l=1 ends this loop.
            pari_flx_small_quotient(w, e, de, u, du, p, quotient, remainder)
    if dtr != 0:
        w[output_degrees + dtr - 1] = dtr
    return output_degrees


@native
def pari_flx_small_degfact(
    w: IntegerBuffer,
    a: int,
    degree: int,
    p: int,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    scratch: int,
) -> int:
    """Degree/exponent vector in source sort_factor order, odd small primes.

    Polynomial slots have stride nine; degree -1 denotes zero. Input and
    scratch spans, and output buffers, are disjoint. The caller supplies an
    actual prime. Primality is not retested. Output tails are untouched.
    """
    size = pari_flx_small_factor_workspace_size()
    if degree < 0 or degree > 4 or p < 3 or p % 2 == 0 or p > 3037000493:
        raise ValueError("unsupported Flx small factor domain")
    if a < 0 or scratch < 0 or a + 9 > len(w) or scratch + size > len(w):
        raise ValueError("short Flx small factor workspace")
    if a < scratch + size and scratch < a + 9:
        raise ValueError("overlapping Flx small factor workspace")
    if len(factor_degrees) < degree or len(factor_exponents) < degree:
        raise ValueError("short Flx small factor outputs")
    f = scratch
    derivative = scratch + 9
    r = scratch + 18
    t = scratch + 27
    v = scratch + 36
    tv = scratch + 45
    quotient = scratch + 54
    remainder = scratch + 63
    layers = scratch + 72
    layer_degrees = scratch + 108
    work = scratch + 112
    df = pari_flx_normalize(w, a, degree, p, f)
    if degree == 0:
        return 0
    if degree == 1:
        factor_degrees[0] = 1
        factor_exponents[0] = 1
        return 1
    if degree == 2:
        b = w[f + 1]
        c = w[f]
        doubled = c + c
        if doubled >= p:
            doubled -= p
        four_c = doubled + doubled
        if four_c >= p:
            four_c -= p
        discriminant = b * b % p - four_c
        if discriminant < 0:
            discriminant += p
        symbol = pari_flx_small_krouu_odd(discriminant, p)
        factor_exponents[0] = 1
        if symbol == -1:
            factor_degrees[0] = 2
            return 1
        factor_degrees[0] = 1
        if symbol == 0:
            factor_exponents[0] = 2
            return 1
        factor_degrees[1] = 1
        factor_exponents[1] = 1
        return 2
    for i in range(4):
        w[layer_degrees + i] = 0
        for j in range(9):
            w[layers + i * 9 + j] = 0
        w[layers + i * 9] = 1
    multiplicity = 1
    while True:
        dd = pari_flx_deriv(w, f, df, p, derivative)
        dr = pari_flx_gcd(w, f, df, derivative, dd, p, r, work)
        if dr == 0:
            w[layer_degrees + multiplicity - 1] = pari_flx_copy(
                w, f, df, layers + (multiplicity - 1) * 9
            )
            break
        dt = pari_flx_small_quotient(w, f, df, r, dr, p, t, remainder)
        if dt > 0:
            j = 1
            while True:
                dv = pari_flx_gcd(w, r, dr, t, dt, p, v, work)
                dtv = pari_flx_small_quotient(w, t, dt, v, dv, p, tv, remainder)
                if dtv > 0:
                    index = j * multiplicity - 1
                    w[layer_degrees + index] = pari_flx_normalize(
                        w, tv, dtv, p, layers + index * 9
                    )
                if dv <= 0:
                    break
                dr = pari_flx_small_quotient(w, r, dr, v, dv, p, quotient, remainder)
                pari_flx_copy(w, quotient, dr, r)
                dt = pari_flx_copy(w, v, dv, t)
                j += 1
            if dr == 0:
                break
        df = pari_flx_deflate(w, r, dr, p, quotient)
        df = pari_flx_normalize(w, quotient, df, p, f)
        multiplicity *= p
    last = degree
    while last > 0 and w[layer_degrees + last - 1] == 0:
        last -= 1
    count = 0
    for i in range(last):
        degrees = pari_flx_small_ddf(w, layers + i * 9, w[layer_degrees + i], p, work)
        for j in range(1, w[layer_degrees + i] + 1):
            for k in range(w[degrees + j - 1] // j):
                factor_degrees[count] = j
                factor_exponents[count] = i + 1
                count += 1
    pari_flx_small_sort_factor(w, scratch, count, factor_degrees, factor_exponents)
    return count
