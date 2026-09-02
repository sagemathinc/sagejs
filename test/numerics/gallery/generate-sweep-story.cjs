#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "../../..");
const outputPath = join(
  root,
  "docs/numerical-computing/gallery/stories/ode-parameter-sweep.json",
);

const source = String.raw`
import collections.abc
import hashlib
import json
import math
import sys
import typing

sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.ode import ode_problem, run_ode_parameter_sweep
from sagejs.numerics.sweeps import SweepBudget
from sagejs.plotting import lower_plot_animation, lower_plot_spec

PARAMETERS = [
    {"rate": 0.25},
    {"rate": 0.5},
    {"rate": 1.0},
    {"rate": 2.0},
    {"rate": 4.0},
]
BUDGET = SweepBudget(
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


def normalize_elapsed(value):
    if isinstance(value, dict):
        return {
            key: (0.0 if key == "elapsed_ms" else normalize_elapsed(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [normalize_elapsed(item) for item in value]
    return value


def canonical_bytes(value):
    return len(
        json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    )


def stable_sweep_record(result):
    """Normalize clocks, then repair byte receipts over normalized evidence."""
    record = normalize_elapsed(result.to_dict())
    result_bytes = 0
    trace_bytes = 0
    for item in record["items"]:
        trace = item["trace"]
        retained_bytes = sum(canonical_bytes(event) for event in trace["events"])
        trace["retained_bytes"] = retained_bytes
        item["measurements"]["trace_bytes"] = retained_bytes
        item_result_bytes = canonical_bytes(item["value"]) if item["success"] else 0
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


def make_factory(callback_counts, failed_rate=None):
    def factory(parameter, limits):
        rate = float(parameter["rate"])

        def field(_time, state):
            callback_counts["field"] += 1
            return [-rate * state[0]]

        def reference(time):
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


def independent_oracle(result):
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


def presentation(result, callback_counts):
    before = callback_counts["field"] + callback_counts["reference"]
    explanation = result.explanation()
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
        max_frames=8,
        frame_duration_ms=500,
    )
    plotly = lower_plot_animation(animation)
    static_plotly = lower_plot_spec(static)
    after = callback_counts["field"] + callback_counts["reference"]
    return {
        "source": "SweepResult explanation and exact retained-item prefixes",
        "computed_evidence_only": True,
        "callback_reevaluated": before != after,
        "callback_count_before": before,
        "callback_count_after": after,
        "explanation": normalize_elapsed(explanation),
        "plot_spec": static.to_dict(),
        "plot_animation": animation.to_dict(),
        "plotly": {
            "schema": "plotly-compatible/v1",
            "source": "sagejs.plotting.lower_plot_animation",
            "static_figure": static_plotly,
            "figure": plotly,
        },
    }


def run_case(case_id, title, kind, failed_rate):
    callback_counts = {"field": 0, "reference": 0}
    result = run_ode_parameter_sweep(
        PARAMETERS,
        make_factory(callback_counts, failed_rate=failed_rate),
        budget=BUDGET,
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
    stable_result = stable_sweep_record(result)
    view = presentation(result, callback_counts)
    view["explanation"]["evidence"]["measurements"] = stable_result["measurements"]
    oracle = independent_oracle(result)
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
        "independent_oracle": oracle,
        "evidence": [
            "/result/counts",
            "/result/items",
            "/presentation/explanation/evidence/nested_validations",
            "/presentation/explanation/evidence/failures",
            "/independent_oracle/checks",
        ],
        "presentation": view,
    }


def count_scalars(value):
    if isinstance(value, dict):
        return sum(count_scalars(item) for item in value.values())
    if isinstance(value, list):
        return sum(count_scalars(item) for item in value)
    return 1


def case_measurements(case):
    animation = case["presentation"]["plot_animation"]
    plotly = case["presentation"]["plotly"]
    return {
        "result_bytes": len(json.dumps(case["result"], separators=(",", ":")).encode()),
        "animation_frames": len(animation["frames"]),
        "max_frame_scalars": max(count_scalars(frame) for frame in animation["frames"]),
        "semantic_animation_bytes": len(json.dumps(animation, separators=(",", ":")).encode()),
        "plotly_bytes": len(json.dumps(plotly, separators=(",", ":")).encode()),
    }


cases = [
    run_case("validated-decay-family", "A family of validated decay curves", "success", None),
    run_case("one-budgeted-failure", "One parameter exhausts its local budget", "failure", 2.0),
]
for case in cases:
    case["measurements"] = case_measurements(case)

story = {
    "schema": "sagejs.numerics.gallery.sweep-story/v1",
    "id": "ode-parameter-sweep",
    "domain": "ode",
    "operation": "parameter_sweep",
    "title": "A parameter sweep is a collection of evidence, not a smooth promise",
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
    rate = float(parameter[\"rate\"])
    return ode_problem(
        lambda t, y: [-rate*y[0]],
        (0.0, 2.0),
        [1.0],
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=9000,
        reference=lambda t: [math.exp(-rate*t)],
    )

result = run_ode_parameter_sweep(
    [{\"rate\": 0.25}, {\"rate\": 0.5}, {\"rate\": 1.0}, {\"rate\": 2.0}],
    make_problem,
)
result""",
    "generation_policy": "deterministic single-worker sweep; elapsed times normalized; no callback replay; no interpolation",
    "budgets": {
        "max_story_bytes": 1_000_000,
        "max_result_bytes": 250_000,
        "max_animation_frames": 8,
        "max_scalars_per_frame": 4096,
        "max_semantic_animation_bytes": 250_000,
        "max_plotly_bytes": 500_000,
    },
    "cases": cases,
    "measurements": {"story_bytes": 0},
}
while True:
    measured = len(json.dumps(story, sort_keys=True, separators=(",", ":")).encode()) + 1
    if measured == story["measurements"]["story_bytes"]:
        break
    story["measurements"]["story_bytes"] = measured

print(json.dumps(story, allow_nan=False, sort_keys=True, separators=(",", ":")))
`;

function generate() {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(executable, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONHASHSEED: "0", SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return `${result.stdout.trim()}\n`;
}

function main(argv = process.argv.slice(2)) {
  const output = generate();
  if (argv.includes("--write")) {
    writeFileSync(outputPath, output);
    process.stdout.write(`wrote ${outputPath} (${Buffer.byteLength(output)} bytes)\n`);
    return output;
  }
  assert.ok(existsSync(outputPath), `${outputPath} is missing; run with --write`);
  assert.equal(
    readFileSync(outputPath, "utf8"),
    output,
    "ODE parameter-sweep story is stale; regenerate with --write",
  );
  return output;
}

if (require.main === module) main();

module.exports = { generate, main, outputPath };
