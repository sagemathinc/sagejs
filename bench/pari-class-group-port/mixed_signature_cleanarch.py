"""PARI 2.17.4 mixed-signature `cleanarch` and `cleanarchunit` leaves.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the degree-four, signature `(2, 1)` specialization of
`buch2.c:899-973`. Archimedean values use three row-major `(real, imaginary)`
pairs per column. The first two rows are real places and reduce arguments
modulo `2*pi`; the last row is the complex place and reduces modulo `4*pi`.
The complex logarithm already contains PARI's doubled real component, so the
product-formula check is the ordinary sum of the three packed real parts.
"""

from sagejs.native import Float64Buffer, Int64Buffer, native


@native
def pari_cleanarch_mixed_quartic(
    source: Float64Buffer,
    columns: int,
    scratch: Float64Buffer,
    output: Float64Buffer,
    state: Int64Buffer,
    trace: Float64Buffer,
) -> int:
    """Normalize degree-four `(2, 1)` class logarithms transactionally.

    `state` is status, completed columns, published columns, and failing
    column. `trace` records the maximum input product-formula residual,
    maximum output residual, and maximum imaginary correction. Return one if
    argument reduction lacks a safe binary64 quotient; `output` then remains
    untouched.
    """

    rows = 3
    if columns < 0:
        raise ValueError("negative mixed cleanarch column count")
    size = rows * columns * 2
    if (
        len(source) < size
        or len(scratch) < size
        or len(output) < size
        or len(state) < 4
        or len(trace) < 3
    ):
        raise ValueError("short mixed cleanarch storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -1
    maximum_input = 0.0
    maximum_output = 0.0
    maximum_correction = 0.0
    for column in range(columns):
        norm_sum = 0.0
        for row in range(rows):
            at = 2 * (row * columns + column)
            real = source[at]
            imaginary = source[at + 1]
            if (
                real != real
                or imaginary != imaginary
                or abs(real) > 4503599627370496.0
                or abs(imaginary) > 4503599627370496.0
            ):
                state[0] = 1
                state[3] = column
                return 1
            norm_sum += real
        if abs(norm_sum) > maximum_input:
            maximum_input = abs(norm_sum)
        correction = -norm_sum / 4.0
        cleaned_sum = 0.0
        for row in range(rows):
            at = 2 * (row * columns + column)
            period = 6.283185307179586
            real_shift = correction
            if row >= 2:
                period = 12.566370614359172
                real_shift = 2.0 * correction
            reduced = source[at + 1]
            while reduced < 0.0:
                reduced += period
            while reduced >= period:
                reduced -= period
            if abs(reduced) < 1.0e-14 or abs(period - reduced) < 1.0e-14:
                reduced = 0.0
            scratch[at] = source[at] + real_shift
            scratch[at + 1] = reduced
            cleaned_sum += scratch[at]
            amount = abs(source[at + 1] - reduced)
            if amount > maximum_correction:
                maximum_correction = amount
        if abs(cleaned_sum) > maximum_output:
            maximum_output = abs(cleaned_sum)
        state[1] = column + 1
    for i in range(size):
        output[i] = scratch[i]
    trace[0] = maximum_input
    trace[1] = maximum_output
    trace[2] = maximum_correction
    state[0] = 0
    state[2] = columns
    return 0


@native
def pari_cleanarchunit_mixed_quartic(
    source: Float64Buffer,
    columns: int,
    expected_regulator: float,
    scratch: Float64Buffer,
    output: Float64Buffer,
    state: Int64Buffer,
    trace: Float64Buffer,
) -> int:
    """Clean mixed quartic unit logs and apply PARI's product/regulator gates.

    The field3 unit rank is two, hence exactly two columns are accepted.
    Return one for a product-formula failure, two for a regulator mismatch,
    and three for an unsafe argument reduction. No failure publishes output.
    """

    rows = 3
    if columns != 2 or expected_regulator <= 0.0:
        raise ValueError("unsupported mixed cleanarchunit boundary")
    size = rows * columns * 2
    if (
        len(source) < size
        or len(scratch) < size
        or len(output) < size
        or len(state) < 4
        or len(trace) < 6
    ):
        raise ValueError("short mixed cleanarchunit storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = -1
    maximum_correction = 0.0
    for column in range(columns):
        norm_sum = 0.0
        for row in range(rows):
            at = 2 * (row * columns + column)
            real = source[at]
            imaginary = source[at + 1]
            if (
                real != real
                or imaginary != imaginary
                or abs(real) > 4503599627370496.0
                or abs(imaginary) > 4503599627370496.0
            ):
                state[0] = 3
                state[3] = column
                return 3
            norm_sum += real
        trace[column] = norm_sum
        if abs(norm_sum) >= 0.0009765625:
            state[0] = 1
            state[3] = column
            return 1
        for row in range(rows):
            at = 2 * (row * columns + column)
            period = 6.283185307179586
            if row >= 2:
                period = 12.566370614359172
            reduced = source[at + 1]
            while reduced < 0.0:
                reduced += period
            while reduced >= period:
                reduced -= period
            if abs(reduced) < 1.0e-14 or abs(period - reduced) < 1.0e-14:
                reduced = 0.0
            scratch[at] = source[at]
            scratch[at + 1] = reduced
            amount = abs(source[at + 1] - reduced)
            if amount > maximum_correction:
                maximum_correction = amount
        state[1] = column + 1
    a = scratch[0]
    b = scratch[2]
    c = scratch[4]
    d = scratch[6]
    regulator = abs(a * d - b * c)
    difference = regulator - expected_regulator
    trace[2] = regulator
    trace[3] = difference
    trace[4] = maximum_correction
    trace[5] = abs((scratch[0] + scratch[4] + scratch[8]))
    other = abs(scratch[2] + scratch[6] + scratch[10])
    if other > trace[5]:
        trace[5] = other
    if abs(difference) >= 0.5:
        state[0] = 2
        return 2
    for i in range(size):
        output[i] = scratch[i]
    state[0] = 0
    state[2] = columns
    return 0
