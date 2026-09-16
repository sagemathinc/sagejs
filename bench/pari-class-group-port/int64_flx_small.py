"""PARI 2.17.4 Flx basecases on explicit nine-coefficient slots.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: src/basemath/Flx.c, pinned SHA256
7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44.
Canonical coefficients, degree -1 for zero, degree <=8, odd prime
3<=p<=3037000493 are caller preconditions. Outputs clear unused slot tails.
Except copy, output slots must be disjoint from inputs and each other.
GCD scratch comprises three disjoint slots, also disjoint from output/inputs.
Unsigned 64-bit accumulators retain source HIGHBIT reduction points.  The
admitted modulus bound makes each product smaller than 2^63 and each guarded
sum smaller than 2^64, so no accumulator addition wraps on this corridor.
Fixed-slot tail clearing adds representation stores absent from variable-length
PARI objects; no identical primitive-cost claim is made. This is the small
basecase corridor, not general Flx dispatch.
"""

from sagejs.native import (
    UInt64Buffer,
    native,
    uint64,
    Int64Buffer,
    int64,
    checked_int64,
)


@native
def uint64_pari_word_mod_inverse(value: uint64, modulus: uint64) -> uint64:
    """PARI's unsigned-word `Fl_inv` corridor without an exact-integer island.

    `uint64` arithmetic is modulo 2^64, matching the intentional unsigned
    subtraction and coefficient wrap in `xgcduu(f=1)`.  Callers supply a
    canonical nonzero residue and `2 <= modulus <= 3_037_000_493`.
    """
    if modulus < 2 or value == 0 or value >= modulus:
        raise ValueError("invalid canonical modular-inverse input")
    d: uint64 = modulus
    d1: uint64 = value
    xv: uint64 = 0
    xv1: uint64 = 1
    swapped: int64 = 0
    while d1 > 1:
        d -= d1
        if d >= d1:
            quotient: uint64 = 1 + d // d1
            d %= d1
            xv += quotient * xv1
        else:
            xv += xv1
        if d <= 1:
            swapped = 1
            break
        d1 -= d
        if d1 >= d:
            quotient = 1 + d1 // d
            d1 %= d
            xv1 += quotient * xv
        else:
            xv1 += xv
    if swapped != 0:
        gcd: uint64 = d1
        if d == 1:
            gcd = 1
        result: uint64 = modulus - xv % modulus
    else:
        gcd = d
        if d1 == 1:
            gcd = 1
        result = xv1 % modulus
    if gcd != 1 or result == 0:
        raise ZeroDivisionError("noninvertible polynomial coefficient")
    return result


@native
def int64_pari_flx_copy(w: UInt64Buffer, a: int64, da: int64, out: int64) -> int64:
    if out > a:
        _range_0_0: int64 = da
        _range_0_1: int64 = -1
        _range_0_2: int64 = -1
        i: int64 = 0
        for i in range(_range_0_0, _range_0_1, _range_0_2):
            w[out + i] = w[a + i]
    else:
        _range_1_0: int64 = da + 1
        i: int64 = 0
        for i in range(_range_1_0):
            w[out + i] = w[a + i]
    _range_2_0: int64 = da + 1
    _range_2_1: int64 = 9
    i: int64 = 0
    for i in range(_range_2_0, _range_2_1):
        w[out + i] = 0
    return checked_int64(da)


@native
def int64_pari_flx_normalize(
    w: UInt64Buffer, a: int64, da: int64, p: uint64, out: int64
) -> int64:
    if da < 0:
        raise ValueError("cannot normalize zero polynomial")
    if w[a + da] == 1:
        return checked_int64(int64_pari_flx_copy(w, a, da, out))
    inv: uint64 = uint64_pari_word_mod_inverse(w[a + da], p)
    _range_3_0: int64 = da
    i: int64 = 0
    for i in range(_range_3_0):
        w[out + i] = w[a + i] * inv % p
    w[out + da] = 1
    _range_4_0: int64 = da + 1
    _range_4_1: int64 = 9
    i: int64 = 0
    for i in range(_range_4_0, _range_4_1):
        w[out + i] = 0
    return checked_int64(da)


@native
def int64_pari_flx_sub(
    w: UInt64Buffer, a: int64, da: int64, b: int64, db: int64, p: uint64, out: int64
) -> int64:
    d: int64 = da
    if db > d:
        d = db
    _range_5_0: int64 = d + 1
    i: int64 = 0
    for i in range(_range_5_0):
        v: uint64 = 0
        if i <= da:
            v = w[a + i]
        if i <= db:
            subtract = w[b + i]
            if v < subtract:
                v += p
            v -= subtract
        w[out + i] = v
    _range_6_0: int64 = d + 1
    _range_6_1: int64 = 9
    i: int64 = 0
    for i in range(_range_6_0, _range_6_1):
        w[out + i] = 0
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return checked_int64(d)


@native
def int64_pari_flx_mul(
    w: UInt64Buffer, a: int64, da: int64, b: int64, db: int64, p: uint64, out: int64
) -> int64:
    if da < 0 or db < 0:
        return checked_int64(int64_pari_flx_copy(w, a, -1, out))
    if da + db > 8:
        raise ValueError("product exceeds small Flx slot")
    d: int64 = da + db
    v: int64 = 0
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
    _range_7_0: int64 = 9
    i: int64 = 0
    for i in range(_range_7_0):
        w[out + i] = 0
    _range_8_0: int64 = da + db + 1
    i: int64 = 0
    for i in range(_range_8_0):
        first: int64 = i - da
        if first < 0:
            first = 0
        last: int64 = i
        if last > db:
            last = db
        total: uint64 = 0
        _range_9_0: int64 = first
        _range_9_1: int64 = last + 1
        j: int64 = 0
        for j in range(_range_9_0, _range_9_1):
            if w[b + j] != 0:
                total += w[b + j] * w[a + i - j]
                if total & 9223372036854775808:
                    total %= p
        w[out + v + i] = total % p
    return checked_int64(d)


@native
def int64_pari_flx_sqr(
    w: UInt64Buffer, a: int64, da: int64, p: uint64, out: int64
) -> int64:
    if da > 4:
        raise ValueError("square exceeds small Flx slot")
    _range_10_0: int64 = 9
    i: int64 = 0
    for i in range(_range_10_0):
        w[out + i] = 0
    if da < 0:
        return checked_int64(-1)
    d: int64 = 2 * da
    v: int64 = 0
    while w[a] == 0:
        a += 1
        da -= 1
        v += 2
    _range_11_0: int64 = 2 * da + 1
    i: int64 = 0
    for i in range(_range_11_0):
        first: int64 = i - da
        if first < 0:
            first = 0
        total: uint64 = 0
        _range_12_0: int64 = first
        _range_12_1: int64 = (i + 1) // 2
        j: int64 = 0
        for j in range(_range_12_0, _range_12_1):
            if w[a + j] != 0:
                total += w[a + j] * w[a + i - j]
                if total & 9223372036854775808:
                    total %= p
        total = 2 * (total % p)
        if i % 2 == 0:
            total += w[a + i // 2] * w[a + i // 2]
        w[out + v + i] = total % p
    return checked_int64(d)


@native
def int64_pari_flx_divrem(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    quot: int64,
    rem: int64,
) -> int64:
    return checked_int64(_int64_pari_flx_divrem(w, a, da, b, db, p, quot, rem, 1))


@native
def int64_pari_flx_div(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
    """Source quotient-only branch; scratch is one disjoint nine-slot owner."""
    _int64_pari_flx_divrem(w, a, da, b, db, p, out, scratch, 0)
    d: int64 = da - db
    if d < -1:
        d = -1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return checked_int64(d)


@native
def int64_pari_flx_rem(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
    """Source remainder-only constant dispatch; scratch holds the quotient."""
    if db < 0:
        raise ZeroDivisionError("zero Flx divisor")
    if db == 0:
        return checked_int64(int64_pari_flx_copy(w, a, -1, out))
    return checked_int64(_int64_pari_flx_divrem(w, a, da, b, db, p, scratch, out, 1))


@native
def _int64_pari_flx_divrem(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    quot: int64,
    rem: int64,
    want_rem: int64,
) -> int64:
    if db < 0:
        raise ZeroDivisionError("zero Flx divisor")
    _range_13_0: int64 = 9
    i: int64 = 0
    for i in range(_range_13_0):
        w[quot + i] = 0
        if want_rem != 0:
            w[rem + i] = 0
    if da < db and db != 0:
        if want_rem == 0:
            return checked_int64(-1)
        return checked_int64(int64_pari_flx_copy(w, a, da, rem))
    inv: uint64 = 1
    if w[b + db] != 1:
        inv = uint64_pari_word_mod_inverse(w[b + db], p)
    if db == 0:
        _range_14_0: int64 = da + 1
        i: int64 = 0
        for i in range(_range_14_0):
            w[quot + i] = w[a + i] * inv % p
        return checked_int64(-1)
    dz: int64 = da - db
    dy1: int64 = db - 1
    while dy1 >= 0 and w[b + dy1] == 0:
        dy1 -= 1
    w[quot + dz] = inv * w[a + da] % p
    _range_15_0: int64 = da - 1
    _range_15_1: int64 = db - 1
    _range_15_2: int64 = -1
    i: int64 = 0
    for i in range(_range_15_0, _range_15_1, _range_15_2):
        total: uint64 = p - w[a + i]
        j: int64 = i - dy1
        while j <= i and j <= dz:
            total += w[quot + j] * w[b + i - j]
            if total & 9223372036854775808:
                total %= p
            j += 1
        total %= p
        if total != 0:
            w[quot + i - db] = (p - total) * inv % p
    if want_rem == 0:
        return checked_int64(-1)
    _range_16_0: int64 = db
    i: int64 = 0
    for i in range(_range_16_0):
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
    d: int64 = db - 1
    while d >= 0 and w[rem + d] == 0:
        d -= 1
    return checked_int64(d)


@native
def int64_pari_flx_gcd(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
    if db > da:
        a, b = b, a
        da, db = db, da
    int64_pari_flx_copy(w, a, da, scratch)
    int64_pari_flx_copy(w, b, db, scratch + 9)
    while db >= 0:
        if db == 0:
            return checked_int64(int64_pari_flx_copy(w, scratch + 9, 0, out))
        dc: int64 = int64_pari_flx_divrem(
            w, scratch, da, scratch + 9, db, p, scratch + 18, out
        )
        int64_pari_flx_copy(w, scratch + 9, db, scratch)
        int64_pari_flx_copy(w, out, dc, scratch + 9)
        da: int64 = db
        db: int64 = dc
    return checked_int64(int64_pari_flx_copy(w, scratch, da, out))


@native
def int64_pari_flx_deriv(
    w: UInt64Buffer, a: int64, da: int64, p: uint64, out: int64
) -> int64:
    _range_17_0: int64 = 9
    i: int64 = 0
    for i in range(_range_17_0):
        w[out + i] = 0
    _range_18_0: int64 = 1
    _range_18_1: int64 = da + 1
    i: int64 = 0
    for i in range(_range_18_0, _range_18_1):
        w[out + i - 1] = i * w[a + i] % p
    d: int64 = da - 1
    if d < -1:
        d = -1
    while d >= 0 and w[out + d] == 0:
        d -= 1
    return checked_int64(d)


@native
def int64_pari_flx_deflate(
    w: UInt64Buffer, a: int64, da: int64, k: int64, out: int64
) -> int64:
    if k < 1:
        raise ValueError("deflation stride must be positive")
    if k == 1 or da <= 0:
        return checked_int64(int64_pari_flx_copy(w, a, da, out))
    d: int64 = da // k
    _range_19_0: int64 = d + 1
    i: int64 = 0
    for i in range(_range_19_0):
        w[out + i] = w[a + i * k]
    _range_20_0: int64 = d + 1
    _range_20_1: int64 = 9
    i: int64 = 0
    for i in range(_range_20_0, _range_20_1):
        w[out + i] = 0
    return checked_int64(d)
