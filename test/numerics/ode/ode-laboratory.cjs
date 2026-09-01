#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ode-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
import math
import time
from sagejs.numerics.model import STATUS_CODES
from sagejs.numerics.ode import (
    OdeEvent,
    OdeInvariant,
    OdeUnsupportedError,
    ode_capabilities,
    ode_problem,
    plan_ode,
    solve_ivp,
    solve_ode_problem,
)

capabilities = ode_capabilities()
assert set(capabilities["implemented_methods"]) == {"rk4", "rk45", "rosenbrock4"}
assert capabilities["unsupported_methods"]["radau"]["classification"] == "unsupported"
assert capabilities["implemented_methods"]["rk45"]["stiff"] is False
assert capabilities["implemented_methods"]["rosenbrock4"]["stiff"] is True
assert capabilities["implemented_methods"]["rosenbrock4"]["automatic_selection"] is False
assert capabilities["implementation_targets"]["runtimes"] == [
    "browser",
    "node",
    "sea",
    "cpython",
]
assert "windows-x64" in capabilities["implementation_targets"]["platforms"]
assert "qualified_runtimes" not in capabilities["implementation_targets"]
assert "portability_evidence" not in capabilities

calls = [0]
def counted(t, y):
    calls[0] += 1
    return [y[0]]

problem = ode_problem(
    counted,
    (0.0, 1.0),
    [1.0],
    rtol=1e-7,
    atol=1e-10,
    evaluation_times=[0.0, 0.25, 0.5, 1.0],
    reference=lambda t: [math.exp(t)],
    reference_atol=1e-6,
    reference_rtol=1e-6,
    function_record={"kind": "expression", "replayable": True, "expression": "[y[0]]"},
)
selected = plan_ode(problem)
assert selected.method == "rk45" and calls[0] == 0
answer = solve_ode_problem(problem)
assert answer.success and answer.status == "converged"
assert answer.termination_reason == "reached_t_bound"
assert abs(answer.value[0] - math.e) < 1e-6
assert len(answer.trajectory.times) == 4
assert abs(answer.trajectory(0.5)[0] - math.exp(0.5)) < 1e-6
assert answer.validation.truth_level == "validated_approximate"
assert answer.evidence["dense_defect"]["sample_count"] > 0
assert answer.evidence["reference_solution"]["passed"]
assert answer.evidence["local_error_control"]["max_accepted_error_norm"] <= 1.0
assert answer.trace.events[0].kind == "start"
assert answer.trace.events[-1].kind == "finish"
assert len(answer.plot("trajectory").layers) == 2
assert len(answer.plot("step_size").layers) == 2
assert len(answer.plot("local_error").layers) == 2
assert len(answer.animate().frames) >= 2
assert len(answer.animate("step_size").frames) >= 2
assert len(answer.animate("local_error").frames) >= 2
assert len(answer.animate("event").frames) >= 2
assert "global error bound" in answer.explain()
record = json.loads(answer.to_json())
assert record["domain_payload"]["limitations"]["stiff_methods_supported"] is False
assert record["domain_payload"]["limitations"]["stiffness_detection_supported"] is False
assert record["domain_payload"]["trajectory"]["dense_output"] is True

def oscillator(t, y):
    return [y[1], -y[0]]

oscillation = solve_ivp(
    oscillator,
    (0.0, 2.0 * math.pi),
    [1.0, 0.0],
    rtol=1e-8,
    atol=1e-11,
    invariants=[
        OdeInvariant(
            lambda t, y: y[0] * y[0] + y[1] * y[1],
            name="squared_norm",
            atol=2e-7,
            rtol=2e-7,
        )
    ],
    reference=lambda t: [math.cos(t), -math.sin(t)],
    reference_atol=2e-8,
    reference_rtol=2e-7,
)
assert oscillation.success
assert oscillation.evidence["invariants"][0]["passed"]
assert oscillation.evidence["invariants"][0]["max_sampled_abs_drift"] >= 0.0
assert oscillation.evidence["invariants"][0]["sample_count"] == len(
    oscillation.evidence["invariants"][0]["sampled_times"]
)
assert oscillation.evidence["reference_solution"]["passed"]
assert oscillation.evidence["reference_solution"]["max_sampled_abs_error"] >= 0.0
assert abs(oscillation.value[0] - 1.0) < 2e-8
assert len(oscillation.plot("phase").layers) == 2
assert len(oscillation.animate("phase").frames) >= 2

impact = solve_ivp(
    lambda t, y: [y[1], -9.81],
    (0.0, 3.0),
    [10.0, 0.0],
    events=OdeEvent(
        lambda t, y: y[0],
        name="ground",
        terminal=True,
        direction=-1,
        value_tolerance=1e-9,
    ),
    reference=lambda t: [10.0 - 4.905 * t * t, -9.81 * t],
    reference_atol=1e-7,
    reference_rtol=1e-7,
)
impact_time = math.sqrt(20.0 / 9.81)
assert impact.success and impact.termination_reason == "terminal_event"
assert abs(impact.trajectory.final_time - impact_time) < 1e-8
assert len(impact.events) == 1 and impact.events[0].residual_passed

backward = solve_ivp(
    lambda t, y: [y[0]],
    (1.0, 0.0),
    [math.e],
    reference=lambda t: [math.exp(t)],
    reference_atol=1e-6,
    reference_rtol=1e-6,
)
assert backward.success and abs(backward.value[0] - 1.0) < 1e-6
assert abs(backward.trajectory(0.5)[0] - math.sqrt(math.e)) < 1e-6

wrong_direction = solve_ivp(
    lambda t, y: [1.0],
    (0.0, 1.0),
    [0.0],
    events=OdeEvent(lambda t, y: t, terminal=True, direction=-1),
)
assert wrong_direction.success
assert wrong_direction.termination_reason == "reached_t_bound"
assert len(wrong_direction.events) == 0

right_direction = solve_ivp(
    lambda t, y: [1.0],
    (0.0, 1.0),
    [0.0],
    events=OdeEvent(lambda t, y: t, terminal=True, direction=1),
)
assert right_direction.success
assert right_direction.termination_reason == "terminal_event"
assert right_direction.trajectory.final_time == 0.0

rk4_errors = []
for step in (0.1, 0.05):
    baseline = solve_ivp(
        lambda t, y: [y[0]],
        (0.0, 1.0),
        [1.0],
        method="rk4",
        first_step=step,
        max_step=step,
        reference=lambda t: [math.exp(t)],
        reference_atol=1.0,
        reference_rtol=0.0,
    )
    assert baseline.success and baseline.validation.truth_level == "heuristic"
    rk4_errors.append(abs(baseline.value[0] - math.e))
assert rk4_errors[0] / rk4_errors[1] > 12.0

rejections = solve_ivp(
    lambda t, y: [-10.0 * y[0]],
    (0.0, 1.0),
    [1.0],
    first_step=0.5,
    rtol=1e-8,
    atol=1e-11,
)
assert rejections.success
assert rejections.evidence["local_error_control"]["rejected_steps"] > 0

nodes = (0.0, 1.0 / 5.0, 3.0 / 10.0, 4.0 / 5.0, 8.0 / 9.0, 1.0)
def hidden_between_stages(t, y):
    value = 1.0
    for node in nodes:
        value *= (t - node) * (t - node)
    return [1e12 * value]

aliased = solve_ivp(
    hidden_between_stages,
    (0.0, 1.0),
    [0.0],
    first_step=1.0,
    max_step=1.0,
)
assert not aliased.success and aliased.status == "validation_failed"
assert not aliased.evidence["dense_defect"]["passed"]
assert aliased.evidence["dense_defect"]["max_scaled_state_equivalent_defect"] > 1e12

cancelled = solve_ivp(lambda t, y: [1.0], (0.0, 1.0), [0.0], cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"

limited = solve_ivp(
    lambda t, y: [y[0]],
    (0.0, 1.0),
    [1.0],
    first_step=0.1,
    max_evaluations=3,
)
assert not limited.success and limited.status == "maximum_evaluations"

output_limited = solve_ivp(
    lambda t, y: [1.0],
    (0.0, 1.0),
    [0.0],
    method="rk4",
    first_step=0.01,
    max_step=0.01,
    max_output_points=2,
)
assert not output_limited.success
assert output_limited.termination_reason == "maximum_output_points"
assert len(output_limited.trajectory.internal_times) == 2
assert len(output_limited.trajectory.segments) == 1

def slow_initial_event(t, y):
    time.sleep(0.02)
    return 0.0

elapsed = solve_ivp(
    lambda t, y: [0.0],
    (0.0, 1.0),
    [0.0],
    events=OdeEvent(slow_initial_event, terminal=True),
    max_elapsed_ms=1,
)
expected_elapsed_status = (
    "maximum_elapsed_time"
    if "maximum_elapsed_time" in STATUS_CODES
    else "backend_failure"
)
assert not elapsed.success and elapsed.status == expected_elapsed_status
assert elapsed.termination_reason == "maximum_elapsed_time"

cancel_after_event = [False]
def cancelling_initial_event(t, y):
    cancel_after_event[0] = True
    return 0.0

post_event_cancelled = solve_ivp(
    lambda t, y: [0.0],
    (0.0, 1.0),
    [0.0],
    events=OdeEvent(cancelling_initial_event, terminal=True),
    cancel=lambda: cancel_after_event[0],
)
assert not post_event_cancelled.success and post_event_cancelled.status == "cancelled"

nonfinite = solve_ivp(
    lambda t, y: [float("inf")],
    (0.0, 1.0),
    [1.0],
)
assert not nonfinite.success and nonfinite.status == "nonfinite_evaluation"

failed_callback = solve_ivp(
    lambda t, y: 1 / 0,
    (0.0, 1.0),
    [1.0],
)
assert not failed_callback.success and failed_callback.status == "callback_error"

truncated = solve_ivp(
    lambda t, y: [y[0]],
    (0.0, 1.0),
    [1.0],
    first_step=0.01,
    max_step=0.01,
    max_trace_events=4,
)
assert not truncated.trace.truncated and len(truncated.trace.events) <= 4
assert truncated.trace.events[-1].data["omitted_trace_details"] > 0
assert len(truncated.animate().frames) <= 4

wide_dimension = 500
wide = solve_ivp(
    lambda t, y: [0.0 for _ in range(wide_dimension)],
    (0.0, 1.0),
    [0.0 for _ in range(wide_dimension)],
    method="rk4",
    first_step=1.0,
    max_step=1.0,
    trace="evaluations",
    max_trace_events=2,
    max_trace_bytes=1024,
)
assert wide.success
assert len(wide.trace.to_json().encode("utf-8")) <= 1024
assert "initial_state_summary" in wide.trace.events[0].data

drifting = solve_ivp(
    oscillator,
    (0.0, 6.0),
    [1.0, 0.0],
    method="rk4",
    first_step=0.5,
    max_step=0.5,
    rtol=0.1,
    atol=0.1,
    invariants=[
        OdeInvariant(
            lambda t, y: y[0] * y[0] + y[1] * y[1],
            name="squared_norm",
            atol=1e-12,
            rtol=0.0,
        )
    ],
)
assert not drifting.success and drifting.status == "validation_failed"
assert not drifting.evidence["invariants"][0]["passed"]
assert drifting.evidence["invariants"][0]["max_sampled_abs_drift"] > 1e-4

stiff_problem = ode_problem(
    lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
    (0.0, 1.0),
    [1.0],
    method="radau",
)
try:
    plan_ode(stiff_problem)
    raise AssertionError("Radau must not be advertised")
except OdeUnsupportedError as error:
    assert error.to_dict()["classification"] == "unsupported"

stiff_explicit = solve_ivp(
    lambda t, y: [-1000.0 * (y[0] - math.cos(t)) - math.sin(t)],
    (0.0, 1.0),
    [1.0],
    first_step=0.1,
    max_evaluations=30,
)
assert not stiff_explicit.success and stiff_explicit.status == "maximum_evaluations"

print("ODE numerical laboratory passed")
`;

test("ODE contracts, explicit algorithms, failures, and views agree in CPython", () => {
  assert.equal(runCPython(witness), "ODE numerical laboratory passed");
});

test("ODE contracts, explicit algorithms, failures, and views run in Sage.js", () => {
  assert.equal(runSagejs(witness), "ODE numerical laboratory passed");
});

test("frozen SciPy differential oracle remains within its qualified envelope", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const fixture = join(root, "test", "numerics", "ode", "scipy-oracles.json");
  const script = join(root, "test", "numerics", "ode", "check_scipy_oracle.py");
  assert.match(run(executable, [script, "--fixture", fixture]), /SciPy oracle fixture passed/);
});

test("live SciPy differential oracle agrees when SciPy is installed", (context) => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const script = join(root, "test", "numerics", "ode", "check_scipy_oracle.py");
  const fixture = join(root, "test", "numerics", "ode", "scipy-oracles.json");
  const result = spawnSync(executable, [script, "--fixture", fixture, "--live-scipy"], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.status === 77) {
    context.skip("SciPy is not installed on this validation host");
    return;
  }
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /live SciPy oracle passed/);
});

test("the ODE corpus classifies analytic, stiff, event, and failure cases", () => {
  const corpus = JSON.parse(
    readFileSync(join(root, "test", "numerics", "ode", "corpus.json"), "utf8"),
  );
  const classes = new Set(corpus.cases.map(({ classification }) => classification));
  assert.deepEqual(classes, new Set(["analytic", "conserved", "event", "stiff", "failure"]));
  assert.equal(
    corpus.cases.find(({ id }) => id === "robertson").sagejs.expected,
    "validated-approximate",
  );
  assert.equal(
    corpus.cases.find(({ id }) => id === "dense-stage-alias").sagejs.expected,
    "validation_failed",
  );
  assert.equal(
    corpus.cases.find(({ id }) => id === "initial-event-direction").sagejs.expected,
    "direction-filtered",
  );
});
