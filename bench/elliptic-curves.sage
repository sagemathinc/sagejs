# This source is intentionally accepted unchanged by Sage.js and SageMath.
# Timings exclude process startup and include construction of each fresh curve.

import time


def coefficient_sweep(coefficients, bound):
    values = EllipticCurve(coefficients).anlist(bound)
    return values[len(values) - 1]


def measure(operation, samples, coefficients, bound):
    coefficient_sweep(coefficients, min(bound, 1000))
    for sample in range(samples):
        start = time.time()
        answer = coefficient_sweep(coefficients, bound)
        elapsed = float(time.time() - start)
        print("RESULT", operation, 1, sample, elapsed, answer)


curve = [0, 0, 1, -1, 0]
measure("anlist-100k", 5, curve, 100000)
measure("anlist-1m", 3, curve, 1000000)
