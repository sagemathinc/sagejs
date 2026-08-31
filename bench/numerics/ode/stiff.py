#!/usr/bin/env python3
"""Measure the complete qualified Rosenbrock4 stiff corpus.

This harness prints a reproducible observation record. It does not declare a
release performance budget or qualify a new runtime.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.append(str(ROOT / "src" / "lib"))

from sagejs.numerics.ode import solve_ivp  # noqa: E402


def robertson(t: float, y: list[float]) -> list[float]:
    y1, y2, y3 = y
    return [
        -0.04 * y1 + 1e4 * y2 * y3,
        0.04 * y1 - 1e4 * y2 * y3 - 3e7 * y2 * y2,
        3e7 * y2 * y2,
    ]


def robertson_jacobian(t: float, y: list[float]) -> list[list[float]]:
    y1, y2, y3 = y
    return [
        [-0.04, 1e4 * y3, 1e4 * y2],
        [0.04, -1e4 * y3 - 6e7 * y2, -1e4 * y2],
        [0.0, 6e7 * y2, 0.0],
    ]


def hires(t: float, y: list[float]) -> list[float]:
    return [
        -1.71 * y[0] + 0.43 * y[1] + 8.32 * y[2] + 0.0007,
        1.71 * y[0] - 8.75 * y[1],
        -10.03 * y[2] + 0.43 * y[3] + 0.035 * y[4],
        8.32 * y[1] + 1.71 * y[2] - 1.12 * y[3],
        -1.745 * y[4] + 0.43 * y[5] + 0.43 * y[6],
        -280.0 * y[5] * y[7] + 0.69 * y[3] + 1.71 * y[4] - 0.43 * y[5] + 0.69 * y[6],
        280.0 * y[5] * y[7] - 1.81 * y[6],
        -280.0 * y[5] * y[7] + 1.81 * y[6],
    ]


def hires_jacobian(t: float, y: list[float]) -> list[list[float]]:
    return [
        [-1.71, 0.43, 8.32, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.71, -8.75, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, -10.03, 0.43, 0.035, 0.0, 0.0, 0.0],
        [0.0, 8.32, 1.71, -1.12, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, -1.745, 0.43, 0.43, 0.0],
        [
            0.0,
            0.0,
            0.0,
            0.69,
            1.71,
            -0.43 - 280.0 * y[7],
            0.69,
            -280.0 * y[5],
        ],
        [0.0, 0.0, 0.0, 0.0, 0.0, 280.0 * y[7], -1.81, 280.0 * y[5]],
        [0.0, 0.0, 0.0, 0.0, 0.0, -280.0 * y[7], 1.81, -280.0 * y[5]],
    ]


MU = 1000.0


def vanderpol(t: float, y: list[float]) -> list[float]:
    return [y[1], MU * (1.0 - y[0] * y[0]) * y[1] - y[0]]


def vanderpol_jacobian(t: float, y: list[float]) -> list[list[float]]:
    return [
        [0.0, 1.0],
        [-2.0 * MU * y[0] * y[1] - 1.0, MU * (1.0 - y[0] * y[0])],
    ]


CASES: dict[str, tuple[Any, Any, tuple[float, float], list[float], float]] = {
    "robertson": (
        robertson,
        robertson_jacobian,
        (0.0, 100.0),
        [1.0, 0.0, 0.0],
        1e-10,
    ),
    "hires": (
        hires,
        hires_jacobian,
        (0.0, 321.8122),
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0057],
        1e-10,
    ),
    "stiff_vanderpol": (
        vanderpol,
        vanderpol_jacobian,
        (0.0, 3000.0),
        [2.0, 0.0],
        1e-9,
    ),
}


def main() -> None:
    records: dict[str, Any] = {}
    for name, (function, jacobian, t_span, y0, atol) in CASES.items():
        started = time.perf_counter()
        result = solve_ivp(
            function,
            t_span,
            y0,
            method="rosenbrock4",
            jacobian=jacobian,
            rtol=1e-6,
            atol=atol,
            max_steps=20_000,
            max_evaluations=250_000,
            max_output_points=20_000,
            trace="summary",
        )
        elapsed_ms = 1000.0 * (time.perf_counter() - started)
        if not result.success:
            raise RuntimeError(name + " failed: " + result.status)
        measurements = result.to_dict()["measurements"]
        records[name] = {
            "elapsed_ms": elapsed_ms,
            "final_state": list(result.value),
            "accepted_steps": measurements["accepted_steps"],
            "rejected_steps": measurements["rejected_steps"],
            "callback_evaluations": measurements["callback_evaluations"],
            "jacobian_evaluations": measurements["jacobian_evaluations"],
            "maximum_linear_residual": measurements[
                "max_normalized_linear_solve_residual"
            ],
            "dense_acceptance_metric": result.evidence["dense_defect"][
                "acceptance_metric"
            ],
        }
    print(
        json.dumps(
            {
                "schema_version": 1,
                "scope": "single CPython process; one complete solve per case; not a release budget",
                "method": "ordinary-Python Kaps-Rentrop Rosenbrock4",
                "cases": records,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
