"""PARI 2.17.4 odd-prime degree factorization, polynomial degree at most four.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: `FpX_factor.c` Flx_factor_squarefree_pre, Flx_ddf_Shoup,
Flx_simplefact_Cantor, vddf_to_simplefact, Flx_degfact_2; `arith1.c`
krouu_s; `RgX.c` brent_kung_optpow. Preserve constant squarefree layers,
Frobenius calls, and Shoup power-table/evaluation schedule. This is not
root counting or a replacement factorization algorithm.
"""

from sagejs.native import (
    Int64Buffer,
    UInt64Buffer,
    native,
    uint64,
    Int64Buffer,
    int64,
    checked_int64,
)

from .int64_flx_small import (
    int64_pari_flx_copy,
    int64_pari_flx_normalize,
    int64_pari_flx_deriv,
    int64_pari_flx_deflate,
    int64_pari_flx_sub,
    int64_pari_flx_div,
    int64_pari_flx_gcd,
)
from .int64_flx_small_power import (
    int64_pari_flxq_powu,
    int64_pari_flxq_powers,
    int64_pari_flx_flxqv_eval,
)


@native
def int64_pari_flx_small_factor_workspace_size() -> int64:
    """Eight work polynomials, four layers/degrees, and exact DDF spans."""
    return checked_int64(12 * 9 + 4 + 19 * 9 + 2 + 3 + 2 + 4 + 90)


@native
def int64_pari_flx_small_krouu_odd(x: int64, y: int64) -> int64:
    """Literal krouu_s with initial sign one and odd positive denominator."""
    sign: int64 = 1
    while x != 0:
        valuation: int64 = 0
        while x % 2 == 0:
            valuation += 1
            x //= 2
        if valuation != 0:
            residue: int64 = y % 8
            if valuation % 2 != 0 and (residue == 3 or residue == 5):
                sign = -sign
        if x % 4 >= 2 and y % 4 >= 2:
            sign = -sign
        temporary: int64 = y % x
        y: int64 = x
        x: int64 = temporary
    if y == 1:
        return checked_int64(sign)
    return checked_int64(0)


@native
def int64_pari_flx_small_optpow(degree: int64, number: int64) -> int64:
    """brent_kung_optpow(degree, number, 1), including strict tie choice."""
    best: int64 = 1
    cost: int64 = number * (degree - 1)
    _range_0_0: int64 = 2
    _range_0_1: int64 = degree + 1
    power: int64 = 0
    for power in range(_range_0_0, _range_0_1):
        candidate: int64 = power - 1 + number * ((degree - 1) // power)
        if candidate < cost:
            best = power
            cost = candidate
    return checked_int64(best)


@native
def int64_pari_flx_small_sort_factor(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    scratch: int64,
    count: int64,
    degrees: Int64Buffer,
    exponents: Int64Buffer,
) -> int64:
    """bibli2.c gen_sortspec cases 1--3 and its 2+2 merge, then sort_factor.

    Compare degrees only, preserving the source stable tie order. Twelve
    scratch entries hold original degrees, exponents, and the permutation.
    Return the active count for the buffered native ABI, not a new vector.
    """
    _range_1_0: int64 = count
    i: int64 = 0
    for i in range(_range_1_0):
        metadata[scratch + i] = degrees[i]
        metadata[scratch + 4 + i] = exponents[i]
    order: int64 = scratch + 8
    if count == 1:
        metadata[order] = 0
    elif count == 2:
        if degrees[0] <= degrees[1]:
            metadata[order] = 0
            metadata[order + 1] = 1
        else:
            metadata[order] = 1
            metadata[order + 1] = 0
    elif count == 3:
        p0: int64 = 0
        p1: int64 = 1
        p2: int64 = 2
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
        metadata[order] = p0
        metadata[order + 1] = p1
        metadata[order + 2] = p2
    elif count == 4:
        a0: int64 = 0
        a1: int64 = 1
        b0: int64 = 2
        b1: int64 = 3
        if degrees[0] > degrees[1]:
            a0 = 1
            a1 = 0
        if degrees[2] > degrees[3]:
            b0 = 3
            b1 = 2
        ix: int64 = 0
        iy: int64 = 0
        output: int64 = 0
        while ix < 2 and iy < 2:
            a: int64 = a0
            b = b0
            if ix == 1:
                a = a1
            if iy == 1:
                b = b1
            if degrees[a] <= degrees[b]:
                metadata[order + output] = a
                ix += 1
            else:
                metadata[order + output] = b
                iy += 1
            output += 1
        while ix < 2:
            a = a0
            if ix == 1:
                a = a1
            metadata[order + output] = a
            output += 1
            ix += 1
        while iy < 2:
            b = b0
            if iy == 1:
                b = b1
            metadata[order + output] = b
            output += 1
            iy += 1
    _range_2_0: int64 = count
    i: int64 = 0
    for i in range(_range_2_0):
        index: int64 = metadata[order + i]
        degrees[i] = metadata[scratch + index]
        exponents[i] = metadata[scratch + 4 + index]
    return checked_int64(count)


@native
def int64_pari_flx_small_quotient(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    out: int64,
    rem: int64,
) -> int64:
    """Source quotient-only division: do not compute an unused remainder.

    The squarefree and DDF identities establish exactness; independent oracle
    checks, not the candidate work schedule, validate those identities.
    """
    return checked_int64(int64_pari_flx_div(w, a, da, b, db, p, out, rem))


@native
def int64_pari_flx_small_ddf(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    t: int64,
    dt: int64,
    p: uint64,
    scratch: int64,
) -> int64:
    return checked_int64(
        _int64_pari_flx_small_ddf(w, metadata, t, dt, p, scratch, -1, -1)
    )


@native
def int64_pari_flx_small_ddf_polynomials(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    t: int64,
    dt: int64,
    p: uint64,
    components: int64,
    component_degrees: int64,
    scratch: int64,
) -> int64:
    """Expose Shoup's raw components, with four constant-one hole slots.

    Canonical nonzero polynomial of degree 0..4; p is an odd prime at most
    3037000493. Caller provides disjoint input (9), component (36), degree
    (4), and scratch (272) spans. No extra normalization is performed.
    The source's logical result length is dt; padding holes are representation.
    """
    if dt < 0 or dt > 4 or p < 3 or p > 3037000493 or p % 2 == 0:
        raise ValueError("small DDF polynomial frontier")
    if (
        t < 0
        or components < 0
        or component_degrees < 0
        or scratch < 0
        or len(w) < t + 9
        or len(w) < components + 36
        or len(metadata) < component_degrees + 4
        or len(w) < scratch + 272
    ):
        raise ValueError("short DDF polynomial storage")
    _range_3_0: int64 = dt + 1
    i: int64 = 0
    for i in range(_range_3_0):
        if w[t + i] < 0 or w[t + i] >= p:
            raise ValueError("noncanonical DDF polynomial")
    if w[t + dt] == 0:
        raise ValueError("zero DDF leading coefficient")
    _int64_pari_flx_small_ddf(
        w, metadata, t, dt, p, scratch, components, component_degrees
    )
    return checked_int64(dt)


@native
def _int64_pari_flx_small_ddf(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    t: int64,
    dt: int64,
    p: uint64,
    scratch: int64,
    components: int64,
    component_degrees: int64,
) -> int64:
    """Shoup for dt<=4; return offset of four component-degree slots.

    Scratch has nineteen polynomial spans, baby/giant degree tables (2+3),
    two F degrees, four f degrees, and shared ninety-slot primitive scratch.
    Polynomial T remains disjoint and unchanged. Degree-zero holes still
    compute Frobenius before the source DDF early return.
    """
    x: int64 = scratch
    xp: int64 = scratch + 9
    baby: int64 = scratch + 18
    giant: int64 = scratch + 36
    second_giant: int64 = scratch + 63
    h: int64 = scratch + 72
    tr: int64 = scratch + 90
    factors: int64 = scratch + 99
    e: int64 = scratch + 117
    u: int64 = scratch + 126
    quotient: int64 = scratch + 135
    remainder: int64 = scratch + 144
    difference: int64 = scratch + 153
    temporary: int64 = scratch + 162
    baby_degrees: int64 = scratch + 171
    giant_degrees: int64 = scratch + 173
    factor_degrees: int64 = scratch + 176
    output_degrees: int64 = scratch + 178
    work: int64 = scratch + 182
    _range_4_0: int64 = 9
    i: int64 = 0
    for i in range(_range_4_0):
        w[x + i] = 0
    w[x + 1] = 1
    signed_prime: int64 = checked_int64(p)
    dxp: int64 = int64_pari_flxq_powu(
        w, x, 1, signed_prime, t, dt, p, xp, work, metadata, work + 72
    )
    _range_5_0: int64 = 4
    i: int64 = 0
    for i in range(_range_5_0):
        metadata[output_degrees + i] = 0
    if components >= 0:
        _range_6_0: int64 = 36
        i: int64 = 0
        for i in range(_range_6_0):
            w[components + i] = 0
        _range_7_0: int64 = 4
        i: int64 = 0
        for i in range(_range_7_0):
            w[components + i * 9] = 1
            metadata[component_degrees + i] = 0
    if dt == 0:
        return checked_int64(output_degrees)
    if dt == 1:
        metadata[output_degrees] = 1
        if components >= 0:
            int64_pari_flx_copy(w, t, dt, components)
            metadata[component_degrees] = dt
        return checked_int64(output_degrees)
    # B=dt//2, l=isqrt(B)=1 throughout this declared degree corridor.
    # ro=0 and expu(p)>0 for odd primes: source takes baby-table else branch.
    number: int64 = dt // 2
    baby_power: int64 = int64_pari_flx_small_optpow(dt, 0)
    int64_pari_flxq_powers(
        w, xp, dxp, baby_power, t, dt, p, baby, metadata, baby_degrees, work
    )
    giant_power: int64 = int64_pari_flx_small_optpow(dt, number - 1)
    int64_pari_flxq_powers(
        w, xp, dxp, giant_power, t, dt, p, giant, metadata, giant_degrees, work
    )
    dg2: int64 = -1
    if number == 2:
        dg2 = int64_pari_flx_flxqv_eval(
            w,
            giant + 9,
            metadata[giant_degrees + 1],
            giant,
            metadata,
            giant_degrees,
            giant_power,
            t,
            dt,
            p,
            second_giant,
            work,
        )
    _range_8_0: int64 = number
    j: int64 = 0
    for j in range(_range_8_0):
        g: int64 = giant + 9
        dg: int64 = metadata[giant_degrees + 1]
        if j == 1:
            g = second_giant
            dg = dg2
        dh: int64 = int64_pari_flx_sub(w, g, dg, x, 1, p, h + j * 9)
        metadata[factor_degrees + j] = dh  # Reused after the first gcd stage.
    dtr: int64 = int64_pari_flx_copy(w, t, dt, tr)
    _range_9_0: int64 = number
    j: int64 = 0
    for j in range(_range_9_0):
        du: int64 = int64_pari_flx_gcd(
            w, tr, dtr, h + j * 9, metadata[factor_degrees + j], p, u, work
        )
        if du != 0:
            du = int64_pari_flx_normalize(w, u, du, p, temporary)
            int64_pari_flx_copy(w, temporary, du, u)
            dtr = int64_pari_flx_small_quotient(
                w, tr, dtr, u, du, p, quotient, remainder
            )
            int64_pari_flx_copy(w, quotient, dtr, tr)
        int64_pari_flx_copy(w, u, du, factors + j * 9)
        metadata[factor_degrees + j] = du
    _range_10_0: int64 = number
    j: int64 = 0
    for j in range(_range_10_0):
        de: int64 = int64_pari_flx_copy(
            w, factors + j * 9, metadata[factor_degrees + j], e
        )
        g = giant + 9
        dg = metadata[giant_degrees + 1]
        if j == 1:
            g = second_giant
            dg = dg2
        dd: int64 = int64_pari_flx_sub(w, g, dg, x, 1, p, difference)
        du = int64_pari_flx_gcd(w, e, de, difference, dd, p, u, work)
        if du != 0:
            metadata[output_degrees + j] = du
            if components >= 0:
                int64_pari_flx_copy(w, u, du, components + j * 9)
                metadata[component_degrees + j] = du
            # Source performs the division even though l=1 ends this loop.
            int64_pari_flx_small_quotient(w, e, de, u, du, p, quotient, remainder)
    if dtr != 0:
        metadata[output_degrees + dtr - 1] = dtr
        if components >= 0:
            int64_pari_flx_copy(w, tr, dtr, components + (dtr - 1) * 9)
            metadata[component_degrees + dtr - 1] = dtr
    return checked_int64(output_degrees)


@native
def int64_pari_flx_small_degfact(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    a: int64,
    degree: int64,
    p: uint64,
    factor_degrees: Int64Buffer,
    factor_exponents: Int64Buffer,
    scratch: int64,
) -> int64:
    """Degree/exponent vector in source sort_factor order, odd small primes.

    Polynomial slots have stride nine; degree -1 denotes zero. Input and
    scratch spans, and output buffers, are disjoint. The caller supplies an
    actual prime. Primality is not retested. Output tails are untouched.
    """
    size: int64 = int64_pari_flx_small_factor_workspace_size()
    if degree < 0 or degree > 4 or p < 3 or p % 2 == 0 or p > 3037000493:
        raise ValueError("unsupported Flx small factor domain")
    if (
        a < 0
        or scratch < 0
        or a + 9 > len(w)
        or scratch + size > len(w)
        or scratch + size > len(metadata)
    ):
        raise ValueError("short Flx small factor workspace")
    if a < scratch + size and scratch < a + 9:
        raise ValueError("overlapping Flx small factor workspace")
    if len(factor_degrees) < degree or len(factor_exponents) < degree:
        raise ValueError("short Flx small factor outputs")
    f: int64 = scratch
    layers: int64 = scratch + 72
    layer_degrees: int64 = scratch + 108
    work: int64 = scratch + 112
    df: int64 = int64_pari_flx_normalize(w, a, degree, p, f)
    if degree == 0:
        return checked_int64(0)
    if degree == 1:
        factor_degrees[0] = 1
        factor_exponents[0] = 1
        return checked_int64(1)
    if degree == 2:
        b = w[f + 1]
        c = w[f]
        doubled = c + c
        if doubled >= p:
            doubled -= p
        four_c = doubled + doubled
        if four_c >= p:
            four_c -= p
        discriminant = b * b % p
        if discriminant < four_c:
            discriminant += p
        discriminant -= four_c
        symbol: int64 = int64_pari_flx_small_krouu_odd(
            checked_int64(discriminant), checked_int64(p)
        )
        factor_exponents[0] = 1
        if symbol == -1:
            factor_degrees[0] = 2
            return checked_int64(1)
        factor_degrees[0] = 1
        if symbol == 0:
            factor_exponents[0] = 2
            return checked_int64(1)
        factor_degrees[1] = 1
        factor_exponents[1] = 1
        return checked_int64(2)
    last: int64 = int64_pari_flx_small_squarefree(
        w, metadata, f, df, p, layers, layer_degrees, work
    )
    count: int64 = 0
    _range_11_0: int64 = last
    i: int64 = 0
    for i in range(_range_11_0):
        degrees: int64 = int64_pari_flx_small_ddf(
            w, metadata, layers + i * 9, metadata[layer_degrees + i], p, work
        )
        _range_12_0: int64 = 1
        _range_12_1: int64 = metadata[layer_degrees + i] + 1
        j: int64 = 0
        for j in range(_range_12_0, _range_12_1):
            _range_13_0: int64 = metadata[degrees + j - 1] // j
            k: int64 = 0
            for k in range(_range_13_0):
                factor_degrees[count] = j
                factor_exponents[count] = i + 1
                count += 1
    int64_pari_flx_small_sort_factor(
        w, metadata, scratch, count, factor_degrees, factor_exponents
    )
    return checked_int64(count)


@native
def int64_pari_flx_small_squarefree(
    w: UInt64Buffer,
    metadata: Int64Buffer,
    f: int64,
    degree: int64,
    p: uint64,
    layers: int64,
    layer_degrees: int64,
    scratch: int64,
) -> int64:
    """Shared source squarefree layers for flag-zero and degree-only paths.

    The caller owns a mutable, monic canonical f slot, degree 1..4. Four
    nine-slot layers and four degree entries are disjoint from it and the
    ninety-entry scratch. Arithmetic and constant-one holes retain the old
    degree-factor implementation; only workspace offsets have changed.
    """
    derivative: int64 = scratch
    r: int64 = scratch + 9
    t: int64 = scratch + 18
    v: int64 = scratch + 27
    tv: int64 = scratch + 36
    quotient: int64 = scratch + 45
    remainder: int64 = scratch + 54
    work: int64 = scratch + 63
    signed_prime: int64 = checked_int64(p)
    _range_14_0: int64 = 4
    i: int64 = 0
    for i in range(_range_14_0):
        metadata[layer_degrees + i] = 0
        _range_15_0: int64 = 9
        j: int64 = 0
        for j in range(_range_15_0):
            w[layers + i * 9 + j] = 0
        w[layers + i * 9] = 1
    df: int64 = degree
    multiplicity: int64 = 1
    while True:
        dd: int64 = int64_pari_flx_deriv(w, f, df, p, derivative)
        dr: int64 = int64_pari_flx_gcd(w, f, df, derivative, dd, p, r, work)
        if dr == 0:
            metadata[layer_degrees + multiplicity - 1] = int64_pari_flx_copy(
                w, f, df, layers + (multiplicity - 1) * 9
            )
            break
        dt: int64 = int64_pari_flx_small_quotient(w, f, df, r, dr, p, t, remainder)
        if dt > 0:
            j: int64 = 1
            while True:
                dv: int64 = int64_pari_flx_gcd(w, r, dr, t, dt, p, v, work)
                dtv: int64 = int64_pari_flx_small_quotient(
                    w, t, dt, v, dv, p, tv, remainder
                )
                if dtv > 0:
                    index: int64 = j * multiplicity - 1
                    metadata[layer_degrees + index] = int64_pari_flx_normalize(
                        w, tv, dtv, p, layers + index * 9
                    )
                if dv <= 0:
                    break
                dr = int64_pari_flx_small_quotient(
                    w, r, dr, v, dv, p, quotient, remainder
                )
                int64_pari_flx_copy(w, quotient, dr, r)
                dt = int64_pari_flx_copy(w, v, dv, t)
                j += 1
            if dr == 0:
                break
        df = int64_pari_flx_deflate(w, r, dr, signed_prime, quotient)
        df = int64_pari_flx_normalize(w, quotient, df, p, f)
        multiplicity *= signed_prime
    last: int64 = degree
    while last > 0 and metadata[layer_degrees + last - 1] == 0:
        last -= 1
    return checked_int64(last)
