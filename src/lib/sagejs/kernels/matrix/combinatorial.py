"""Packed exact kernels for matrix permanents and minors.

The public combinatorial layer performs Sage-compatible validation and work
budgeting before entering these functions.  Each kernel then consumes one
row-major input buffer and fills one complete result buffer in a single
isolated call.  The ordinary Python bodies are the exact fallback and the
source lowered by `@native`; there is no Python or JavaScript callback inside
the compiled call graph.

Integer and rational kernels use arbitrary-precision `IntegerBuffer` storage.
Rationals are represented by parallel canonical numerator and denominator
buffers.  Prime-field kernels use canonical `UInt64Buffer` residues and an
explicit `PrimeFieldModulus`.  Callers own all result and scratch storage.
"""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_mul,
    prime_sub,
    uint64,
)


@native
def _packed_binomial(n: uint64, k: uint64) -> uint64:
    """Return `n` choose `k` for shape validation inside a kernel."""
    zero: uint64 = 0
    one: uint64 = 1
    if k > n:
        return zero
    if k > n - k:
        k = n - k
    answer: uint64 = one
    step: uint64 = one
    while step <= k:
        answer = (answer * (n - k + step)) // step
        step = step + one
    return answer


@native
def _next_combination(
    indices: UInt64Buffer, offset: uint64, n: uint64, k: uint64
) -> bool:
    """Advance one length-`k` lexicographic combination in-place."""
    one: uint64 = 1
    position = k
    while position > 0:
        position = position - one
        if indices[offset + position] != position + n - k:
            indices[offset + position] = indices[offset + position] + one
            following = position + one
            while following < k:
                indices[offset + following] = indices[offset + following - one] + one
                following = following + one
            return True
    return False


@native
def packed_integer_matrix_permanent(
    output: IntegerBuffer,
    entries: IntegerBuffer,
    states: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    """Fill `output[0]` with the exact rectangular permanent."""
    one: uint64 = 1
    if rows > columns or rows > 30:
        return False
    state_count = one << rows
    if len(output) != 1 or len(entries) != rows * columns:
        return False
    if len(states) != state_count:
        return False
    for index in range(state_count):
        states[index] = 0
    states[0] = 1
    full_mask = state_count - one
    for column in range(columns):
        mask = full_mask
        while mask > 0:
            mask = mask - one
            value = states[mask]
            for row in range(rows):
                bit = one << row
                if mask & bit == 0:
                    destination = mask | bit
                    states[destination] = (
                        states[destination] + value * entries[row * columns + column]
                    )
    output[0] = states[full_mask]
    return True


@native
def packed_integer_matrix_minors(
    output: IntegerBuffer,
    entries: IntegerBuffer,
    states: IntegerBuffer,
    indices: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    size: uint64,
) -> bool:
    """Fill every exact `size` minor in Sage's lexicographic order."""
    zero: uint64 = 0
    one: uint64 = 1
    if size == 0 or size > rows or size > columns or size > 30:
        return False
    state_count = one << size
    result_count = _packed_binomial(rows, size) * _packed_binomial(columns, size)
    if len(output) != result_count or len(entries) != rows * columns:
        return False
    if len(states) != state_count or len(indices) != 2 * size:
        return False
    for index in range(size):
        indices[index] = index
        indices[size + index] = index
    result_index = zero
    more_rows = True
    while more_rows:
        for index in range(size):
            indices[size + index] = index
        more_columns = True
        while more_columns:
            for mask in range(state_count):
                states[mask] = 0
            states[0] = 1
            for row_offset in range(size):
                source_row = indices[row_offset]
                for mask in range(state_count):
                    cardinality = zero
                    scan = mask
                    while scan != 0:
                        cardinality = cardinality + (scan & one)
                        scan = scan >> one
                    if cardinality == row_offset:
                        value = states[mask]
                        for column_offset in range(size):
                            bit = one << column_offset
                            if mask & bit == 0:
                                term = (
                                    value
                                    * entries[
                                        source_row * columns
                                        + indices[size + column_offset]
                                    ]
                                )
                                inversions = zero
                                later = column_offset + one
                                while later < size:
                                    if mask & (one << later) != 0:
                                        inversions = inversions + one
                                    later = later + one
                                if inversions & one != 0:
                                    term = -term
                                states[mask | bit] = states[mask | bit] + term
            output[result_index] = states[state_count - one]
            result_index = result_index + one
            more_columns = _next_combination(indices, size, columns, size)
        more_rows = _next_combination(indices, zero, rows, size)
    return result_index == result_count


@native
def _rational_gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


@native
def _rational_add(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    common = _rational_gcd(left_denominator, right_denominator)
    left_scale = left_denominator // common
    right_scale = right_denominator // common
    numerator = left_numerator * right_scale + right_numerator * left_scale
    if numerator == 0:
        return 0, 1
    remaining = _rational_gcd(numerator, common)
    return numerator // remaining, left_scale * (right_denominator // remaining)


@native
def _rational_multiply(
    left_numerator: int,
    left_denominator: int,
    right_numerator: int,
    right_denominator: int,
) -> tuple[int, int]:
    if left_numerator == 0 or right_numerator == 0:
        return 0, 1
    left_common = _rational_gcd(left_numerator, right_denominator)
    right_common = _rational_gcd(right_numerator, left_denominator)
    return (
        (left_numerator // left_common) * (right_numerator // right_common),
        (left_denominator // right_common) * (right_denominator // left_common),
    )


@native
def packed_rational_matrix_permanent(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    state_numerators: IntegerBuffer,
    state_denominators: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    """Fill one canonical numerator/denominator permanent pair."""
    one: uint64 = 1
    if rows > columns or rows > 30:
        return False
    state_count = one << rows
    if len(output_numerators) != 1 or len(output_denominators) != 1:
        return False
    if len(numerators) != rows * columns or len(denominators) != len(numerators):
        return False
    if len(state_numerators) != state_count or len(state_denominators) != state_count:
        return False
    for denominator_index in range(len(denominators)):
        if denominators[denominator_index] <= 0:
            return False
    for index in range(state_count):
        state_numerators[index] = 0
        state_denominators[index] = 1
    state_numerators[0] = 1
    full_mask = state_count - one
    for column in range(columns):
        mask = full_mask
        while mask > 0:
            mask = mask - one
            for row in range(rows):
                bit = one << row
                if mask & bit == 0:
                    term_numerator, term_denominator = _rational_multiply(
                        state_numerators[mask],
                        state_denominators[mask],
                        numerators[row * columns + column],
                        denominators[row * columns + column],
                    )
                    destination = mask | bit
                    sum_numerator, sum_denominator = _rational_add(
                        state_numerators[destination],
                        state_denominators[destination],
                        term_numerator,
                        term_denominator,
                    )
                    state_numerators[destination] = sum_numerator
                    state_denominators[destination] = sum_denominator
    output_numerators[0] = state_numerators[full_mask]
    output_denominators[0] = state_denominators[full_mask]
    return True


@native
def packed_rational_matrix_minors(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    state_numerators: IntegerBuffer,
    state_denominators: IntegerBuffer,
    indices: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    size: uint64,
) -> bool:
    """Fill every canonical rational minor in lexicographic order."""
    zero: uint64 = 0
    one: uint64 = 1
    if size == 0 or size > rows or size > columns or size > 30:
        return False
    state_count = one << size
    result_count = _packed_binomial(rows, size) * _packed_binomial(columns, size)
    if (
        len(output_numerators) != result_count
        or len(output_denominators) != result_count
    ):
        return False
    if len(numerators) != rows * columns or len(denominators) != len(numerators):
        return False
    if len(state_numerators) != state_count or len(state_denominators) != state_count:
        return False
    if len(indices) != 2 * size:
        return False
    for denominator_index in range(len(denominators)):
        if denominators[denominator_index] <= 0:
            return False
    for index in range(size):
        indices[index] = index
        indices[size + index] = index
    result_index: uint64 = 0
    more_rows = True
    while more_rows:
        for index in range(size):
            indices[size + index] = index
        more_columns = True
        while more_columns:
            for mask in range(state_count):
                state_numerators[mask] = 0
                state_denominators[mask] = 1
            state_numerators[0] = 1
            for row_offset in range(size):
                source_row = indices[row_offset]
                for mask in range(state_count):
                    cardinality: uint64 = 0
                    scan = mask
                    while scan != 0:
                        cardinality = cardinality + (scan & one)
                        scan = scan >> one
                    if cardinality == row_offset:
                        for column_offset in range(size):
                            bit = one << column_offset
                            if mask & bit == 0:
                                entry = (
                                    source_row * columns + indices[size + column_offset]
                                )
                                term_numerator, term_denominator = _rational_multiply(
                                    state_numerators[mask],
                                    state_denominators[mask],
                                    numerators[entry],
                                    denominators[entry],
                                )
                                inversions: uint64 = 0
                                later: uint64 = column_offset + one
                                while later < size:
                                    if mask & (one << later) != 0:
                                        inversions = inversions + one
                                    later = later + one
                                if inversions & one != 0:
                                    term_numerator = -term_numerator
                                destination = mask | bit
                                sum_numerator, sum_denominator = _rational_add(
                                    state_numerators[destination],
                                    state_denominators[destination],
                                    term_numerator,
                                    term_denominator,
                                )
                                state_numerators[destination] = sum_numerator
                                state_denominators[destination] = sum_denominator
            output_numerators[result_index] = state_numerators[state_count - one]
            output_denominators[result_index] = state_denominators[state_count - one]
            result_index = result_index + one
            more_columns = _next_combination(indices, size, columns, size)
        more_rows = _next_combination(indices, zero, rows, size)
    return result_index == result_count


@native
def packed_prime_matrix_permanent(
    output: UInt64Buffer,
    entries: UInt64Buffer,
    states: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Fill one permanent over a word-prime field."""
    zero = modulus - modulus
    one = modulus // modulus
    modulus_value = modulus + zero
    if rows > columns or rows > 30:
        return False
    state_count = one << rows
    if len(output) != 1 or len(entries) != rows * columns or len(states) != state_count:
        return False
    for entry_index in range(len(entries)):
        if entries[entry_index] >= modulus_value:
            return False
    for index in range(state_count):
        states[index] = zero
    states[0] = one
    full_mask = state_count - one
    for column in range(columns):
        mask = full_mask
        while mask > 0:
            mask = mask - one
            for row in range(rows):
                bit = one << row
                if mask & bit == 0:
                    destination = mask | bit
                    states[destination] = prime_add(
                        states[destination],
                        prime_mul(
                            states[mask], entries[row * columns + column], modulus
                        ),
                        modulus,
                    )
    output[0] = states[full_mask]
    return True


@native
def packed_prime_matrix_minors(
    output: UInt64Buffer,
    entries: UInt64Buffer,
    states: UInt64Buffer,
    indices: UInt64Buffer,
    rows: uint64,
    columns: uint64,
    size: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Fill all canonical residues of the requested minors."""
    zero = modulus - modulus
    one = modulus // modulus
    modulus_value = modulus + zero
    if size == 0 or size > rows or size > columns or size > 30:
        return False
    state_count = one << size
    result_count = _packed_binomial(rows, size) * _packed_binomial(columns, size)
    if len(output) != result_count or len(entries) != rows * columns:
        return False
    if len(states) != state_count or len(indices) != 2 * size:
        return False
    for entry_index in range(len(entries)):
        if entries[entry_index] >= modulus_value:
            return False
    for index in range(size):
        indices[index] = index
        indices[size + index] = index
    result_index = zero
    more_rows = True
    while more_rows:
        for index in range(size):
            indices[size + index] = index
        more_columns = True
        while more_columns:
            for mask in range(state_count):
                states[mask] = 0
            states[0] = one
            for row_offset in range(size):
                source_row = indices[row_offset]
                for mask in range(state_count):
                    cardinality = zero
                    scan = mask
                    while scan != 0:
                        cardinality = cardinality + (scan & one)
                        scan = scan >> one
                    if cardinality == row_offset:
                        for column_offset in range(size):
                            bit = one << column_offset
                            if mask & bit == 0:
                                term = prime_mul(
                                    states[mask],
                                    entries[
                                        source_row * columns
                                        + indices[size + column_offset]
                                    ],
                                    modulus,
                                )
                                inversions = zero
                                later = column_offset + one
                                while later < size:
                                    if mask & (one << later) != 0:
                                        inversions = inversions + one
                                    later = later + one
                                if inversions & one != 0:
                                    term = prime_sub(zero, term, modulus)
                                destination = mask | bit
                                states[destination] = prime_add(
                                    states[destination], term, modulus
                                )
            output[result_index] = states[state_count - one]
            result_index = result_index + one
            # The prime-field core uses its modulus-specialized buffer type;
            # keep this tiny cursor update in the same core instead of
            # crossing to the generic UInt64 helper ABI.
            more_columns = False
            position = size
            while position > zero and not more_columns:
                position = position - one
                if indices[size + position] != position + columns - size:
                    indices[size + position] = indices[size + position] + one
                    following = position + one
                    while following < size:
                        indices[size + following] = (
                            indices[size + following - one] + one
                        )
                        following = following + one
                    more_columns = True
        more_rows = False
        position = size
        while position > zero and not more_rows:
            position = position - one
            if indices[position] != position + rows - size:
                indices[position] = indices[position] + one
                following = position + one
                while following < size:
                    indices[following] = indices[following - one] + one
                    following = following + one
                more_rows = True
    return result_index == result_count


__all__ = [
    "packed_integer_matrix_minors",
    "packed_integer_matrix_permanent",
    "packed_prime_matrix_minors",
    "packed_prime_matrix_permanent",
    "packed_rational_matrix_minors",
    "packed_rational_matrix_permanent",
]
