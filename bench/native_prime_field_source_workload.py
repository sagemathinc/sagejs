"""Timed interpreted control for the source-transparent matrix experiment."""

from __future__ import annotations

import os
import time

from native_prime_field_source import source_prime_matmul, source_prime_rank


size = int(os.environ.get("SAGEJS_NATIVE_PRIME_SOURCE_FALLBACK_SIZE", "12"))
prime = 65521
field = GF(prime)
left = matrix(
    field,
    size,
    size,
    lambda row, column: (row * 17 + column * 31 + 1) % prime,
)
right = matrix(
    field,
    size,
    size,
    lambda row, column: (row * 43 + column * 11 + 3) % prime,
)


def measure(name, operation, check):
    started = time.perf_counter()
    answer = operation()
    elapsed = time.perf_counter() - started
    if not check(answer):
        raise AssertionError(f"{name} returned an incorrect result")
    print("RESULT", name, f"{elapsed:.12f}")


measure(
    "rank",
    lambda: source_prime_rank(left),
    lambda answer: answer == left.rank(),
)
measure(
    "matmul",
    lambda: source_prime_matmul(left, right),
    lambda answer: answer == left * right,
)
