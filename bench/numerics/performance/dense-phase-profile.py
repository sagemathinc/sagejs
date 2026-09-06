"""Attribute public LU latency without changing mathematical operations.

Run through the ordinary Sage.js Python frontend. These instrumented timings
are diagnostic, not a qualified benchmark or a sum of per-phase medians.
"""

import json
import time

import sagejs.numerics.linear_algebra.operations as operations
from sagejs.numerics.linear_algebra.storage import DenseMatrix

originals = {
    "factorization": operations.lu_factorize,
    "validation": operations.validate_lu,
    "result": operations._factorization_result,
}
phases = {}


def measured(name):
    original = originals[name]

    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            phases[name] = (
                phases.get(name, 0.0) + (time.perf_counter() - started) * 1000.0
            )

    return wrapper


records = []
try:
    for size in (16, 32):
        matrix = DenseMatrix(
            size,
            size,
            [
                float(size if row == col else ((row * size + col) * 17 + 3) % 13 - 6)
                for row in range(size)
                for col in range(size)
            ],
        )
        reference = operations.lu(matrix, trace="none")
        expected = [reference.value, reference.validation.to_dict(), reference.status]
        operations.lu_factorize = measured("factorization")
        operations.validate_lu = measured("validation")
        operations._factorization_result = measured("result")
        samples = []
        for iteration in range(10):
            phases = {}
            started = time.perf_counter()
            result = operations.lu(matrix, trace="none")
            total = (time.perf_counter() - started) * 1000.0
            assert result.success
            assert [
                result.value,
                result.validation.to_dict(),
                result.status,
            ] == expected
            phases["other"] = total - sum(phases.values())
            phases["total"] = total
            if iteration >= 3:
                samples.append(phases)
        records.append({"size": size, "samples_ms": samples})
        operations.lu_factorize = originals["factorization"]
        operations.validate_lu = originals["validation"]
        operations._factorization_result = originals["result"]
finally:
    operations.lu_factorize = originals["factorization"]
    operations.validate_lu = originals["validation"]
    operations._factorization_result = originals["result"]
print(
    json.dumps(
        {"classification": "instrumented-development-profile", "records": records}
    )
)
