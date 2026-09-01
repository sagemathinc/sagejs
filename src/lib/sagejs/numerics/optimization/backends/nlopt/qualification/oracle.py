#!/usr/bin/env python3
"""Run only the selected NLopt Nelder-Mead cases through SciPy."""

from __future__ import annotations

import hashlib
import importlib
import json
import platform
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[7]
CORPUS_PATH = ROOT / "bench" / "numerical-p3-nlopt" / "corpus.json"
SELECTION_PATH = HERE / "selection-v1.json"

# SciPy and NumPy are qualification-time oracles, not runtime dependencies of
# the numerical-optimization package.  Resolve them explicitly at execution so
# the repository package graph cannot mistake them for product imports.
np = importlib.import_module("numpy")
scipy = importlib.import_module("scipy")
minimize = importlib.import_module("scipy.optimize").minimize


def objective(name: str, values: Any) -> float:
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
    }
    if name not in functions:
        raise ValueError(f"unselected oracle objective {name}")
    return float(functions[name]())


def run_case(record: dict[str, Any]) -> dict[str, Any]:
    if record["method"] != "nlopt-nelder-mead":
        raise ValueError(f"non-Nelder-Mead case reached the oracle: {record['id']}")
    initial = np.asarray(record["initial"], dtype=np.float64)
    bounds = None
    if "lower" in record or "upper" in record:
        lower = record.get("lower", [-np.inf] * len(initial))
        upper = record.get("upper", [np.inf] * len(initial))
        bounds = list(zip(lower, upper, strict=True))
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
        lower_array = np.asarray([entry[0] for entry in bounds])
        upper_array = np.asarray([entry[1] for entry in bounds])
        simplex = np.clip(simplex, lower_array, upper_array)
    result = minimize(
        lambda values: objective(str(record["problem"]), values),
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
    point = np.asarray(result.x, dtype=np.float64)
    return {
        "id": record["id"],
        "oracle": "scipy.optimize.Nelder-Mead",
        "success": bool(result.success),
        "status": int(result.status),
        "message": str(result.message),
        "value": [float(entry) for entry in point],
        "objective": objective(str(record["problem"]), point),
        "maximum_violation": 0.0,
        "evaluations": int(result.nfev),
    }


def main() -> None:
    corpus_bytes = CORPUS_PATH.read_bytes()
    selection_bytes = SELECTION_PATH.read_bytes()
    corpus = json.loads(corpus_bytes)
    selection = json.loads(selection_bytes)
    records = {record["id"]: record for record in corpus["cases"]}
    case_ids = selection["case_ids"]
    if len(case_ids) != len(set(case_ids)) or any(
        "cobyla" in name.lower() for name in case_ids
    ):
        raise ValueError("selection is duplicated or COBYLA-contaminated")
    selected = [records[name] for name in case_ids]
    all_nelder_mead = [
        record["id"]
        for record in corpus["cases"]
        if record["method"] == "nlopt-nelder-mead"
    ]
    if all_nelder_mead != case_ids:
        raise ValueError("selection does not equal the complete Nelder-Mead corpus")
    output = {
        "schema": "sagejs.numerical-nlopt-nelder-mead-scipy-oracle/v2",
        "corpus_sha256": hashlib.sha256(corpus_bytes).hexdigest(),
        "selection_sha256": hashlib.sha256(selection_bytes).hexdigest(),
        "runtime": {
            "python": platform.python_version(),
            "scipy": scipy.__version__,
            "numpy": np.__version__,
        },
        "cases": [run_case(record) for record in selected],
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
