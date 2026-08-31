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
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-stiff-ode-"));
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
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import math
import time
from sagejs.numerics.model import STATUS_CODES
from sagejs.numerics.ode import OdeEvent, ode_capabilities, ode_problem, plan_ode, solve_ivp, solve_ode_problem
from sagejs.numerics.ode.rosenbrock import rosenbrock4_step

capabilities = ode_capabilities()
stiff_capability = capabilities["implemented_methods"]["rosenbrock4"]
assert stiff_capability["family"] == "kaps_rentrop_rosenbrock_4_3"
assert stiff_capability["stiff"] is True
assert stiff_capability["automatic_selection"] is False
assert plan_ode(ode_problem(lambda t, y: [y[0]], (0.0, 1.0), [1.0])).method == "rk45"

override_problem = ode_problem(lambda t, y: [-y[0]], (0.0, 1.0), [1.0])
override_result = solve_ode_problem(override_problem, method="rosenbrock4")
assert override_result.success
assert override_result.evidence["dense_defect"]["acceptance_model"] == "implicit_euler_linearized_resolvent"

reverse_override_problem = ode_problem(
    lambda t, y: [-y[0]],
    (0.0, 1.0),
    [1.0],
    method="rosenbrock4",
)
reverse_override = solve_ode_problem(reverse_override_problem, method="rk45")
assert reverse_override.success
assert reverse_override.evidence["dense_defect"]["acceptance_model"] == "step_width_scaled_derivative_defect"

def scalar_step(step):
    state = [1.0]
    derivative = [1.0]
    time_value = 0.0
    count = int(round(1.0 / step))
    for _ in range(count):
        state, derivative, error, dense, residual = rosenbrock4_step(
            lambda t, y: [y[0]],
            lambda t, y, f: [[1.0]],
            lambda t, y, f, h: [0.0],
            time_value,
            state,
            derivative,
            step,
        )
        assert residual <= 1e-10
        time_value += step
    return abs(state[0] - math.e)

coarse_error = scalar_step(0.1)
fine_error = scalar_step(0.05)
assert coarse_error / fine_error > 12.0

def robertson(t, y):
    y1, y2, y3 = y
    return [
        -0.04 * y1 + 1e4 * y2 * y3,
        0.04 * y1 - 1e4 * y2 * y3 - 3e7 * y2 * y2,
        3e7 * y2 * y2,
    ]

def robertson_jacobian(t, y):
    y1, y2, y3 = y
    return [
        [-0.04, 1e4 * y3, 1e4 * y2],
        [0.04, -1e4 * y3 - 6e7 * y2, -1e4 * y2],
        [0.0, 6e7 * y2, 0.0],
    ]

supplied = solve_ivp(
    robertson,
    (0.0, 1.0),
    [1.0, 0.0, 0.0],
    method="rosenbrock4",
    jacobian=robertson_jacobian,
    rtol=1e-5,
    atol=1e-10,
    max_validation_evaluations=20,
)
finite_difference = solve_ivp(
    robertson,
    (0.0, 1.0),
    [1.0, 0.0, 0.0],
    method="rosenbrock4",
    rtol=1e-5,
    atol=1e-10,
    max_validation_evaluations=20,
)
assert supplied.success and finite_difference.success
assert max(abs(supplied.value[i] - finite_difference.value[i]) for i in range(3)) < 2e-7
assert abs(sum(supplied.value) - 1.0) < 2e-12
assert supplied.evidence["dense_defect"]["passed"]
assert supplied.evidence["dense_defect"]["acceptance_model"] == "implicit_euler_linearized_resolvent"
assert supplied.evidence["dense_defect"]["acceptance_metric"] <= supplied.evidence["dense_defect"]["acceptance_threshold"]
supplied_measurements = supplied.to_dict()["measurements"]
finite_measurements = finite_difference.to_dict()["measurements"]
assert supplied_measurements["jacobian_evaluations"] > 0
assert supplied_measurements["finite_difference_jacobian_evaluations"] == 0
assert finite_measurements["finite_difference_jacobian_evaluations"] > 0
assert supplied_measurements["max_normalized_linear_solve_residual"] <= 1e-10

decay_event = solve_ivp(
    lambda t, y: [-1000.0 * y[0]],
    (0.0, 0.01),
    [1.0],
    method="rosenbrock4",
    jacobian=lambda t, y: [[-1000.0]],
    events=OdeEvent(
        lambda t, y: y[0] - 0.5,
        terminal=True,
        direction=-1,
        value_tolerance=1e-9,
    ),
    rtol=1e-7,
    atol=1e-10,
)
assert decay_event.success and decay_event.termination_reason == "terminal_event"
assert abs(decay_event.trajectory.final_time - math.log(2.0) / 1000.0) < 2e-10
assert decay_event.events[0].residual_passed

singular = solve_ivp(
    lambda t, y: [0.0],
    (0.0, 1.0),
    [0.0],
    method="rosenbrock4",
    jacobian=lambda t, y: [[4.0]],
    first_step=1.0,
    max_step=1.0,
    max_linear_solve_failures=1,
)
assert not singular.success and singular.status == "backend_failure"
assert singular.termination_reason == "singular_linear_system"

workspace_calls = [0]
def workspace_rhs(t, y):
    workspace_calls[0] += 1
    return [0.0 for _ in y]

workspace_limited = solve_ivp(
    workspace_rhs,
    (0.0, 1.0),
    [0.0 for _ in range(10)],
    method="rosenbrock4",
    max_workspace_bytes=1,
)
assert not workspace_limited.success and workspace_limited.termination_reason == "maximum_workspace_bytes"
assert workspace_calls[0] == 0

evaluation_limited = solve_ivp(
    robertson,
    (0.0, 1.0),
    [1.0, 0.0, 0.0],
    method="rosenbrock4",
    max_evaluations=3,
)
assert not evaluation_limited.success and evaluation_limited.status == "maximum_evaluations"

cancel_after_jacobian = [False]
def cancelling_jacobian(t, y):
    cancel_after_jacobian[0] = True
    return [[-1.0]]

cancelled = solve_ivp(
    lambda t, y: [-y[0]],
    (0.0, 1.0),
    [1.0],
    method="rosenbrock4",
    jacobian=cancelling_jacobian,
    cancel=lambda: cancel_after_jacobian[0],
)
assert not cancelled.success and cancelled.status == "cancelled"

def slow_jacobian(t, y):
    time.sleep(0.02)
    return [[-1.0]]

elapsed = solve_ivp(
    lambda t, y: [-y[0]],
    (0.0, 1.0),
    [1.0],
    method="rosenbrock4",
    jacobian=slow_jacobian,
    max_elapsed_ms=1,
)
expected_elapsed_status = "maximum_elapsed_time" if "maximum_elapsed_time" in STATUS_CODES else "backend_failure"
assert not elapsed.success and elapsed.status == expected_elapsed_status
assert elapsed.termination_reason == "maximum_elapsed_time"

print("stiff ODE laboratory passed")
`;

test("Rosenbrock4 order, stiff solve, budgets, events, and failures agree in CPython", () => {
  assert.equal(runCPython(witness), "stiff ODE laboratory passed");
});

test("Rosenbrock4 source path runs in Sage.js", () => {
  assert.equal(runSagejs(witness), "stiff ODE laboratory passed");
});
