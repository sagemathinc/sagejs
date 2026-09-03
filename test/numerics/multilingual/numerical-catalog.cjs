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
local_source_root = ${JSON.stringify(join(root, "src/lib"))}
sys.path.insert(0, local_source_root)

from sagejs.numerics.frontends import (
    FRONTEND_LANGUAGES,
    UnsupportedFrontendError,
    create_frontend_registry,
)

registry = create_frontend_registry()
keys = {operation.key for operation in registry.operations()}
assert len(keys) == 22
with open(
    ${JSON.stringify(join(root, "docs/numerical-computing/multilingual/support-matrix.json"))},
    encoding="utf-8",
) as support_file:
    support_ledger = json.load(support_file)
support_by_operation = {
    item["operation"]: item for item in support_ledger["operations"]
}
assert set(support_by_operation) == keys
for operation in registry.operations():
    adapter = registry.adapter(operation)
    documented = support_by_operation[operation.key]
    assert sorted(documented["registry"]) == sorted(adapter.aliases), operation.key
    assert sorted(documented["emit"]) == sorted(adapter.emitters), operation.key
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
    ("sage", "eig", ([[0, -1], [1, 0]],), {}),
    ("sage", "svd", ([[1, 2], [3, 4]],), {}),
    ("sage", "fft", ([1, 2, 3],), {}),
    ("matlab", "conv", ([1, 2], [3, 4]), {}),
    ("sage", "interpolate", ([0, 1, 2], [1, 2, 5]), {}),
    ("sage", "cubic_spline", ([0, 1, 2], [1, 2, 5]), {}),
    ("wolfram", "NIntegrate", (lambda x: x*x, 0, 1), {"expression": "x^2"}),
    ("matlab", "fminbnd", (lambda x: (x-2)**2, 0, 4), {"expression": "(x-2)^2"}),
    ("sage", "minimize", (lambda p: (p[0]-1)**2, [0]), {"expression": "(x0-1)^2"}),
    ("matlab", "fsolve", (lambda p: [p[0]**2-2], [1]), {"expression": ["x0^2-2"]}),
    ("sage", "nonlinear_least_squares", (lambda p: [p[0]-2], [0]), {"expression": ["x0-2"]}),
    ("matlab", "polyfit", ([0, 1, 2], [1, 3, 5]), {}),
    ("matlab", "ode45", (lambda t, y: [y[0]], [0, 0.25], [1]), {"expression": ["y0"]}),
    ("wolfram", "SageJSDescribe", ([1, 2, 3, 4],), {}),
    ("sage", "one_sample_t_test", ([1, 2, 4, 5], 2), {}),
    ("wolfram", "TwoSampleTTest", ([1, 2, 4], [2, 3, 5]), {}),
    ("sage", "linear_regression", ([0, 1, 2, 3], [1, 3, 5, 7]), {}),
    ("sage", "run_parameter_sweep", ([1, 2, 3], lambda p, c: p*p), {"expression": "parameter^2"}),
]

for language, name, arguments, options in cases:
    intent = registry.lower(language, name, *arguments, **options)
    result = registry.execute(intent)
    assert result.success, (name, result.status, result.to_dict())
    assert result.frontend_intent.digest == intent.digest
    assert result.to_dict()["frontend_digest"] == intent.digest
    assert result.value is not None

# Source option names normalize to real package keyword names rather than
# becoming inert metadata. These execute through the same public functions.
option_cases = [
    ("matlab", "lsqminnorm", ([[1, 0], [0, 1], [1, 1]], [1, 2, 3]), {"max_sweeps": 32}, "max_sweeps"),
    ("matlab", "eig_symmetric", ([[2, 1], [1, 2]],), {"MaxIterations": 40}, "max_iterations"),
    ("matlab", "svd", ([[1, 2], [3, 4]],), {"MaxIterations": 40}, "max_iterations"),
    ("matlab", "integral", (lambda x: x*x, 0, 1), {"AbsTol": 1e-9, "RelTol": 1e-9}, "absolute_tolerance"),
    ("matlab", "fminbnd", (lambda x: (x-2)**2, 0, 4), {"TolX": 1e-8}, "xtol"),
    ("sage", "interpolate", ([0, 1], [0, 1]), {"method": "linear"}, "method"),
]
for language, name, arguments, options, normalized_name in option_cases:
    intent = registry.lower(language, name, *arguments, **options)
    assert normalized_name in intent.options
    assert registry.execute(intent).success

# A recognized vendor name is not a license to execute a differently shaped
# canonical operation. These aliases are absent until their language contract
# has a qualified adapter.
for language, name, arguments in (
    ("matlab", "eig", ([[0, -1], [1, 0]],)),
    ("matlab", "fft", ([1, 2, 3],)),
    ("matlab", "griddedInterpolant", ([0, 1], [0, 1])),
    ("matlab", "ttest", ([1, 2, 3], 2)),
    ("matlab", "ttest2", ([1, 2], [2, 3])),
    ("wolfram", "Eigensystem", ([[2, 1], [1, 2]],)),
    ("wolfram", "Fourier", ([1, 2, 3],)),
    ("wolfram", "ListConvolve", ([1, 2], [3, 4])),
):
    try:
        registry.lower(language, name, *arguments)
        raise AssertionError("unsafe vendor alias unexpectedly lowered: " + name)
    except UnsupportedFrontendError as error:
        assert error.diagnostic.code == "unsupported_operation"

# Replayable callbacks are executable claims, not decorative source strings.
mismatched = registry.lower(
    "matlab", "integral", lambda x: x, 0, 1, expression="x^2"
)
mismatched_result = registry.execute(mismatched)
assert not mismatched_result.success
assert mismatched_result.status == "callback_error"

try:
    registry.lower(
        "matlab",
        "integral",
        lambda x: x,
        0,
        1,
        expression="x",
        parameters=("x", "unused"),
    )
    raise AssertionError("mismatched callback parameter count unexpectedly lowered")
except ValueError:
    pass

# Every claimed target has a checked, edit-detecting emitted-source round trip.
# Targets whose result/normalization conventions are not yet qualified fail
# with one structured unsupported_target diagnostic.
unsupported_targets = {
    "symmetric_eigen": {"matlab", "wolfram"},
    "general_eigen": {"matlab", "wolfram"},
    "singular_value_decomposition": {"matlab", "wolfram"},
    "convolution": {"wolfram"},
    "interpolation": {"matlab", "wolfram"},
    "cubic_spline": {"matlab", "wolfram"},
    "minimize": {"wolfram"},
    "nonlinear_system": {"wolfram"},
    "nonlinear_least_squares": {"wolfram"},
    "linear_fit": {"wolfram"},
    "initial_value_problem": {"wolfram"},
    "descriptive_statistics": {"matlab", "wolfram"},
    "one_sample_t_test": {"matlab", "wolfram"},
    "two_sample_t_test": {"matlab", "wolfram"},
    "linear_regression": {"matlab", "wolfram"},
    "parameter_sweep": {"matlab", "wolfram"},
}
for language, name, arguments, options in cases:
    intent = registry.lower(language, name, *arguments, **options)
    for target in FRONTEND_LANGUAGES:
        should_be_unsupported = target in unsupported_targets.get(
            intent.operation, set()
        )
        try:
            source = registry.emit(intent, target)
        except UnsupportedFrontendError as error:
            assert should_be_unsupported, (intent.operation, target)
            assert error.diagnostic.code == "unsupported_target"
            continue
        assert not should_be_unsupported, (intent.operation, target)
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

# Python/SciPy output is a standalone executable program, including NumPy
# when a portable expression renders np.exp/np.sin/etc.
replayable_integral = registry.lower(
    "python-scipy",
    "scipy.integrate.quad",
    lambda x: math.exp(-x),
    0,
    1,
    expression="exp(-x)",
)
python_source = registry.emit(replayable_integral, "python-scipy")
assert "import numpy as np" in python_source
sys.path.remove(local_source_root)
try:
    scope = {}
    exec(python_source, scope)
    assert abs(scope["result"] - (1.0 - math.exp(-1.0))) < 1e-10

    solve_source = registry.emit(equivalent[1], "python-scipy")
    solve_scope = {}
    exec(solve_source, solve_scope)
    assert max(abs(float(a) - b) for a, b in zip(solve_scope["result"], [2, 3])) < 1e-12
finally:
    sys.path.insert(0, local_source_root)

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
callback_types = []
matlab.arrayfun(
    lambda value: callback_types.append(isinstance(value, float)) or value,
    [1, 2, 3],
)
assert callback_types == [True, True, True]
matrix_sweep = matlab.arrayfun(lambda value: value*value, [[1, 2], [3, 4]])
assert matrix_sweep.tolist() == [[1, 4], [9, 16]]
assert wolfram.Map(lambda value: value+1, [1, 2, 3]) == [2, 3, 4]
for module, name in ((matlab, "linsolve"), (wolfram, "LinearSolve")):
    rich = module.numerical_result(name, [[1, 1], [2, 2]], [1, 2])
    assert not rich.success
    try:
        module.numerical_value(name, [[1, 1], [2, 2]], [1, 2])
        raise AssertionError("failed short numerical result unexpectedly escaped")
    except RuntimeError as error:
        assert "failed:" in str(error)
try:
    matlab.polyfit([0, 1], [1, 2], 2)
    raise AssertionError("unqualified polynomial fit unexpectedly executed")
except NotImplementedError:
    pass
for name, call in (
    ("matlab.eig", lambda: matlab.eig([[0, -1], [1, 0]])),
    ("matlab.fft", lambda: matlab.fft([1, 2, 3])),
    ("matlab.gridded_interpolant", lambda: matlab.gridded_interpolant([0, 1], [0, 1])),
    ("matlab.ttest", lambda: matlab.ttest([1, 2, 3], 2)),
    ("matlab.ttest2", lambda: matlab.ttest2([1, 2], [2, 3])),
    ("wolfram.Eigensystem", lambda: wolfram.Eigensystem([[2, 1], [1, 2]])),
    ("wolfram.GeneralEigensystem", lambda: wolfram.GeneralEigensystem([[0, -1], [1, 0]])),
    ("wolfram.SingularValueDecomposition", lambda: wolfram.SingularValueDecomposition([[1, 2], [3, 4]])),
    ("wolfram.Fourier", lambda: wolfram.Fourier([1, 2, 3])),
    ("wolfram.ListConvolve", lambda: wolfram.ListConvolve([1, 2], [3, 4])),
):
    try:
        call()
        raise AssertionError("unsafe public alias unexpectedly executed: " + name)
    except NotImplementedError as error:
        assert error.diagnostic.code == "unsupported_operation"
try:
    matlab.conv([[1, 2], [3, 4]], [1, 2])
    raise AssertionError("matrix convolution unexpectedly flattened")
except TypeError as error:
    assert "vector, not a matrix" in str(error)
try:
    matlab.fminsearch(lambda point: point[0] ** 2, [[1, 2], [3, 4]])
    raise AssertionError("matrix initial point unexpectedly flattened")
except TypeError as error:
    assert "vector, not a matrix" in str(error)
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
