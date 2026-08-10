"""Source-transparent structural kernels for dense integer matrices.

Matrices are row-major ``IntegerBuffer`` values.  Their packed ABI stores a
signed limb count plus fixed-capacity limbs per entry; compiled loads become
tagged machine-word/GMP values and promote locally on overflow.  These Python
bodies are also the exact dynamic fallback.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def dense_integer_matrix_get(source: IntegerBuffer, index: int) -> int:
    return source[index]


@native
def dense_integer_matrix_set(
    target: IntegerBuffer, index: int, value: int,
) -> bool:
    target[index] = value
    return True


@native
def dense_integer_matrix_copy(
    output: IntegerBuffer, source: IntegerBuffer,
) -> bool:
    valid = len(output) == len(source)
    if valid:
        for index in range(len(source)):
            output[index] = source[index]
    return valid


@native
def dense_integer_matrix_add(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    valid = len(output) == len(left) and len(left) == len(right)
    if valid:
        for index in range(len(output)):
            output[index] = left[index] + right[index]
    return valid


@native
def dense_integer_matrix_subtract(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    valid = len(output) == len(left) and len(left) == len(right)
    if valid:
        for index in range(len(output)):
            output[index] = left[index] - right[index]
    return valid


@native
def dense_integer_matrix_negate(
    output: IntegerBuffer, source: IntegerBuffer,
) -> bool:
    valid = len(output) == len(source)
    if valid:
        for index in range(len(output)):
            output[index] = -source[index]
    return valid


@native
def dense_integer_matrix_scalar_multiply(
    output: IntegerBuffer,
    source: IntegerBuffer,
    scalar: int,
) -> bool:
    valid = len(output) == len(source)
    if valid:
        for index in range(len(output)):
            output[index] = source[index] * scalar
    return valid


@native
def dense_integer_matrix_transpose(
    output: IntegerBuffer,
    source: IntegerBuffer,
    rows: uint64,
    columns: uint64,
) -> bool:
    valid = len(output) == rows * columns
    if len(source) != rows * columns:
        valid = False
    if valid:
        for row in range(rows):
            for column in range(columns):
                output[column * rows + row] = source[row * columns + column]
    return valid


@native
def dense_integer_matrix_equal(
    left: IntegerBuffer, right: IntegerBuffer,
) -> bool:
    equal = len(left) == len(right)
    if equal:
        for index in range(len(left)):
            if left[index] != right[index]:
                equal = False
    return equal


@native
def dense_integer_matrix_is_zero(source: IntegerBuffer) -> bool:
    answer = True
    for index in range(len(source)):
        if source[index] != 0:
            answer = False
    return answer


@native
def dense_integer_matrix_is_one(
    source: IntegerBuffer, rows: uint64, columns: uint64,
) -> bool:
    answer = rows == columns and len(source) == rows * columns
    if answer:
        for row in range(rows):
            for column in range(columns):
                expected = 0
                if row == column:
                    expected = 1
                if source[row * columns + column] != expected:
                    answer = False
    return answer


@native
def dense_integer_matrix_nonzero_count(source: IntegerBuffer) -> int:
    count = 0
    for index in range(len(source)):
        if source[index] != 0:
            count += 1
    return count


@native
def dense_integer_matrix_trace(source: IntegerBuffer, size: uint64) -> int:
    value = 0
    if len(source) == size * size:
        for index in range(size):
            value += source[index * size + index]
    return value


@native
def dense_integer_matrix_stack(
    output: IntegerBuffer,
    top: IntegerBuffer,
    bottom: IntegerBuffer,
) -> bool:
    valid = len(output) == len(top) + len(bottom)
    if valid:
        for index in range(len(top)):
            output[index] = top[index]
        for index in range(len(bottom)):
            output[len(top) + index] = bottom[index]
    return valid


@native
def dense_integer_matrix_augment(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    rows: uint64,
    left_columns: uint64,
    right_columns: uint64,
) -> bool:
    valid = len(left) == rows * left_columns
    if len(right) != rows * right_columns:
        valid = False
    output_columns = left_columns + right_columns
    if len(output) != rows * output_columns:
        valid = False
    if valid:
        for row in range(rows):
            target = row * output_columns
            for column in range(left_columns):
                output[target + column] = left[row * left_columns + column]
            for column in range(right_columns):
                output[target + left_columns + column] = (
                    right[row * right_columns + column]
                )
    return valid


@native
def dense_integer_matrix_select_rows(
    output: IntegerBuffer,
    source: IntegerBuffer,
    indices: IntegerBuffer,
    source_rows: uint64,
    columns: uint64,
) -> bool:
    valid = len(source) == source_rows * columns
    if len(output) != len(indices) * columns:
        valid = False
    if valid:
        for target_row in range(len(indices)):
            source_row = indices[target_row]
            if source_row >= source_rows:
                valid = False
            else:
                for column in range(columns):
                    output[target_row * columns + column] = (
                        source[source_row * columns + column]
                    )
    return valid


@native
def dense_integer_matrix_select_columns(
    output: IntegerBuffer,
    source: IntegerBuffer,
    indices: IntegerBuffer,
    rows: uint64,
    source_columns: uint64,
) -> bool:
    valid = len(source) == rows * source_columns
    if len(output) != rows * len(indices):
        valid = False
    if valid:
        for row in range(rows):
            for target_column in range(len(indices)):
                source_column = indices[target_column]
                if source_column >= source_columns:
                    valid = False
                else:
                    output[row * len(indices) + target_column] = (
                        source[row * source_columns + source_column]
                    )
    return valid


@native
def dense_integer_matrix_random_fill(
    target: IntegerBuffer,
    lower: int,
    span: uint64,
    initial_state: uint64,
    word_base: uint64,
    multiplier: uint64,
    increment: uint64,
) -> uint64:
    """Fill from ``range(lower, lower + span)`` using rejection sampling."""
    limit: uint64 = word_base - word_base % span
    state: uint64 = initial_state
    for index in range(len(target)):
        while state >= limit:
            state = (multiplier * state + increment) % word_base
        target[index] = lower + state % span
        if index + 1 < len(target):
            state = (multiplier * state + increment) % word_base
    return state


@native
def dense_integer_matrix_random_fill_default(
    target: IntegerBuffer,
    initial_state: uint64,
    word_base: uint64,
    zero_cutoff: uint64,
    sign_cutoff: uint64,
    multiplier: uint64,
    increment: uint64,
) -> uint64:
    """Bulk form of Sage.js's zero-heavy default integer distribution."""
    state: uint64 = initial_state
    for index in range(len(target)):
        first: uint64 = state
        state = (multiplier * state + increment) % word_base
        if first < zero_cutoff:
            target[index] = 0
        else:
            tail: uint64 = state
            state = (multiplier * state + increment) % word_base
            while tail == 0:
                tail = state
                state = (multiplier * state + increment) % word_base
            magnitude: uint64 = word_base // tail
            if state >= sign_cutoff:
                target[index] = -magnitude
            else:
                target[index] = magnitude
            state = (multiplier * state + increment) % word_base
    return state


__all__ = [
    'dense_integer_matrix_add',
    'dense_integer_matrix_augment',
    'dense_integer_matrix_copy',
    'dense_integer_matrix_equal',
    'dense_integer_matrix_get',
    'dense_integer_matrix_is_one',
    'dense_integer_matrix_is_zero',
    'dense_integer_matrix_negate',
    'dense_integer_matrix_nonzero_count',
    'dense_integer_matrix_random_fill',
    'dense_integer_matrix_random_fill_default',
    'dense_integer_matrix_scalar_multiply',
    'dense_integer_matrix_select_columns',
    'dense_integer_matrix_select_rows',
    'dense_integer_matrix_stack',
    'dense_integer_matrix_set',
    'dense_integer_matrix_subtract',
    'dense_integer_matrix_trace',
    'dense_integer_matrix_transpose',
]
