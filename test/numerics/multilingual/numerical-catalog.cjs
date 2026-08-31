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

const catalogWitness = String.raw`
import collections.abc, hashlib, json, math, re, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.numerics.frontends import (
    FRONTEND_LANGUAGES,
    UnsupportedFrontendError,
    create_frontend_registry,
)

registry = create_frontend_registry()
keys = {operation.key for operation in registry.operations()}
assert len(keys) == 22
for expected in (
    "linear_algebra:linear_solve:v1",
    "linear_algebra:least_squares:v1",
    "spectral:general_eigen:v1",
    "approximation:cubic_spline:v1",
    "integration:definite_integral:v1",
    "optimization:minimize:v1",
    "nonlinear_systems:nonlinear_system:v1",
    "least_squares:nonlinear_least_squares:v1",
    "fitting:linear_fit:v1",
    "ode:initial_value_problem:v1",
    "statistics:linear_regression:v1",
    "sweeps:parameter_sweep:v1",
):
    assert expected in keys

# Four natural spellings lower to exactly one source-independent semantic
# request. Source provenance is intentionally not part of the digest.
matrix = [[3, 1], [1, 2]]
right = [9, 8]
equivalent = [
    registry.lower("sage", "solve", matrix, right),
    registry.lower("python-scipy", "numpy.linalg.solve", matrix, right),
    registry.lower("matlab", "linsolve", matrix, right),
    registry.lower("wolfram", "LinearSolve", matrix, right),
]
assert len({intent.digest for intent in equivalent}) == 1

cases = [
    ("sage", "solve", (matrix, right), {}),
    ("matlab", "lsqminnorm", ([[1, 0], [0, 1], [1, 1]], [1, 2, 3]), {}),
    ("sage", "eigh", ([[2, 1], [1, 2]],), {}),
    ("matlab", "eig", ([[0, -1], [1, 0]],), {}),
    ("sage", "svd", ([[1, 2], [3, 4]],), {}),
    ("wolfram", "Fourier", ([1, 2, 3],), {}),
    ("matlab", "conv", ([1, 2], [3, 4]), {}),
    ("sage", "interpolate", ([0, 1, 2], [1, 2, 5]), {}),
    ("matlab", "spline", ([0, 1, 2], [1, 2, 5]), {}),
    ("wolfram", "NIntegrate", (lambda x: x*x, 0, 1), {"expression": "x^2"}),
    ("matlab", "fminbnd", (lambda x: (x-2)**2, 0, 4), {"expression": "(x-2)^2"}),
    ("wolfram", "FindMinimum", (lambda p: (p[0]-1)**2, [0]), {"expression": "(x0-1)^2"}),
    ("matlab", "fsolve", (lambda p: [p[0]**2-2], [1]), {"expression": ["x0^2-2"]}),
    ("sage", "nonlinear_least_squares", (lambda p: [p[0]-2], [0]), {"expression": ["x0-2"]}),
    ("matlab", "polyfit", ([0, 1, 2], [1, 3, 5]), {}),
    ("matlab", "ode45", (lambda t, y: [y[0]], [0, 0.25], [1]), {"expression": ["y0"]}),
    ("wolfram", "SageJSDescribe", ([1, 2, 3, 4],), {}),
    ("matlab", "ttest", ([1, 2, 4, 5], 2), {}),
    ("wolfram", "TwoSampleTTest", ([1, 2, 4], [2, 3, 5]), {}),
    ("matlab", "fitlm", ([0, 1, 2, 3], [1, 3, 5, 7]), {}),
    ("sage", "run_parameter_sweep", ([1, 2, 3], lambda p, c: p*p), {"expression": "parameter^2"}),
]

for language, name, arguments, options in cases:
    intent = registry.lower(language, name, *arguments, **options)
    result = registry.execute(intent)
    assert result.success, (name, result.status, result.to_dict())
    assert result.frontend_intent.digest == intent.digest
    assert result.to_dict()["frontend_digest"] == intent.digest
    assert result.value is not None

# Every claimed target has a checked, edit-detecting emitted-source round trip.
# Targets whose result/normalization conventions are not yet qualified fail
# with one structured unsupported_target diagnostic.
for language, name, arguments, options in cases:
    intent = registry.lower(language, name, *arguments, **options)
    for target in FRONTEND_LANGUAGES:
        try:
            source = registry.emit(intent, target)
        except UnsupportedFrontendError as error:
            assert error.diagnostic.code == "unsupported_target"
            continue
        reconstructed = registry.parse(source, target, intent.operation_ref)
        assert reconstructed.digest == intent.digest
        changed = source.replace("result =", "result  =", 1)
        try:
            registry.parse(changed, target, intent.operation_ref)
            raise AssertionError("edited generated source unexpectedly parsed")
        except UnsupportedFrontendError as error:
            assert error.diagnostic.code == "semantic_mismatch"

opaque = registry.lower("matlab", "integral", lambda x: x, 0, 1)
try:
    registry.emit(opaque, "sage")
    raise AssertionError("opaque callback unexpectedly emitted")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "non_replayable_intent"

optioned = registry.lower("matlab", "conv", [1], [2], mode="same")
try:
    registry.emit(optioned, "python-scipy")
    raise AssertionError("unqualified option unexpectedly emitted")
except UnsupportedFrontendError as error:
    assert error.diagnostic.code == "unsupported_option"

print("foundational numerical catalog witness passed")
`;

test("foundational catalog executes and round-trips in CPython", () => {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(
    run(executable, ["-I", "-c", catalogWitness]),
    "foundational numerical catalog witness passed",
  );
});

const runtimeWitness = String.raw`
import collections.abc, hashlib, json, math, re, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

import matlab
import wolfram

solution = matlab.linsolve([[3, 1], [1, 2]], [9, 8])
assert abs(solution[0] - 2) < 1e-12 and abs(solution[1] - 3) < 1e-12
assert matlab.conv([1, 2], [3, 4]) == [3, 10, 8]
summary = wolfram.SageJSDescribe([1, 2, 3, 4])
assert summary["count"] == 4
regression = wolfram.LinearModelFitData([0, 1, 2], [1, 3, 5])
assert abs(regression["slope"] - 2) < 1e-12
assert matlab.arrayfun(lambda value: value*value, [1, 2, 3]) == [1, 4, 9]
assert wolfram.Map(lambda value: value+1, [1, 2, 3]) == [2, 3, 4]
try:
    matlab.polyfit([0, 1], [1, 2], 2)
    raise AssertionError("unqualified polynomial fit unexpectedly executed")
except NotImplementedError:
    pass
print("multilingual runtime entrypoint witness passed")
`;

test("MATLAB and Wolfram runtime entrypoints share canonical solvers", () => {
  const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-catalog-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, runtimeWitness);
    assert.equal(
      run(process.execPath, [executable, "--python", filename]),
      "multilingual runtime entrypoint witness passed",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
