"""Paired public LU probe of exact coordinate-row reconstruction."""

import json
import math
import time

import sagejs.numerics.linear_algebra.validation as validation
from sagejs.numerics.linear_algebra.operations import lu
from sagejs.numerics.linear_algebra.storage import DenseMatrix


def generic_product(left, right, *, check=None):
    """Independent product at 2a7728109, before coordinate-row recognition."""
    if left.ncols != right.nrows:
        raise ValueError("matrix dimensions do not conform during validation")
    rows, inner, columns = left.nrows, left.ncols, right.ncols
    left_entries, right_entries = left.entries, right.entries
    entries = []
    for row in range(rows):
        if check is not None:
            check()
        offset = row * inner
        for column in range(columns):
            if check is not None:
                check()
            terms = [
                left_entries[offset + index] * right_entries[index * columns + column]
                for index in range(inner)
            ]
            entries.append(math.fsum(terms))
    return DenseMatrix(rows, columns, entries)


current_product = validation._independent_product
records = []
try:
    for n in (8, 16, 32):
        matrix = DenseMatrix(
            n,
            n,
            [
                float(n if row == col else ((row * n + col) * 17 + 3) % 13 - 6)
                for row in range(n)
                for col in range(n)
            ],
        )
        assert (
            current_product(matrix, matrix).entries
            == generic_product(matrix, matrix).entries
        )
        samples = {"generic": [], "coordinate": []}
        observations = []
        for block in range(10):
            order = (
                ("generic", "coordinate") if block % 2 else ("coordinate", "generic")
            )
            for mode in order:
                validation._independent_product = (
                    generic_product if mode == "generic" else current_product
                )
                started = time.perf_counter()
                result = lu(matrix, trace="none")
                elapsed = (time.perf_counter() - started) * 1000.0
                assert result.success
                observation = [
                    result.value,
                    result.validation.to_dict(),
                    result.status,
                    result.evaluations,
                    result.iterations,
                ]
                if observations:
                    assert observation == observations[0]
                else:
                    observations.append(observation)
                if block >= 3:
                    samples[mode].append(elapsed)
        records.append({"n": n, "samples_ms": samples, "observation": observations[0]})
finally:
    validation._independent_product = current_product
print(json.dumps(records))
