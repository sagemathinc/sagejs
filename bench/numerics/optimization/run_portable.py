#!/usr/bin/env python3
"""Run the backend-neutral production optimization corpus on the fallback."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src/lib"))

from sagejs.numerics.optimization import (  # noqa: E402
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    curve_fit,
    least_squares,
    linear_fit,
    minimize,
    minimize_scalar,
    solve_nonlinear_system,
)

sys.path.pop(0)


def rosenbrock(point: list[float]) -> float:
    return sum(
        100.0 * (point[index + 1] - point[index] * point[index]) ** 2
        + (1.0 - point[index]) ** 2
        for index in range(len(point) - 1)
    )


def rosenbrock_gradient(point: list[float]) -> list[float]:
    gradient = [0.0 for _ in point]
    for index in range(len(point) - 1):
        difference = point[index + 1] - point[index] * point[index]
        gradient[index] += -400.0 * point[index] * difference + 2.0 * (
            point[index] - 1.0
        )
        gradient[index + 1] += 200.0 * difference
    return gradient


def solve_case(case: dict[str, Any]) -> Any:
    formula = case["formula"]
    initial = case.get("initial", [])
    if formula == "quadratic-2":
        return minimize_scalar(lambda x: (x - 2.0) ** 2, *case["bounds"])
    if formula == "tiny-quadratic":
        return minimize_scalar(
            lambda x: (x - 5.0e-13) ** 2,
            *case["bounds"],
            xtol=1.0e-15,
            rtol=0.0,
        )
    if formula == "identity":
        return minimize_scalar(lambda x: x, *case["bounds"])
    if formula == "positive-infinity":
        return minimize_scalar(lambda x: float("inf"), *case["bounds"])
    if formula == "rosenbrock":
        return minimize(rosenbrock, initial, method=case["method"], maxiter=3000)
    if formula == "absolute-bowl":
        return minimize(
            lambda point: abs(point[0]) + abs(point[1]),
            initial,
            method=case["method"],
            maxiter=3000,
        )
    if formula == "rosenbrock-gradient":
        return minimize(
            rosenbrock,
            initial,
            gradient=rosenbrock_gradient,
            method=case["method"],
            maxiter=3000,
            max_evaluations=50_000,
        )
    if formula == "active-box":
        return minimize(
            lambda point: (point[0] - 3.0) ** 2 + (point[1] + 1.0) ** 2,
            initial,
            gradient=lambda point: [
                2.0 * (point[0] - 3.0),
                2.0 * (point[1] + 1.0),
            ],
            bounds=case["bounds"],
            method=case["method"],
        )
    if formula == "fixed-coordinate":
        return minimize(
            lambda point: (
                (point[0] - 1.0) ** 2 + point[1] * point[1] + (point[2] + 1.0) ** 2
            ),
            initial,
            gradient=lambda point: [
                2.0 * (point[0] - 1.0),
                2.0 * point[1],
                2.0 * (point[2] + 1.0),
            ],
            bounds=case["bounds"],
            method=case["method"],
        )
    if formula == "false-gradient":
        return minimize(
            lambda point: (point[0] - 2.0) ** 2,
            initial,
            gradient=lambda point: [0.0],
            method=case["method"],
        )
    if formula == "shallow-false-gradient":
        return minimize(
            lambda point: 1.0e-4 * point[0],
            initial,
            gradient=lambda point: [0.0],
            method=case["method"],
        )
    if formula == "bounded-method-envelope":
        return minimize(
            lambda point: point[0] * point[0],
            initial,
            bounds=case["bounds"],
            method=case["method"],
        )
    if formula == "circle-line":
        return solve_nonlinear_system(
            lambda point: [
                point[0] * point[0] + point[1] * point[1] - 1.0,
                point[0] - point[1],
            ],
            initial,
        )
    if formula == "linear-residual-30":
        x_values = [index / 10.0 for index in range(30)]
        y_values = [2.5 * x_value - 0.75 for x_value in x_values]
        return least_squares(
            lambda point: [
                point[0] * x_values[index] + point[1] - y_values[index]
                for index in range(len(x_values))
            ],
            initial,
        )
    if formula == "rosenbrock-residual":
        return least_squares(
            lambda point: [10.0 * (point[1] - point[0] * point[0]), 1.0 - point[0]],
            initial,
        )
    if formula == "rank-deficient":
        return least_squares(
            lambda point: [
                point[0] + point[1] - 2.0,
                2.0 * (point[0] + point[1] - 2.0),
            ],
            initial,
        )
    if formula == "stationary-maximum":
        return least_squares(
            lambda point: [point[0] * point[0] - 1.0],
            initial,
        )
    if formula == "ill-conditioned":
        return least_squares(
            lambda point: [
                point[0] + point[1] - 1.0,
                point[0] + (1.0 + 1.0e-6) * point[1] - 1.0,
            ],
            initial,
        )
    if formula == "exponential-decay":
        x_values = [0.0, 1.0, 2.0, 3.0]
        return least_squares(
            lambda point: [
                point[0] * math.exp(-point[1] * x_value)
                - 2.0 * math.exp(-0.5 * x_value)
                for x_value in x_values
            ],
            initial,
        )
    if formula == "affine-data":
        return linear_fit([0.0, 1.0, 2.0, 3.0], [1.0, 3.0, 5.0, 7.0])
    if formula == "exponential-data":
        x_values = [0.0, 1.0, 2.0, 3.0]
        y_values = [2.0 * math.exp(-0.5 * x_value) for x_value in x_values]
        return curve_fit(
            lambda x_value, point: point[0] * math.exp(-point[1] * x_value),
            x_values,
            y_values,
            initial,
        )
    if formula == "cancelled-quadratic":
        return minimize_scalar(lambda x: x * x, *case["bounds"], cancel=lambda: True)
    if formula == "budget-quadratic":
        return minimize_scalar(lambda x: x * x, *case["bounds"], max_evaluations=1)
    if formula == "invalid-scalar-result":
        return minimize_scalar(lambda x: "not-a-number", *case["bounds"])
    if formula == "invalid-gradient-result":
        return minimize(
            lambda point: point[0] * point[0],
            initial,
            gradient=lambda point: ["not-a-number"],
            method=case["method"],
        )
    if formula == "oversized-residual":
        return least_squares(
            lambda point: [0.0] * (MAX_RESIDUAL_DIMENSION + 1),
            initial,
        )
    if formula == "oversized-fit":
        return linear_fit(
            list(range(MAX_FIT_OBSERVATIONS + 1)),
            [0.0] * (MAX_FIT_OBSERVATIONS + 1),
        )
    if formula == "validation-callback-failure":
        calls = [0]

        def objective(point: list[float]) -> float:
            calls[0] += 1
            if calls[0] > 1:
                raise LookupError("validation-only failure")
            return (point[0] - 1.0) ** 2

        return minimize(
            objective,
            initial,
            gradient=lambda point: [0.0],
            method=case["method"],
        )
    if formula == "validation-budget":
        return minimize(
            lambda point: (point[0] - 1.0) ** 2,
            initial,
            gradient=lambda point: [0.0],
            method=case["method"],
            max_evaluations=2,
        )
    if formula == "unsupported-constraint":
        return minimize(
            lambda point: point[0] * point[0],
            initial,
            constraints=[lambda point: point[0]],
        )
    raise ValueError("unknown corpus formula: " + formula)


def distance(actual: Any, expected: Any) -> float:
    if isinstance(expected, list):
        return max(
            abs(float(actual[index]) - float(expected[index]))
            for index in range(len(expected))
        )
    return abs(float(actual) - float(expected))


def platform_id() -> str:
    machine = platform.machine().lower()
    normalized = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64"}.get(
        machine, machine
    )
    return platform.system().lower() + "-" + normalized


def acceptance(case: dict[str, Any], result: Any) -> tuple[bool, dict[str, Any]]:
    expected = case["expect"]
    checks: dict[str, Any] = {}
    passed = True
    expected_methods = {
        "scalar-minimum": "bounded-brent",
        "nonlinear-system": "damped-newton",
        "least-squares": "damped-gauss-newton",
        "linear-fit": "centered-linear-fit",
        "curve-fit": "damped-gauss-newton",
    }
    expected_method = case.get("method", expected_methods.get(case["operation"]))
    checks["method"] = result.method == expected_method
    passed = passed and checks["method"]
    if "success" in expected:
        checks["success"] = result.success == expected["success"]
        passed = passed and checks["success"]
        if expected["success"]:
            checks["validation"] = result.validation.passed is True
            passed = passed and checks["validation"]
    if "status" in expected:
        checks["status"] = result.status == expected["status"]
        passed = passed and checks["status"]
    if "value" in expected:
        checks["value_present"] = result.value is not None
        passed = passed and checks["value_present"]
        if result.value is not None:
            measured_distance = distance(result.value, expected["value"])
            checks["distance"] = measured_distance
            checks["distance_passed"] = measured_distance <= expected["distance_max"]
            passed = passed and checks["distance_passed"]
    if "objective_max" in expected:
        checks["objective_present"] = result.objective is not None
        passed = passed and checks["objective_present"]
        if result.objective is not None:
            checks["objective"] = result.objective
            checks["objective_passed"] = result.objective <= expected["objective_max"]
            passed = passed and checks["objective_passed"]
    if "validation_residual_max" in expected:
        checks["validation_residual_present"] = result.residual is not None
        passed = passed and checks["validation_residual_present"]
        if result.residual is not None:
            checks["validation_residual"] = result.residual
            checks["validation_residual_passed"] = (
                result.residual <= expected["validation_residual_max"]
            )
            passed = passed and checks["validation_residual_passed"]
    if "diagnostics" in expected:
        actual_diagnostics = {item.code for item in result.diagnostics}
        checks["diagnostics"] = all(
            code in actual_diagnostics for code in expected["diagnostics"]
        )
        passed = passed and checks["diagnostics"]
    return passed, checks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--samples", type=int, default=1)
    parser.add_argument("--benchmark-only", action="store_true")
    parser.add_argument("--output")
    arguments = parser.parse_args()
    corpus_path = Path(__file__).with_name("corpus.json")
    corpus_bytes = corpus_path.read_bytes()
    corpus = json.loads(corpus_bytes)
    selected = []
    for case in corpus["cases"]:
        if arguments.case and case["id"] not in arguments.case:
            continue
        if arguments.benchmark_only and not case.get("benchmark", False):
            continue
        selected.append(case)
    records: list[dict[str, Any]] = []
    all_passed = True
    for case in selected:
        durations: list[float] = []
        result = None
        exception_name = None
        for _ in range(arguments.samples):
            started = time.perf_counter()
            try:
                result = solve_case(case)
                exception_name = None
            except Exception as error:
                result = None
                exception_name = type(error).__name__
            durations.append(1000.0 * (time.perf_counter() - started))
        if "exception" in case["expect"]:
            accepted = exception_name == case["expect"]["exception"]
            checks = {"exception": exception_name}
        elif result is None:
            accepted = False
            checks = {"exception": exception_name}
        else:
            accepted, checks = acceptance(case, result)
        all_passed = all_passed and accepted
        record: dict[str, Any] = {
            "id": case["id"],
            "accepted": accepted,
            "checks": checks,
            "durations_ms": durations,
            "median_ms": statistics.median(durations),
        }
        if result is not None:
            record.update(
                {
                    "status": result.status,
                    "success": result.success,
                    "method": result.method,
                    "value": result.value,
                    "objective": result.objective,
                    "validation": result.validation.to_dict(),
                    "iterations": result.iterations,
                    "evaluations": result.evaluations,
                }
            )
        records.append(record)
    receipt = {
        "schema_version": 1,
        "source_revision": subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip(),
        "backend": "sagejs-ordinary-python",
        "runtime": "cpython " + sys.version.split()[0],
        "platform": platform_id(),
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
        "samples": arguments.samples,
        "passed": sum(1 for record in records if record["accepted"]),
        "total": len(records),
        "cases": records,
    }
    text = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if arguments.output:
        Path(arguments.output).write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
