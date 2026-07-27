# This source is intentionally accepted unchanged by Sage.js and SageMath.
# Timings exclude startup and construction of the field and input operands.

import time


def add_loop(field, iterations):
    value = field("1.25", "-0.75")
    step = field("0.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value + step
    return value


def multiply_loop(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value


def measure(operation, precision, iterations, operation_function):
    field = ComplexField(precision)
    operation_function(field, min(10000, iterations))
    for sample in range(7):
        start = time.time()
        answer = operation_function(field, iterations)
        elapsed = float(time.time() - start)
        print("RESULT", operation, precision, iterations, sample, elapsed)
    return answer


measure("add", 53, 500000, add_loop)
measure("multiply", 53, 500000, multiply_loop)
measure("add", 1000, 200000, add_loop)
measure("multiply", 1000, 100000, multiply_loop)
measure("add", 10000, 50000, add_loop)
measure("multiply", 10000, 10000, multiply_loop)
