"""Typed scalar adaptations of unchanged CoWasm benchmark bodies.

The original sources in ../src remain the compatibility authority. This
module makes harness-only adaptations explicit: assertions remain in the
cross-runtime runner, and iterable traversal is normalized to indexed access
where the native compiler does not yet support general iterators.
"""

from sagejs.native import native
from typing import Tuple


@native
def extended_euclid(a: Integer, b: Integer) -> Tuple[Integer, Integer, Integer]:
    previous_x, x = 1, 0
    previous_y, y = 0, 1
    while b:
        quotient, remainder = divmod(a, b)
        x, previous_x = previous_x - quotient * x, x
        y, previous_y = previous_y - quotient * y, y
        a, b = b, remainder
    return a, previous_x, previous_y


@native
def xgcd_loop(iterations: uint64 = 100000) -> Integer:
    total = 0
    for index in range(iterations):
        gcd, coefficient, second_coefficient = extended_euclid(92250, 922350 + index)
        total += gcd
    return total


@native
def inverse_mod(value: Integer, modulus: Integer) -> Integer:
    if value == 1 or modulus <= 1:
        return value % modulus
    gcd, coefficient, ignored = extended_euclid(value, modulus)
    if gcd != 1:
        raise ZeroDivisionError
    answer = coefficient % modulus
    if answer < 0:
        answer += modulus
    return answer


@native
def inverse_mod_loop(iterations: uint64 = 100000) -> Integer:
    total = 0
    for value in range(1, iterations):
        total += inverse_mod(value, 1073741827)
    return total


@native
def sum_stride(iterations: uint64 = 1000000) -> Integer:
    total = 0
    for index in range(0, iterations, 3):
        total += 1
    return total


@native
def int_divmod_loop(iterations: uint64 = 1000000) -> Integer:
    values = [1, 1235, 5434, 394879374, -34453]
    total = 0
    for iteration in range(iterations):
        for index in range(5):
            quotient, remainder = divmod(values[index], 23)
            total += quotient + remainder
    return total
