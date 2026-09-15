"""PARI 2.17.4 small Flx quotient-ring powering.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate Flx.c Flxq_mul/sqr/powu and bb_group.c gen_powu_i, including its
binary/sliding-window schedule. Coefficient arithmetic uses flx_small.
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
    int64_pari_flx_mul,
    int64_pari_flx_sqr,
    int64_pari_flx_rem,
)

FLXQ_OPERATION_SCRATCH = 18
FLXQ_POWER_SCRATCH = 90
FLXQ_EVAL_SCRATCH = 54


@native
def int64_positive_bit_length(value: int64) -> int64:
    """Return bit length in the admitted nonnegative int64 domain."""
    bits: int64 = 0
    while value != 0:
        value //= 2
        bits += 1
    return checked_int64(bits)


@native
def int64_power_of_two(exponent: int64) -> int64:
    value: int64 = 1
    while exponent > 0:
        value *= 2
        exponent -= 1
    return checked_int64(value)


@native
def int64_shift_right(value: int64, shift: int64) -> int64:
    while shift > 0:
        value //= 2
        shift -= 1
    return checked_int64(value)


@native
def int64_pari_flxq_mul(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    b: int64,
    db: int64,
    t: int64,
    dt: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
    """Source multiply then remainder; reserve 18 disjoint scratch slots."""
    d: int64 = int64_pari_flx_mul(w, a, da, b, db, p, scratch)
    return checked_int64(int64_pari_flx_rem(w, scratch, d, t, dt, p, out, scratch + 9))


@native
def int64_pari_flxq_sqr(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    t: int64,
    dt: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
    """Source square then remainder; reserve 18 disjoint scratch slots."""
    d: int64 = int64_pari_flx_sqr(w, a, da, p, scratch)
    return checked_int64(int64_pari_flx_rem(w, scratch, d, t, dt, p, out, scratch + 9))


@native
def int64_pari_flxq_powu(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    exponent: int64,
    t: int64,
    dt: int64,
    p: uint64,
    out: int64,
    scratch: int64,
    degree_work: Int64Buffer,
    degree_work_start: int64,
) -> int64:
    """Power with exactly the source multiplication schedule, without pre-reduction.

    Odd prime p is a caller assumption, 0<=dt<=4 and -1<=da<=4. Each
    polynomial occupies nine slots; inputs, output and 90-slot scratch are
    disjoint. Output publication uses copies, never changes input owners.
    No special-case source dispatcher or alternative powering algorithm.
    """
    if exponent < 0 or exponent > 3037000493:
        raise ValueError("Flxq exponent outside admitted catalog corridor")
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
    _range_0_0: int64 = da + 1
    i: int64 = 0
    for i in range(_range_0_0):
        if w[a + i] >= p:
            raise ValueError("noncanonical Flxq coefficient")
    _range_1_0: int64 = dt + 1
    i: int64 = 0
    for i in range(_range_1_0):
        if w[t + i] >= p:
            raise ValueError("noncanonical Flxq modulus")
    if (da >= 0 and w[a + da] == 0) or w[t + dt] == 0:
        raise ValueError("noncanonical Flxq degree")
    if exponent == 0:
        _range_2_0: int64 = 9
        i: int64 = 0
        for i in range(_range_2_0):
            w[out + i] = 0
        w[out] = 1
        return checked_int64(0)
    if exponent == 1:
        return checked_int64(int64_pari_flx_copy(w, a, da, out))
    if exponent == 2:
        return checked_int64(int64_pari_flxq_sqr(w, a, da, t, dt, p, out, scratch))
    temporary: int64 = scratch + 18
    running: int64 = scratch + 81
    degree: int64 = da
    if exponent < 512:
        degree = int64_pari_flx_copy(w, a, da, running)
        # Source highest bit is implicit, then square/multiply left to right.
        bit: int64 = int64_positive_bit_length(exponent) - 2
        while bit >= 0:
            degree = int64_pari_flxq_sqr(
                w, running, degree, t, dt, p, temporary, scratch
            )
            int64_pari_flx_copy(w, temporary, degree, running)
            if int64_shift_right(exponent, bit) % 2:
                degree = int64_pari_flxq_mul(
                    w, running, degree, a, da, t, dt, p, temporary, scratch
                )
                int64_pari_flx_copy(w, temporary, degree, running)
            bit -= 1
        return checked_int64(int64_pari_flx_copy(w, running, degree, out))
    window: int64 = 2
    if exponent >= 33554432:
        window = 3
    count: int64 = int64_power_of_two(window - 1)
    square: int64 = scratch + 27
    table: int64 = scratch + 36
    degrees: int64 = degree_work_start
    if degree_work_start < 0 or degree_work_start + 4 > len(degree_work):
        raise ValueError("short bounded Flxq degree workspace")
    square_degree: int64 = int64_pari_flxq_sqr(w, a, da, t, dt, p, square, scratch)
    degree_work[degrees] = int64_pari_flx_copy(w, a, da, table)
    _range_3_0: int64 = 1
    _range_3_1: int64 = count
    i: int64 = 0
    for i in range(_range_3_0, _range_3_1):
        degree_work[degrees + i] = int64_pari_flxq_mul(
            w,
            table + 9 * (i - 1),
            degree_work[degrees + i - 1],
            square,
            square_degree,
            t,
            dt,
            p,
            table + 9 * i,
            scratch,
        )
    bit = int64_positive_bit_length(exponent) - 1
    started = False
    while bit >= 0:
        if window > bit + 1:
            window = bit + 1
        block: int64 = int64_shift_right(
            exponent, bit + 1 - window
        ) % int64_power_of_two(window)
        trailing: int64 = 0
        odd: int64 = block
        while odd % 2 == 0:
            trailing += 1
            odd //= 2
        bit -= window
        index: int64 = int64_shift_right(block, trailing + 1)
        if not started:
            degree = int64_pari_flx_copy(
                w, table + 9 * index, degree_work[degrees + index], running
            )
            started = True
        else:
            _range_4_0: int64 = window - trailing
            i: int64 = 0
            for i in range(_range_4_0):
                degree = int64_pari_flxq_sqr(
                    w, running, degree, t, dt, p, temporary, scratch
                )
                int64_pari_flx_copy(w, temporary, degree, running)
            degree = int64_pari_flxq_mul(
                w,
                running,
                degree,
                table + 9 * index,
                degree_work[degrees + index],
                t,
                dt,
                p,
                temporary,
                scratch,
            )
            int64_pari_flx_copy(w, temporary, degree, running)
        _range_5_0: int64 = trailing
        i: int64 = 0
        for i in range(_range_5_0):
            degree = int64_pari_flxq_sqr(
                w, running, degree, t, dt, p, temporary, scratch
            )
            int64_pari_flx_copy(w, temporary, degree, running)
        while bit >= 0:
            if int64_shift_right(exponent, bit) % 2:
                break
            degree = int64_pari_flxq_sqr(
                w, running, degree, t, dt, p, temporary, scratch
            )
            int64_pari_flx_copy(w, temporary, degree, running)
            bit -= 1
    return checked_int64(int64_pari_flx_copy(w, running, degree, out))


@native
def int64_pari_flxq_powers(
    w: UInt64Buffer,
    a: int64,
    da: int64,
    length: int64,
    t: int64,
    dt: int64,
    p: uint64,
    out: int64,
    degree_values: Int64Buffer,
    degree_slots: int64,
    scratch: int64,
) -> int64:
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
        or degree_slots + length + 1 > len(degree_values)
        or scratch + 18 > len(w)
    ):
        raise ValueError("short Flxq powers workspace")
    _range_6_0: int64 = 9
    i: int64 = 0
    for i in range(_range_6_0):
        w[out + i] = 0
    w[out] = 1
    degree_values[degree_slots] = 0
    if length == 0:
        return checked_int64(1)
    degree_values[degree_slots + 1] = int64_pari_flx_copy(w, a, da, out + 9)
    if length == 1:
        return checked_int64(2)
    degree_values[degree_slots + 2] = int64_pari_flxq_sqr(
        w, a, da, t, dt, p, out + 18, scratch
    )
    return checked_int64(3)


@native
def int64_pari_flx_flxqv_eval(
    w: UInt64Buffer,
    q: int64,
    dq: int64,
    table: int64,
    degree_values: Int64Buffer,
    table_degrees: int64,
    length: int64,
    t: int64,
    dt: int64,
    p: uint64,
    out: int64,
    scratch: int64,
) -> int64:
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
        or table_degrees + 3 > len(degree_values)
        or out + 9 > len(w)
        or scratch + 54 > len(w)
    ):
        raise ValueError("short Flxq evaluation workspace")
    if dq == -1:
        _range_7_0: int64 = 9
        i: int64 = 0
        for i in range(_range_7_0):
            w[out + i] = 0
        return checked_int64(-1)
    n: int64 = 3
    columns: int64 = 1
    if dq + 1 > 3:
        n = 2
        columns = 2
    # Flm_mul(A,B): A consists of the first n table polynomials truncated
    # to dt coefficients; B consists of consecutive n-coefficient Q blocks.
    _range_8_0: int64 = columns
    column: int64 = 0
    for column in range(_range_8_0):
        _range_9_0: int64 = 9
        row: int64 = 0
        for row in range(_range_9_0):
            w[scratch + 9 * column + row] = 0
        _range_10_0: int64 = dt
        row: int64 = 0
        for row in range(_range_10_0):
            value = 0
            _range_11_0: int64 = n
            k: int64 = 0
            for k in range(_range_11_0):
                position: int64 = column * n + k
                if position <= dq and row <= degree_values[table_degrees + k]:
                    value += w[table + 9 * k + row] * w[q + position]
            w[scratch + 9 * column + row] = value % p
    last: int64 = scratch + 9 * (columns - 1)
    degree: int64 = dt - 1
    while degree >= 0 and w[last + degree] == 0:
        degree -= 1
    running: int64 = scratch + 36
    temporary: int64 = scratch + 45
    int64_pari_flx_copy(w, last, degree, running)
    _range_12_0: int64 = columns - 2
    _range_12_1: int64 = -1
    _range_12_2: int64 = -1
    column: int64 = 0
    for column in range(_range_12_0, _range_12_1, _range_12_2):
        degree = int64_pari_flxq_mul(
            w,
            running,
            degree,
            table + 18,
            degree_values[table_degrees + 2],
            t,
            dt,
            p,
            temporary,
            scratch + 18,
        )
        # Source Flx_add; both summands have degree less than dt.
        _range_13_0: int64 = dt
        row: int64 = 0
        for row in range(_range_13_0):
            w[running + row] = (w[temporary + row] + w[scratch + 9 * column + row]) % p
        _range_14_0: int64 = dt
        _range_14_1: int64 = 9
        row: int64 = 0
        for row in range(_range_14_0, _range_14_1):
            w[running + row] = 0
        degree = dt - 1
        while degree >= 0 and w[running + degree] == 0:
            degree -= 1
    return checked_int64(int64_pari_flx_copy(w, running, degree, out))
