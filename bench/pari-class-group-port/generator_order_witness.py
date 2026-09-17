"""Exact replay of the nontrivial cubic generator order witness.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a deliberately frozen continuation of the PARI 2.17.4
``class_group_gen`` experiment for ``x^3 - 200*x + 7``.  The preceding
signed-``genback`` leaf publishes the generator ideal, its ordered compact
principal factors, and the Smith identity.  This leaf retains that provenance
and independently verifies the missing order relation ``I**24 = (alpha)`` by
exact ideal arithmetic.  PARI is not called by this source boundary.

All cubic ideals and multiplication matrices are row-major.  The private
column-HNF routine uses exact integer Bezout operations, so unlike the earlier
word-modulus reduction helper it continues past the 64-bit norm boundary.
"""

from sagejs.native import IntegerBuffer, native

from .composite_ideal_hnf import pari_hnf_column_step
from .signed_prime_ideal_reduction import pari_cubic_mul_matrix


@native
def _pari_exact_cubic_column_hnf(
    original: IntegerBuffer,
    columns: int,
    work: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Return the exact rank-three column HNF of up to nine generators."""
    if columns < 3 or columns > 9:
        raise ValueError("unsupported exact cubic HNF shape")
    if len(original) < 3 * columns or len(work) < 3 * columns or len(output) < 9:
        raise ValueError("short exact cubic HNF storage")
    for i in range(3 * columns):
        work[i] = original[i]

    destination = columns - 1
    row = 2
    while row >= 0:
        pivot_column = -1
        for column in range(destination + 1):
            if work[row * columns + column] != 0:
                pivot_column = column
                break
        if pivot_column < 0:
            return -1
        if pivot_column != destination:
            for source_row in range(3):
                temporary = work[source_row * columns + destination]
                work[source_row * columns + destination] = work[
                    source_row * columns + pivot_column
                ]
                work[source_row * columns + pivot_column] = temporary

        for column in range(destination):
            left = work[row * columns + column]
            if left != 0:
                right = work[row * columns + destination]
                pari_hnf_column_step(
                    work,
                    3,
                    columns,
                    column,
                    destination,
                    left,
                    right,
                )
        pivot = work[row * columns + destination]
        if pivot < 0:
            pivot = -pivot
            for source_row in range(3):
                work[source_row * columns + destination] = -work[
                    source_row * columns + destination
                ]
        if pivot == 0:
            return -1

        # Previously selected columns have zero entries below this row.  Their
        # current-row entries can therefore be reduced without disturbing the
        # already selected lower pivots.
        for column in range(destination + 1, columns):
            value = work[row * columns + column]
            remainder = value % pivot
            quotient = (value - remainder) // pivot
            if quotient != 0:
                for source_row in range(3):
                    work[source_row * columns + column] -= (
                        quotient * work[source_row * columns + destination]
                    )
        destination -= 1
        row -= 1

    first = columns - 3
    for output_row in range(3):
        for output_column in range(3):
            output[output_row * 3 + output_column] = work[
                output_row * columns + first + output_column
            ]
    return 0


@native
def _pari_exact_cubic_ideal_multiply(
    left: IntegerBuffer,
    right: IntegerBuffer,
    multiplication_table: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_work: IntegerBuffer,
    output: IntegerBuffer,
) -> int:
    """Multiply integral cubic ideals without a machine-word norm bound."""
    if (
        len(left) < 9
        or len(right) < 9
        or len(multiplication_table) < 27
        or len(generators) < 27
        or len(hnf_work) < 27
        or len(output) < 9
    ):
        raise ValueError("short exact cubic ideal-product storage")
    for left_column in range(3):
        for right_column in range(3):
            column = 3 * left_column + right_column
            for output_coordinate in range(3):
                value = 0
                for left_coordinate in range(3):
                    for right_coordinate in range(3):
                        value += (
                            multiplication_table[
                                (left_coordinate * 3 + right_coordinate) * 3
                                + output_coordinate
                            ]
                            * left[left_coordinate * 3 + left_column]
                            * right[right_coordinate * 3 + right_column]
                        )
                generators[output_coordinate * 9 + column] = value
    return _pari_exact_cubic_column_hnf(generators, 9, hnf_work, output)


@native
def pari_cubic_generator_order_witness_frozen(
    generator_ideal: IntegerBuffer,
    invariant: int,
    multiplication_table: IntegerBuffer,
    relation_hnf: IntegerBuffer,
    relation_exponents: IntegerBuffer,
    smith_m1: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_values: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    factor_metadata: IntegerBuffer,
    principal_numerator: IntegerBuffer,
    principal_denominator: int,
    base: IntegerBuffer,
    accumulator: IntegerBuffer,
    product: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_work: IntegerBuffer,
    principal_matrix: IntegerBuffer,
    principal_hnf_work: IntegerBuffer,
    principal_hnf_scratch: IntegerBuffer,
    trace_work: IntegerBuffer,
    power_ideal: IntegerBuffer,
    principal_hnf: IntegerBuffer,
    retained_factor_kinds: IntegerBuffer,
    retained_factor_values: IntegerBuffer,
    retained_factor_exponents: IntegerBuffer,
    retained_factor_metadata: IntegerBuffer,
    power_trace: IntegerBuffer,
    state: IntegerBuffer,
) -> int:
    """Verify and publish the exact ``I**24`` principal witness.

    The four compact factors are the source-order output of the already
    authenticated signed-``genback`` reduction.  They are deliberately
    checked here because this frozen leaf is a provenance replay, not a public
    generic ideal-power operation.  Algebraic rejection publishes no ideal,
    factor, HNF, or trace output.
    """
    factor_count = 0
    if len(factor_metadata) >= 1:
        factor_count = factor_metadata[0]
    if (
        len(generator_ideal) < 9
        or len(multiplication_table) < 27
        or len(relation_hnf) < 4
        or len(relation_exponents) < 2
        or len(smith_m1) < 2
        or len(principal_numerator) < 3
        or len(base) < 9
        or len(accumulator) < 9
        or len(product) < 9
        or len(generators) < 27
        or len(hnf_work) < 27
        or len(principal_matrix) < 9
        or len(principal_hnf_work) < 9
        or len(principal_hnf_scratch) < 9
        or len(trace_work) < 54
        or len(power_ideal) < 9
        or len(principal_hnf) < 9
        or len(power_trace) < 54
        or len(state) < 10
    ):
        raise ValueError("short cubic generator-order witness storage")
    if factor_count != 4:
        return -1
    if (
        len(factor_kinds) < factor_count
        or len(factor_values) < 4 * factor_count
        or len(factor_exponents) < factor_count
        or len(retained_factor_kinds) < factor_count
        or len(retained_factor_values) < 4 * factor_count
        or len(retained_factor_exponents) < factor_count
        or len(retained_factor_metadata) < 1
    ):
        raise ValueError("short retained genback factor storage")
    for i in range(10):
        state[i] = 0
    state[0] = -1
    if invariant != 24 or principal_denominator <= 0:
        return -1

    # Authenticate the exact Smith order identity r*24 = W*m1.
    for row in range(2):
        right = 0
        for column in range(2):
            right += relation_hnf[column * 2 + row] * smith_m1[column]
        if relation_exponents[row] * invariant != right:
            return -1
        state[3] += 1

    # Preserve and authenticate the exact source-order signed-genback tape:
    # 1/8, 1/5, (-17 + w)^-1, 40.  This is intentionally field-specific.
    expected_kind = [0, 0, 1, 0]
    expected_a = [1, 1, -17, 40]
    expected_b = [0, 0, 1, 0]
    expected_c = [0, 0, 0, 0]
    expected_denominator = [8, 5, 1, 1]
    expected_exponent = [1, 1, -1, 1]
    for i in range(factor_count):
        if (
            factor_kinds[i] != expected_kind[i]
            or factor_values[4 * i] != expected_a[i]
            or factor_values[4 * i + 1] != expected_b[i]
            or factor_values[4 * i + 2] != expected_c[i]
            or factor_values[4 * i + 3] != expected_denominator[i]
            or factor_exponents[i] != expected_exponent[i]
        ):
            return -1

    for i in range(9):
        base[i] = generator_ideal[i]
        accumulator[i] = 0
    accumulator[0] = 1
    accumulator[4] = 1
    accumulator[8] = 1

    exponent = invariant
    trace_count = 0
    while exponent > 0:
        if exponent % 2 != 0:
            if (
                _pari_exact_cubic_ideal_multiply(
                    accumulator,
                    base,
                    multiplication_table,
                    generators,
                    hnf_work,
                    product,
                )
                != 0
            ):
                return -1
            for i in range(9):
                accumulator[i] = product[i]
                trace_work[9 * trace_count + i] = product[i]
            trace_count += 1
        exponent //= 2
        if exponent != 0:
            if (
                _pari_exact_cubic_ideal_multiply(
                    base,
                    base,
                    multiplication_table,
                    generators,
                    hnf_work,
                    product,
                )
                != 0
            ):
                return -1
            for i in range(9):
                base[i] = product[i]
                trace_work[9 * trace_count + i] = product[i]
            trace_count += 1
    if trace_count > 6:
        return -1

    pari_cubic_mul_matrix(multiplication_table, principal_numerator, principal_matrix)
    if (
        _pari_exact_cubic_column_hnf(
            principal_matrix, 3, principal_hnf_scratch, principal_hnf_work
        )
        != 0
    ):
        return -1
    compared = 0
    for i in range(9):
        if principal_hnf_work[i] != accumulator[i] * principal_denominator:
            return -1
        compared += 1

    # Publish only after all exact identities have succeeded.
    for i in range(9):
        power_ideal[i] = accumulator[i]
        principal_hnf[i] = principal_hnf_work[i]
    for i in range(9 * trace_count):
        power_trace[i] = trace_work[i]
    for i in range(factor_count):
        retained_factor_kinds[i] = factor_kinds[i]
        retained_factor_exponents[i] = factor_exponents[i]
        for j in range(4):
            retained_factor_values[4 * i + j] = factor_values[4 * i + j]
    retained_factor_metadata[0] = factor_count

    state[0] = 0
    state[1] = invariant
    state[2] = trace_count
    state[4] = factor_count
    state[5] = accumulator[0]
    state[6] = principal_hnf_work[0]
    state[7] = compared
    state[8] = 9 * trace_count
    state[9] = principal_denominator
    return 0


__all__ = ["pari_cubic_generator_order_witness_frozen"]
