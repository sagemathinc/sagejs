"""PARI 2.17.4 Flx_FlxqV_eval_pre and Flx_Flxq_eval_pre, small slots.

Copyright (C) The PARI group, GPL-2.0-or-later; without warranty.
The source matrix-block product and high-to-low modular Horner order remain.
Slots have nine canonical zero-padded coefficients; all spans are disjoint.
"""

from sagejs.native import IntegerBuffer, native
from .flx_small import pari_flx_copy, pari_flx_mul, pari_flx_sqr, pari_flx_rem


@native
def _block_eval_degree(w: IntegerBuffer, a: int, d: int) -> int:
    while d >= 0 and w[a + d] == 0:
        d -= 1
    return d


@native
def pari_flx_small_block_eval(
    w: IntegerBuffer,
    q: int,
    dq: int,
    powers: int,
    power_count: int,
    modulus: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Evaluate using 1..4 source powers, output9 and scratch128 entries."""
    if (
        n < 1
        or n > 4
        or dq < -1
        or dq > 4
        or power_count < 1
        or power_count > 4
        or (power_count == 1 and dq > 0)
        or p < 3
        or p > 3037000493
        or p % 2 == 0
    ):
        raise ValueError("small block evaluation frontier")
    if q < 0 or powers < 0 or modulus < 0 or out < 0 or scratch < 0:
        raise ValueError("negative block evaluation offset")
    if (
        len(w) < q + dq + 1
        or len(w) < powers + 9 * power_count
        or len(w) < modulus + n + 1
        or len(w) < out + 9
        or len(w) < scratch + 128
    ):
        raise ValueError("short block evaluation storage")
    if w[modulus + n] != 1:
        raise ValueError("block evaluation modulus must be monic")
    if dq < 0:
        return pari_flx_copy(w, q, -1, out)
    width = power_count
    blocks = 1
    if dq + 1 > power_count:
        width = power_count - 1
        blocks = (dq + width) // width
    for block in range(blocks):
        for row in range(n):
            total = w[powers + row] * w[q + block * width]
            for k in range(1, width):
                coefficient = 0
                if block * width + k <= dq:
                    coefficient = w[q + block * width + k]
                total += w[powers + k * 9 + row] * coefficient
                if total & 9223372036854775808:
                    total %= p
            w[scratch + block * 9 + row] = total % p
        for row in range(n, 9):
            w[scratch + block * 9 + row] = 0
    last = scratch + (blocks - 1) * 9
    ds = _block_eval_degree(w, last, n - 1)
    pari_flx_copy(w, last, ds, out)
    giant = powers + 9 * (power_count - 1)
    dg = _block_eval_degree(w, giant, n - 1)
    for block in range(blocks - 2, -1, -1):
        dm = pari_flx_mul(w, out, ds, giant, dg, p, scratch + 45)
        ds = pari_flx_rem(
            w, scratch + 45, dm, modulus, n, p, scratch + 54, scratch + 63
        )
        for i in range(n):
            value = w[scratch + 54 + i] + w[scratch + block * 9 + i]
            if value >= p:
                value -= p
            w[out + i] = value
        for i in range(n, 9):
            w[out + i] = 0
        ds = _block_eval_degree(w, out, n - 1)
    return ds


@native
def pari_flx_small_compose(
    w: IntegerBuffer,
    q: int,
    dq: int,
    x: int,
    dx: int,
    modulus: int,
    n: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Source floor(sqrt(deg Q)) power table followed by block evaluation.

    Requires reduced x, monic degree1..4 modulus; output9 and scratch192.
    """
    if (
        n < 1
        or n > 4
        or dq < -1
        or dq > 4
        or dx < -1
        or dx >= n
        or p < 3
        or p > 3037000493
        or p % 2 == 0
    ):
        raise ValueError("small composition frontier")
    if q < 0 or x < 0 or modulus < 0 or out < 0 or scratch < 0:
        raise ValueError("negative composition offset")
    if (
        len(w) < q + dq + 1
        or len(w) < x + dx + 1
        or len(w) < modulus + n + 1
        or len(w) < out + 9
        or len(w) < scratch + 192
    ):
        raise ValueError("short composition storage")
    if w[modulus + n] != 1:
        raise ValueError("composition modulus must be monic")
    if dq < 0:
        return pari_flx_copy(w, q, -1, out)
    count = 1
    if dq >= 1:
        count = 2
    if dq >= 4:
        count = 3
    pari_flx_copy(w, x, -1, scratch)
    w[scratch] = 1
    if count >= 2:
        pari_flx_copy(w, x, dx, scratch + 9)
    if count == 3:
        d = pari_flx_sqr(w, x, dx, p, scratch + 27)
        pari_flx_rem(w, scratch + 27, d, modulus, n, p, scratch + 18, scratch + 36)
    return pari_flx_small_block_eval(
        w, q, dq, scratch, count, modulus, n, p, out, scratch + 54
    )
