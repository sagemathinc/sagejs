"""Timed readable fallback for the Native Kernel v8 matrix benchmark."""

from __future__ import annotations

import os
import time

from native_prime_field_matrix import (
    prime_field_determinant,
    prime_field_echelon,
    prime_field_rank,
    prime_field_solve,
)


size = int(os.environ.get('SAGEJS_NATIVE_PRIME_FIELD_FALLBACK_SIZE', '16'))
prime = 65521
field = GF(prime)


def hilbert_matrix(rows: int, columns: int):
    return matrix(
        field,
        rows,
        columns,
        lambda row, column: field(1) / field(row + column + 1),
    )


source = hilbert_matrix(size, size)
right = matrix(
    field,
    size,
    4,
    lambda row, column: field((row + 1) * (column + 2)),
)


def measure(name, operation, check):
    started = time.perf_counter()
    answer = operation()
    elapsed = time.perf_counter() - started
    if not check(answer):
        raise AssertionError(f'{name} returned an incorrect result')
    print('RESULT', name, f'{elapsed:.12f}')


measure('rank', lambda: prime_field_rank(source), lambda answer: answer == size)
measure(
    'determinant',
    lambda: prime_field_determinant(source),
    lambda answer: answer != 0,
)
measure(
    'echelon',
    lambda: prime_field_echelon(source),
    lambda answer: answer.rank() == size,
)
measure(
    'solve-4',
    lambda: prime_field_solve(source, right),
    lambda answer: source * answer == right,
)
