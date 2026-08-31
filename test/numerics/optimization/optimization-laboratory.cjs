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
    capabilities,
    curve_fit,
    least_squares,
    linear_fit,
    minimize,
    minimize_problem,
    minimize_scalar,
    plan,
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

interior = minimize_scalar(lambda x: (x - 2.0)**2, -1.0, 5.0)
assert interior.success and abs(interior.value - 2.0) < 1.0e-8
assert interior.method == "bounded-brent"
assert interior.validation.passed and interior.verify().passed
assert len(interior.plot().layers) == 2
assert len(interior.animate().frames) >= 2

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
assert json.loads(fit.to_json())["method"] == "damped-gauss-newton"

try:
    minimize(lambda point: point[0]*point[0], [1.0], constraints=[lambda point: point[0]])
    raise AssertionError("nonlinear constraints must fail closed")
except NotImplementedError:
    pass

print("optimization success laboratory passed")
`;

const failureWitness = String.raw`
from sagejs.numerics.optimization import minimize, minimize_scalar

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
