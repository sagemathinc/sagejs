#!/usr/bin/env python3
"""Run the shared NLopt corpus through independent SciPy/PRIMA methods."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import scipy
from scipy.optimize import minimize


ROOT = Path(__file__).resolve().parent
CORPUS_PATH = ROOT / "corpus.json"


def objectives(name: str, values: np.ndarray) -> float:
    x = float(values[0])
    y = float(values[1]) if len(values) > 1 else 0.0
    functions = {
        "rosenbrock": lambda: (1 - x) ** 2 + 100 * (y - x * x) ** 2,
        "beale": lambda: (
            (1.5 - x + x * y) ** 2
            + (2.25 - x + x * y**2) ** 2
            + (2.625 - x + x * y**3) ** 2
        ),
        "absolute": lambda: abs(x) + 2 * abs(y),
        "outside_box": lambda: (x - 3) ** 2 + (y + 2) ** 2,
        "ill_scaled": lambda: ((x - 1e6) / 1e6) ** 2 + ((y - 1e-6) / 1e-6) ** 2,
        "quadratic_2_1": lambda: (x - 2) ** 2 + (y - 1) ** 2,
        "quadratic_1_1": lambda: (x - 1) ** 2 + (y - 1) ** 2,
        "quadratic_2_2": lambda: (x - 2) ** 2 + (y - 2) ** 2,
        "scalar_to_five": lambda: (x - 5) ** 2,
        "scalar_to_one": lambda: (x - 1) ** 2,
        "scalar_to_two_million_scaled": lambda: ((x - 2e6) / 1e6) ** 2,
        "scalar_square": lambda: x * x,
    }
    return float(functions[name]())


def inequality(name: str, values: np.ndarray) -> list[float]:
    x = float(values[0])
    y = float(values[1]) if len(values) > 1 else 0.0
    functions = {
        "sum_le_one": lambda: [x + y - 1],
        "unit_disk": lambda: [x * x + y * y - 1],
        "redundant_sum_le_one": lambda: [
            x + y - 1,
            2 * x + 2 * y - 2,
            x + y - 1,
        ],
        "x_le_tiny": lambda: [x - 1e-8],
        "x_le_million_scaled": lambda: [(x - 1e6) / 1e6],
        "infeasible_interval": lambda: [x, 1 - x],
    }
    return [float(entry) for entry in functions[name]()]


def equality(name: str, values: np.ndarray) -> list[float]:
    x, y = (float(entry) for entry in values)
    if name == "sum_eq_one":
        return [x + y - 1]
    raise KeyError(name)


def maximum_violation(record: dict[str, object], values: np.ndarray) -> float:
    violations = [0.0]
    if "inequality" in record:
        violations.extend(inequality(str(record["inequality"]), values))
    if "equality" in record:
        violations.extend(
            abs(entry) for entry in equality(str(record["equality"]), values)
        )
    return max(violations)


def run_case(record: dict[str, object]) -> dict[str, object]:
    initial = np.asarray(record["initial"], dtype=np.float64)
    bounds = None
    if "lower" in record or "upper" in record:
        lower = record.get("lower", [-np.inf] * len(initial))
        upper = record.get("upper", [np.inf] * len(initial))
        bounds = list(zip(lower, upper, strict=True))
    if record["method"] == "nlopt-nelder-mead":
        simplex = np.vstack(
            [
                initial,
                *[
                    initial
                    + np.eye(len(initial))[index] * float(record["initial_step"][index])
                    for index in range(len(initial))
                ],
            ]
        )
        if bounds is not None:
            lower = np.asarray([entry[0] for entry in bounds])
            upper = np.asarray([entry[1] for entry in bounds])
            simplex = np.clip(simplex, lower, upper)
        result = minimize(
            lambda values: objectives(str(record["problem"]), values),
            initial,
            method="Nelder-Mead",
            bounds=bounds,
            options={
                "initial_simplex": simplex,
                "maxfev": 4000,
                "xatol": 1e-10,
                "fatol": 1e-12,
            },
        )
        oracle = "scipy.optimize.Nelder-Mead"
    else:
        constraints = []
        if "inequality" in record:
            constraints.append(
                {
                    "type": "ineq",
                    "fun": lambda values: (
                        -np.asarray(inequality(str(record["inequality"]), values))
                    ),
                }
            )
        if "equality" in record:
            constraints.extend(
                [
                    {
                        "type": "ineq",
                        "fun": lambda values: (
                            -np.asarray(equality(str(record["equality"]), values))
                        ),
                    },
                    {
                        "type": "ineq",
                        "fun": lambda values: np.asarray(
                            equality(str(record["equality"]), values)
                        ),
                    },
                ]
            )
        result = minimize(
            lambda values: objectives(str(record["problem"]), values),
            initial,
            method="COBYLA",
            bounds=bounds,
            constraints=constraints,
            options={
                "maxiter": 4000,
                "rhobeg": max(float(entry) for entry in record["initial_step"]),
                "tol": 1e-9,
                "catol": float(record.get("feasibility_tolerance", 1e-8)),
            },
        )
        oracle = "scipy.optimize.COBYLA (PRIMA)"
    point = np.asarray(result.x, dtype=np.float64)
    return {
        "id": record["id"],
        "oracle": oracle,
        "success": bool(result.success),
        "status": int(result.status),
        "message": str(result.message),
        "value": [float(entry) for entry in point],
        "objective": objectives(str(record["problem"]), point),
        "maximum_violation": maximum_violation(record, point),
        "evaluations": int(result.nfev),
    }


def main() -> None:
    corpus_bytes = CORPUS_PATH.read_bytes()
    corpus = json.loads(corpus_bytes)
    results = [run_case(record) for record in corpus["cases"]]
    output = {
        "schema": "sagejs.numerical-nlopt-scipy-oracle/v1",
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
        "runtime": {
            "python": __import__("platform").python_version(),
            "scipy": scipy.__version__,
            "numpy": np.__version__,
        },
        "cases": results,
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
