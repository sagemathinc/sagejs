"""Source-transparent structural kernels for packed small `GF(p)[x]`."""

from __future__ import annotations

from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_add,
    prime_inverse,
    prime_mul,
    prime_sub,
    uint64,
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
def packed_prime_field_polynomial_derivative(
    output: UInt64Buffer,
    source: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    expected = 0
    if len(source) > 1:
        expected = len(source) - 1
    valid = len(output) == expected
    if valid:
        for index in range(1, len(source)):
            output[index - 1] = prime_mul(source[index], index % modulus, modulus)
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


@native
def packed_prime_field_polynomial_evaluate(
    coefficients: UInt64Buffer,
    value: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Evaluate low-to-high coefficients by modular Horner iteration."""
    result = 0
    length = len(coefficients)
    for offset in range(length):
        index = length - offset - 1
        result = prime_add(
            prime_mul(result, value, modulus), coefficients[index], modulus
        )
    return result


@native
def packed_prime_field_polynomial_quo_rem(
    quotient: UInt64Buffer,
    remainder: UInt64Buffer,
    dividend: UInt64Buffer,
    divisor: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    """Divide canonical low-to-high coefficients over a small prime field."""
    quotient_length = 0
    if len(dividend) >= len(divisor):
        quotient_length = len(dividend) - len(divisor) + 1
    valid = (
        len(divisor) != 0
        and len(quotient) == quotient_length
        and len(remainder) == len(dividend)
    )
    if valid:
        for index in range(len(remainder)):
            remainder[index] = dividend[index]
        for index in range(len(quotient)):
            quotient[index] = 0
        divisor_degree = len(divisor) - 1
        inverse = prime_inverse(divisor[divisor_degree], modulus)
        for offset in range(quotient_length):
            shift = quotient_length - offset - 1
            factor = prime_mul(remainder[divisor_degree + shift], inverse, modulus)
            quotient[shift] = factor
            if factor != 0:
                for index in range(len(divisor)):
                    target = index + shift
                    remainder[target] = prime_sub(
                        remainder[target],
                        prime_mul(factor, divisor[index], modulus),
                        modulus,
                    )
    return valid
