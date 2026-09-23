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
    two: int64 = 2
    one: int64 = 1
    two_unsigned: uint64 = 2
    if exponent < 0 or exponent > 3037000493:
        raise ValueError("Flxq exponent outside admitted catalog corridor")
    if p <= two_unsigned or p > 3037000493 or p % two_unsigned == 0:
        raise ValueError("Flxq requires an odd word prime")
    if dt < 0 or dt > 4 or da < -1 or da > 4:
        raise ValueError("Flxq small quotient degree frontier")
    if a < 0 or t < 0 or out < 0 or scratch < 0:
        raise ValueError("negative Flxq owner")
    w_length: int64 = checked_int64(len(w))
    a_end: int64 = a + 9
    t_end: int64 = t + 9
    out_end: int64 = out + 9
    scratch_end: int64 = scratch + 90
    if (
        a_end > w_length
        or t_end > w_length
        or out_end > w_length
        or scratch_end > w_length
    ):
        raise ValueError("short Flxq owner")
    if (
        (a < t_end and t < a_end)
        or (a < out_end and out < a_end)
        or (t < out_end and out < t_end)
    ):
        raise ValueError("overlapping Flxq polynomial owners")
    if (
        (a < scratch_end and scratch < a_end)
        or (t < scratch_end and scratch < t_end)
        or (out < scratch_end and scratch < out_end)
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
            if int64_shift_right(exponent, bit) % two:
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
    degree_work_length: int64 = checked_int64(len(degree_work))
    degree_work_end: int64 = degree_work_start + 4
    if degree_work_start < 0 or degree_work_end > degree_work_length:
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
        if window > bit + one:
            window = bit + one
        block: int64 = int64_shift_right(
            exponent, bit + 1 - window
        ) % int64_power_of_two(window)
        trailing: int64 = 0
        odd: int64 = block
        while odd % two == 0:
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
            if int64_shift_right(exponent, bit) % two:
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
    w_length: int64 = checked_int64(len(w))
    degree_values_length: int64 = checked_int64(len(degree_values))
    output_slots: int64 = 9 * (length + 1)
    output_end: int64 = out + output_slots
    degree_values_end: int64 = degree_slots + length + 1
    scratch_end: int64 = scratch + 18
    if (
        out < 0
        or degree_slots < 0
        or scratch < 0
        or output_end > w_length
        or degree_values_end > degree_values_length
        or scratch_end > w_length
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
    w_length: int64 = checked_int64(len(w))
    degree_values_length: int64 = checked_int64(len(degree_values))
    q_end: int64 = q + 9
    table_end: int64 = table + 27
    table_degrees_end: int64 = table_degrees + 3
    out_end: int64 = out + 9
    scratch_end: int64 = scratch + 54
    if (
        q < 0
        or table < 0
        or table_degrees < 0
        or out < 0
        or scratch < 0
        or q_end > w_length
        or table_end > w_length
        or table_degrees_end > degree_values_length
        or out_end > w_length
        or scratch_end > w_length
    ):
        raise ValueError("short Flxq evaluation workspace")
    one: int64 = 1
    two: int64 = 2
    three: int64 = 3
    nine: int64 = 9
    eighteen: int64 = 18
    if dq == -1:
        _range_7_0: int64 = 9
        i: int64 = 0
        for i in range(_range_7_0):
            w[out + i] = 0
        return checked_int64(-1)
    n: int64 = 3
    columns: int64 = 1
    if dq + one > three:
        n = two
        columns = two
    # Flm_mul(A,B): A consists of the first n table polynomials truncated
    # to dt coefficients; B consists of consecutive n-coefficient Q blocks.
    _range_8_0: int64 = columns
    column: int64 = 0
    for column in range(_range_8_0):
        _range_9_0: int64 = 9
        row: int64 = 0
        for row in range(_range_9_0):
            w[scratch + nine * column + row] = 0
        _range_10_0: int64 = dt
        row: int64 = 0
        for row in range(_range_10_0):
            value: uint64 = 0
            _range_11_0: int64 = n
            k: int64 = 0
            for k in range(_range_11_0):
                position: int64 = column * n + k
                table_degree: int64 = degree_values[table_degrees + k]
                if position <= dq and row <= table_degree:
                    left: uint64 = w[table + nine * k + row]
                    right: uint64 = w[q + position]
                    value += left * right
            w[scratch + nine * column + row] = value % p
    last: int64 = scratch + nine * (columns - one)
    degree: int64 = dt - one
    while degree >= 0 and w[last + degree] == 0:
        degree -= 1
    running: int64 = scratch + 36
    temporary: int64 = scratch + 45
    int64_pari_flx_copy(w, last, degree, running)
    _range_12_0: int64 = columns - two
    _range_12_1: int64 = -1
    _range_12_2: int64 = -1
    column: int64 = 0
    for column in range(_range_12_0, _range_12_1, _range_12_2):
        degree = int64_pari_flxq_mul(
            w,
            running,
            degree,
            table + eighteen,
            degree_values[table_degrees + two],
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
            left: uint64 = w[temporary + row]
            right: uint64 = w[scratch + nine * column + row]
            w[running + row] = (left + right) % p
        _range_14_0: int64 = dt
        _range_14_1: int64 = 9
        row: int64 = 0
        for row in range(_range_14_0, _range_14_1):
            w[running + row] = 0
        degree = dt - one
        while degree >= 0 and w[running + degree] == 0:
            degree -= 1
    return checked_int64(int64_pari_flx_copy(w, running, degree, out))
