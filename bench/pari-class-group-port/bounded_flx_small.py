"""PARI 2.17.4 Flx basecases on explicit nine-coefficient slots.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: src/basemath/Flx.c, pinned SHA256
7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44.
Canonical coefficients, degree -1 for zero, degree <=8, odd prime
3<=p<=3037000493 are caller preconditions. Outputs clear unused slot tails.
Except copy, output slots must be disjoint from inputs and each other.
GCD scratch comprises three disjoint slots, also disjoint from output/inputs.
Exact Python integers retain source HIGHBIT reduction points without overflow.
Fixed-slot tail clearing adds representation stores absent from variable-length
PARI objects; no identical primitive-cost claim is made. This is the small
basecase corridor, not general Flx dispatch.
"""

from sagejs.native import UInt64Buffer, checked_uint64, native, uint64
from .relation_cache import pari_word_mod_inverse


@native
def bounded_pari_flx_copy(w: UInt64Buffer, a: int, da: int, out: int) -> int:
    if out > a:
        for i in range(da, -1, -1):
            w[out + i] = w[a + i]
    else:
        for i in range(da + 1):
            w[out + i] = w[a + i]
    for i in range(da + 1, 9):
        w[out + i] = 0
    return da


@native
def bounded_pari_flx_normalize(
    w: UInt64Buffer, a: int, da: int, p: uint64, out: int
) -> int:
    if da < 0:
        raise ValueError("cannot normalize zero polynomial")
    if w[a + da] == 1:
        return bounded_pari_flx_copy(w, a, da, out)
    inv: uint64 = checked_uint64(pari_word_mod_inverse(w[a + da], p))
    for i in range(da):
        w[out + i] = w[a + i] * inv % p
    w[out + da] = 1
    for i in range(da + 1, 9):
        w[out + i] = 0
    return da


@native
def bounded_pari_flx_sub(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int
) -> int:
    d = da
    if db > d:
        d = db
    for i in range(d + 1):
        v: uint64 = 0
        if i <= da:
            v = w[a + i]
        if i <= db:
            subtract = w[b + i]
            if v < subtract:
                v += p
            v -= subtract
        w[out + i] = v
    for i in range(d + 1, 9):
        w[out + i] = 0
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return d


@native
def bounded_pari_flx_mul(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int
) -> int:
    if da < 0 or db < 0:
        return bounded_pari_flx_copy(w, a, -1, out)
    if da + db > 8:
        raise ValueError("product exceeds small Flx slot")
    d = da + db
    v = 0
    while w[a] == 0:
        a += 1
        da -= 1
        v += 1
    while w[b] == 0:
        b += 1
        db -= 1
        v += 1
    if da < db:
        a, b = b, a
        da, db = db, da
    for i in range(9):
        w[out + i] = 0
    for i in range(da + db + 1):
        first = i - da
        if first < 0:
            first = 0
        last = i
        if last > db:
            last = db
        total: uint64 = 0
        for j in range(first, last + 1):
            if w[b + j] != 0:
                total += w[b + j] * w[a + i - j]
                if total & 9223372036854775808:
                    total %= p
        w[out + v + i] = total % p
    return d


@native
def bounded_pari_flx_sqr(w: UInt64Buffer, a: int, da: int, p: uint64, out: int) -> int:
    if da > 4:
        raise ValueError("square exceeds small Flx slot")
    for i in range(9):
        w[out + i] = 0
    if da < 0:
        return -1
    d = 2 * da
    v = 0
    while w[a] == 0:
        a += 1
        da -= 1
        v += 2
    for i in range(2 * da + 1):
        first = i - da
        if first < 0:
            first = 0
        total: uint64 = 0
        for j in range(first, (i + 1) // 2):
            if w[a + j] != 0:
                total += w[a + j] * w[a + i - j]
                if total & 9223372036854775808:
                    total %= p
        total = 2 * (total % p)
        if i % 2 == 0:
            total += w[a + i // 2] * w[a + i // 2]
        w[out + v + i] = total % p
    return d


@native
def bounded_pari_flx_divrem(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, quot: int, rem: int
) -> int:
    return _bounded_pari_flx_divrem(w, a, da, b, db, p, quot, rem, 1)


@native
def bounded_pari_flx_div(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int, scratch: int
) -> int:
    """Source quotient-only branch; scratch is one disjoint nine-slot owner."""
    _bounded_pari_flx_divrem(w, a, da, b, db, p, out, scratch, 0)
    d = da - db
    if d < -1:
        d = -1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return d


@native
def bounded_pari_flx_rem(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int, scratch: int
) -> int:
    """Source remainder-only constant dispatch; scratch holds the quotient."""
    if db < 0:
        raise ZeroDivisionError("zero Flx divisor")
    if db == 0:
        return bounded_pari_flx_copy(w, a, -1, out)
    return _bounded_pari_flx_divrem(w, a, da, b, db, p, scratch, out, 1)


@native
def _bounded_pari_flx_divrem(
    w: UInt64Buffer,
    a: int,
    da: int,
    b: int,
    db: int,
    p: uint64,
    quot: int,
    rem: int,
    want_rem: int,
) -> int:
    if db < 0:
        raise ZeroDivisionError("zero Flx divisor")
    for i in range(9):
        w[quot + i] = 0
        if want_rem != 0:
            w[rem + i] = 0
    if da < db and db != 0:
        if want_rem == 0:
            return -1
        return bounded_pari_flx_copy(w, a, da, rem)
    inv: uint64 = 1
    if w[b + db] != 1:
        inv = checked_uint64(pari_word_mod_inverse(w[b + db], p))
    if db == 0:
        for i in range(da + 1):
            w[quot + i] = w[a + i] * inv % p
        return -1
    dz = da - db
    dy1 = db - 1
    while dy1 >= 0 and w[b + dy1] == 0:
        dy1 -= 1
    w[quot + dz] = inv * w[a + da] % p
    for i in range(da - 1, db - 1, -1):
        total: uint64 = p - w[a + i]
        j = i - dy1
        while j <= i and j <= dz:
            total += w[quot + j] * w[b + i - j]
            if total & 9223372036854775808:
                total %= p
            j += 1
        total %= p
        if total != 0:
            w[quot + i - db] = (p - total) * inv % p
    if want_rem == 0:
        return -1
    for i in range(db):
        total: uint64 = w[quot] * w[b + i]
        j = i - dy1
        if j < 1:
            j = 1
        while j <= i and j <= dz:
            total += w[quot + j] * w[b + i - j]
            if total & 9223372036854775808:
                total %= p
            j += 1
        reduced: uint64 = total % p
        value: uint64 = w[a + i]
        if value < reduced:
            value += p
        w[rem + i] = value - reduced
    d = db - 1
    while d >= 0 and w[rem + d] == 0:
        d -= 1
    return d


@native
def bounded_pari_flx_gcd(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int, scratch: int
) -> int:
    if db > da:
        a, b = b, a
        da, db = db, da
    bounded_pari_flx_copy(w, a, da, scratch)
    bounded_pari_flx_copy(w, b, db, scratch + 9)
    while db >= 0:
        if db == 0:
            return bounded_pari_flx_copy(w, scratch + 9, 0, out)
        dc = bounded_pari_flx_divrem(
            w, scratch, da, scratch + 9, db, p, scratch + 18, out
        )
        bounded_pari_flx_copy(w, scratch + 9, db, scratch)
        bounded_pari_flx_copy(w, out, dc, scratch + 9)
        da = db
        db = dc
    return bounded_pari_flx_copy(w, scratch, da, out)


@native
def bounded_pari_flx_deriv(
    w: UInt64Buffer, a: int, da: int, p: uint64, out: int
) -> int:
    for i in range(9):
        w[out + i] = 0
    for i in range(1, da + 1):
        w[out + i - 1] = i * w[a + i] % p
    d = da - 1
    if d < -1:
        d = -1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return d


@native
def bounded_pari_flx_deflate(w: UInt64Buffer, a: int, da: int, k: int, out: int) -> int:
    if k < 1:
        raise ValueError("deflation stride must be positive")
    if k == 1 or da <= 0:
        return bounded_pari_flx_copy(w, a, da, out)
    d = da // k
    for i in range(d + 1):
        w[out + i] = w[a + i * k]
    for i in range(d + 1, 9):
        w[out + i] = 0
    return d
