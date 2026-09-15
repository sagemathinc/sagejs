"""PARI 2.17.4 small Flx quotient-ring powering.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate Flx.c Flxq_mul/sqr/powu and bb_group.c gen_powu_i, including its
binary/sliding-window schedule. Coefficient arithmetic uses flx_small.
"""

from sagejs.native import IntegerBuffer, native
from .flx_small import pari_flx_copy, pari_flx_mul, pari_flx_sqr, pari_flx_rem

FLXQ_OPERATION_SCRATCH = 18
FLXQ_POWER_SCRATCH = 90
FLXQ_EVAL_SCRATCH = 54


@native
def pari_flxq_mul(
    w: IntegerBuffer,
    a: int,
    da: int,
    b: int,
    db: int,
    t: int,
    dt: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Source multiply then remainder; reserve 18 disjoint scratch slots."""
    d = pari_flx_mul(w, a, da, b, db, p, scratch)
    return pari_flx_rem(w, scratch, d, t, dt, p, out, scratch + 9)


@native
def pari_flxq_sqr(
    w: IntegerBuffer, a: int, da: int, t: int, dt: int, p: int, out: int, scratch: int
) -> int:
    """Source square then remainder; reserve 18 disjoint scratch slots."""
    d = pari_flx_sqr(w, a, da, p, scratch)
    return pari_flx_rem(w, scratch, d, t, dt, p, out, scratch + 9)


@native
def pari_flxq_powu(
    w: IntegerBuffer,
    a: int,
    da: int,
    exponent: int,
    t: int,
    dt: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Power with exactly the source multiplication schedule, without pre-reduction.

    Odd prime p is a caller assumption, 0<=dt<=4 and -1<=da<=4. Each
    polynomial occupies nine slots; inputs, output and 90-slot scratch are
    disjoint. Output publication uses copies, never changes input owners.
    No special-case source dispatcher or alternative powering algorithm.
    """
    if exponent < 0 or exponent > 18446744073709551615:
        raise ValueError("Flxq exponent outside unsigned word")
    if p <= 2 or p > 3037000493 or p % 2 == 0:
        raise ValueError("Flxq requires an odd word prime")
    if dt < 0 or dt > 4 or da < -1 or da > 4:
        raise ValueError("Flxq small quotient degree frontier")
    if a < 0 or t < 0 or out < 0 or scratch < 0:
        raise ValueError("negative Flxq owner")
    if a + 9 > len(w) or t + 9 > len(w) or out + 9 > len(w) or scratch + 90 > len(w):
        raise ValueError("short Flxq owner")
    if (
        (a < t + 9 and t < a + 9)
        or (a < out + 9 and out < a + 9)
        or (t < out + 9 and out < t + 9)
    ):
        raise ValueError("overlapping Flxq polynomial owners")
    if (
        (a < scratch + 90 and scratch < a + 9)
        or (t < scratch + 90 and scratch < t + 9)
        or (out < scratch + 90 and scratch < out + 9)
    ):
        raise ValueError("overlapping Flxq scratch owner")
    for i in range(da + 1):
        if w[a + i] < 0 or w[a + i] >= p:
            raise ValueError("noncanonical Flxq coefficient")
    for i in range(dt + 1):
        if w[t + i] < 0 or w[t + i] >= p:
            raise ValueError("noncanonical Flxq modulus")
    if (da >= 0 and w[a + da] == 0) or w[t + dt] == 0:
        raise ValueError("noncanonical Flxq degree")
    if exponent == 0:
        for i in range(9):
            w[out + i] = 0
        w[out] = 1
        return 0
    if exponent == 1:
        return pari_flx_copy(w, a, da, out)
    if exponent == 2:
        return pari_flxq_sqr(w, a, da, t, dt, p, out, scratch)
    temporary = scratch + 18
    running = scratch + 81
    degree = da
    if exponent < 512:
        degree = pari_flx_copy(w, a, da, running)
        # Source highest bit is implicit, then square/multiply left to right.
        bit = exponent.bit_length() - 2
        while bit >= 0:
            degree = pari_flxq_sqr(w, running, degree, t, dt, p, temporary, scratch)
            pari_flx_copy(w, temporary, degree, running)
            if (exponent >> bit) & 1:
                degree = pari_flxq_mul(
                    w, running, degree, a, da, t, dt, p, temporary, scratch
                )
                pari_flx_copy(w, temporary, degree, running)
            bit -= 1
        return pari_flx_copy(w, running, degree, out)
    window = 2
    if exponent >= 33554432:
        window = 3
    count = 1 << (window - 1)
    square = scratch + 27
    table = scratch + 36
    degrees = scratch + 72
    square_degree = pari_flxq_sqr(w, a, da, t, dt, p, square, scratch)
    w[degrees] = pari_flx_copy(w, a, da, table)
    for i in range(1, count):
        w[degrees + i] = pari_flxq_mul(
            w,
            table + 9 * (i - 1),
            w[degrees + i - 1],
            square,
            square_degree,
            t,
            dt,
            p,
            table + 9 * i,
            scratch,
        )
    bit = exponent.bit_length() - 1
    started = False
    while bit >= 0:
        if window > bit + 1:
            window = bit + 1
        block = (exponent >> (bit + 1 - window)) & ((1 << window) - 1)
        trailing = 0
        odd = block
        while odd % 2 == 0:
            trailing += 1
            odd >>= 1
        bit -= window
        index = block >> (trailing + 1)
        if not started:
            degree = pari_flx_copy(w, table + 9 * index, w[degrees + index], running)
            started = True
        else:
            for i in range(window - trailing):
                degree = pari_flxq_sqr(w, running, degree, t, dt, p, temporary, scratch)
                pari_flx_copy(w, temporary, degree, running)
            degree = pari_flxq_mul(
                w,
                running,
                degree,
                table + 9 * index,
                w[degrees + index],
                t,
                dt,
                p,
                temporary,
                scratch,
            )
            pari_flx_copy(w, temporary, degree, running)
        for i in range(trailing):
            degree = pari_flxq_sqr(w, running, degree, t, dt, p, temporary, scratch)
            pari_flx_copy(w, temporary, degree, running)
        while bit >= 0:
            if (exponent >> bit) & 1:
                break
            degree = pari_flxq_sqr(w, running, degree, t, dt, p, temporary, scratch)
            pari_flx_copy(w, temporary, degree, running)
            bit -= 1
    return pari_flx_copy(w, running, degree, out)


@native
def pari_flxq_powers(
    w: IntegerBuffer,
    a: int,
    da: int,
    length: int,
    t: int,
    dt: int,
    p: int,
    out: int,
    degree_slots: int,
    scratch: int,
) -> int:
    """The length<=2 gen_powers prefix: one, copy x, square x.

    Reserve 9*(length+1) output slots, length+1 degree slots and18 scratch
    slots, all disjoint from inputs and each other. Return table length.
    """
    if length < 0 or length > 2:
        raise ValueError("small Flxq powers length frontier")
    if (
        out < 0
        or degree_slots < 0
        or scratch < 0
        or out + 9 * (length + 1) > len(w)
        or degree_slots + length + 1 > len(w)
        or scratch + 18 > len(w)
    ):
        raise ValueError("short Flxq powers workspace")
    for i in range(9):
        w[out + i] = 0
    w[out] = 1
    w[degree_slots] = 0
    if length == 0:
        return 1
    w[degree_slots + 1] = pari_flx_copy(w, a, da, out + 9)
    if length == 1:
        return 2
    w[degree_slots + 2] = pari_flxq_sqr(w, a, da, t, dt, p, out + 18, scratch)
    return 3


@native
def pari_flx_flxqv_eval(
    w: IntegerBuffer,
    q: int,
    dq: int,
    table: int,
    table_degrees: int,
    length: int,
    t: int,
    dt: int,
    p: int,
    out: int,
    scratch: int,
) -> int:
    """Source Flx_FlxqV_eval matrix blocks, length=2 and degree Q<=3.

    table contains 1,x,x², each nine slots. Use exactly54 disjoint scratch
    slots: two matrix-product columns, quotient operation scratch and two
    working polynomials. Coefficient matrix multiplication precedes the
    source descending quotient multiply/add loop, not polynomial Horner.
    """
    if length != 2 or dq < -1 or dq > 3 or dt < 1 or dt > 4:
        raise ValueError("small Flxq evaluation frontier")
    if (
        q < 0
        or table < 0
        or table_degrees < 0
        or out < 0
        or scratch < 0
        or q + 9 > len(w)
        or table + 27 > len(w)
        or table_degrees + 3 > len(w)
        or out + 9 > len(w)
        or scratch + 54 > len(w)
    ):
        raise ValueError("short Flxq evaluation workspace")
    if dq == -1:
        for i in range(9):
            w[out + i] = 0
        return -1
    n = 3
    columns = 1
    if dq + 1 > 3:
        n = 2
        columns = 2
    # Flm_mul(A,B): A consists of the first n table polynomials truncated
    # to dt coefficients; B consists of consecutive n-coefficient Q blocks.
    for column in range(columns):
        for row in range(9):
            w[scratch + 9 * column + row] = 0
        for row in range(dt):
            value = 0
            for k in range(n):
                position = column * n + k
                if position <= dq and row <= w[table_degrees + k]:
                    value += w[table + 9 * k + row] * w[q + position]
            w[scratch + 9 * column + row] = value % p
    last = scratch + 9 * (columns - 1)
    degree = dt - 1
    while degree >= 0 and w[last + degree] == 0:
        degree -= 1
    running = scratch + 36
    temporary = scratch + 45
    pari_flx_copy(w, last, degree, running)
    for column in range(columns - 2, -1, -1):
        degree = pari_flxq_mul(
            w,
            running,
            degree,
            table + 18,
            w[table_degrees + 2],
            t,
            dt,
            p,
            temporary,
            scratch + 18,
        )
        # Source Flx_add; both summands have degree less than dt.
        for row in range(dt):
            w[running + row] = (w[temporary + row] + w[scratch + 9 * column + row]) % p
        for row in range(dt, 9):
            w[running + row] = 0
        degree = dt - 1
        while degree >= 0 and w[running + degree] == 0:
            degree -= 1
    return pari_flx_copy(w, running, degree, out)
