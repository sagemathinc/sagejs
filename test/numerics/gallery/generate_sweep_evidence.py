#!/usr/bin/env python3
"""Generate the ODE parameter-sweep lesson from retained public evidence."""

from __future__ import annotations

import collections.abc  # noqa: F401 -- needed by the Sage.js CPython shim
import hashlib  # noqa: F401 -- preload stdlib before src/lib shadows it
import json
import math
import sys
import typing  # noqa: F401 -- preload stdlib before src/lib shadows it
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "src" / "lib"))

from sagejs.numerics.ode import ode_problem, run_ode_parameter_sweep
from sagejs.numerics.sweeps import SweepBudget
from sagejs.plotting import lower_plot_animation

SCHEMA = "sagejs.numerics.gallery.story/v1"
PARAMETERS = [
    {"rate": 0.25},
    {"rate": 0.5},
    {"rate": 1.0},
    {"rate": 2.0},
    {"rate": 4.0},
]
SWEEP_BUDGET = SweepBudget(
    max_items=8,
    max_concurrency=2,
    max_evaluations=10_000,
    max_elapsed_ms=10_000,
    max_memory_bytes=10_000_000,
    max_input_bytes=100_000,
    max_result_bytes=4_000_000,
    max_trace_events=100,
    max_trace_bytes=200_000,
)


def _normalize_elapsed(value: Any) -> Any:
    """Remove nondeterministic clocks without changing computed evidence."""
    if isinstance(value, dict):
        return {
            key: (0.0 if key == "elapsed_ms" else _normalize_elapsed(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_normalize_elapsed(item) for item in value]
    return value


def _canonical_bytes(value: Any) -> int:
    return len(
        json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    )


def _stable_sweep_result(result: Any) -> dict[str, Any]:
    """Normalize clocks and repair byte receipts over the normalized record."""
    record = _normalize_elapsed(result.to_dict())
    result_bytes = 0
    trace_bytes = 0
    for item in record["items"]:
        trace = item["trace"]
        retained_bytes = sum(_canonical_bytes(event) for event in trace["events"])
        trace["retained_bytes"] = retained_bytes
        item["measurements"]["trace_bytes"] = retained_bytes
        item_result_bytes = _canonical_bytes(item["value"]) if item["success"] else 0
        item["measurements"]["result_bytes"] = item_result_bytes
        result_bytes += item_result_bytes
        trace_bytes += retained_bytes
    record["measurements"]["elapsed_ms"] = 0.0
    record["measurements"]["result_bytes"] = result_bytes
    record["measurements"]["trace_bytes"] = trace_bytes
    record["measurements"]["fixture_elapsed_policy"] = (
        "normalized to zero; byte receipts recomputed from normalized retained evidence"
    )
    return record


def _make_factory(callback_counts: dict[str, int], failed_rate: float | None = None):
    def factory(parameter: dict[str, float], limits: Any) -> Any:
        rate = float(parameter["rate"])

        def field(_time: float, state: list[float]) -> list[float]:
            callback_counts["field"] += 1
            return [-rate * state[0]]

        def reference(time: float) -> list[float]:
            callback_counts["reference"] += 1
            return [math.exp(-rate * time)]

        maximum = 1 if rate == failed_rate else limits.max_evaluations
        return ode_problem(
            field,
            (0.0, 2.0),
            [1.0],
            evaluation_times=[0.0, 0.5, 1.0, 1.5, 2.0],
            rtol=1.0e-7,
            atol=1.0e-10,
            max_evaluations=maximum,
            max_elapsed_ms=9000,
            max_output_points=64,
            max_validation_evaluations=16,
            max_trace_events=32,
            max_trace_bytes=8192,
            trace="summary",
            reference=reference,
            reference_atol=1.0e-6,
            reference_rtol=1.0e-6,
            function_record={
                "kind": "parameterized_decay",
                "rate": rate,
                "replayable": True,
            },
        )

    return factory


def _independent_oracle(result: Any) -> dict[str, Any]:
    checks = []
    for item in result.items:
        if not item.success:
            continue
        record = item.to_dict()
        rate = float(record["parameter"]["rate"])
        observed = float(record["value"]["value"][0])
        expected = math.exp(-2.0 * rate)
        error = abs(observed - expected)
        tolerance = 2.0e-6
        checks.append(
            {
                "index": item.index,
                "rate": rate,
                "observed_final_state": observed,
                "analytic_final_state": expected,
                "absolute_error": error,
                "tolerance": tolerance,
                "passed": error <= tolerance,
            }
        )
    return {
        "identity": "the decay solution satisfies y(2)=exp(-2*rate)",
        "checks": checks,
        "passed": bool(checks) and all(check["passed"] for check in checks),
    }


def _presentation(
    result: Any,
    callback_counts: dict[str, int],
    stable_result: dict[str, Any],
) -> dict[str, Any]:
    before = callback_counts["field"] + callback_counts["reference"]
    explanation = _normalize_elapsed(result.explanation())
    explanation["evidence"]["measurements"] = stable_result["measurements"]
    static = result.to_plot_spec(
        x_path="/parameter/rate",
        y_path="/value/value/0",
        x_label="decay rate",
        y_label="retained y(2)",
    )
    animation = result.to_animation(
        x_path="/parameter/rate",
        y_path="/value/value/0",
        x_label="decay rate",
        y_label="retained y(2)",
        max_frames=6,
        frame_duration_ms=500,
    )
    plotly = lower_plot_animation(animation)
    after = callback_counts["field"] + callback_counts["reference"]
    return {
        "source": "SweepResult explanation and exact retained-item prefixes",
        "computed_evidence_only": True,
        "callback_reevaluated": before != after,
        "callback_count_before": before,
        "callback_count_after": after,
        "public_surface_gap": None,
        "static_description": static.alt_text(),
        "explanation": explanation,
        "plot_spec": static.to_dict(),
        "plot_animation": animation.to_dict(),
        "plotly": {
            "schema": "plotly-compatible/v1",
            "source": "sagejs.plotting.lower_plot_animation",
            "shared_lowering": {"status": "available", "diagnostics": []},
            "figure": plotly,
        },
    }


def _run_case(
    case_id: str,
    title: str,
    kind: str,
    failed_rate: float | None,
) -> dict[str, Any]:
    callback_counts = {"field": 0, "reference": 0}
    result = run_ode_parameter_sweep(
        PARAMETERS,
        _make_factory(callback_counts, failed_rate=failed_rate),
        budget=SWEEP_BUDGET,
        mode="collect",
        seed=20260902,
        concurrency=1,
        problem_factory_record={
            "kind": "module_function",
            "module": "decay_sweep_lesson",
            "name": "make_problem",
            "replayable": True,
        },
    )
    stable_result = _stable_sweep_result(result)
    return {
        "id": case_id,
        "title": title,
        "kind": kind,
        "question": (
            "How does the terminal state change with the decay rate?"
            if kind == "success"
            else "What remains trustworthy when one nested ODE solve exhausts its evaluation budget?"
        ),
        "static_description": (
            "Five independently validated terminal states follow exp(-2*rate); the slider reveals only exact completed sweep prefixes."
            if kind == "success"
            else "Four validated terminal states remain visible. The rate-2 item has a retained callback_error and no fabricated coordinate."
        ),
        "result": stable_result,
        "independent_oracle": _independent_oracle(result),
        "evidence": [
            "/result/counts",
            "/result/items",
            "/presentation/explanation/evidence/nested_validations",
            "/presentation/explanation/evidence/failures",
            "/independent_oracle/checks",
        ],
        "presentation": _presentation(result, callback_counts, stable_result),
    }


def sweep_story() -> dict[str, Any]:
    """Return one complete success/failure parameter-sweep lesson."""
    return {
        "schema": SCHEMA,
        "id": "ode-parameter-sweep",
        "domain": "ode",
        "operation": "parameter_sweep",
        "title": "A parameter sweep is evidence, not a smooth promise",
        "summary": "Vary a decay rate, validate every completed ODE endpoint independently, and retain a bounded failure without manufacturing a missing curve point.",
        "learning_objectives": [
            "Read a sweep as ordered item-level evidence with aggregate resource accounting.",
            "Compare validated numerical endpoints with the analytic decay law.",
            "Distinguish a missing failed result from an interpolated or fabricated value.",
            "Use Play, Pause, Step, Restart, Speed, and the slider over exact retained prefixes.",
        ],
        "method_assumptions": [
            "The scalar decay model y'=-rate*y has the analytic solution y(t)=exp(-rate*t).",
            "Every successful nested ODE result must retain passing independent validation evidence.",
            "Sweep ordering is input ordering; animation order does not imply adaptive sampling in parameter space.",
            "Failures have no plot coordinate unless the failed result retained a validated numeric value.",
        ],
        "canonical_python": """import math
from sagejs.numerics.ode import ode_problem, run_ode_parameter_sweep

def make_problem(parameter, limits):
    rate = float(parameter["rate"])
    return ode_problem(
        lambda t, y: [-rate*y[0]],
        (0.0, 2.0),
        [1.0],
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=9000,
        reference=lambda t: [math.exp(-rate*t)],
    )

result = run_ode_parameter_sweep(
    [
        {"rate": float("0.25")},
        {"rate": float("0.5")},
        {"rate": float("1.0")},
        {"rate": float("2.0")},
    ],
    make_problem,
)
result""",
        "cases": [
            _run_case(
                "validated-decay-family",
                "A family of validated decay curves",
                "success",
                None,
            ),
            _run_case(
                "one-budgeted-failure",
                "One parameter exhausts its local budget",
                "failure",
                2.0,
            ),
        ],
    }


if __name__ == "__main__":
    print(
        json.dumps(
            sweep_story(),
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    )
