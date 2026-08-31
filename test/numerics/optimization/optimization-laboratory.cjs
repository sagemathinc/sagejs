#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "../../..");

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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-optimization-"));
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

const successWitness = String.raw`
import json
import math
from sagejs.numerics.optimization import (
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    capabilities,
    curve_fit,
    least_squares,
    linear_fit,
    minimize,
    minimize_problem,
    minimize_scalar,
    plan,
    supports,
    solve_nonlinear_system,
)

calls = [0]
def counted(point):
    calls[0] += 1
    return (point[0] - 1.0)**2 + 2.0*(point[1] + 2.0)**2

problem = minimize_problem(counted, [4.0, -5.0], method="nelder-mead")
selected = plan(problem)
assert selected.method == "nelder-mead" and calls[0] == 0
records = capabilities()
assert records["schema_version"] == 1
assert "cobyla" in records["explicitly_unsupported"]["nonlinear_constraints"]["methods"]
assert records["qualification"]["platforms"] == ["linux-x64"]
assert not records["qualification"]["browser"]
assert not records["qualification"]["sea"]
assert not records["qualification"]["four_platform_release"]

interior = minimize_scalar(lambda x: (x - 2.0)**2, -1.0, 5.0)
assert interior.success and abs(interior.value - 2.0) < 1.0e-8
assert interior.method == "bounded-brent"
assert interior.validation.passed and interior.verify().passed
assert len(interior.plot().layers) == 2
interior_animation = interior.animate().to_dict()
assert len(interior_animation["frames"]) >= 2
first_path = interior_animation["frames"][0]["state"]["value"]["layers"][1]["data"]["x"]
last_path = interior_animation["frames"][-1]["state"]["value"]["layers"][1]["data"]["x"]
assert len(first_path) < len(last_path)
assert abs(first_path[0] - interior.value) > 1.0e-2
assert any(event.kind == "phase" for event in interior.trace.events)

boundary = minimize_scalar(lambda x: x, 0.0, 3.0)
assert boundary.success and boundary.value == 0.0

bfgs = minimize(
    counted,
    [4.0, -5.0],
    gradient=lambda point: [2.0*(point[0]-1.0), 4.0*(point[1]+2.0)],
    method="bfgs",
)
assert bfgs.success and abs(bfgs.value[0] - 1.0) < 1.0e-7
assert abs(bfgs.value[1] + 2.0) < 1.0e-7
assert bfgs.residual is not None and bfgs.residual < 1.0e-6
assert len(bfgs.to_plot_spec().layers) == 2
assert "projected_gradient_kkt" in bfgs.explain()

simplex = minimize(
    lambda point: (1.0-point[0])**2 + 100.0*(point[1]-point[0]*point[0])**2,
    [-1.2, 1.0],
    method="nelder-mead",
    maxiter=2000,
)
assert simplex.success and abs(simplex.value[0] - 1.0) < 2.0e-5

bounded = minimize(
    lambda point: (point[0]-3.0)**2 + (point[1]+1.0)**2,
    [0.0, 0.0],
    gradient=lambda point: [2.0*(point[0]-3.0), 2.0*(point[1]+1.0)],
    bounds=[(None, 1.0), (0.0, 2.0)],
    method="projected-bfgs",
)
assert bounded.success and bounded.value == [1.0, 0.0]
assert bounded.residual == 0.0

system = solve_nonlinear_system(
    lambda point: [point[0]*point[0] + point[1]*point[1] - 1.0, point[0] - point[1]],
    [0.8, 0.6],
)
assert system.success and abs(system.value[0] - 2.0**-0.5) < 1.0e-9
assert system.residual is not None and system.residual < 1.0e-9

least = least_squares(
    lambda point: [point[0] - 1.0, 2.0*(point[1] + 2.0)],
    [0.0, 0.0],
)
assert least.success and abs(least.value[0] - 1.0) < 1.0e-8
assert least.domain_payload["parameter_diagnostics"]["covariance_available"]

rank_deficient = least_squares(
    lambda point: [point[0] + point[1] - 2.0, 2.0*(point[0]+point[1]-2.0)],
    [0.0, 0.0],
)
assert rank_deficient.success
assert rank_deficient.domain_payload["parameter_diagnostics"]["rank_deficient_or_ill_conditioned"]

linear = linear_fit([0.0, 1.0, 2.0, 3.0], [1.0, 3.0, 5.0, 7.0])
assert linear.success and linear.value == [2.0, 1.0]
assert len(linear.plot().layers) == 3

fit = curve_fit(
    lambda x, p: p[0]*math.exp(-p[1]*x),
    [0.0, 1.0, 2.0, 3.0],
    [2.0, 1.213061319, 0.735758882, 0.44626032],
    [1.5, 0.4],
)
assert fit.success and abs(fit.value[0] - 2.0) < 1.0e-7
assert abs(fit.value[1] - 0.5) < 1.0e-7
assert len(fit.plot().layers) == 3
fit_animation = fit.animate().to_dict()
first_fit = fit_animation["frames"][0]["state"]["value"]["layers"][1]["data"]["y"]
last_fit = fit_animation["frames"][-1]["state"]["value"]["layers"][1]["data"]["y"]
assert first_fit != last_fit
assert json.loads(fit.to_json())["method"] == "damped-gauss-newton"

bounded_problem = minimize_problem(
    lambda point: point[0]*point[0],
    [1.0],
    bounds=[(0.0, 2.0)],
)
assert not supports(bounded_problem, "bfgs")
try:
    plan(bounded_problem, "bfgs")
    raise AssertionError("method overrides must respect constraint envelopes")
except ValueError:
    pass

large_problem = minimize_problem(lambda point: sum(value*value for value in point), [0.0]*65)
large_plan = plan(large_problem)
assert large_plan.method == "bfgs" and supports(large_problem)

try:
    minimize(lambda point: point[0]*point[0], [1.0], constraints=[lambda point: point[0]])
    raise AssertionError("nonlinear constraints must fail closed")
except NotImplementedError:
    pass

print("optimization success laboratory passed")
`;

const failureWitness = String.raw`
from sagejs.numerics.optimization import (
    MAX_FIT_OBSERVATIONS,
    MAX_RESIDUAL_DIMENSION,
    curve_fit,
    least_squares,
    linear_fit,
    minimize,
    minimize_scalar,
    solve_nonlinear_system,
)

callback_error = minimize_scalar(lambda x: 1.0/0.0, -1.0, 1.0)
assert not callback_error.success and callback_error.status == "callback_error"

nonfinite = minimize_scalar(lambda x: float("inf"), -1.0, 1.0)
assert not nonfinite.success and nonfinite.status == "nonfinite_evaluation"

cancelled = minimize_scalar(lambda x: x*x, -1.0, 1.0, cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"
assert cancelled.domain_payload["stop_reason"] == "explicit_cancellation"

budget = minimize_scalar(lambda x: x*x, -1.0, 1.0, max_evaluations=1)
assert not budget.success and budget.status == "maximum_evaluations"

false_gradient = minimize(
    lambda point: (point[0]-2.0)**2,
    [0.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert false_gradient.status == "converged" and not false_gradient.success
assert not false_gradient.validation.passed
assert "validation_failed" in {item.code for item in false_gradient.diagnostics}

shallow_false_gradient = minimize(
    lambda point: 1.0e-4*point[0],
    [0.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert shallow_false_gradient.status == "converged"
assert not shallow_false_gradient.success
assert shallow_false_gradient.validation.residual > 5.0e-5

stationary_maximum = least_squares(
    lambda point: [point[0]*point[0] - 1.0],
    [0.0],
)
assert stationary_maximum.status == "converged"
assert not stationary_maximum.success
second_order = [
    check for check in stationary_maximum.validation.to_dict()["checks"]
    if check["kind"] == "coordinate_second_order_minimum"
][0]
assert not second_order["passed"] and second_order["minimum_sampled_curvature"] < 0.0

tiny = minimize_scalar(
    lambda x: (x - 5.0e-13)**2,
    0.0,
    1.0e-12,
    xtol=1.0e-15,
    rtol=0.0,
)
assert tiny.success and abs(tiny.value - 5.0e-13) <= 1.0e-15

bad_scalar = minimize_scalar(lambda x: "not-a-number", 0.0, 1.0)
assert bad_scalar.status == "invalid_problem" and not bad_scalar.success

bad_vector = minimize(lambda point: "not-a-vector", [0.0], method="nelder-mead")
assert bad_vector.status == "invalid_problem" and not bad_vector.success

bad_gradient = minimize(
    lambda point: point[0]*point[0],
    [1.0],
    gradient=lambda point: ["not-a-number"],
    method="bfgs",
)
assert bad_gradient.status == "invalid_problem" and not bad_gradient.success

bad_residual = least_squares(lambda point: "not-a-vector", [0.0])
assert bad_residual.status == "invalid_problem" and not bad_residual.success

bad_jacobian = least_squares(
    lambda point: [point[0] - 1.0],
    [0.0],
    jacobian=lambda point: [["not-a-number"]],
)
assert bad_jacobian.status == "invalid_problem" and not bad_jacobian.success

oversized_residual = least_squares(
    lambda point: [0.0]*(MAX_RESIDUAL_DIMENSION + 1),
    [0.0],
)
assert oversized_residual.status == "invalid_problem"

try:
    linear_fit(
        list(range(MAX_FIT_OBSERVATIONS + 1)),
        [0.0]*(MAX_FIT_OBSERVATIONS + 1),
    )
    raise AssertionError("fit input ceilings must fail before solving")
except ValueError:
    pass

class ValidationFailure:
    def __init__(self):
        self.calls = 0

    def __call__(self, point):
        self.calls += 1
        if self.calls > 1:
            raise LookupError("validation-only failure")
        return (point[0] - 1.0)**2

validation_callback = minimize(
    ValidationFailure(),
    [1.0],
    gradient=lambda point: [0.0],
    method="bfgs",
)
assert validation_callback.status == "callback_error"
assert not validation_callback.success
callback_items = [
    item.to_dict() for item in validation_callback.diagnostics
    if item.code == "callback_error"
]
assert len(callback_items) == 1
assert callback_items[0]["details"]["phase"] == "validation"

validation_budget = minimize(
    lambda point: (point[0] - 1.0)**2,
    [1.0],
    gradient=lambda point: [0.0],
    method="bfgs",
    max_evaluations=2,
)
assert validation_budget.status == "maximum_evaluations"
assert not validation_budget.success

ill_conditioned = least_squares(
    lambda point: [
        point[0] + point[1] - 1.0,
        point[0] + (1.0 + 1.0e-6)*point[1] - 1.0,
    ],
    [0.0, 0.0],
)
assert ill_conditioned.success
condition = ill_conditioned.domain_payload["parameter_diagnostics"]
assert condition["covariance_available"]
assert condition["rank_deficient_or_ill_conditioned"]
assert condition["normal_matrix_condition_estimate"] > 1.0e12

no_trace = minimize_scalar(lambda x: x*x, -1.0, 1.0, trace="none")
try:
    no_trace.animate()
    raise AssertionError("animations must not fabricate unretained iterations")
except ValueError:
    pass

truncated = minimize(
    lambda point: (1.0-point[0])**2 + 100.0*(point[1]-point[0]*point[0])**2,
    [-1.2, 1.0],
    method="nelder-mead",
    maxiter=2000,
    trace="iterations",
    max_trace_events=4,
)
assert truncated.trace.truncated and len(truncated.trace.events) <= 4

print("optimization failure laboratory passed")
`;

test("optimization success corpus agrees in CPython", () => {
  assert.equal(runCPython(successWitness), "optimization success laboratory passed");
});

test("optimization success corpus runs in Sage.js", () => {
  assert.equal(runSagejs(successWitness), "optimization success laboratory passed");
});

test("optimization failure and budget corpus agrees in CPython", () => {
  assert.equal(runCPython(failureWitness), "optimization failure laboratory passed");
});

test("optimization failure and budget corpus runs in Sage.js", () => {
  assert.equal(runSagejs(failureWitness), "optimization failure laboratory passed");
});
