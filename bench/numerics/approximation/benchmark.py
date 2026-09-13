"""Representative dynamic-Python approximation benchmark and budget witness."""

from __future__ import annotations

import collections.abc  # noqa: F401
import hashlib  # noqa: F401
import json
import math
import platform
import sys
import time
import typing  # noqa: F401
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.approximation import (  # noqa: E402
    chebyshev_approximation,
    cubic_spline,
    finite_difference,
    interpolate,
)


def milliseconds(function):
    started = time.perf_counter()
    value = function()
    return value, 1000.0 * (time.perf_counter() - started)


def barycentric_case() -> tuple[dict[str, float | int], float]:
    count = 32
    nodes = sorted(math.cos(math.pi * index / (count - 1)) for index in range(count))
    values = [math.exp(value) for value in nodes]
    result, construction_ms = milliseconds(lambda: interpolate(nodes, values))
    assert result.success

    def evaluate_all() -> float:
        checksum = 0.0
        for index in range(1000):
            checksum += result.evaluate(-1.0 + 2.0 * index / 999.0)
        return checksum

    checksum, evaluation_ms = milliseconds(evaluate_all)
    return {
        "nodes": count,
        "queries": 1000,
        "construction_ms": construction_ms,
        "evaluation_ms": evaluation_ms,
    }, checksum


def spline_case() -> tuple[dict[str, float | int], float]:
    count = 2001
    nodes = [10.0 * index / (count - 1) for index in range(count)]
    values = [math.sin(value) for value in nodes]
    result, construction_ms = milliseconds(
        lambda: cubic_spline(nodes, values, boundary="natural")
    )
    assert result.success

    def evaluate_all() -> float:
        checksum = 0.0
        for index in range(1000):
            checksum += result.evaluate(10.0 * index / 999.0)
        return checksum

    checksum, evaluation_ms = milliseconds(evaluate_all)
    return {
        "nodes": count,
        "queries": 1000,
        "construction_ms": construction_ms,
        "evaluation_ms": evaluation_ms,
    }, checksum


def finite_difference_case() -> tuple[dict[str, float | int], float]:
    repeats = 200

    def differentiate_all() -> float:
        checksum = 0.0
        for index in range(repeats):
            point = index / repeats
            result = finite_difference(
                math.exp,
                point,
                derivative=math.exp,
                accuracy_order=4,
            )
            assert result.success
            checksum += result.evaluate(0)
        return checksum

    checksum, elapsed_ms = milliseconds(differentiate_all)
    return {
        "derivatives": repeats,
        "stencil_accuracy_order": 4,
        "elapsed_ms": elapsed_ms,
    }, checksum


def chebyshev_case() -> tuple[dict[str, float | int], float]:
    degree = 64
    result, construction_ms = milliseconds(
        lambda: chebyshev_approximation(math.exp, [-1, 1], degree)
    )
    assert result.success

    def evaluate_all() -> float:
        checksum = 0.0
        for index in range(1000):
            checksum += result.evaluate(-1.0 + 2.0 * index / 999.0)
        return checksum

    checksum, evaluation_ms = milliseconds(evaluate_all)
    return {
        "degree": degree,
        "queries": 1000,
        "construction_ms": construction_ms,
        "evaluation_ms": evaluation_ms,
    }, checksum


cases: dict[str, dict[str, float | int]] = {}
checksum = 0.0
for name, benchmark in (
    ("barycentric", barycentric_case),
    ("cubic_spline", spline_case),
    ("finite_difference", finite_difference_case),
    ("chebyshev", chebyshev_case),
):
    record, contribution = benchmark()
    cases[name] = record
    checksum += contribution

if "--check" in sys.argv:
    assert float(cases["barycentric"]["construction_ms"]) < 2500.0
    assert float(cases["barycentric"]["evaluation_ms"]) < 2500.0
    assert float(cases["cubic_spline"]["construction_ms"]) < 2500.0
    assert float(cases["cubic_spline"]["evaluation_ms"]) < 2500.0
    assert float(cases["finite_difference"]["elapsed_ms"]) < 2500.0
    assert float(cases["chebyshev"]["construction_ms"]) < 2500.0
    assert float(cases["chebyshev"]["evaluation_ms"]) < 2500.0

print(
    json.dumps(
        {
            "schema": "sagejs.numerics.approximation.benchmark/v1",
            "runtime": platform.python_implementation(),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "timer": "time.perf_counter",
            "warmup": "construction precedes evaluation timing; no discarded run",
            "samples": 1,
            "cases": cases,
            "checksum": checksum,
        },
        sort_keys=True,
    )
)
