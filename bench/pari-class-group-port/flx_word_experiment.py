"""PARI 2.17.4 small Flx machine-storage experiment, not a production dispatch.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translated from src/basemath/Flx.c (SHA256
7d22f056fe56aa3c5fbd6b0e8f02fdb2e13e285d8a519382ddb2dbe7efefda44).
The coefficient schedule is the existing flx_small.py translation. Only storage
and residue/accumulator types differ; signed degree/index variables remain int.
Canonical coefficients, top coefficient nonzero for nonzero polynomials,
disjoint nine-word slots, -1 <= degree <= 4, and odd prime
3 <= p <= 3037000493 are caller preconditions. Fixed tail clearing is retained.
"""

from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64, checked_uint64
from .flx_small import pari_flx_mul, pari_flx_sqr


@native
def flx_word_mul(
    w: UInt64Buffer, a: int, da: int, b: int, db: int, p: uint64, out: int
) -> int:
    if da < 0 or db < 0:
        for i in range(9):
            w[out + i] = 0
        return -1
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
    highbit: uint64 = 9223372036854775808
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
                if total & highbit:
                    total %= p
        w[out + v + i] = total % p
    return d


@native
def flx_word_sqr(w: UInt64Buffer, a: int, da: int, p: uint64, out: int) -> int:
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
    highbit: uint64 = 9223372036854775808
    for i in range(2 * da + 1):
        first = i - da
        if first < 0:
            first = 0
        total: uint64 = 0
        for j in range(first, (i + 1) // 2):
            if w[a + j] != 0:
                total += w[a + j] * w[a + i - j]
                if total & highbit:
                    total %= p
        total = 2 * (total % p)
        if i % 2 == 0:
            total += w[a + i // 2] * w[a + i // 2]
        w[out + v + i] = total % p
    return d


@native
def flx_word_batch(w: UInt64Buffer, degree: int, p: uint64, count: uint64) -> int:
    checksum: uint64 = 0
    i: uint64 = 0
    while i < count:
        flx_word_mul(w, 0, degree, 9, degree, p, 18)
        flx_word_sqr(w, 0, degree, p, 27)
        checksum += w[18] + w[27]
        i += 1
    return checksum


@native
def flx_exact_batch(w: IntegerBuffer, degree: int, p: int, count: uint64) -> int:
    checksum: uint64 = 0
    i: uint64 = 0
    while i < count:
        pari_flx_mul(w, 0, degree, 9, degree, p, 18)
        pari_flx_sqr(w, 0, degree, p, 27)
        checksum += checked_uint64(w[18] + w[27])
        i += 1
    return checksum
