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

test("public minimize preserves exact explicit NLopt identities", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize, minimize_problem, solve_minimize_problem

nelder_mead = minimize(
    lambda point: (point[0] - 2.0)**2 + (point[1] + 1.0)**2,
    [5.0, 5.0],
    bounds=[[-10.0, 10.0], [-10.0, 10.0]],
    method="nlopt-nelder-mead",
)
assert nelder_mead.method == "nlopt-nelder-mead"
assert nelder_mead.backend == "nlopt-mit-wasm"
assert nelder_mead.success and nelder_mead.validation.passed
assert max(abs(nelder_mead.value[0] - 2.0), abs(nelder_mead.value[1] + 1.0)) < 1.0e-6
assert nelder_mead.domain_payload["method_identity"] == "nlopt-nelder-mead"
assert nelder_mead.domain_payload["backend_identity"] == "nlopt-mit-wasm"
provenance = nelder_mead.to_dict()["provenance"]
assert provenance["implementation_kind"] == "external_library_wasm"
assert not provenance["source_transparent"]

# Opposite 1-D simplex vertices can have exactly equal objective values while
# still far from stationary. The public route must not accept NLopt's optional
# function-tolerance stop before its independent stationarity check can pass.
one_dimensional = minimize(
    lambda point: (point[0] - 3.0)**2,
    [0.0],
    method="nlopt-nelder-mead",
)
assert one_dimensional.success and one_dimensional.validation.passed
assert abs(one_dimensional.value[0] - 3.0) < 1.0e-6
assert one_dimensional.domain_payload["backend_status"] == "parameter_tolerance_reached"

zero_scale = minimize(
    lambda point: point[0]**2,
    [1.0],
    method="nlopt-nelder-mead",
)
assert zero_scale.success and zero_scale.validation.passed
assert zero_scale.status == "converged"
assert zero_scale.evaluations < 1000
assert abs(zero_scale.value[0]) < 1.0e-7

cobyla = minimize(
    lambda point: (point[0] - 2.0)**2,
    [0.0],
    constraints=[{"type": "ineq", "fun": lambda point: 1.0 - point[0]}],
    method="nlopt-cobyla",
)
assert cobyla.method == "nlopt-cobyla"
assert cobyla.backend == "nlopt-mit-wasm"
assert cobyla.success and cobyla.validation.passed
assert abs(cobyla.value[0] - 1.0) < 1.0e-6
assert cobyla.domain_payload["backend_derivative_callbacks"] == 0

automatic = minimize(lambda point: (point[0] - 2.0)**2, [0.0])
assert automatic.method == "nelder-mead"
assert automatic.backend == "ordinary-python"
assert automatic.to_dict()["provenance"]["source_transparent"]
print("public NLopt identities passed")
`), "public NLopt identities passed");
});

test("independent validation rejects rotated saddles and false constrained optima", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize, minimize_problem, solve_minimize_problem

def rotated_saddle(point):
    x = point[0] - 1.0
    y = point[1] - 1.0
    radius_squared = x*x + y*y
    return x*x + y*y - 3.0*x*y + radius_squared*radius_squared

saddle = minimize(
    rotated_saddle,
    [1.0, 1.0],
    method="nlopt-nelder-mead",
    initial_step=1.0e-4,
    xtol=1.0e-3,
)
assert saddle.status == "converged"
assert not saddle.success and not saddle.validation.passed
curvature = next(
    check for check in saddle.validation.to_dict()["checks"]
    if check["kind"] == "independent_minimum_curvature"
)
assert curvature["minimum_curvature"] < -curvature["threshold"]

auto_problem = minimize_problem(
    rotated_saddle,
    [1.0, 1.0],
    method="auto",
    initial_step=1.0e-4,
    xtol=1.0e-3,
)
override = solve_minimize_problem(auto_problem, method="nlopt-nelder-mead")
assert override.status == "converged"
assert not override.success and not override.validation.passed
override_curvature = next(
    check for check in override.validation.to_dict()["checks"]
    if check["kind"] == "independent_minimum_curvature"
)
assert override_curvature["required"] and override_curvature["negative"]

try:
    minimize(
        lambda point: sum(value*value for value in point),
        [1.0 for _ in range(33)],
        method="nlopt-nelder-mead",
    )
except ValueError as error:
    assert "validated dimension envelope" in str(error)
else:
    raise AssertionError("NLopt Nelder-Mead exceeded its curvature envelope")

false_kkt = minimize(
    lambda point: -point[0] - point[1] + point[2]**2,
    [0.0, 0.0, 0.0],
    constraints=[
        {"type": "ineq", "fun": lambda point: point[1] - 0.9*point[0]},
        {"type": "ineq", "fun": lambda point: point[0] - 0.9*point[1]},
    ],
    method="nlopt-cobyla",
    maxiter=2,
)
# This objective is unbounded on the feasible wedge, so the backend is not
# required to return the origin.  Validate that exact candidate directly: the
# earlier independent validator falsely certified it from coordinate probes.
false_kkt._value = [0.0, 0.0, 0.0]
false_kkt_validation = false_kkt.verify()
assert not false_kkt_validation.passed
kkt = next(
    check for check in false_kkt_validation.to_dict()["checks"]
    if check["kind"] == "independent_active_constraint_kkt"
)
assert not kkt["passed"] and kkt["residual"] > kkt["threshold"]
assert kkt["descent_direction_feasible"]

shifted = minimize(
    lambda point: 1.0 + 1.0e-4*rotated_saddle(point),
    [1.0, 1.0],
    constraints=[{"type": "ineq", "fun": lambda _point: 1.0}],
    method="nlopt-cobyla",
    maxiter=2,
)
shifted._value = [1.0, 1.0]
shifted_validation = shifted.verify()
assert not shifted_validation.passed
shifted_local = next(
    check for check in shifted_validation.to_dict()["checks"]
    if check["kind"] == "independent_feasible_direction_local_minimum"
)
assert shifted_local["maximum_sampled_decrease"] > shifted_local["threshold"]

near_active = minimize(
    lambda point: 1.0 + point[0],
    [0.0],
    constraints=[
        {"type": "ineq", "fun": lambda point: 1.0e-7 + point[0]}
    ],
    method="nlopt-cobyla",
    maxiter=2,
)
near_active._value = [0.0]
near_active_validation = near_active.verify()
assert not near_active_validation.passed
near_active_kkt = next(
    check for check in near_active_validation.to_dict()["checks"]
    if check["kind"] == "independent_active_constraint_kkt"
)
assert near_active_kkt["residual"] > near_active_kkt["threshold"]
print("public adversarial validation passed")
`), "public adversarial validation passed");
});

test("COBYLA validates equality constraints and rejects infeasible success", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize

equality = minimize(
    lambda point: (point[0] - 0.25)**2 + (point[1] - 0.75)**2,
    [0.0, 0.0],
    constraints=[{"type": "eq", "fun": lambda point: point[0] + point[1] - 1.0}],
    method="nlopt-cobyla",
)
assert equality.success and equality.validation.passed
assert abs(equality.value[0] - 0.25) < 1.0e-6
assert abs(equality.value[1] - 0.75) < 1.0e-6

circle = minimize(
    lambda point: (point[0] - 1.0)**2 + point[1]**2,
    [0.0, 1.0],
    constraints=[
        {
            "type": "eq",
            "fun": lambda point: point[0]**2 + point[1]**2 - 1.0,
        }
    ],
    method="nlopt-cobyla",
)
assert circle.success and circle.validation.passed
assert abs(circle.value[0] - 1.0) < 1.0e-5
assert abs(circle.value[1]) < 1.0e-5

active_bound = minimize(
    lambda point: (point[0] - 3.0)**2,
    [0.0],
    bounds=[[0.0, 2.0]],
    method="nlopt-nelder-mead",
)
assert active_bound.success and active_bound.validation.passed
assert abs(active_bound.value[0] - 2.0) < 1.0e-8
active_curvature = next(
    check for check in active_bound.validation.to_dict()["checks"]
    if check["kind"] == "independent_minimum_curvature"
)
assert active_curvature["reason"] == "strict_first_order_active_bounds"

infeasible = minimize(
    lambda point: point[0]**2,
    [0.5],
    constraints=[
        {"type": "ineq", "fun": lambda point: point[0] - 1.0},
        {"type": "ineq", "fun": lambda point: -point[0]},
    ],
    method="nlopt-cobyla",
)
# The positive library status is retained as execution evidence, but the
# independent feasibility oracle must deny public success.
assert infeasible.status == "converged"
assert not infeasible.success
assert not infeasible.validation.passed
assert infeasible.validation.residual > 0.49
assert infeasible.domain_payload["backend_status_code"] > 0
print("public constrained validation passed")
`), "public constrained validation passed");
});

test("explicit NLopt methods fail closed and leave the backend reusable", () => {
  assert.equal(evaluate(String.raw`
from sagejs.numerics.optimization import minimize

try:
    minimize(lambda point: point[0]**2, [1.0], method="cobyla")
except ValueError as error:
    assert "unsupported" in str(error)
else:
    raise AssertionError("generic COBYLA silently selected the NLopt backend")

try:
    minimize(
        lambda point: point[0]**2,
        [1.0],
        constraints=[{"type": "ineq", "fun": lambda point: point[0]}],
        method="auto",
    )
except ValueError as error:
    assert "explicit nlopt-cobyla" in str(error)
else:
    raise AssertionError("nonlinear constraints entered automatic selection")

def broken(_point):
    raise RuntimeError("private callback detail")

callback = minimize(broken, [1.0], method="nlopt-nelder-mead")
assert not callback.success and callback.status == "callback_error"
callback_provenance = callback.to_dict()["provenance"]
assert callback_provenance["implementation_kind"] == "external_library_wasm"
assert not callback_provenance["source_transparent"]

limited = minimize(
    lambda point: (point[0] - 2.0)**2,
    [20.0],
    method="nlopt-nelder-mead",
    maxiter=2,
    max_evaluations=100,
)
assert not limited.success and limited.status == "maximum_evaluations"
assert limited.domain_payload["backend_evaluation_budget"] == 2

checks = [0]
def cancel():
    checks[0] += 1
    return checks[0] >= 3

cancelled = minimize(
    lambda point: (point[0] - 2.0)**2,
    [20.0],
    method="nlopt-nelder-mead",
    cancel=cancel,
)
assert not cancelled.success and cancelled.status == "cancelled"
cancelled_provenance = cancelled.to_dict()["provenance"]
assert cancelled_provenance["implementation_kind"] == "external_library_wasm"
assert not cancelled_provenance["source_transparent"]

recovered = minimize(
    lambda point: (point[0] - 2.0)**2,
    [20.0],
    method="nlopt-nelder-mead",
)
assert recovered.success and recovered.validation.passed
assert abs(recovered.value[0] - 2.0) < 1.0e-6
print("public NLopt failure contracts passed")
`), "public NLopt failure contracts passed");
});
