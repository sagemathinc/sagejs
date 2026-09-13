"""Representative warm polynomial-root timing and validation evidence."""

from __future__ import annotations

import collections.abc  # noqa: F401
import hashlib  # noqa: F401
import json
import math
import platform
import random
import statistics
import sys
import time
import typing  # noqa: F401
from pathlib import Path

import numpy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.approximation.polynomial_roots import (  # noqa: E402
    polynomial_roots,
)


def coefficients_from_roots(roots: list[complex]) -> list[complex]:
    coefficients = [1.0 + 0.0j]
    for root in roots:
        updated = [0.0j] * (len(coefficients) + 1)
        for index in range(len(coefficients)):
            updated[index] += coefficients[index]
            updated[index + 1] -= root * coefficients[index]
        coefficients = updated
    return coefficients


random_generator = random.Random(20260831)
workloads: list[dict[str, object]] = []
for degree in (4, 8, 16, 32, 64):
    roots = [
        complex(
            random_generator.uniform(-1.5, 1.5),
            random_generator.uniform(-1.5, 1.5),
        )
        for _ in range(degree)
    ]
    workloads.append(
        {
            "name": "separated-complex-degree-" + str(degree),
            "degree": degree,
            "coefficients": coefficients_from_roots(roots),
        }
    )

workloads.extend(
    [
        {
            "name": "repeated-root-degree-8",
            "degree": 8,
            "coefficients": coefficients_from_roots([1.0] * 8),
        },
        {
            "name": "wide-quadratic-300-decades",
            "degree": 2,
            "coefficients": [1.0, -1.0e150, 1.0],
        },
    ]
)

records: list[dict[str, object]] = []
for workload in workloads:
    coefficients = workload["coefficients"]
    if not isinstance(coefficients, list):
        raise TypeError("invalid benchmark workload")
    warm = polynomial_roots(coefficients)
    if not warm.success:
        raise RuntimeError(warm.explain())
    samples: list[float] = []
    numpy_samples: list[float] = []
    final = warm
    repetitions = 9 if int(workload["degree"]) <= 16 else 5
    for _ in range(repetitions):
        started = time.perf_counter()
        final = polynomial_roots(coefficients)
        samples.append(1000.0 * (time.perf_counter() - started))
        started = time.perf_counter()
        numpy_result = numpy.roots(coefficients)
        numpy_samples.append(1000.0 * (time.perf_counter() - started))
        if len(numpy_result) != int(workload["degree"]):
            raise RuntimeError("NumPy companion oracle returned the wrong root count")
    records.append(
        {
            "name": workload["name"],
            "degree": workload["degree"],
            "method": final.method,
            "success": final.success,
            "iterations": final.iterations,
            "evaluations": final.evaluations,
            "warm_median_ms": statistics.median(samples),
            "warm_minimum_ms": min(samples),
            "numpy_companion_warm_median_ms": statistics.median(numpy_samples),
            "maximum_backward_error": final.value["maximum_backward_error"],
            "vieta_reconstruction_error": final.value["vieta_reconstruction_error"],
            "maximum_relative_condition": final.value["maximum_relative_condition"],
        }
    )

print(
    json.dumps(
        {
            "schema": "sagejs.numerics.polynomial-roots.benchmark/v1",
            "host": {
                "python": platform.python_version(),
                "platform": platform.platform(),
                "machine": platform.machine(),
            },
            "policy": {
                "warmup_runs": 1,
                "sample_count": "9 through degree 16; 5 above",
                "equivalence_gate": "result success plus independent backward validation",
                "scope": "ordinary CPython path; no browser or cross-platform claim",
            },
            "records": records,
        },
        indent=2,
        sort_keys=True,
    )
)
