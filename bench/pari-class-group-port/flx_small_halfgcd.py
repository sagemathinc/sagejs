"""PARI 2.17.4 `Flx_halfres_basecase`, without resultant accumulation.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
This is the strict degree-descending small branch of Flx_halfgcd_pre used
by Flxq_minpoly_pre. Keep quotient/remainder, swap and transformation order.
Explicit polynomial slots replace GEN allocation, with resident slot swaps.
"""

from sagejs.native import IntegerBuffer, native
from .flx_small import pari_flx_copy, pari_flx_divrem, pari_flx_mul, pari_flx_sub


@native
def pari_flx_small_halfgcd(
    w: IntegerBuffer,
    a: int,
    da: int,
    b: int,
    db: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Publish row-major polynomial matrix M=[u,v;u1,v1].

    Nine-coefficient slots, canonical inputs, 1<=da<=8 and -1<=db<da.
    Output has four slots followed by their four degrees (40 entries).
    Scratch is ten slots (90 entries), disjoint from inputs and output.
    Input spans may overlap each other. Matrix output is published only after
    the Euclidean loop; fixed-slot tail clearing is representation overhead.
    """
    if da < 1 or da > 8 or db < -1 or db >= da or p < 3 or p > 3037000493:
        raise ValueError("small halfgcd degree/prime frontier")
    if p % 2 == 0:
        raise ValueError("small halfgcd requires odd prime")
    if (
        a < 0
        or b < 0
        or out < 0
        or scratch < 0
        or len(w) < a + 9
        or len(w) < b + 9
        or len(w) < out + 40
        or len(w) < scratch + 90
    ):
        raise ValueError("short small halfgcd workspace")
    if (
        (out < a + 9 and a < out + 40)
        or (out < b + 9 and b < out + 40)
        or (scratch < a + 9 and a < scratch + 90)
        or (scratch < b + 9 and b < scratch + 90)
        or (scratch < out + 40 and out < scratch + 90)
    ):
        raise ValueError("overlapping small halfgcd workspace")
    aa = scratch
    bb = scratch + 9
    rr = scratch + 18
    q = scratch + 27
    u = scratch + 36
    u1 = scratch + 45
    v = scratch + 54
    v1 = scratch + 63
    product = scratch + 72
    difference = scratch + 81
    pari_flx_copy(w, a, da, aa)
    pari_flx_copy(w, b, db, bb)
    for i in range(36):
        w[u + i] = 0
    w[u] = 1
    w[v1] = 1
    du = 0
    du1 = -1
    dv = -1
    dv1 = 0
    half = (da + 1) // 2
    while db + 1 > half:
        dr = pari_flx_divrem(w, aa, da, bb, db, p, q, rr)
        dq = da - db
        # a=b, b=r; old a becomes the next remainder's free slot.
        aa, bb, rr = bb, rr, aa
        da, db = db, dr
        u, u1 = u1, u
        du, du1 = du1, du
        v, v1 = v1, v
        dv, dv1 = dv1, dv
        dp = pari_flx_mul(w, u, du, q, dq, p, product)
        du1 = pari_flx_sub(w, u1, du1, product, dp, p, difference)
        u1, difference = difference, u1
        dp = pari_flx_mul(w, v, dv, q, dq, p, product)
        dv1 = pari_flx_sub(w, v1, dv1, product, dp, p, difference)
        v1, difference = difference, v1
    pari_flx_copy(w, u, du, out)
    pari_flx_copy(w, v, dv, out + 9)
    pari_flx_copy(w, u1, du1, out + 18)
    pari_flx_copy(w, v1, dv1, out + 27)
    w[out + 36] = du
    w[out + 37] = dv
    w[out + 38] = du1
    w[out + 39] = dv1
    return 0
