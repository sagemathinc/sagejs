#!/usr/bin/env python3
"""Development-only SciPy differentials for the portable optimization slice."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import scipy
from scipy import optimize

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src/lib"))

from sagejs.numerics.optimization import (  # noqa: E402
    least_squares,
    minimize,
    minimize_scalar,
    solve_nonlinear_system,
)

sys.path.pop(0)


def rosenbrock(point: list[float] | np.ndarray[Any, Any]) -> float:
    return float(
        sum(
            100.0 * (point[index + 1] - point[index] * point[index]) ** 2
            + (1.0 - point[index]) ** 2
            for index in range(len(point) - 1)
        )
    )


def rosenbrock_gradient(point: list[float] | np.ndarray[Any, Any]) -> list[float]:
    gradient = [0.0 for _ in point]
    for index in range(len(point) - 1):
        difference = point[index + 1] - point[index] * point[index]
        gradient[index] += -400.0 * point[index] * difference + 2.0 * (
            point[index] - 1.0
        )
        gradient[index + 1] += 200.0 * difference
    return gradient


def max_distance(left: Any, right: Any) -> float:
    if isinstance(left, (int, float)):
        return abs(float(left) - float(right))
    return max(
        abs(float(left[index]) - float(right[index])) for index in range(len(left))
    )


def platform_id() -> str:
    machine = platform.machine().lower()
    normalized = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64"}.get(
        machine, machine
    )
    return platform.system().lower() + "-" + normalized


def result_record(
    case_id: str,
    method_relationship: str,
    sagejs_result: Any,
    scipy_value: Any,
    scipy_objective: float,
    *,
    expected_method: str,
    distance_limit: float,
    objective_limit: float,
) -> dict[str, Any]:
    value_distance = max_distance(sagejs_result.value, scipy_value)
    objective_difference = abs(float(sagejs_result.objective or 0.0) - scipy_objective)
    accepted = bool(
        sagejs_result.success
        and sagejs_result.method == expected_method
        and value_distance <= distance_limit
        and objective_difference <= objective_limit
    )
    return {
        "id": case_id,
        "accepted": accepted,
        "method_relationship": method_relationship,
        "sagejs": {
            "method": sagejs_result.method,
            "value": sagejs_result.value,
            "objective": sagejs_result.objective,
            "status": sagejs_result.status,
            "validation": sagejs_result.validation.to_dict(),
            "evaluations": sagejs_result.evaluations,
        },
        "scipy": {
            "value": np.asarray(scipy_value).tolist(),
            "objective": scipy_objective,
        },
        "checks": {
            "method": sagejs_result.method == expected_method,
            "expected_method": expected_method,
            "value_distance": value_distance,
            "value_distance_limit": distance_limit,
            "objective_difference": objective_difference,
            "objective_difference_limit": objective_limit,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    arguments = parser.parse_args()
    records: list[dict[str, Any]] = []

    ours_scalar = minimize_scalar(lambda x: (x - 2.0) ** 2, -1.0, 5.0)
    scipy_scalar = optimize.minimize_scalar(
        lambda x: (x - 2.0) ** 2,
        bounds=(-1.0, 5.0),
        method="bounded",
        options={"xatol": 1.0e-10},
    )
    records.append(
        result_record(
            "bounded-brent-quadratic",
            "same bounded Brent family",
            ours_scalar,
            float(scipy_scalar.x),
            float(scipy_scalar.fun),
            expected_method="bounded-brent",
            distance_limit=1.0e-8,
            objective_limit=1.0e-14,
        )
    )

    initial = [-1.2, 1.0]
    ours_simplex = minimize(rosenbrock, initial, method="nelder-mead", maxiter=3000)
    scipy_simplex = optimize.minimize(
        rosenbrock,
        np.asarray(initial),
        method="Nelder-Mead",
        options={"maxiter": 3000, "xatol": 1.0e-9, "fatol": 1.0e-10},
    )
    records.append(
        result_record(
            "nelder-mead-rosenbrock-2",
            "same named algorithm; trajectories need not match",
            ours_simplex,
            scipy_simplex.x,
            float(scipy_simplex.fun),
            expected_method="nelder-mead",
            distance_limit=2.0e-5,
            objective_limit=1.0e-12,
        )
    )

    ours_bfgs = minimize(
        rosenbrock,
        initial,
        gradient=rosenbrock_gradient,
        method="bfgs",
        maxiter=3000,
    )
    scipy_bfgs = optimize.minimize(
        rosenbrock,
        np.asarray(initial),
        jac=lambda point: np.asarray(rosenbrock_gradient(point)),
        method="BFGS",
        options={"maxiter": 3000, "gtol": 1.0e-7},
    )
    records.append(
        result_record(
            "bfgs-rosenbrock-2",
            "same named algorithm",
            ours_bfgs,
            scipy_bfgs.x,
            float(scipy_bfgs.fun),
            expected_method="bfgs",
            distance_limit=3.0e-6,
            objective_limit=1.0e-11,
        )
    )

    def active_objective(point: Any) -> float:
        return float((point[0] - 3.0) ** 2 + (point[1] + 1.0) ** 2)

    def active_gradient(point: Any) -> list[float]:
        return [2.0 * (point[0] - 3.0), 2.0 * (point[1] + 1.0)]

    ours_box = minimize(
        active_objective,
        [0.0, 0.0],
        gradient=active_gradient,
        bounds=[(None, 1.0), (0.0, 2.0)],
        method="projected-bfgs",
    )
    scipy_box = optimize.minimize(
        active_objective,
        np.asarray([0.0, 0.0]),
        jac=lambda point: np.asarray(active_gradient(point)),
        bounds=((None, 1.0), (0.0, 2.0)),
        method="L-BFGS-B",
    )
    records.append(
        result_record(
            "active-box-mathematical-oracle",
            "mathematical oracle only; projected-bfgs is not L-BFGS-B",
            ours_box,
            scipy_box.x,
            float(scipy_box.fun),
            expected_method="projected-bfgs",
            distance_limit=1.0e-10,
            objective_limit=1.0e-12,
        )
    )

    def system_function(point: Any) -> list[float]:
        return [
            point[0] * point[0] + point[1] * point[1] - 1.0,
            point[0] - point[1],
        ]

    ours_system = solve_nonlinear_system(system_function, [0.8, 0.6])
    scipy_system = optimize.root(system_function, np.asarray([0.8, 0.6]), method="hybr")
    system_residual = max(abs(value) for value in system_function(scipy_system.x))
    records.append(
        result_record(
            "nonlinear-system-circle-line",
            "mathematical oracle; damped Newton versus MINPACK hybr",
            ours_system,
            scipy_system.x,
            system_residual,
            expected_method="damped-newton",
            distance_limit=1.0e-9,
            objective_limit=1.0e-9,
        )
    )

    x_values = [0.0, 1.0, 2.0, 3.0]

    def residual_function(point: Any) -> list[float]:
        return [
            point[0] * math.exp(-point[1] * x_value) - 2.0 * math.exp(-0.5 * x_value)
            for x_value in x_values
        ]

    ours_least = least_squares(residual_function, [1.5, 0.4])
    scipy_least = optimize.least_squares(residual_function, np.asarray([1.5, 0.4]))
    records.append(
        result_record(
            "least-squares-exponential",
            "mathematical oracle; damped Gauss-Newton versus SciPy TRF",
            ours_least,
            scipy_least.x,
            0.5 * float(np.dot(scipy_least.fun, scipy_least.fun)),
            expected_method="damped-gauss-newton",
            distance_limit=2.0e-6,
            objective_limit=1.0e-12,
        )
    )

    def rank_residual(point: Any) -> list[float]:
        return [
            point[0] + point[1] - 2.0,
            2.0 * (point[0] + point[1] - 2.0),
        ]

    ours_rank = least_squares(rank_residual, [0.0, 0.0])
    scipy_rank = optimize.least_squares(rank_residual, np.asarray([0.0, 0.0]))
    records.append(
        result_record(
            "least-squares-rank-deficient",
            "solution-manifold objective oracle; parameters are nonunique",
            ours_rank,
            ours_rank.value,
            0.5 * float(np.dot(scipy_rank.fun, scipy_rank.fun)),
            expected_method="damped-gauss-newton",
            distance_limit=0.0,
            objective_limit=1.0e-12,
        )
    )

    corpus_bytes = Path(__file__).with_name("corpus.json").read_bytes()
    receipt = {
        "schema_version": 1,
        "source_revision": subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip(),
        "oracle": "scipy",
        "platform": platform_id(),
        "scipy_version": scipy.__version__,
        "numpy_version": np.__version__,
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
        "passed": sum(1 for record in records if record["accepted"]),
        "total": len(records),
        "cases": records,
    }
    text = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if arguments.output:
        Path(arguments.output).write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0 if receipt["passed"] == receipt["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
