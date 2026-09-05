"""Paired public LU development probe, not library or release qualification."""

import json
import math
import time

import sagejs.numerics.linear_algebra.validation as validation
from sagejs.numerics.linear_algebra.operations import lu
from sagejs.numerics.linear_algebra.storage import DenseMatrix


def previous_product(left, right, *, check=None):
    """The independent product body at 85a84375d, before storage snapshots."""
    if left.ncols != right.nrows:
        raise ValueError("matrix dimensions do not conform during validation")
    entries = []
    for row in range(left.nrows):
        if check is not None:
            check()
        for column in range(right.ncols):
            if check is not None:
                check()
            terms = [
                left.entry(row, index) * right.entry(index, column)
                for index in range(left.ncols)
            ]
            entries.append(math.fsum(terms))
    return DenseMatrix(left.nrows, right.ncols, entries)


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
            == previous_product(matrix, matrix).entries
        )
        samples = {"previous": [], "snapshot": []}
        for block in range(10):
            order = ("previous", "snapshot") if block % 2 else ("snapshot", "previous")
            for mode in order:
                validation._independent_product = (
                    previous_product if mode == "previous" else current_product
                )
                started = time.perf_counter()
                result = lu(matrix, trace="none")
                elapsed = (time.perf_counter() - started) * 1000.0
                assert result.success
                if block >= 3:
                    samples[mode].append(elapsed)
        records.append({"n": n, "samples_ms": samples})
finally:
    validation._independent_product = current_product
print(json.dumps(records))
