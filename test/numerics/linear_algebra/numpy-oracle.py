"""Deterministic NumPy differential campaign for dense numerical linear algebra.

This is development/release evidence, not a runtime dependency.  The portable
Node test executes fixed values from `corpus.json` on every supported test host.
"""

from __future__ import annotations

import collections.abc
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from typing import Any

import numpy as np
import numpy.linalg as nla
import scipy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.linear_algebra import (  # noqa: E402
    condition_number,
    least_squares,
    solve,
)


def _relative_error(observed: list[float], expected: np.ndarray[Any, Any]) -> float:
    difference = max(
        (
            abs(observed[index] - float(expected[index]))
            for index in range(len(observed))
        ),
        default=0.0,
    )
    scale = max((abs(float(value)) for value in expected), default=1.0)
    return difference / max(1.0, scale)


def campaign(seed: int = 20260831) -> dict[str, Any]:
    """Run deterministic square, tall, wide, condition, and scale comparisons."""
    generator = np.random.default_rng(seed)
    random.seed(seed)
    failures: list[dict[str, Any]] = []
    maximum_solve_error = 0.0
    maximum_least_squares_error = 0.0
    maximum_condition_error = 0.0
    solve_cases = 0
    least_squares_cases = 0
    condition_cases = 0

    for size in range(1, 9):
        for sample in range(50):
            matrix = generator.normal(size=(size, size))
            row_scale = np.power(10.0, generator.uniform(-5.0, 5.0, size=(size, 1)))
            matrix = matrix * row_scale
            expected_solution = generator.normal(size=size)
            right = matrix @ expected_solution
            reference = nla.solve(matrix, right)
            result = solve(matrix.tolist(), right.tolist())
            solve_cases += 1
            if not result.success:
                failures.append(
                    {
                        "kind": "solve",
                        "size": size,
                        "sample": sample,
                        "status": result.status,
                    }
                )
                continue
            maximum_solve_error = max(
                maximum_solve_error, _relative_error(result.value, reference)
            )

    for rows, columns in ((5, 2), (8, 3), (2, 5), (3, 8), (4, 4)):
        for sample in range(50):
            matrix = generator.normal(size=(rows, columns))
            right = generator.normal(size=rows)
            reference = nla.lstsq(matrix, right, rcond=None)[0]
            result = least_squares(matrix.tolist(), right.tolist())
            least_squares_cases += 1
            if not result.success:
                failures.append(
                    {
                        "kind": "least_squares",
                        "shape": [rows, columns],
                        "sample": sample,
                        "status": result.status,
                    }
                )
                continue
            maximum_least_squares_error = max(
                maximum_least_squares_error, _relative_error(result.value, reference)
            )

    for rows, columns in ((2, 2), (5, 3), (3, 5), (8, 8)):
        for sample in range(25):
            matrix = generator.normal(size=(rows, columns))
            reference = float(nla.cond(matrix))
            result = condition_number(matrix.tolist())
            condition_cases += 1
            if not result.success or result.value is None:
                failures.append(
                    {
                        "kind": "condition",
                        "shape": [rows, columns],
                        "sample": sample,
                        "status": result.status,
                    }
                )
                continue
            maximum_condition_error = max(
                maximum_condition_error, abs(result.value - reference) / reference
            )

    scale_base = [[1.0, 1.0], [0.0, 1.0]]
    reference_condition = (3.0 + math.sqrt(5.0)) / 2.0
    for exponent in (-200, -100, 0, 100, 200):
        factor = 10.0**exponent
        scaled = [[factor * value for value in row] for row in scale_base]
        result = condition_number(scaled)
        if (
            not result.success
            or result.value is None
            or abs(result.value - reference_condition) > 1e-13
        ):
            failures.append(
                {"kind": "uniform_scale", "exponent": exponent, "value": result.value}
            )

    if failures:
        raise AssertionError(json.dumps(failures, sort_keys=True))
    return {
        "schema_version": 1,
        "seed": seed,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "cases": {
            "solve": solve_cases,
            "least_squares": least_squares_cases,
            "condition": condition_cases,
            "uniform_scale": 5,
        },
        "maximum_relative_errors": {
            "solve": maximum_solve_error,
            "least_squares": maximum_least_squares_error,
            "condition": maximum_condition_error,
        },
        "failures": 0,
    }


if __name__ == "__main__":
    print(json.dumps(campaign(), sort_keys=True, separators=(",", ":")))
