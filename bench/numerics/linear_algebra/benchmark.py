"""Representative dynamic-Python dense linear algebra benchmark."""

from __future__ import annotations

import json
import math
import os
import sys
import time
from collections.abc import Callable
from typing import Any

from sagejs.numerics.linear_algebra import DenseMatrix, matrix_rank, solve
from sagejs.numerics.linear_algebra.factorizations import lu_factorize, qr_factorize
from sagejs.numerics.linear_algebra.validation import validate_qr, validate_solve


def _matrix(size: int) -> tuple[list[list[float]], list[float]]:
    rows: list[list[float]] = []
    for row in range(size):
        values: list[float] = []
        for column in range(size):
            value = float(((row * 17 + column * 13) % 23) - 11) / 23.0
            if row == column:
                value += float(size)
            values.append(value)
        rows.append(values)
    expected = [float((index * 7) % 13 - 6) / 7.0 for index in range(size)]
    right = [
        math.fsum(rows[row][column] * expected[column] for column in range(size))
        for row in range(size)
    ]
    return rows, right


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return 0.5 * (ordered[middle - 1] + ordered[middle])


def _measure(
    name: str,
    function: Callable[[], Any],
    *,
    samples: int,
    warmup: int = 1,
) -> tuple[dict[str, Any], Any]:
    for _ in range(warmup):
        function()
    timings: list[float] = []
    result: Any = None
    for _ in range(samples):
        started = time.perf_counter()
        result = function()
        timings.append((time.perf_counter() - started) * 1000.0)
    return (
        {
            "name": name,
            "samples": samples,
            "warmup": warmup,
            "milliseconds": timings,
            "median_milliseconds": _median(timings),
            "minimum_milliseconds": min(timings),
        },
        result,
    )


def benchmark(size: int = 16, samples: int = 3) -> dict[str, Any]:
    """Measure conversion, kernels, validation, tracing, and full results."""
    rows, right_values = _matrix(size)
    records: list[dict[str, Any]] = []

    conversion, dense = _measure(
        "storage_conversion", lambda: DenseMatrix.from_rows(rows), samples=samples
    )
    records.append(conversion)
    right = DenseMatrix(size, 1, right_values)

    factor_record, factorization = _measure(
        "partial_pivot_lu_factorization",
        lambda: lu_factorize(dense),
        samples=samples,
    )
    records.append(factor_record)
    solve_record, raw_solution = _measure(
        "retained_lu_solve", lambda: factorization.solve(right), samples=samples
    )
    records.append(solve_record)
    validation_record, validation = _measure(
        "independent_backward_validation",
        lambda: validate_solve(
            dense,
            raw_solution,
            right,
            tolerance=1e-12,
            condition_estimate=None,
        ),
        samples=samples,
    )
    records.append(validation_record)

    qr_record, qr_factorization = _measure(
        "column_pivoted_householder_qr",
        lambda: qr_factorize(dense, pivoted=True),
        samples=samples,
    )
    records.append(qr_record)
    qr_validation_record, qr_validation = _measure(
        "independent_qr_validation",
        lambda: validate_qr(dense, qr_factorization),
        samples=samples,
    )
    records.append(qr_validation_record)

    rank_record, rank_result = _measure(
        "jacobi_rank_diagnostics",
        lambda: matrix_rank(dense, max_sweeps=64, trace="none"),
        samples=samples,
    )
    records.append(rank_record)

    structured_record, structured = _measure(
        "structured_solve_with_diagnostics",
        lambda: solve(dense, right_values, max_sweeps=64, trace="none"),
        samples=samples,
    )
    records.append(structured_record)

    trace_record, traced = _measure(
        "structured_solve_iteration_trace",
        lambda: solve(
            dense,
            right_values,
            max_sweeps=64,
            trace="iterations",
            max_trace_events=256,
        ),
        samples=samples,
    )
    records.append(trace_record)

    if (
        not validation.passed
        or not qr_validation.passed
        or not structured.success
        or not traced.success
    ):
        raise RuntimeError("benchmark result failed independent validation")
    if rank_result.value != size or qr_factorization.rank_estimate != size:
        raise RuntimeError("benchmark matrix unexpectedly lost numerical rank")
    checksum = math.fsum(float(value) for value in structured.value)
    trace_overhead = (
        trace_record["median_milliseconds"] / structured_record["median_milliseconds"]
    )
    runtime_name = str(getattr(sys.implementation, "name", "unknown"))
    for argument in sys.argv:
        if "sagejs" in str(argument).lower():
            runtime_name = "sagejs"
            break
    return {
        "schema_version": 1,
        "workload": {
            "id": "diagonally-dominant-dense-square",
            "size": size,
            "right_sides": 1,
            "numeric_type": "binary64",
            "method": "partial_pivot_lu",
            "result_gate": "independent_normwise_backward_error",
        },
        "execution": {
            "implementation": "ordinary_python_same_source",
            "runtime": runtime_name,
            "samples": samples,
            "warmup": 1,
            "host": {
                "platform": str(sys.platform),
                "machine": os.environ.get("SAGEJS_BENCHMARK_MACHINE", "unrecorded"),
            },
            "source_revision": os.environ.get(
                "SAGEJS_BENCHMARK_REVISION", "unrecorded-working-tree"
            ),
        },
        "measurements": records,
        "trace_overhead_ratio": trace_overhead,
        "result": {
            "success": structured.success,
            "rank": rank_result.value,
            "backward_residual": structured.residual,
            "solution_checksum": checksum,
            "retained_trace_events": len(traced.trace.events),
            "trace_truncated": traced.trace.truncated,
        },
    }


if __name__ == "__main__":
    print(
        json.dumps(
            benchmark(),
            sort_keys=True,
            separators=(",", ":"),
        )
    )
