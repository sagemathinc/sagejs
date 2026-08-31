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

const root = join(__dirname, "../../..");

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-approximation-"));
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

from sagejs.numerics import ResourceBudget
from sagejs.numerics.approximation import (
    chebyshev_approximation,
    cubic_spline,
    finite_difference,
    finite_difference_problem,
    fornberg_weights,
    interpolate,
    interpolation_problem,
    plan_finite_difference,
    plan_interpolation,
)
from sagejs.numerics.approximation.splines import _validation_metrics


def close(left, right, tolerance=1e-10):
    assert abs(left - right) <= tolerance * max(1.0, abs(right)), (left, right)


# Stable second-form barycentric interpolation reproduces a polynomial and its
# derivative without constructing a Vandermonde system.
nodes = [-1.0, -0.4, 0.2, 0.75, 1.5]
values = [x**4 - 2.0*x + 1.0 for x in nodes]
polynomial = interpolate(nodes, values, trace="iterations")
assert polynomial.success and polynomial.method == "barycentric"
for x in (-1.0, -0.8, 0.0, 0.6, 1.5):
    close(polynomial.evaluate(x), x**4 - 2.0*x + 1.0, 2e-12)
    close(polynomial.evaluate(x, 1), 4.0*x**3 - 2.0, 3e-11)
assert polynomial.validation.truth_level == "validated_approximate"
assert json.loads(polynomial.to_json())["value"]["kind"] == "barycentric_polynomial"
assert polynomial.plot_data(19)["layers"][0]["role"] == "approximation"
assert "second barycentric" in polynomial.explain()

linear = interpolate([0, 1, 3], [0, 2, 3], method="linear")
close(linear.evaluate(2), 2.5)
close(linear.evaluate(2, 1), 0.5)
try:
    linear.evaluate(1, 1)
    raise AssertionError("a derivative was invented at a piecewise-linear knot")
except ValueError:
    pass

# Result access is detached: callers cannot invalidate attached validation.
detached_value = polynomial.value
detached_value["values"][0] = 999.0
assert polynomial.evaluate(nodes[0]) == values[0]
detached_record = polynomial.to_dict()
detached_record["value"]["values"][0] = 999.0
assert polynomial.evaluate(nodes[0]) == values[0]

planned_interpolation = plan_interpolation(interpolation_problem(nodes, values))
platform_support = planned_interpolation.to_dict()["capability"]["platform_support"]
assert platform_support["node"] == "local_sagejs_runtime_passed"
assert platform_support["browser"].startswith("pending_")

# Runge's example records the distinction between a stable representation and
# an intrinsically poor node choice; Chebyshev approximation is much better.
runge = lambda x: 1.0 / (1.0 + 25.0*x*x)
equispaced = [-1.0 + 2.0*i/16.0 for i in range(17)]
global_runge = interpolate(equispaced, [runge(x) for x in equispaced])
chebyshev_runge = chebyshev_approximation(runge, [-1, 1], 16)
grid = [-1.0 + 2.0*i/200.0 for i in range(201)]
global_error = max(abs(global_runge.evaluate(x) - runge(x)) for x in grid)
chebyshev_error = max(abs(chebyshev_runge.evaluate(x) - runge(x)) for x in grid)
assert chebyshev_error < global_error / 5.0

# Boundary conditions are construction data, not display labels.
cubic_nodes = [0.0, 0.3, 0.9, 1.4, 2.0]
cubic_values = [x**3 - 2.0*x + 1.0 for x in cubic_nodes]
not_a_knot = cubic_spline(cubic_nodes, cubic_values)
clamped = cubic_spline(cubic_nodes, cubic_values, boundary=(-2.0, 10.0))
mixed = cubic_spline(cubic_nodes, cubic_values, boundary=((2, 0.0), (1, 10.0)))
natural = cubic_spline(cubic_nodes, cubic_values, boundary="natural")
for result in (not_a_knot, clamped, mixed, natural):
    assert result.success, result.explain()
    assert result.validation.passed
for x in (0.0, 0.2, 0.7, 1.3, 2.0):
    close(not_a_knot.evaluate(x), x**3 - 2.0*x + 1.0, 4e-12)
    close(clamped.evaluate(x), x**3 - 2.0*x + 1.0, 4e-12)
close(natural.evaluate(0.0, 2), 0.0)
close(natural.evaluate(2.0, 2), 0.0)

periodic_nodes = [0.0, math.pi/2.0, math.pi, 3.0*math.pi/2.0, 2.0*math.pi]
periodic = cubic_spline(
    periodic_nodes,
    [0.0, 1.0, 0.0, -1.0, 0.0],
    boundary="periodic",
)
assert periodic.success
close(periodic.evaluate(0.0, 1), periodic.evaluate(2.0*math.pi, 1))
close(periodic.evaluate(-math.pi/2.0), -1.0)

# Periodic validation must inspect the final segment without wrapping x[-1]
# back to x[0]. A fault in that segment is visible in both value and boundary
# residuals.
damaged_periodic = periodic.value
damaged_periodic["coefficients"][-1][3] += 10.0
damaged_metrics = _validation_metrics(damaged_periodic)
assert damaged_metrics[0] > 1.0
assert damaged_metrics[3] > 1.0

rough_spline = cubic_spline([0, 1, 2, 4], [0, 1, -0.5, 0.25], boundary="natural")
try:
    rough_spline.evaluate(1, 3)
    raise AssertionError("a two-sided third derivative was invented at a spline knot")
except ValueError:
    pass

# The plan fixes the stencil and step without spending a callback evaluation.
calls = [0]
def counted_exp(x):
    calls[0] += 1
    return math.exp(x)

derivative_problem = finite_difference_problem(
    counted_exp, 1.0, derivative=math.exp, accuracy_order=4
)
derivative_plan = plan_finite_difference(derivative_problem)
assert calls[0] == 0
assert derivative_plan.method == "fornberg-central"
derivative = finite_difference(
    counted_exp, 1.0, derivative=math.exp, accuracy_order=4
)
assert derivative.success
close(derivative.evaluate(0), math.e, 2e-10)
assert derivative.value["roundoff_floor"] > 0.0
assert derivative.value["error_estimate"] > 0.0
assert derivative.plot_data()["layers"][0]["role"] == "stencil"

second = finite_difference(
    math.sin,
    0.4,
    derivative_order=2,
    accuracy_order=4,
    derivative=lambda x: -math.sin(x),
)
assert second.success
close(second.evaluate(0), -math.sin(0.4), 2e-7)
assert fornberg_weights([-1.0, 0.0, 1.0], 1) == [-0.5, 0.0, 0.5]
assert fornberg_weights([-1.0, 0.0, 1.0], 2) == [1.0, -2.0, 1.0]
for direction in ("forward", "backward"):
    one_sided = finite_difference(
        math.exp,
        1.0,
        stencil=direction,
        accuracy_order=4,
        derivative=math.exp,
    )
    assert one_sided.success, one_sided.explain()
    close(one_sided.evaluate(0), math.e, 2e-7)

for malformed_offsets in ([float("nan"), 0.0, 1.0], [float("inf"), 0.0, 1.0]):
    try:
        fornberg_weights(malformed_offsets, 1)
        raise AssertionError("nonfinite Fornberg offsets were accepted")
    except ValueError:
        pass

moment_check = derivative.validation.to_dict()["checks"][0]
assert moment_check["kind"] == "finite_difference_moments"
assert moment_check["maximum_normalized_residual"] <= moment_check["tolerance"]

# An exact derivative reference is checked against the caller's tolerance,
# never against a self-inflating heuristic error estimate.
bad_reference = finite_difference(
    math.exp,
    0.0,
    step=10.0,
    derivative=math.exp,
    atol=1e-300,
    rtol=1e-300,
)
assert not bad_reference.success
assert bad_reference.status == "validation_failed"
assert bad_reference.validation.residual > 1e5

# Chebyshev coefficients remain detached and differentiable through Clenshaw.
exponential = chebyshev_approximation(math.exp, [-1, 1], 14)
assert exponential.success and exponential.validation.truth_level == "heuristic"
for x in (-1.0, -0.3, 0.2, 1.0):
    close(exponential.evaluate(x), math.exp(x), 2e-12)
    close(exponential.evaluate(x, 1), math.exp(x), 2e-10)
assert "not a rigorous uniform error bound" in json.loads(exponential.to_json())["validation"]["checks"][1]["note"]

exact_linear = chebyshev_approximation(lambda x: x, [-1, 1], 1)
assert exact_linear.success
assert exact_linear.value["error_estimate"] < 1e-12
tail_check = exact_linear.validation.to_dict()["checks"][1]
assert not tail_check["performed"] and tail_check["passed"] is None

# Stable affine interval arithmetic supports large finite endpoints without
# constructing an overflowing midpoint or span.
large_interval = chebyshev_approximation(
    lambda x: x / 1e308,
    [1e308, 1.5e308],
    2,
)
assert large_interval.success
close(large_interval.evaluate(1.25e308), 1.25, 2e-12)
large_interval.to_json()

wide_interpolant = interpolate([-1e308, 0.0, 1e308], [-1.0, 0.0, 1.0])
assert wide_interpolant.success
close(wide_interpolant.evaluate(5e307), 0.5, 2e-12)
wide_interpolant.to_json()

try:
    interpolate(
        [float(i) for i in range(33)],
        [math.sin(i) for i in range(33)],
    )
    raise AssertionError("an unvalidated large global interpolant was accepted")
except ValueError:
    pass

try:
    finite_difference(lambda x: 0.0, 1e308, step=1e308)
    raise AssertionError("a nonfinite finite-difference stencil was accepted")
except ValueError:
    pass

try:
    finite_difference(math.sin, 0.0, derivative_order=33, accuracy_order=33)
    raise AssertionError("an unqualified oversized finite-difference stencil was accepted")
except ValueError:
    pass

try:
    chebyshev_approximation(math.exp, [-1, 1], 513)
    raise AssertionError("an unqualified direct Chebyshev degree was accepted")
except ValueError:
    pass

try:
    cubic_spline([-1e308, 0.0, 1e308], [-1.0, 0.0, 1.0])
    raise AssertionError("an overflowing spline spacing system was accepted")
except ValueError:
    pass

try:
    cubic_spline([0.0, 5e-324], [1.0, 1.0])
    raise AssertionError("an unrepresentable inverse spline spacing was accepted")
except ValueError:
    pass

# DCT normalization is applied before summation, so a representable result does
# not fail merely because an unscaled intermediate sum would overflow.
large_constant = chebyshev_approximation(lambda _x: 1.7e308, [-1, 1], 4)
assert large_constant.success
assert large_constant.evaluate(0.25) > 1.6e308
large_constant.to_json()

# Failure and hard-budget behavior are structured and deterministic.
try:
    interpolate([0.0, 0.0], [1.0, 2.0])
    raise AssertionError("duplicate nodes were accepted")
except ValueError:
    pass

try:
    cubic_spline([0, 1, 2], [0, 1, 2], boundary="periodic")
    raise AssertionError("inconsistent periodic data were accepted")
except ValueError:
    pass

cancelled = finite_difference(math.sin, 1.0, cancel=lambda: True)
assert not cancelled.success and cancelled.status == "cancelled"

cancel_checks = [0]
def cancel_during_construction():
    cancel_checks[0] += 1
    return cancel_checks[0] > 6

cancelled_construction = interpolate(
    [float(i) for i in range(16)],
    [math.sin(i) for i in range(16)],
    cancel=cancel_during_construction,
)
assert not cancelled_construction.success
assert cancelled_construction.status == "cancelled"
assert cancel_checks[0] > 6

tiny_budget = ResourceBudget(max_iterations=10, max_evaluations=2)
exhausted = finite_difference(math.sin, 1.0, resource_budget=tiny_budget)
assert not exhausted.success and exhausted.status == "maximum_evaluations"

iteration_budget = ResourceBudget(max_iterations=1, max_evaluations=256)
iteration_exhausted = interpolate(
    [0.0, 0.25, 0.5, 0.75, 1.0],
    [0.0, 0.25, 0.5, 0.75, 1.0],
    resource_budget=iteration_budget,
)
assert not iteration_exhausted.success
assert iteration_exhausted.status == "maximum_iterations"

def delayed_final_holdout(x):
    if x == 1.0:
        deadline = time.perf_counter() + 0.01
        while time.perf_counter() < deadline:
            pass
    return x

elapsed_budget = ResourceBudget(
    max_iterations=100,
    max_evaluations=256,
    max_elapsed_ms=1,
)
elapsed = chebyshev_approximation(
    delayed_final_holdout,
    [0.0, 1.0],
    0,
    resource_budget=elapsed_budget,
)
assert not elapsed.success
assert elapsed.status != "maximum_evaluations"
assert elapsed.to_dict()["domain_payload"]["stop_reason"] == "maximum_elapsed_time"

raised = chebyshev_approximation(lambda _x: 1 / 0, [-1, 1], 2)
assert not raised.success and raised.status == "callback_error"
assert "non_replayable_callback" in [item.code for item in raised.diagnostics]

nonfinite = chebyshev_approximation(
    lambda x: float("inf") if x > 0.0 else 0.0,
    [-1, 1],
    4,
)
assert not nonfinite.success and nonfinite.status == "nonfinite_evaluation"

unresolved = chebyshev_approximation(math.exp, [-1, 1], 2, tolerance=1e-12)
assert not unresolved.success and unresolved.status == "validation_failed"
assert not unresolved.validation.passed

trace_budget = ResourceBudget(
    max_iterations=200,
    max_evaluations=256,
    max_trace_events=4,
    max_trace_bytes=4096,
)
truncated = interpolate(
    [float(i) for i in range(20)],
    [math.sin(i) for i in range(20)],
    resource_budget=trace_budget,
    trace="iterations",
)
assert truncated.trace.truncated
assert len(truncated.trace.events) <= 4

print("approximation numerical laboratory passed")
`;

test("approximation contracts and failure corpus agree in CPython", () => {
  assert.equal(runCPython(witness), "approximation numerical laboratory passed");
});

test("approximation contracts and failure corpus run in Sage.js", () => {
  assert.equal(runSagejs(witness), "approximation numerical laboratory passed");
});

test("SciPy, NumPy, and mpmath differential oracle corpus agrees", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(
    run(executable, ["-I", join(__dirname, "differential_oracles.py")]),
    "approximation differential oracles passed",
  );
});
