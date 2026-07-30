# This source is intentionally accepted unchanged by Sage.js and SageMath.
# Timings exclude process startup. Fresh determinant, solve, and inverse
# batches are constructed before each timed sample so cached results cannot
# distort the comparison.

import time


def multiply_loop(left, right, iterations):
    answer = left
    for _ in range(iterations):
        answer = left * right
    return answer


def determinant_batch(matrices):
    answer = 0
    for value in matrices:
        answer += value.det()
    return answer


def solve_batch(pairs):
    answer = pairs[0][1]
    for value, right in pairs:
        answer = value.solve_right(right)
    return answer


def inverse_batch(matrices):
    answer = matrices[0]
    for value in matrices:
        answer = value.inverse()
    return answer


def make_matrices(entries, degree, count, offset):
    answer = []
    for index in range(count):
        values = list(entries)
        diagonal = ((index + offset) % degree) * (degree + 1)
        values[diagonal] += (index + offset) % 17
        answer.append(matrix(ZZ, degree, degree, values))
    return answer


def measure(operation, iterations, operation_function, *operands):
    operation_function(*operands, min(iterations, 20))
    for sample in range(7):
        start = time.time()
        answer = operation_function(*operands, iterations)
        elapsed = float(time.time() - start)
        print("RESULT", operation, iterations, sample, elapsed)
    return answer


def measure_fresh(
    operation,
    iterations,
    setup_function,
    operation_function,
    entries,
    degree,
):
    operation_function(setup_function(entries, degree, 1, -1))
    answer = 0
    for sample in range(7):
        batch = setup_function(
            entries, degree, iterations, sample * iterations)
        start = time.time()
        answer = operation_function(batch)
        elapsed = float(time.time() - start)
        print("RESULT", operation, iterations, sample, elapsed)
    return answer


def make_solve_pairs(entries, degree, count, offset):
    matrices = make_matrices(entries, degree, count, offset)
    right = vector(ZZ, [index + 1 for index in range(degree)])
    return [(value, right) for value in matrices]


degree = 40
entries = []
for row in range(degree):
    for column in range(degree):
        value = ((17 * row + 31 * column + 7) % 101) - 50
        if row == column:
            value += 5000
        entries.append(value)

left = matrix(ZZ, degree, degree, entries)
right = left.transpose()

measure("matrix-multiply", 1000, multiply_loop, left, right)
measure_fresh(
    "fresh-determinant", 100, make_matrices,
    determinant_batch, entries, degree)
measure_fresh(
    "fresh-solve", 25, make_solve_pairs,
    solve_batch, entries, degree)
measure_fresh(
    "fresh-inverse", 10, make_matrices,
    inverse_batch, entries, degree)
