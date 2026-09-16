"""PARI 2.17.4 randomized Flxq minimal polynomial, degrees two to four.

Derived from `Flx.c`: Flxq_minpoly_pre and its transposed multiplication.
Copyright (C) The PARI group, GPL-2.0-or-later, without warranty.
Plain small monic moduli select the source non-Barrett transmul branch.
"""

from sagejs.native import IntegerBuffer, native
from .flx_small import (
    pari_flx_copy,
    pari_flx_mul,
    pari_flx_sqr,
    pari_flx_rem,
    pari_flx_div,
    pari_flx_sub,
    pari_flx_normalize,
)
from .flx_small_halfgcd import pari_flx_small_halfgcd
from .flx_small_block_eval import pari_flx_small_block_eval
from .pari_random import pari_random_fl


@native
def _minpoly_degree(w: IntegerBuffer, a: int, d: int) -> int:
    while d >= 0 and w[a + d] == 0:
        d -= 1
    return d


@native
def _minpoly_shift(w: IntegerBuffer, a: int, da: int, shift: int, out: int) -> int:
    for i in range(9):
        w[out + i] = 0
    if da < 0 or da + shift < 0:
        return -1
    for i in range(da + 1):
        if i + shift >= 0:
            w[out + i + shift] = w[a + i]
    return da + shift


@native
def _minpoly_recip(w: IntegerBuffer, a: int, da: int, n: int, out: int) -> int:
    for i in range(9):
        w[out + i] = 0
    for i in range(da + 1):
        w[out + n - i - 1] = w[a + i]
    return _minpoly_degree(w, out, n - 1)


@native
def _minpoly_trans_init(
    w: IntegerBuffer,
    tau: int,
    dt: int,
    modulus: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
) -> tuple[int, int, int]:
    df = _minpoly_recip(w, modulus, n, n + 1, out + 18)
    db = _minpoly_recip(w, tau, dt, n, out)
    ds = _minpoly_shift(w, tau, dt, n - 1, scratch)
    dh = pari_flx_div(w, scratch, ds, modulus, n, p, scratch + 9, scratch + 18)
    dh = _minpoly_recip(w, scratch + 9, dh, n - 1, out + 9)
    return db, dh, df


@native
def _minpoly_trans(
    w: IntegerBuffer,
    tr: int,
    db: int,
    dh: int,
    df: int,
    a: int,
    da: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    if da < 0:
        return pari_flx_copy(w, a, -1, out)
    d = pari_flx_mul(w, tr, db, a, da, p, scratch)
    d2 = _minpoly_shift(w, scratch, d, 1 - n, scratch + 9)
    if dh < 0:
        return pari_flx_copy(w, scratch + 9, d2, out)
    d = pari_flx_mul(w, tr + 18, df, a, da, p, scratch)
    d1 = _minpoly_shift(w, scratch, d, -n, scratch + 18)
    d3 = pari_flx_mul(w, scratch + 18, d1, tr + 9, dh, p, scratch)
    if d3 >= n - 1:
        d3 = n - 2
    d3 = _minpoly_degree(w, scratch, d3)
    d3 = _minpoly_shift(w, scratch, d3, 1, scratch + 18)
    return pari_flx_sub(w, scratch + 9, d2, scratch + 18, d3, p, out)


@native
def pari_flxq_minpoly(
    w: IntegerBuffer,
    a: int,
    da: int,
    modulus: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
    random_state: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Return source-normalized minimal polynomial with resident RNG.

    Modulus monic, degree2..4; reduced input degree-1..n-1; canonical residues
    and odd prime3..3037000493 are caller preconditions. All spans disjoint.
    Scratch1536, output9, RNG66, diagnostic1. Diagnostic counts projections.
    No randomized retry cap or substitute linear-algebra algorithm is used.
    """
    if n < 2 or n > 4 or da < -1 or da >= n or p < 3 or p > 3037000493 or p % 2 == 0:
        raise ValueError("small minpoly frontier")
    if a < 0 or modulus < 0 or out < 0 or scratch < 0:
        raise ValueError("negative minpoly offset")
    if (
        len(w) < a + da + 1
        or len(w) < modulus + n + 1
        or len(w) < out + 9
        or len(w) < scratch + 1536
        or len(random_state) < 66
        or len(diagnostic) < 1
    ):
        raise ValueError("short minpoly storage")
    if w[modulus + n] != 1:
        raise ValueError("minpoly modulus must be monic")
    g = scratch
    tau = scratch + 9
    v = scratch + 18
    c = scratch + 27
    monomial = scratch + 36
    newg = scratch + 54
    evaluated = scratch + 63
    newtau = scratch + 72
    powers = scratch + 81
    tr = scratch + 117
    work = scratch + 144
    matrix = scratch + 432
    pari_flx_copy(w, a, -1, g)
    w[g] = 1
    pari_flx_copy(w, g, 0, tau)
    pari_flx_copy(w, g, 0, powers)
    pari_flx_copy(w, a, da, powers + 9)
    ds = pari_flx_sqr(w, a, da, p, work)
    dx2 = pari_flx_rem(w, work, ds, modulus, n, p, powers + 18, work + 9)
    dg = 0
    dt = 0
    diagnostic[0] = 0
    while dt >= 0:
        if dg == n:
            pari_flx_copy(w, a, -1, g)
            w[g] = 1
            pari_flx_copy(w, g, 0, tau)
            dg = 0
            dt = 0
        diagnostic[0] += 1
        for i in range(n):
            w[v + i] = pari_random_fl(random_state, p)
        for i in range(n, 9):
            w[v + i] = 0
        dv = _minpoly_degree(w, v, n - 1)
        db, dh, df = _minpoly_trans_init(w, tau, dt, modulus, n, p, tr, work)
        dv = _minpoly_trans(w, tr, db, dh, df, v, dv, n, p, work + 36, work)
        pari_flx_copy(w, work + 36, dv, v)
        m = 2 * (n - dg)
        k1 = 1
        if m >= 4:
            k1 = 2
        dgiant = da
        if k1 == 2:
            dgiant = dx2
        db, dh, df = _minpoly_trans_init(
            w, powers + 9 * k1, dgiant, modulus, n, p, tr, work
        )
        pari_flx_copy(w, a, -1, c)
        for i in range(0, m, k1):
            mj = k1
            if m - i < mj:
                mj = m - i
            for j in range(mj):
                dp = 0
                if j == 1:
                    dp = da
                length = dv + 1
                if dp + 1 < length:
                    length = dp + 1
                total = 0
                if length > 0:
                    total = w[v] * w[powers + j * 9]
                    for k in range(1, length):
                        total += w[v + k] * w[powers + j * 9 + k]
                        if total & 9223372036854775808:
                            total %= p
                    total %= p
                w[c + m - 1 - i - j] = total
            dv = _minpoly_trans(w, tr, db, dh, df, v, dv, n, p, work + 36, work)
            pari_flx_copy(w, work + 36, dv, v)
        dc = _minpoly_degree(w, c, m - 1)
        pari_flx_copy(w, a, -1, monomial)
        w[monomial + m] = 1
        pari_flx_small_halfgcd(w, monomial, m, c, dc, p, matrix, scratch + 480)
        gp = matrix + 27
        dgp = w[matrix + 39]
        if dgp < 1:
            continue
        dg = pari_flx_mul(w, g, dg, gp, dgp, p, newg)
        pari_flx_copy(w, newg, dg, g)
        de = pari_flx_small_block_eval(
            w, gp, dgp, powers, 3, modulus, n, p, evaluated, scratch + 300
        )
        dm = pari_flx_mul(w, tau, dt, evaluated, de, p, work)
        dt = pari_flx_rem(w, work, dm, modulus, n, p, newtau, work + 9)
        pari_flx_copy(w, newtau, dt, tau)
    return pari_flx_normalize(w, g, dg, p, out)
