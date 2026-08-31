#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "../..");

function evaluate(source) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs-source.cjs"), "--python", "-"],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("public least-squares routes exact cminpack identities and validates", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import least_squares

def residual(point):
    x, y = point
    return [10.0 * (y - x*x), 1.0 - x]

def jacobian(point):
    x, _ = point
    return [[-20.0*x, 10.0], [-1.0, 0.0]]

lmdif = least_squares(residual, [-1.2, 1.0], method="cminpack-lmdif")
assert lmdif.method == "cminpack-lmdif"
assert lmdif.backend == "cminpack-wasm"
assert lmdif.success and lmdif.validation.passed
assert max(abs(lmdif.value[0] - 1.0), abs(lmdif.value[1] - 1.0)) < 1.0e-8
assert lmdif.domain_payload["method_identity"] == "cminpack-lmdif"
assert lmdif.domain_payload["backend_identity"] == "cminpack-wasm"

lmder = least_squares(
    residual,
    [-1.2, 1.0],
    jacobian=jacobian,
    method="cminpack-lmder",
)
assert lmder.method == "cminpack-lmder"
assert lmder.backend == "cminpack-wasm"
assert lmder.success and lmder.validation.passed
assert lmder.domain_payload["backend_jacobian_evaluations"] > 0
assert lmder.iterations > 0

automatic = least_squares(residual, [-1.2, 1.0], method="auto")
assert automatic.method == "damped-gauss-newton"
assert automatic.backend == "ordinary-python"
print("public cminpack integration passed")
`), "public cminpack integration passed");
});

test("public cminpack enforces iterations and reports method-driven diagnostics", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import least_squares

def residual(point):
    x, y = point
    return [10.0 * (y - x*x), 1.0 - x]

def unused_jacobian(point):
    x, _ = point
    return [[-20.0*x, 10.0], [-1.0, 0.0]]

limited = least_squares(
    residual,
    [-1.2, 1.0],
    method="cminpack-lmdif",
    maxiter=1,
    max_evaluations=300,
)
assert not limited.success
assert limited.status == "maximum_iterations"
assert limited.iterations == 1
assert "maximum_iterations" in {item.code for item in limited.diagnostics}

finite_difference = least_squares(
    residual,
    [-1.2, 1.0],
    jacobian=unused_jacobian,
    method="cminpack-lmdif",
)
assert "finite_difference_derivative" in {
    item.code for item in finite_difference.diagnostics
}
print("public cminpack iteration and derivative contracts passed")
`), "public cminpack iteration and derivative contracts passed");
});

test("explicit lmder never substitutes when its Jacobian contract is absent", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import least_squares

try:
    least_squares(lambda point: [point[0]], [1.0], method="cminpack-lmder")
except ValueError as error:
    assert "explicit Jacobian" in str(error)
else:
    raise AssertionError("cminpack-lmder silently substituted another method")
print("explicit method identity passed")
  `), "explicit method identity passed");
});

test("public callback and resource failures stay structured and reusable", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import least_squares

def broken(_point):
    raise RuntimeError("private callback detail")

callback = least_squares(broken, [1.0], method="cminpack-lmdif")
assert not callback.success
assert callback.status == "callback_error"

budget = least_squares(
    lambda point: [point[0] - 2.0],
    [20.0],
    method="cminpack-lmdif",
    max_evaluations=2,
)
assert not budget.success
assert budget.status == "maximum_evaluations"

cancel_checks = [0]
def cancel():
    cancel_checks[0] += 1
    return cancel_checks[0] >= 3

cancelled = least_squares(
    lambda point: [point[0] - 2.0],
    [20.0],
    method="cminpack-lmdif",
    cancel=cancel,
)
assert not cancelled.success
assert cancelled.status == "cancelled"

recovered = least_squares(
    lambda point: [point[0] - 2.0],
    [20.0],
    method="cminpack-lmdif",
)
assert recovered.success and recovered.validation.passed
assert abs(recovered.value[0] - 2.0) < 1.0e-10
print("public cminpack failures and recovery passed")
`), "public cminpack failures and recovery passed");
});
