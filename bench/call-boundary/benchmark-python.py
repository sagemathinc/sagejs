"""Measure CPython-to-C call overhead for the same two-int32 operation."""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time

import boundary_add


def add_python(left: int, right: int) -> int:
    return left + right


def run_inline(count: int) -> int:
    accumulator = 17
    for _ in range(count):
        accumulator += 3
    return accumulator


def run_calls(operation: object, count: int) -> int:
    accumulator = 17
    for _ in range(count):
        accumulator = operation(accumulator, 3)  # type: ignore[operator]
    return accumulator


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=5_000_000)
    parser.add_argument("--warmup", type=int, default=500_000)
    parser.add_argument("--samples", type=int, default=9)
    arguments = parser.parse_args()
    for name in ("iterations", "warmup", "samples"):
        if getattr(arguments, name) <= 0:
            parser.error(f"--{name} must be positive")

    cases = [
        ("inline-loop", run_inline),
        ("python-call", lambda count: run_calls(add_python, count)),
        ("cpython-fastcall", lambda count: run_calls(boundary_add.add_fastcall, count)),
        ("cpython-varargs", lambda count: run_calls(boundary_add.add_varargs, count)),
    ]
    checksums = {name: operation(arguments.warmup) for name, operation in cases}
    observations: dict[str, list[float]] = {name: [] for name, _ in cases}
    for sample in range(arguments.samples):
        rotated = [cases[(index + sample) % len(cases)] for index in range(len(cases))]
        for name, operation in rotated:
            started = time.perf_counter_ns()
            checksum = operation(arguments.iterations)
            elapsed = time.perf_counter_ns() - started
            expected = checksums[name] + 3 * (arguments.iterations - arguments.warmup)
            if checksum != expected:
                raise RuntimeError(f"{name} produced {checksum}, expected {expected}")
            observations[name].append(elapsed / arguments.iterations)

    medians = {name: statistics.median(values) for name, values in observations.items()}
    baseline = medians["inline-loop"]
    results = [
        {
            "name": name,
            "raw_ns_per_call": medians[name],
            "incremental_ns_per_call": max(0.0, medians[name] - baseline),
            "calls_per_second": 1_000_000_000 / medians[name],
            "samples_ns_per_call": observations[name],
        }
        for name, _ in cases
    ]
    print(
        json.dumps(
            {
                "schema": "sagejs.call-boundary-benchmark/v1",
                "runtime": {
                    "name": "cpython",
                    "version": platform.python_version(),
                    "implementation": platform.python_implementation(),
                },
                "platform": {
                    "os": sys.platform,
                    "arch": platform.machine(),
                },
                "iterations": arguments.iterations,
                "warmup_iterations": arguments.warmup,
                "samples": arguments.samples,
                "checksum": checksums["cpython-fastcall"]
                + 3 * (arguments.iterations - arguments.warmup),
                "results": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
