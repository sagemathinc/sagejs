"""PARI 2.17.4's rank-two fundamental-unit lattice suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the bounded totally-real cubic cut used after relation acceptance.  It
preserves the two source transformations: rectangular integer `ZM_lll` on the
rank-two relation lattice, then `lll(real_i(A) * U1)` through PARI's exact
real-to-integer rescale and binary quadratic-form shortcut.  Complex unit
reconstruction (`getfu`) is deliberately a later boundary.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, native

from .lll_dpe_pass import pari_lll_dpe
from .lll_fast import pari_lll_fast
from .lll_rescale import pari_lll_rescale


@native
def pari_unit_integer_lattice_rank_two(
    original: IntegerBuffer,
    columns: int,
    u1: IntegerBuffer,
    state: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    gram: IntegerBuffer,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    approximate: Float64Buffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    dpe_float_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
) -> int:
    """Return PARI's `U1` for a two-row, rank-two relation lattice.

    Matrices are column-major. The `columns < 199` guard is
    `extract_full_lattice`'s source `NULL` shortcut. `state` is `(fast zeros,
    DPE zeros, output columns, status, selector status)`, where selector status
    0 is that shortcut. Status 0 is success, 1 is an unsupported rank/fallback.
    The frozen cubic inputs do not select FLATTER or a higher-precision retry.
    """
    rows = 2
    if columns < 2 or columns >= 199:
        raise ValueError("rank-two unit lattice needs at least two columns")
    square = columns * columns
    if (
        len(original) < rows * columns
        or len(u1) < columns * 2
        or len(state) < 5
        or len(basis) < rows * columns
        or len(transform) < square
        or len(gram) < square
        or len(mu) < square
        or len(mu_exponents) < square
        or len(r) < square
        or len(r_exponents) < square
        or len(s) < columns
        or len(s_exponents) < columns
        or len(approximate) < rows * columns
        or len(float_gram) < square
        or len(alpha) < columns
        or len(column) < columns
        or len(column_exponents) < columns
        or len(normalized) < columns
        or len(temporary) < columns
        or len(dpe_float_scratch) < columns
        or len(integer_scratch) < columns
    ):
        raise ValueError("short rank-two unit lattice workspace")
    for i in range(5):
        state[i] = -1
    state[4] = 0
    for j in range(columns):
        for i in range(rows):
            basis[j * rows + i] = original[j * rows + i]
        for i in range(columns):
            transform[j * columns + i] = 0
        transform[j * columns + j] = 1
    fast_zeros = pari_lll_fast(
        basis,
        transform,
        rows,
        columns,
        columns,
        0.99,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        column_exponents,
        float_gram,
        alpha,
        column,
        integer_scratch,
        normalized,
        temporary,
    )
    state[0] = fast_zeros
    if fast_zeros < 0:
        state[3] = 1
        return 1
    dpe_zeros = pari_lll_dpe(
        gram,
        basis,
        transform,
        rows,
        columns,
        columns,
        True,
        0.99,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        integer_scratch,
        dpe_float_scratch,
    )
    state[1] = dpe_zeros
    if dpe_zeros != columns - 2:
        state[3] = 1
        return 1
    for j in range(2):
        for i in range(columns):
            u1[j * columns + i] = transform[(dpe_zeros + j) * columns + i]
    state[2] = 2
    state[3] = 0
    return 0


@native
def pari_unit_real_lattice_rank_two(
    matrix_triples: IntegerBuffer,
    rows: int,
    integers: IntegerBuffer,
    u2: IntegerBuffer,
    form: IntegerBuffer,
    basis: IntegerBuffer,
    transform: IntegerBuffer,
    gram: IntegerBuffer,
    mu: Float64Buffer,
    mu_exponents: IntegerBuffer,
    r: Float64Buffer,
    r_exponents: IntegerBuffer,
    s: Float64Buffer,
    s_exponents: IntegerBuffer,
    approximate: Float64Buffer,
    float_gram: Float64Buffer,
    alpha: IntegerBuffer,
    column: IntegerBuffer,
    column_exponents: IntegerBuffer,
    normalized: Float64Buffer,
    temporary: Float64Buffer,
    dpe_float_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Run `lll(P)` for a full-rank `rows`-by-two PARI real matrix.

    Input is row-major `(mantissa, bit_precision, exponent)` storage. The
    exact rescale is shared with `RgM_rescale_to_int`; the resulting integer
    matrix follows PARI's fast and mandatory DPE LLL passes.
    """
    if rows < 2 or len(matrix_triples) != rows * 2 * 3:
        raise ValueError("invalid real unit lattice shape")
    if (
        len(integers) < rows * 2
        or len(u2) < 4
        or len(form) < 3
        or len(basis) < rows * 2
        or len(transform) < 4
        or len(gram) < 4
        or len(mu) < 4
        or len(mu_exponents) < 4
        or len(r) < 4
        or len(r_exponents) < 4
        or len(s) < 2
        or len(s_exponents) < 2
        or len(approximate) < rows * 2
        or len(float_gram) < 4
        or len(alpha) < 2
        or len(column) < rows
        or len(column_exponents) < rows
        or len(normalized) < rows
        or len(temporary) < rows
        or len(dpe_float_scratch) < rows
        or len(integer_scratch) < rows
        or len(state) < 2
    ):
        raise ValueError("short real unit lattice workspace")
    pari_lll_rescale(matrix_triples, integers)
    a = 0
    b = 0
    c = 0
    for i in range(rows):
        x = integers[i * 2]
        y = integers[i * 2 + 1]
        a += x * x
        b += 2 * x * y
        c += y * y
    form[0] = a
    form[1] = b
    form[2] = c
    for j in range(2):
        for i in range(rows):
            basis[j * rows + i] = integers[i * 2 + j]
    transform[0] = 1
    transform[1] = 0
    transform[2] = 0
    transform[3] = 1
    state[0] = pari_lll_fast(
        basis,
        transform,
        rows,
        2,
        2,
        0.75,
        0.51,
        False,
        mu,
        r,
        s,
        approximate,
        column_exponents,
        float_gram,
        alpha,
        column,
        integer_scratch,
        normalized,
        temporary,
    )
    if state[0] < 0:
        return 1
    state[1] = pari_lll_dpe(
        gram,
        basis,
        transform,
        rows,
        2,
        2,
        True,
        0.75,
        0.51,
        False,
        mu,
        mu_exponents,
        r,
        r_exponents,
        s,
        s_exponents,
        alpha,
        integer_scratch,
        dpe_float_scratch,
    )
    if state[1] != 0:
        return 1
    u2[0] = transform[0]
    u2[1] = transform[2]
    u2[2] = transform[1]
    u2[3] = transform[3]
    return 0


@native
def pari_unit_compose_rank_two(
    u1: IntegerBuffer,
    rows: int,
    u2: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Compute `U1 * U2`; U1/output are column-major, U2 row-major."""
    if rows < 1 or len(u1) < rows * 2 or len(u2) < 4 or len(output) < rows * 2:
        raise ValueError("short unit transform storage")
    for i in range(rows):
        x = u1[i]
        y = u1[rows + i]
        output[i] = x * u2[0] + y * u2[2]
        output[rows + i] = x * u2[1] + y * u2[3]
    return 0


@native
def pari_cleanarchunit_real_cubic(
    arch: Float64Buffer,
    columns: int,
    expected_regulator: float,
    clean: Float64Buffer,
    trace: Float64Buffer,
) -> int:
    """Totally-real cubic `cleanarchunit` and `get_regulator` decision.

    `arch` and `clean` are row-major `(real, imaginary)` pairs. Return 0 on
    source acceptance, 1 when a unit log-norm fails, and 2 when the absolute
    regulator discrepancy is at least 1/2. Trace stores the two column sums,
    computed regulator, signed discrepancy, and maximum imaginary correction.
    """
    rows = 3
    if columns != 2 or expected_regulator <= 0.0:
        raise ValueError("unsupported cleanarchunit boundary")
    if len(arch) < rows * columns * 2 or len(clean) < rows * columns * 2:
        raise ValueError("short archimedean unit storage")
    if len(trace) < 5:
        raise ValueError("short cleanarchunit trace")
    sum0 = 0.0
    sum1 = 0.0
    for i in range(rows):
        sum0 += arch[(i * columns) * 2]
        sum1 += arch[(i * columns + 1) * 2]
    trace[0] = sum0
    trace[1] = sum1
    if abs(sum0) >= 0.001953125 or abs(sum1) >= 0.001953125:
        trace[2] = 0.0
        trace[3] = 0.0
        trace[4] = 0.0
        return 1
    period = 6.283185307179586
    maximum = 0.0
    for i in range(rows * columns):
        re = arch[2 * i]
        im = arch[2 * i + 1]
        reduced = im
        while reduced < 0.0:
            reduced += period
        while reduced >= period:
            reduced -= period
        distance = abs(reduced)
        other = abs(period - reduced)
        if other < distance:
            distance = other
        if distance < 1.0e-9:
            reduced = 0.0
        clean[2 * i] = re
        clean[2 * i + 1] = reduced
        correction = abs(im - reduced)
        if correction > maximum:
            maximum = correction
    a = clean[0]
    b = clean[2]
    c = clean[4]
    d = clean[6]
    regulator = abs(a * d - b * c)
    difference = regulator - expected_regulator
    trace[2] = regulator
    trace[3] = difference
    trace[4] = maximum
    if abs(difference) >= 0.5:
        return 2
    return 0
