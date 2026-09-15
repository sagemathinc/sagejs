"""Bounded resident-storage experiment for the real PARI HNFLLL workload.

This keeps the translated Havas--Majewski--Matthews algorithm and its packed
public boundary, but stores its mutable exact matrices in one lexical arena.
The primary entry includes allocation, copy-in, initialization, arithmetic,
and copy-out.  It is an experiment, not a replacement for `hnflll.py`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from sagejs.native import (
    Int64Buffer,
    IntegerBuffer,
    NativeExactArena,
    NativeIntegerVector,
    checked_uint64,
    native,
    uint64,
)


@native
def resident_hnflll_round_quotient(value: int, divisor: int) -> int:
    """Return PARI's nearest quotient, with ties toward positive infinity."""
    if divisor <= 0:
        raise ValueError("HNFLLL rounding requires positive divisor")
    quotient = abs(value) // divisor
    if value < 0:
        quotient = -quotient
    remainder = value - quotient * divisor
    if remainder == 0:
        return quotient
    twice = 2 * abs(remainder)
    if twice > divisor or (twice == divisor and value > 0):
        if value > 0:
            quotient += 1
        else:
            quotient -= 1
    return quotient


@native
def resident_hnflll_exact_quotient(value: int, divisor: int) -> int:
    """Check and perform the exact positive-divisor quotient."""
    if divisor <= 0 or value % divisor != 0:
        raise ValueError("invalid HNFLLL exact quotient")
    return value // divisor


@native
def resident_hnflll_normalize(
    a: NativeIntegerVector,
    u: NativeIntegerVector,
    rows: int,
    columns: int,
    j: int,
    lam: NativeIntegerVector,
    state: Int64Buffer,
) -> int:
    """Translate `findi_normalize` and `Minus` on resident vectors."""
    row = 0
    for i in range(rows):
        if a[(j - 1) * rows + i] != 0:
            row = i + 1
            break
    if row != 0 and a[(j - 1) * rows + row - 1] < 0:
        state[1] += 1
        for i in range(rows):
            index = (j - 1) * rows + i
            a[index] = -a[index]
        for i in range(columns):
            index = (j - 1) * columns + i
            u[index] = -u[index]
        for k in range(1, j):
            index = (j - 1) * columns + k - 1
            lam[index] = -lam[index]
        for k in range(j + 1, columns + 1):
            index = (k - 1) * columns + j - 1
            lam[index] = -lam[index]
    return row


@native
def resident_hnflll_reduce(
    a: NativeIntegerVector,
    u: NativeIntegerVector,
    rows: int,
    columns: int,
    k: int,
    j: int,
    lam: NativeIntegerVector,
    d: NativeIntegerVector,
    state: Int64Buffer,
) -> tuple[int, int]:
    """Translate `reduce2`, using resident addmul/submul mutations."""
    state[2] += 1
    row0 = resident_hnflll_normalize(a, u, rows, columns, j, lam, state)
    row1 = resident_hnflll_normalize(a, u, rows, columns, k, lam, state)
    quotient = 0
    if row0 != 0:
        state[3] += 1
        quotient = a[(k - 1) * rows + row0 - 1] // a[(j - 1) * rows + row0 - 1]
    elif abs(2 * lam[(k - 1) * columns + j - 1]) > d[j]:
        state[4] += 1
        quotient = resident_hnflll_round_quotient(lam[(k - 1) * columns + j - 1], d[j])
    else:
        state[5] += 1
        return row0, row1
    if quotient != 0:
        state[6] += 1
        quotient = -quotient
        if row0 != 0:
            for i in range(rows - 1, -1, -1):
                source = (j - 1) * rows + i
                if a[source] != 0:
                    a.addmul((k - 1) * rows + i, quotient, a[source])
        for i in range(columns - 1, -1, -1):
            source = (j - 1) * columns + i
            if u[source] != 0:
                u.addmul((k - 1) * columns + i, quotient, u[source])
        lam.addmul((k - 1) * columns + j - 1, quotient, d[j])
        for i in range(j - 1):
            source = (j - 1) * columns + i
            if lam[source] != 0:
                destination = (k - 1) * columns + i
                if quotient == 1:
                    lam.addmul(destination, 1, lam[source])
                elif quotient == -1:
                    lam.submul(destination, 1, lam[source])
                else:
                    lam.addmul(destination, quotient, lam[source])
    return row0, row1


@native
def resident_hnflll_swap(
    a: NativeIntegerVector,
    u: NativeIntegerVector,
    rows: int,
    columns: int,
    k: int,
    lam: NativeIntegerVector,
    d: NativeIntegerVector,
) -> int:
    """Translate `hnfswap`; full column swaps reuse resident entries."""
    for i in range(rows):
        a.swap((k - 1) * rows + i, (k - 2) * rows + i)
    for i in range(columns):
        u.swap((k - 1) * columns + i, (k - 2) * columns + i)
    for j in range(k - 2, 0, -1):
        lam.swap((k - 2) * columns + j - 1, (k - 1) * columns + j - 1)
    for i in range(k + 1, columns + 1):
        left_index = (i - 1) * columns + k - 2
        right_index = (i - 1) * columns + k - 1
        left = lam[left_index]
        right = lam[right_index]
        if left == 0 and right == 0:
            continue
        cross = lam[(k - 1) * columns + k - 2]
        second = resident_hnflll_exact_quotient(left * d[k] - right * cross, d[k - 1])
        first = resident_hnflll_exact_quotient(
            right * d[k - 2] + left * cross, d[k - 1]
        )
        lam[left_index] = first
        lam[right_index] = second
    cross = lam[(k - 1) * columns + k - 2]
    d[k - 1] = resident_hnflll_exact_quotient(d[k - 2] * d[k] + cross * cross, d[k - 1])
    return 0


@native
def pari_hnflll_resident_experiment(
    original: IntegerBuffer,
    rows: uint64,
    columns: uint64,
    output_h: IntegerBuffer,
    output_u: IntegerBuffer,
    output_lam: IntegerBuffer,
    output_d: IntegerBuffer,
    state: Int64Buffer,
    maximum_bits: uint64,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Run HNFLLL with bounded resident storage, including boundary copies."""
    matrix_size = rows * columns
    square_size = columns * columns
    d_size: uint64 = checked_uint64(columns + 1)
    if len(original) < matrix_size or len(output_h) < matrix_size:
        raise ValueError("short resident HNFLLL input or matrix output")
    if len(output_u) < square_size or len(output_lam) < square_size:
        raise ValueError("short resident HNFLLL square output")
    if len(output_d) < d_size or len(state) < 11:
        raise ValueError("short resident HNFLLL scalar output")
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        a = arena.integer_vector(matrix_size, maximum_bits)
        u = arena.integer_vector(square_size, maximum_bits)
        lam = arena.integer_vector(square_size, maximum_bits)
        d = arena.integer_vector(d_size, maximum_bits)
        for j in range(columns):
            for i in range(rows):
                a[j * rows + i] = original[j * rows + rows - i - 1]
        for i in range(square_size):
            u[i] = 0
            lam[i] = 0
        for i in range(columns):
            u[i * columns + i] = 1
        for i in range(d_size):
            d[i] = 1
        for state_index in range(11):
            state[state_index] = 0
        k = 2
        kmax = 2
        while k < columns + 1:
            state[0] += 1
            row0, row1 = resident_hnflll_reduce(
                a, u, rows, columns, k, k - 1, lam, d, state
            )
            swap = 0
            if row0 != 0:
                if row1 == 0 or row0 <= row1:
                    swap = 1
            elif row1 == 0:
                state[8] += 1
                cross = lam[(k - 1) * columns + k - 2]
                if d[k - 2] * d[k] + cross * cross < d[k - 1] * d[k - 1]:
                    swap = 1
            if swap != 0:
                state[7] += 1
                resident_hnflll_swap(a, u, rows, columns, k, lam, d)
                if k > 2:
                    k -= 1
            else:
                for reduce_index in range(k - 2, 0, -1):
                    row0, row1 = resident_hnflll_reduce(
                        a, u, rows, columns, k, reduce_index, lam, d, state
                    )
                k += 1
                if k > kmax:
                    kmax = k
        if columns == 1:
            resident_hnflll_normalize(a, u, rows, columns, 1, lam, state)
        for j in range(columns):
            reverse_index: uint64 = 0
            while reverse_index + reverse_index < rows:
                a.swap(
                    j * rows + reverse_index,
                    j * rows + rows - reverse_index - 1,
                )
                reverse_index += 1
        state[9] = k
        state[10] = kmax
        for i in range(matrix_size):
            output_h[i] = a[i]
        for i in range(square_size):
            output_u[i] = u[i]
            output_lam[i] = lam[i]
        for i in range(d_size):
            output_d[i] = d[i]
        return 0


@native
def resident_hnflll_alias_probe(
    output: IntegerBuffer,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Exercise destination/operand aliasing and swap on resident entries."""
    if len(output) < 2:
        raise ValueError("short resident alias output")
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(2, 32)
        values[0] = 2
        values[1] = 3
        values.addmul(0, values[0], values[1])
        values.submul(1, values[1], values[1])
        values.swap(0, 1)
        output[0] = values[0]
        output[1] = values[1]
        return 0


@native
def resident_hnflll_overflow_probe(
    output: IntegerBuffer,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    """Fail before publishing when a bounded resident addmul cannot fit."""
    if len(output) < 1:
        raise ValueError("short resident overflow output")
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        values = arena.integer_vector(1, 8)
        values[0] = 127
        values.addmul(0, values[0], 2)
        output[0] = values[0]
        return 0
