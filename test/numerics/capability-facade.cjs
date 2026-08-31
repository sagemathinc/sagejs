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

const root = join(__dirname, "../..");

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

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-capability-facade-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
import json

from sagejs.numerics import capabilities, describe, plan, supports
from sagejs.numerics.approximation import polynomial_roots_problem
from sagejs.numerics.integration import integration_problem
from sagejs.numerics.linear_algebra import solve
from sagejs.numerics.ode import ode_problem
from sagejs.numerics.optimization import least_squares_problem
from sagejs.numerics.roots import root_problem
from sagejs.numerics.spectral import fft
from sagejs.numerics.statistics import describe as statistics_describe

registry = capabilities()
expected_domains = {
    "roots",
    "approximation",
    "integration",
    "linear_algebra",
    "optimization",
    "ode",
    "spectral",
    "statistics",
}
assert set(registry["domains"]) == expected_domains
index = registry["operation_index"]
for name in (
    "roots.scalar_root",
    "approximation.polynomial_roots",
    "integration.definite_integral",
    "linear_algebra.linear_solve",
    "optimization.nonlinear_least_squares",
    "ode.initial_value_problem",
    "spectral.fourier_transform",
    "statistics.descriptive_statistics",
):
    assert name in index, name

assert describe("scalar_root")["methods"]["brent"]["backend"] == "ordinary-python"
assert describe("polynomial_roots", "approximation")["maximum_degree"] == 64
assert describe("approximation.polynomial_roots")["maximum_degree"] == 64
assert set(capabilities("least_squares")["operations"]) == set(
    capabilities("optimization")["operations"]
)

# Detached discovery must not mutate a later registry call.
registry["domains"]["roots"]["operations"]["scalar_root"]["methods"]["brent"]["backend"] = "changed"
assert capabilities("roots")["operations"]["scalar_root"]["methods"]["brent"]["backend"] == "ordinary-python"

calls = {"root": 0, "integral": 0, "least_squares": 0, "ode": 0}

def root_callback(x):
    calls["root"] += 1
    return x

def integral_callback(x):
    calls["integral"] += 1
    return x

def residual_callback(x):
    calls["least_squares"] += 1
    return [x[0] - 1.0]

def ode_callback(t, y):
    calls["ode"] += 1
    return [y[0]]

problems = [
    root_problem(root_callback, -1.0, 1.0),
    polynomial_roots_problem([1.0, -3.0, 2.0]),
    integration_problem(integral_callback, 0.0, 1.0),
    least_squares_problem(residual_callback, [0.0]),
    ode_problem(ode_callback, [0.0, 1.0], [1.0]),
    solve([[2.0, 0.0], [0.0, 3.0]], [4.0, 9.0]).problem,
    fft([1.0, 2.0, 3.0, 4.0]).problem,
    statistics_describe([1.0, 2.0, 3.0]).problem,
]
for problem in problems:
    assert supports(problem), (problem.domain, problem.operation)
    resolved = plan(problem)
    assert resolved.problem.digest == problem.digest

assert calls == {"root": 0, "integral": 0, "least_squares": 0, "ode": 0}
print(json.dumps({"domains": sorted(expected_domains), "operation_count": len(index)}))
`;

test("the numerical capability facade is coherent in CPython", () => {
  const result = JSON.parse(runCPython(witness));
  assert.equal(result.domains.length, 8);
  assert.ok(result.operation_count >= 30);
});

test("the same capability and planning facade runs in Sage.js", () => {
  const result = JSON.parse(runSagejs(witness));
  assert.equal(result.domains.length, 8);
  assert.ok(result.operation_count >= 30);
});
