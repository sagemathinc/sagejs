#!/usr/bin/env python3
"""Measure complete ODE solves, cold import, memory, and serialized evidence."""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
import tracemalloc
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.append(str(ROOT / "src" / "lib"))

from sagejs.numerics.ode import OdeInvariant, solve_ivp  # noqa: E402


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(fraction * (len(ordered) - 1))))
    return ordered[index]


def _time_workload(function: Any, repetitions: int) -> tuple[dict[str, float], Any]:
    function()
    samples: list[float] = []
    result = None
    for _ in range(repetitions):
        started = time.perf_counter()
        result = function()
        samples.append(1000.0 * (time.perf_counter() - started))
    return (
        {
            "samples": repetitions,
            "minimum_ms": min(samples),
            "median_ms": statistics.median(samples),
            "p90_ms": _percentile(samples, 0.9),
        },
        result,
    )


def _memory_workload(function: Any) -> dict[str, int]:
    tracemalloc.start()
    before_current, _ = tracemalloc.get_traced_memory()
    result = function()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return {
        "traced_current_delta_bytes": max(0, current - before_current),
        "traced_peak_delta_bytes": max(0, peak - before_current),
        "serialized_result_bytes": len(result.to_json().encode("utf-8")),
        "accepted_points": len(result.trajectory.internal_times),
        "dense_segments": len(result.trajectory.segments),
    }


def _cold_import_samples(repetitions: int) -> dict[str, float]:
    source = (
        "import collections.abc, hashlib, json, math, sys, typing;"
        + "sys.path.append("
        + repr(str(ROOT / "src" / "lib"))
        + ");from sagejs.numerics.ode import solve_ivp"
    )
    samples: list[float] = []
    for _ in range(repetitions):
        started = time.perf_counter()
        completed = subprocess.run(
            [sys.executable, "-I", "-c", source],
            cwd=ROOT,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr)
        samples.append(1000.0 * (time.perf_counter() - started))
    return {
        "samples": repetitions,
        "minimum_ms": min(samples),
        "median_ms": statistics.median(samples),
        "p90_ms": _percentile(samples, 0.9),
        "scope": "fresh CPython process plus import; no solve",
    }


def _classroom() -> Any:
    return solve_ivp(
        lambda t, y: [y[0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-7,
        atol=1e-10,
        reference=lambda t: [math.exp(t)],
        reference_atol=1e-6,
        reference_rtol=1e-6,
        trace="summary",
    )


def _interactive() -> Any:
    return solve_ivp(
        lambda t, y: [y[1], -y[0]],
        (0.0, 40.0 * math.pi),
        [1.0, 0.0],
        rtol=1e-7,
        atol=1e-10,
        max_step=0.25,
        invariants=[
            OdeInvariant(
                lambda t, y: y[0] * y[0] + y[1] * y[1],
                name="squared_norm",
                atol=2e-5,
                rtol=2e-5,
            )
        ],
        trace="summary",
    )


def _substantial() -> Any:
    dimension = 32
    initial = [1.0 / (index + 1) for index in range(dimension)]

    def chain(t: float, y: list[float]) -> list[float]:
        answer: list[float] = []
        for index in range(dimension):
            left = y[index - 1] if index else 0.0
            right = y[index + 1] if index + 1 < dimension else 0.0
            answer.append(
                0.2 * left - 0.45 * y[index] + 0.2 * right + 0.01 * math.sin(t)
            )
        return answer

    return solve_ivp(
        chain,
        (0.0, 50.0),
        initial,
        rtol=1e-6,
        atol=1e-9,
        max_step=0.2,
        trace="summary",
    )


def _scipy_oracle_timing(repetitions: int) -> dict[str, Any]:
    try:
        import scipy
        from scipy.integrate import solve_ivp as scipy_solve_ivp
    except ImportError:
        return {"available": False}
    samples: list[float] = []
    result = None
    for _ in range(repetitions):
        started = time.perf_counter()
        result = scipy_solve_ivp(
            lambda t, y: [y[0]],
            (0.0, 1.0),
            [1.0],
            method="RK45",
            rtol=1e-7,
            atol=1e-10,
        )
        samples.append(1000.0 * (time.perf_counter() - started))
    if result is None:
        raise RuntimeError("SciPy timing produced no result")
    return {
        "available": True,
        "version": scipy.__version__,
        "median_ms": statistics.median(samples),
        "nfev": int(result.nfev),
        "final_state": [float(value) for value in result.y[:, -1]],
        "scope": "same RK45 classroom equation/tolerances in the SciPy/NumPy runtime; not a browser timing",
    }


def run_benchmark(repetitions: int, cold_repetitions: int) -> dict[str, Any]:
    workloads = {
        "instant_classroom": _classroom,
        "interactive_exploration": _interactive,
        "substantial_local": _substantial,
    }
    records: dict[str, Any] = {}
    for name, workload in workloads.items():
        timing, result = _time_workload(workload, repetitions)
        if not result.success:
            raise RuntimeError(name + " failed validation: " + result.status)
        records[name] = {
            "timing": timing,
            "rhs_evaluations": result.to_dict()["measurements"]["rhs_evaluations"],
            "accepted_steps": result.evidence["local_error_control"]["accepted_steps"],
            "rejected_steps": result.evidence["local_error_control"]["rejected_steps"],
            "memory": _memory_workload(workload),
        }
    return {
        "schema_version": 1,
        "host": {
            "platform": platform.system().lower(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "node": os.environ.get("SAGEJS_NODE_VERSION", "not-measured"),
        },
        "method": {
            "implementation": "ordinary CPython source",
            "solver": "Dormand-Prince RK45",
            "warmup_solves": 1,
            "timed_repetitions": repetitions,
            "memory": "CPython tracemalloc around one complete solve and result materialization",
        },
        "cold_import": _cold_import_samples(cold_repetitions),
        "workloads": records,
        "scipy_oracle_timing": _scipy_oracle_timing(repetitions),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repetitions", type=int, default=7)
    parser.add_argument("--cold-repetitions", type=int, default=5)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    if arguments.repetitions <= 0 or arguments.cold_repetitions <= 0:
        raise SystemExit("repetition counts must be positive")
    record = run_benchmark(arguments.repetitions, arguments.cold_repetitions)
    rendered = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if arguments.output is not None:
        arguments.output.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
