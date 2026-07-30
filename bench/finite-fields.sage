# This source is intentionally accepted unchanged by Sage.js and SageMath.
# Timings exclude startup and construction of the field and input operands.

import time


def scalar_loop(field, iterations):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for _ in range(iterations):
        value = value * multiplier + increment
    return value


def polynomial_multiply_loop(left, right, iterations):
    value = left
    for _ in range(iterations):
        value = left * right
    return value


def polynomial_gcd_loop(left, right, iterations):
    value = left
    for _ in range(iterations):
        value = left.gcd(right)
    return value


def polynomial_factor_loop(value, iterations):
    answer = value
    for _ in range(iterations):
        answer = value.factor()
    return answer


def residue_list_sum_loop(ring, iterations):
    answer = ring(0)
    for _ in range(iterations):
        answer = sum(list(ring))
    return answer


def measure(operation, iterations, operation_function, *operands):
    operation_function(*operands, min(iterations, 20))
    for sample in range(7):
        start = time.time()
        answer = operation_function(*operands, iterations)
        elapsed = float(time.time() - start)
        print("RESULT", operation, iterations, sample, elapsed)
    return answer


F = GF(65537)
R = PolynomialRing(F, "x")
x = R.gen()
left = (x + 1)^128
right = (x^3 + x + 1)^42
common = x^64 + x + 1
gcd_left = common * (x + 1)^128
gcd_right = common * (x + 2)^128
factor_input = x^96 + x^5 + 1
residue_ring = Zmod(100000)

measure("scalar-mul-add", 500000, scalar_loop, F)
measure("poly-multiply", 5000, polynomial_multiply_loop, left, right)
measure("poly-gcd", 1000, polynomial_gcd_loop, gcd_left, gcd_right)
measure("poly-factor", 20, polynomial_factor_loop, factor_input)
measure("residue-list-sum", 3, residue_list_sum_loop, residue_ring)
