#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "../../..");
const runtimeRoot = process.env.SAGEJS_EXTERNAL_TEST_ROOT || root;

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: runtimeRoot,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source], { cwd: root });
}

function runSagejs(source) {
  return run(
    process.execPath,
    [join(runtimeRoot, "bin/sagejs-source.cjs"), "--python", "-"],
    { input: source },
  );
}

function externalRuntimeArtifactsPresent() {
  return [
    "dist/numerical/backend.cjs",
    "dist/numerical/nlopt-backend.cjs",
    "packages/flint-wasm/numerical/build/cminpack.wasm",
    "src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm",
  ].every((filename) => existsSync(join(runtimeRoot, filename)));
}

const portableWitness = String.raw`
from sagejs.numerics.optimization import curve_fit, minimize

fit = curve_fit(
    lambda x, p: p[0]*x + p[1],
    [-2.0, -1.0, 0.0, 1.0, 2.0],
    [-2.8, -0.9, 1.2, 2.9, 5.1],
    [0.0, 0.0],
    jacobian=lambda x, p: [x, 1.0],
    trace="iterations",
)
assert fit.success
assert fit.backend == "ordinary-python"
assert fit.method == "damped-gauss-newton"
assert "backend_progress_basis" not in fit.domain_payload
fit_animation = fit.animate().to_dict()
assert fit_animation["controls"]["slider_prefix"] == "Iteration: "
assert fit_animation["metadata"]["progress_semantics"] == "algorithm_iterations"
assert all(
    frame["label"] == "returned result" or frame["label"].startswith("iteration ")
    for frame in fit_animation["frames"]
)

minimum = minimize(
    lambda p: (p[0] - 2.0)**2,
    [5.0],
    method="nelder-mead",
    trace="iterations",
)
assert minimum.success
assert minimum.backend == "ordinary-python"
assert "backend_progress_basis" not in minimum.domain_payload
minimum_animation = minimum.animate().to_dict()
assert minimum_animation["controls"]["slider_prefix"] == "Iteration: "
assert minimum_animation["metadata"]["progress_semantics"] == "algorithm_iterations"

print("portable optimizer progress semantics passed")
`;

const externalWitness = String.raw`
import math
from sagejs.numerics.optimization import curve_fit, minimize

def close(left, right, tolerance=1.0e-10):
    return abs(left - right) <= tolerance * max(1.0, abs(left), abs(right))

def progress_events(result, basis):
    events = [
        event.to_dict() for event in result.trace.events
        if event.kind in ("iteration", "phase")
    ]
    assert len(events) > 0
    assert all(event["data"]["progress_basis"] == basis for event in events)
    assert all(event["data"]["backend_iteration_available"] is False for event in events)
    assert [event["data"]["backend_callback_ordinal"] for event in events] == list(
        range(1, len(events) + 1)
    )
    # The trace iteration slot is only the retained progress ordinal. The
    # explicit false flag prevents it from being represented as a backend
    # iteration count.
    assert [event["iteration"] for event in events] == list(range(1, len(events) + 1))
    return events

xdata = [-2.0, -1.0, 0.0, 1.0, 2.0]
ydata = [-2.8, -0.9, 1.2, 2.9, 5.1]
model_visits = []
def linear_model(x, parameters):
    model_visits.append((x, list(parameters)))
    return parameters[0]*x + parameters[1]

# lmdif makes more residual callbacks than solver iterations for this problem,
# so the test cannot accidentally pass by treating callbacks as iterations.
fit = curve_fit(
    linear_model,
    xdata,
    ydata,
    [0.0, 0.0],
    method="cminpack-lmdif",
    trace="evaluations",
    max_trace_events=512,
)
assert fit.success and fit.backend == "cminpack-wasm"
cminpack_progress = progress_events(fit, "cminpack_residual_callback")
payload = fit.domain_payload
assert len(cminpack_progress) == payload["backend_progress_observations"]
assert len(cminpack_progress) == payload["backend_residual_evaluations"]
assert len(cminpack_progress) == payload["backend_callback_evaluations"]
assert len(cminpack_progress) != fit.iterations
for event in cminpack_progress:
    data = event["data"]
    parameters = data["point"]
    residual = [parameters[0]*x + parameters[1] - y for x, y in zip(xdata, ydata)]
    assert close(data["cost"], 0.5*sum(value*value for value in residual))
    assert close(data["residual_norm"], math.sqrt(sum(value*value for value in residual)))
    # Every retained callback point was actually observed by the live model
    # once per datum; no post-hoc interpolated states are accepted.
    assert sum(
        1 for _, visited in model_visits
        if visited == parameters
    ) >= len(xdata)

visits_before_animation = len(model_visits)
fit_animation = fit.animate().to_dict()
assert len(model_visits) == visits_before_animation
assert fit_animation["controls"]["slider_prefix"] == "Progress: "
assert fit_animation["metadata"]["progress_semantics"] == "external_callback_observations"
assert [frame["label"] for frame in fit_animation["frames"][:-1]] == [
    "residual callback " + str(index)
    for index in range(1, len(cminpack_progress) + 1)
]
assert fit_animation["frames"][-1]["label"] == "returned result"

# Recompute the complete two-parameter covariance oracle without using Sage.js
# linear-algebra helpers. For centered x, J^T J = diag(10, 5), and the unbiased
# residual variance divides SSE by 5 - 2 degrees of freedom.
diagnostics = payload["parameter_diagnostics"]
assert diagnostics["source"] == "independent_terminal_jacobian"
assert diagnostics["rank_deficient"] is False
assert diagnostics["covariance_available"] is True
assert diagnostics["rank_deficient_or_ill_conditioned"] is False
terminal = fit.value
terminal_residual = [
    terminal[0]*x + terminal[1] - y for x, y in zip(xdata, ydata)
]
variance = sum(value*value for value in terminal_residual) / 3.0
expected_covariance = [[variance/10.0, 0.0], [0.0, variance/5.0]]
for row in range(2):
    for column in range(2):
        assert close(
            diagnostics["covariance"][row][column],
            expected_covariance[row][column],
            1.0e-8,
        )
assert close(diagnostics["normal_matrix_condition_estimate"], 2.0, 1.0e-8)
assert close(diagnostics["standard_errors"][0], math.sqrt(variance/10.0), 1.0e-8)
assert close(diagnostics["standard_errors"][1], math.sqrt(variance/5.0), 1.0e-8)

rank_deficient = curve_fit(
    lambda x, p: p[0] + p[1],
    [0.0, 1.0, 2.0, 3.0],
    [1.0, 1.0, 1.0, 1.0],
    [0.0, 0.0],
    jacobian=lambda x, p: [1.0, 1.0],
    method="cminpack-lmder",
    trace="evaluations",
    max_trace_events=512,
)
assert not rank_deficient.success
assert rank_deficient.status == "validation_failed"
assert rank_deficient.domain_payload["stop_reason"] == "rank_deficient_terminal_jacobian"
rank_diagnostics = rank_deficient.domain_payload["parameter_diagnostics"]
assert rank_diagnostics["source"] == "independent_terminal_jacobian"
assert rank_diagnostics["rank_deficient"] is True
assert rank_diagnostics["covariance_available"] is False
assert rank_diagnostics["covariance"] is None

objective_visits = []
def objective(point):
    objective_visits.append(list(point))
    return (point[0] - 2.0)**2

minimum = minimize(
    objective,
    [5.0],
    method="nlopt-nelder-mead",
    initial_step=0.5,
    max_evaluations=300,
    trace="evaluations",
    max_trace_events=512,
)
assert minimum.success and minimum.backend == "nlopt-mit-wasm"
nlopt_progress = progress_events(minimum, "nlopt_objective_callback")
nlopt_payload = minimum.domain_payload
count = len(nlopt_progress)
assert minimum.iterations == 0
assert nlopt_payload["backend_iterations_available"] is False
assert count == nlopt_payload["backend_progress_observations"]
assert count == nlopt_payload["backend_evaluations"]
assert count == nlopt_payload["backend_objective_callbacks"]
assert count == nlopt_payload["backend_callback_count"]
incumbent = float("inf")
for event in nlopt_progress:
    data = event["data"]
    point = data["point"]
    expected = (point[0] - 2.0)**2
    assert close(data["objective"], expected)
    accepted = expected < incumbent
    if accepted:
        incumbent = expected
    assert event["accepted"] is accepted
    assert close(data["incumbent_objective"], incumbent)
    assert point in objective_visits

visits_before_animation = len(objective_visits)
minimum_animation = minimum.animate().to_dict()
assert len(objective_visits) == visits_before_animation
assert minimum_animation["controls"]["slider_prefix"] == "Progress: "
assert minimum_animation["metadata"]["progress_semantics"] == "external_callback_observations"
assert [frame["label"] for frame in minimum_animation["frames"][:-1]] == [
    "objective callback " + str(index)
    for index in range(1, count + 1)
]
assert minimum_animation["frames"][-1]["label"] == "returned result"

print("external optimizer observability passed")
`;

test("ordinary-Python optimization retains algorithm-iteration semantics", () => {
  assert.equal(
    runCPython(portableWitness),
    "portable optimizer progress semantics passed",
  );
});

test(
  "qualified external optimizers retain authentic callbacks and independent diagnostics",
  {
    skip: externalRuntimeArtifactsPresent()
      ? false
      : "qualified cminpack/NLopt runtime artifacts are not present",
    timeout: 180_000,
  },
  () => {
    assert.equal(
      runSagejs(externalWitness),
      "external optimizer observability passed",
    );
  },
);
