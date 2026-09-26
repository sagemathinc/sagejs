"""PARI 2.17.4 Flx equal-degree splitting with resident source RNG.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate Flx_edf_simple, Flx_edf and Flx_edf_rec for degree at most four.
"""

from sagejs.native import IntegerBuffer, native
from .pari_random import pari_random_fl
from .flx_small import (
    pari_flx_copy,
    pari_flx_rem,
    pari_flx_gcd,
    pari_flx_div,
    pari_flx_normalize,
)
from .flx_small_power import pari_flxq_powu, pari_flxq_powers, pari_flxq_mul
from .flx_small_factor import pari_flx_small_optpow
from .flx_small_minpoly import pari_flxq_minpoly
from .flx_small_block_eval import pari_flx_small_block_eval, pari_flx_small_compose


@native
def _edf_add_constant(
    w: IntegerBuffer, a: int, da: int, value: int, p: int, out: int
) -> int:
    pari_flx_copy(w, a, da, out)
    w[out] = (w[out] + value) % p
    degree = da
    if degree < 0:
        degree = 0
    while degree >= 0 and w[out + degree] == 0:
        degree -= 1
    return degree


@native
def _edf_random(
    w: IntegerBuffer,
    out: int,
    n: int,
    p: int,
    rng: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    for i in range(9):
        w[out + i] = 0
    for i in range(n):
        w[out + i] = pari_random_fl(rng, p)
    diagnostic[0] += 1
    degree = n - 1
    while degree >= 0 and w[out + degree] == 0:
        degree -= 1
    return degree


@native
def _edf_trace(
    w: IntegerBuffer,
    xp: int,
    dxp: int,
    g: int,
    dg: int,
    d: int,
    t: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    if d == 1:
        return pari_flx_copy(w, g, dg, out)
    maximum = dxp
    if dg > maximum:
        maximum = dg
    power = pari_flx_small_optpow(maximum, 2)
    prefix = power
    if prefix > 2:
        prefix = 2
    pari_flxq_powers(w, xp, dxp, prefix, t, n, p, scratch, scratch + 36, scratch + 64)
    if power == 3:
        w[scratch + 39] = pari_flxq_mul(
            w,
            scratch + 18,
            w[scratch + 38],
            xp,
            dxp,
            t,
            n,
            p,
            scratch + 27,
            scratch + 64,
        )
    # gen_powu_i(...,2) invokes the complete auttrace square: phi3 first.
    pari_flx_small_block_eval(
        w, xp, dxp, scratch, power + 1, t, n, p, scratch + 40, scratch + 64
    )
    degree = pari_flx_small_block_eval(
        w, g, dg, scratch, power + 1, t, n, p, out, scratch + 64
    )
    if dg > degree:
        degree = dg
    for i in range(degree + 1):
        if i <= dg:
            w[out + i] = (w[out + i] + w[g + i]) % p
    while degree >= 0 and w[out + degree] == 0:
        degree -= 1
    return degree


@native
def _edf_run(
    w: IntegerBuffer,
    tp: int,
    n: int,
    xp: int,
    dxp: int,
    d: int,
    p: int,
    out: int,
    degrees: int,
    index: int,
    scratch: int,
    rng: IntegerBuffer,
    diagnostic: IntegerBuffer,
    minpoly_diagnostic: IntegerBuffer,
    simple: int,
) -> int:
    if n == d:
        w[degrees + index] = pari_flx_copy(w, tp, n, out + 9 * index)
        return 0
    if scratch + 2048 > len(w):
        raise ValueError("EDF recursion storage frontier")
    t = scratch
    x = scratch + 9
    g = scratch + 18
    trace = scratch + 27
    hp = scratch + 36
    first = scratch + 45
    second = scratch + 54
    result = scratch + 63
    shifted = scratch + 72
    work = scratch + 144
    pari_flx_copy(w, tp, n, t)
    dx = pari_flx_rem(w, xp, dxp, t, n, p, x, work)
    if simple != 0:
        df = 0
        while True:
            dg = _edf_random(w, g, n, p, rng, diagnostic)
            dt = _edf_trace(w, x, dx, g, dg, d, t, n, p, trace, work)
            if dt < 0:
                continue
            for attempt in range(10):
                random = pari_random_fl(rng, p)
                diagnostic[1] += 1
                ds = _edf_add_constant(w, trace, dt, random, p, shifted)
                dr = pari_flxq_powu(w, shifted, ds, p // 2, t, n, p, result, work)
                ds = _edf_add_constant(w, result, dr, p - 1, p, shifted)
                df = pari_flx_gcd(w, shifted, ds, t, n, p, first, work)
                if df > 0 and df < n:
                    break
            if df > 0 and df < n:
                break
        pari_flx_normalize(w, first, df, p, result)
        pari_flx_copy(w, result, df, first)
        ds = pari_flx_div(w, t, n, first, df, p, second, work)
        _edf_run(
            w,
            first,
            df,
            x,
            dx,
            d,
            p,
            out,
            degrees,
            index,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
            1,
        )
        _edf_run(
            w,
            second,
            ds,
            x,
            dx,
            d,
            p,
            out,
            degrees,
            index + df // d,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
            1,
        )
        return 0
    dh = 0
    dt = -1
    while dh <= 1:
        dg = _edf_random(w, g, n, p, rng, diagnostic)
        dt = _edf_trace(w, x, dx, g, dg, d, t, n, p, trace, work)
        dh = pari_flxq_minpoly(w, trace, dt, t, n, p, hp, work, rng, minpoly_diagnostic)
        diagnostic[2] += minpoly_diagnostic[0]
    return _edf_rec(
        w,
        t,
        n,
        x,
        dx,
        hp,
        dh,
        trace,
        dt,
        d,
        p,
        out,
        degrees,
        index,
        scratch + 2048,
        rng,
        diagnostic,
        minpoly_diagnostic,
    )


@native
def _edf_rec(
    w: IntegerBuffer,
    tp: int,
    n: int,
    xp: int,
    dxp: int,
    hp: int,
    nh: int,
    element: int,
    de: int,
    d: int,
    p: int,
    out: int,
    degrees: int,
    index: int,
    scratch: int,
    rng: IntegerBuffer,
    diagnostic: IntegerBuffer,
    minpoly_diagnostic: IntegerBuffer,
) -> int:
    if scratch + 2048 > len(w):
        raise ValueError("EDF recursion storage frontier")
    t = scratch
    h = scratch + 9
    value = scratch + 18
    linear = scratch + 27
    result = scratch + 36
    shifted = scratch + 45
    u1 = scratch + 54
    u2 = scratch + 63
    f1 = scratch + 72
    f2 = scratch + 81
    work = scratch + 144
    pari_flx_copy(w, tp, n, t)
    pari_flx_copy(w, hp, nh, h)
    dt = pari_flx_rem(w, element, de, t, n, p, value, work)
    du1 = 0
    while du1 == 0 or du1 == nh:
        for i in range(9):
            w[linear + i] = 0
        w[linear] = pari_random_fl(rng, p)
        diagnostic[1] += 1
        w[linear + 1] = 1
        dr = pari_flxq_powu(w, linear, 1, p // 2, h, nh, p, result, work)
        ds = _edf_add_constant(w, result, dr, p - 1, p, shifted)
        du1 = pari_flx_gcd(w, shifted, ds, h, nh, p, u1, work)
    dr = pari_flx_small_compose(w, u1, du1, value, dt, t, n, p, result, work)
    df1 = pari_flx_gcd(w, result, dr, t, n, p, f1, work)
    pari_flx_normalize(w, f1, df1, p, result)
    pari_flx_copy(w, result, df1, f1)
    du2 = pari_flx_div(w, h, nh, u1, du1, p, u2, work)
    df2 = pari_flx_div(w, t, n, f1, df1, p, f2, work)
    if du1 == 1:
        _edf_run(
            w,
            f1,
            df1,
            xp,
            dxp,
            d,
            p,
            out,
            degrees,
            index,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
            0,
        )
    else:
        _edf_rec(
            w,
            f1,
            df1,
            xp,
            dxp,
            u1,
            du1,
            value,
            dt,
            d,
            p,
            out,
            degrees,
            index,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
        )
    index += df1 // d
    if du2 == 1:
        _edf_run(
            w,
            f2,
            df2,
            xp,
            dxp,
            d,
            p,
            out,
            degrees,
            index,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
            0,
        )
    else:
        _edf_rec(
            w,
            f2,
            df2,
            xp,
            dxp,
            u2,
            du2,
            value,
            dt,
            d,
            p,
            out,
            degrees,
            index,
            scratch + 2048,
            rng,
            diagnostic,
            minpoly_diagnostic,
        )
    return 0


@native
def pari_flx_small_edf(
    w: IntegerBuffer,
    tp: int,
    n: int,
    xp: int,
    dxp: int,
    d: int,
    p: int,
    out: int,
    degrees: int,
    scratch: int,
    random_state: IntegerBuffer,
    diagnostic: IntegerBuffer,
    minpoly_diagnostic: IntegerBuffer,
) -> int:
    """Source EDF selection, monic squarefree equal-degree T; explicit p prime.

    Disjoint arena regions: inputs9 each, output36, degrees4, scratch16384.
    RNG66 resident. Diagnostic counts random polynomials, scalar shifts and
    minpoly projections. Arithmetic failure may alter scratch/RNG/outputs.
    """
    if (
        n < 1
        or n > 4
        or d < 1
        or d > 2
        or n % d != 0
        or dxp < -1
        or dxp > 3
        or p < 3
        or p > 3037000493
        or p % 2 == 0
    ):
        raise ValueError("small odd EDF domain")
    if (
        tp < 0
        or xp < 0
        or out < 0
        or degrees < 0
        or scratch < 0
        or tp + 9 > len(w)
        or xp + 9 > len(w)
        or out + 36 > len(w)
        or degrees + 4 > len(w)
        or scratch + 16384 > len(w)
        or len(random_state) < 66
        or len(diagnostic) < 3
        or len(minpoly_diagnostic) < 1
    ):
        raise ValueError("short odd EDF storage")
    if w[tp + n] != 1:
        raise ValueError("EDF requires monic input")
    for i in range(n + 1):
        if w[tp + i] < 0 or w[tp + i] >= p:
            raise ValueError("EDF input residue")
    for i in range(dxp + 1):
        if w[xp + i] < 0 or w[xp + i] >= p:
            raise ValueError("EDF Frobenius residue")
    for i in range(3):
        diagnostic[i] = 0
    e = 0
    v = p
    while v >= 2:
        v //= 2
        e += 1
    le = 0
    v = e
    while v >= 2:
        v //= 2
        le += 1
    simple = 0
    if n // d > e * le:
        simple = 1
    _edf_run(
        w,
        tp,
        n,
        xp,
        dxp,
        d,
        p,
        out,
        degrees,
        0,
        scratch,
        random_state,
        diagnostic,
        minpoly_diagnostic,
        simple,
    )
    return n // d
