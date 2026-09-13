#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function runSagejs(source, pythonMode) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-frontend-breadth-"));
  const filename = join(directory, pythonMode ? "witness.py" : "witness.sage");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    const args = [executable];
    if (pythonMode) args.push("--python");
    args.push(filename);
    return run(process.execPath, args);
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

from sagejs.numerics import describe, plan as numerical_plan, supports
from sagejs.numerics.optimization import (
    curve_fit,
    curve_fit_problem,
    least_squares_problem,
    plan as optimization_plan,
    solve_curve_fit_problem,
)
from sagejs.numerics.ode import (
    OdeUnsupportedError,
    ode_capabilities,
    ode_problem,
    plan_ode,
    solve_ivp,
    solve_ode_problem,
)


model_calls = [0]
jacobian_calls = [0]


def model(x, parameters):
    model_calls[0] += 1
    return parameters[0] * x + parameters[1]


def model_jacobian(x, parameters):
    jacobian_calls[0] += 1
    return [x, 1.0]


xdata = [0.0, 1.0, 2.0, 3.0]
ydata = [1.0, 3.0, 5.0, 7.0]
p0 = [0.0, 0.0]
fit_problem = curve_fit_problem(
    model,
    xdata,
    ydata,
    p0,
    jacobian=model_jacobian,
    max_evaluations=256,
    trace="iterations",
)
assert model_calls == [0] and jacobian_calls == [0]
xdata[0] = 999.0
ydata[0] = 999.0
p0[0] = 999.0
assert fit_problem.initial_data["fit_x"] == [0.0, 1.0, 2.0, 3.0]
assert fit_problem.initial_data["fit_y"] == [1.0, 3.0, 5.0, 7.0]
assert fit_problem.initial_data["point"] == [0.0, 0.0]

fit_plan = numerical_plan(fit_problem)
assert model_calls == [0] and jacobian_calls == [0]
assert fit_plan.to_dict() == optimization_plan(fit_problem).to_dict()
assert fit_plan.problem.operation == "curve_fit"
assert fit_plan.method == "damped-gauss-newton"
assert fit_plan.backend == "ordinary-python"
assert fit_plan.problem.digest == fit_problem.digest
assert supports(fit_problem)
fit_capability = describe("curve_fit")
assert set(fit_capability["methods"]) == {
    "cminpack-lmder",
    "cminpack-lmdif",
    "damped-gauss-newton",
}

fit_result = solve_curve_fit_problem(fit_problem)
assert fit_result.success and fit_result.validation.passed
assert fit_result.problem.digest == fit_problem.digest
assert fit_result.plan_record.problem.digest == fit_problem.digest
assert abs(fit_result.value[0] - 2.0) < 1.0e-7
assert abs(fit_result.value[1] - 1.0) < 1.0e-7
fit_record = fit_result.to_dict()
assert fit_record["reproducibility"]["problem"]["operation"] == "curve_fit"
assert fit_record["domain_payload"]["fit_x"] == [0.0, 1.0, 2.0, 3.0]
assert fit_record["domain_payload"]["parameter_diagnostics"]["covariance_available"]
assert fit_record["measurements"]["callback_counts"]["residual"] > 0
assert fit_record["measurements"]["callback_counts"]["jacobian"] > 0
fit_record["domain_payload"]["fit_x"][0] = -123.0
assert fit_result.to_dict()["domain_payload"]["fit_x"][0] == 0.0

wrong_calls = [0]


def wrong_residual(parameters):
    wrong_calls[0] += 1
    return [parameters[0]]


wrong_problem = least_squares_problem(wrong_residual, [1.0])
try:
    solve_curve_fit_problem(wrong_problem)
    raise AssertionError("a non-fitting problem must fail closed")
except TypeError:
    pass
assert wrong_calls == [0]

cancelled_model_calls = [0]


def cancelled_model(x, parameters):
    cancelled_model_calls[0] += 1
    return parameters[0] * x


cancelled_problem = curve_fit_problem(
    cancelled_model,
    [0.0, 1.0],
    [0.0, 1.0],
    [0.0],
)
cancelled_fit = solve_curve_fit_problem(cancelled_problem, cancel=lambda: True)
assert not cancelled_fit.success and cancelled_fit.status == "cancelled"
assert cancelled_fit.evaluations == 0 and cancelled_model_calls == [0]

limited_fit = curve_fit(
    lambda x, parameters: parameters[0] * x,
    [0.0, 1.0, 2.0],
    [0.0, 1.0, 2.0],
    [0.0],
    max_evaluations=1,
)
assert not limited_fit.success
assert limited_fit.status == "maximum_evaluations"
assert limited_fit.evaluations <= 1

rhs_calls = [0]


def rhs(t, state):
    rhs_calls[0] += 1
    return [-state[0]]


y0 = [1.0]
ivp = ode_problem(
    rhs,
    (0.0, 1.0),
    y0,
    rtol=1.0e-7,
    atol=1.0e-10,
    max_evaluations=512,
    trace="iterations",
)
y0[0] = 999.0
assert ivp.y0 == (1.0,)
ivp_plan = numerical_plan(ivp)
assert rhs_calls == [0]
assert ivp_plan.to_dict() == plan_ode(ivp).to_dict()
assert ivp_plan.method == "rk45" and ivp_plan.backend == "ordinary-python"
assert supports(ivp)

ivp_result = solve_ode_problem(ivp)
assert ivp_result.success and ivp_result.validation.passed
assert abs(ivp_result.value[0] - math.exp(-1.0)) < 2.0e-7
assert ivp_result.problem.digest == ivp.digest
assert ivp_result.plan_record.problem.digest == ivp.digest
ivp_record = ivp_result.to_dict()
assert ivp_record["reproducibility"]["problem"]["operation"] == "initial_value_problem"
assert ivp_record["domain_payload"]["trajectory"]["states"][0] == [1.0]
ivp_record["domain_payload"]["trajectory"]["states"][0][0] = -123.0
assert ivp_result.to_dict()["domain_payload"]["trajectory"]["states"][0] == [1.0]

unsupported_calls = [0]


def unsupported_rhs(t, state):
    unsupported_calls[0] += 1
    return state


unsupported_problem = ode_problem(
    unsupported_rhs,
    (0.0, 1.0),
    [1.0],
    method="bdf",
)
assert not supports(unsupported_problem)
try:
    plan_ode(unsupported_problem)
    raise AssertionError("an unsupported ODE method must fail closed")
except OdeUnsupportedError as error:
    assert error.feature == "bdf"
assert unsupported_calls == [0]
ode_surface = ode_capabilities()
assert ode_surface["unsupported_methods"]["bdf"]["classification"] == "unsupported"
assert ode_surface["unsupported_methods"]["cvode"]["alternative"]

cancelled_rhs_calls = [0]


def cancelled_rhs(t, state):
    cancelled_rhs_calls[0] += 1
    return [-state[0]]


cancelled_ivp = solve_ivp(
    cancelled_rhs,
    (0.0, 1.0),
    [1.0],
    cancel=lambda: True,
)
assert not cancelled_ivp.success and cancelled_ivp.status == "cancelled"
assert cancelled_ivp.evaluations == 0 and cancelled_rhs_calls == [0]

print(json.dumps({
    "fit": {
        "method": fit_result.method,
        "status": fit_result.status,
        "value": fit_result.value,
        "evaluations": fit_result.evaluations,
    },
    "ode": {
        "method": ivp_result.method,
        "status": ivp_result.status,
        "value": ivp_result.value,
        "evaluations": ivp_result.evaluations,
    },
}, sort_keys=True))
`;

test("curve fitting and ODEs expose identical structured Sage/Python semantics", () => {
  const cpython = runCPython(witness);
  const pythonMode = runSagejs(witness, true);
  const sageMode = runSagejs(witness, false);
  for (const observed of [pythonMode, sageMode]) {
    for (const domain of ["fit", "ode"]) {
      const { value: observedValue, ...observedRecord } = observed[domain];
      const { value: expectedValue, ...expectedRecord } = cpython[domain];
      assert.deepEqual(observedRecord, expectedRecord);
      assert.equal(observedValue.length, expectedValue.length);
      for (let index = 0; index < expectedValue.length; index += 1) {
        assert.ok(
          Math.abs(observedValue[index] - expectedValue[index]) <= 1.0e-14,
          `${domain} value ${index} differs across runtimes`,
        );
      }
    }
  }
});
