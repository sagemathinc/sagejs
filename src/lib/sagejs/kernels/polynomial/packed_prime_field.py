"""Source-transparent structural kernels for packed small `GF(p)[x]`."""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_mul,
    prime_sub,
)


@native
def packed_prime_field_polynomial_add(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    length = len(left)
    if len(right) > length:
        length = len(right)
    valid = len(output) == length
    if valid:
        for index in range(len(output)):
            value = 0
            if index < len(left):
                value = left[index]
            if index < len(right):
                value = (value + right[index]) % modulus
            output[index] = value
    return valid


@native
def packed_prime_field_polynomial_subtract(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    length = len(left)
    if len(right) > length:
        length = len(right)
    valid = len(output) == length
    if valid:
        for index in range(len(output)):
            value = 0
            if index < len(left):
                value = left[index]
            if index < len(right):
                value = prime_sub(value, right[index], modulus)
            output[index] = value
    return valid


@native
def packed_prime_field_polynomial_negate(
    output: UInt64Buffer,
    source: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    valid = len(output) == len(source)
    if valid:
        for index in range(len(source)):
            value = source[index]
            if value == 0:
                output[index] = 0
            else:
                output[index] = modulus - value
    return valid


@native
def packed_prime_field_polynomial_multiply(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
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
                target = left_index + right_index
                output[target] = (
                    output[target]
                    + prime_mul(left[left_index], right[right_index], modulus)
                ) % modulus
    return valid


@native
def packed_prime_field_polynomial_equal(
    left: UInt64Buffer,
    right: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    equal = len(left) == len(right)
    if equal:
        for index in range(len(left)):
            if left[index] != right[index]:
                equal = False
    return equal
