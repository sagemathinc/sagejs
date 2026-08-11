"""Source-transparent structural kernels for packed `ZZ[x]` values."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def packed_integer_polynomial_add(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    length = len(left)
    if len(right) > length:
        length = len(right)
    valid = len(output) == length
    if valid:
        for index in range(len(output)):
            value = 0
            if index < len(left):
                value += left[index]
            if index < len(right):
                value += right[index]
            output[index] = value
    return valid


@native
def packed_integer_polynomial_subtract(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    length = len(left)
    if len(right) > length:
        length = len(right)
    valid = len(output) == length
    if valid:
        for index in range(len(output)):
            value = 0
            if index < len(left):
                value += left[index]
            if index < len(right):
                value -= right[index]
            output[index] = value
    return valid


@native
def packed_integer_polynomial_negate(
    output: IntegerBuffer,
    source: IntegerBuffer,
) -> bool:
    valid = len(output) == len(source)
    if valid:
        for index in range(len(source)):
            output[index] = -source[index]
    return valid


@native
def packed_integer_polynomial_multiply(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    expected = 0
    if len(left) != 0 and len(right) != 0:
        expected = len(left) + len(right) - 1
    valid = len(output) == expected
    if valid:
        for index in range(len(output)):
            output[index] = 0
        for left_index in range(len(left)):
            for right_index in range(len(right)):
                output[left_index + right_index] += (
                    left[left_index] * right[right_index]
                )
    return valid


@native
def packed_integer_polynomial_equal(
    left: IntegerBuffer,
    right: IntegerBuffer,
) -> bool:
    equal = len(left) == len(right)
    if equal:
        for index in range(len(left)):
            if left[index] != right[index]:
                equal = False
    return equal


@native
def packed_integer_polynomial_shift_left(
    output: IntegerBuffer,
    source: IntegerBuffer,
    amount: uint64,
) -> bool:
    valid = len(output) == len(source) + amount
    if valid:
        for zero_index in range(amount):
            output[zero_index] = 0
        for source_index in range(len(source)):
            output[amount + source_index] = source[source_index]
    return valid
