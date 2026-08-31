#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");
const corpus = readFileSync(join(__dirname, "corpus.json"), "utf8");

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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-spectral-"));
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
  const executable =
    process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
from sagejs.numerics.spectral import (
    CSRMatrix,
    capabilities,
    convolve,
    fft,
    general_eigen,
    ifft,
    sparse_eigen,
    sparse_solve,
    svd,
    symmetric_eigen,
)

corpus = json.loads(${JSON.stringify(corpus)})

def z(value):
    if isinstance(value, list):
        return complex(value[0], value[1])
    return complex(value)

def matrix(record):
    return [[z(value) for value in row] for row in record]

def close(left, right, tolerance=1e-8):
    return abs(left - right) <= tolerance * max(1.0, abs(left), abs(right))

def match_values(actual, expected):
    remaining = list(expected)
    for value in actual:
        best = min(range(len(remaining)), key=lambda index: abs(value - remaining[index]))
        assert close(value, remaining.pop(best), 1e-7)
    assert not remaining

for case in corpus["dense_eigen"]:
    if case["kind"] == "symmetric":
        result = symmetric_eigen(matrix(case["matrix"]), trace="iterations")
    else:
        result = general_eigen(matrix(case["matrix"]), trace="iterations")
    assert result.success, (case["id"], result.status, result.validation.to_dict())
    match_values(
        [z(value) for value in result.value["eigenvalues"]],
        [z(value) for value in case["expected_eigenvalues"]],
    )
    record = result.to_dict()
    assert record["domain_payload"]["classification"] == case["classification"]
    assert result.validation.passed and result.validation.residual is not None
    json.loads(result.to_json())

for case in corpus["svd"]:
    result = svd(matrix(case["matrix"]), trace="iterations")
    assert result.success, (case["id"], result.status, result.validation.to_dict())
    assert len(result.value["singular_values"]) == len(case["expected_singular_values"])
    for actual, expected in zip(result.value["singular_values"], case["expected_singular_values"]):
        assert close(actual, expected, 1e-8)
    assert result.to_dict()["domain_payload"]["classification"] == case["classification"]

for case in corpus["fft"]:
    samples = [z(value) for value in case["samples"]]
    result = fft(samples, trace="iterations")
    assert result.success, (case["id"], result.status, result.validation.to_dict())
    inverse = ifft([z(value) for value in result.value])
    assert inverse.success
    for actual, expected in zip(inverse.value, samples):
        assert close(z(actual), expected, 1e-8)
    if "expected" in case:
        for actual, expected in zip(result.value, case["expected"]):
            assert close(z(actual), z(expected), 1e-8)
    assert result.to_dict()["domain_payload"]["classification"] == case["classification"]

for case in corpus["convolution"]:
    result = convolve(
        [z(value) for value in case["left"]],
        [z(value) for value in case["right"]],
        mode=case["mode"],
        method=case["method"],
        trace="iterations",
    )
    assert result.success, (case["id"], result.status, result.validation.to_dict())
    if "expected" in case:
        for actual, expected in zip(result.value, case["expected"]):
            assert close(z(actual), z(expected), 1e-8)

for case in corpus["sparse"]:
    operator = CSRMatrix.from_dense(matrix(case["matrix"]))
    if case["operation"] == "solve":
        result = sparse_solve(
            operator,
            [z(value) for value in case["right_hand_side"]],
            method=case["method"],
            trace="iterations",
        )
    else:
        result = sparse_eigen(operator, trace="iterations")
    assert result.success, (case["id"], result.status, result.validation.to_dict())
    assert result.to_dict()["domain_payload"]["classification"] == case["classification"]

# Metamorphic relations exercise semantics without sharing an implementation
# with the algorithm under test.
hermitian = symmetric_eigen([[2.0, 1.0], [1.0, 3.0]])
shifted_hermitian = symmetric_eigen([[9.0, 1.0], [1.0, 10.0]])
assert hermitian.success and shifted_hermitian.success
for actual, expected in zip(
    shifted_hermitian.value["eigenvalues"], hermitian.value["eigenvalues"]
):
    assert close(actual, expected + 7.0, 1e-9)

general = general_eigen([[1.0, 2.0], [0.0, 3.0]])
similar_general = general_eigen([[1.0, 4.0], [0.0, 3.0]])
assert general.success and similar_general.success
match_values(
    [z(value) for value in general.value["eigenvalues"]],
    [z(value) for value in similar_general.value["eigenvalues"]],
)
repeated_diagonalizable = general_eigen([[2.0, 0.0], [0.0, 2.0]])
assert repeated_diagonalizable.success

base_svd = svd([[1.0, -2.0], [3.0, 4.0], [-1.0, 0.5]])
scaled_svd = svd([[-3.0, 6.0], [-9.0, -12.0], [3.0, -1.5]])
assert base_svd.success and scaled_svd.success
for actual, expected in zip(
    scaled_svd.value["singular_values"], base_svd.value["singular_values"]
):
    assert close(actual, 3.0 * expected, 1e-8)

fft_left = [1.0 + 0.5j, -2.0, 3.0j, 0.25, -1.0]
fft_right = [-0.5j, 1.5, 2.0, -1.0j, 4.0]
fft_sum = fft([fft_left[index] + fft_right[index] for index in range(5)])
fft_left_result = fft(fft_left)
fft_right_result = fft(fft_right)
assert fft_sum.success and fft_left_result.success and fft_right_result.success
for index in range(5):
    assert close(
        z(fft_sum.value[index]),
        z(fft_left_result.value[index]) + z(fft_right_result.value[index]),
        1e-8,
    )
orthogonal_fft = fft(fft_left, norm="ortho")
orthogonal_inverse = ifft([z(value) for value in orthogonal_fft.value], norm="ortho")
assert orthogonal_fft.success and orthogonal_inverse.success
for actual, expected in zip(orthogonal_inverse.value, fft_left):
    assert close(z(actual), expected, 1e-8)

convolution_left = [1.0 + 1.0j, 2.0, -0.5]
convolution_right = [3.0, -1.0j]
left_right = convolve(convolution_left, convolution_right, method="direct")
right_left = convolve(convolution_right, convolution_left, method="fft")
assert left_right.success and right_left.success
for actual, expected in zip(left_right.value, right_left.value):
    assert close(z(actual), z(expected), 1e-8)

sparse_operator = CSRMatrix.from_coo(
    [0, 0, 0, 1, 1],
    [0, 0, 1, 0, 1],
    [2.0, 2.0, 1.0, 1.0, 3.0],
    (2, 2),
)
assert sparse_operator.to_dict()["data"] == [4.0, 1.0, 1.0, 3.0]
sparse_base = sparse_solve(sparse_operator, [1.0, 2.0], method="cg")
sparse_scaled = sparse_solve(sparse_operator, [-3.0, -6.0], method="cg")
assert sparse_base.success and sparse_scaled.success
for actual, expected in zip(sparse_scaled.value, sparse_base.value):
    assert close(z(actual), -3.0 * z(expected), 1e-8)

# A tiny individual eigenpair residual is insufficient evidence for a usable
# nonsymmetric eigensystem. The independent basis witness must fail closed.
for separation in (0.0, 1e-12, 1e-10):
    unsafe = general_eigen([[1.0, 1.0], [0.0, 1.0 + separation]])
    assert not unsafe.success and unsafe.status == "validation_failed"
    assert unsafe.value is None
    checks = {
        check["kind"]: check for check in unsafe.validation.to_dict()["checks"]
    }
    assert checks["eigenpair_backward_residual"]["passed"]
    assert not checks["eigenbasis_reciprocal_condition"]["passed"]
    assert any(
        diagnostic.to_dict()["code"] == "ill_conditioned"
        for diagnostic in unsafe.diagnostics
    )

records = capabilities()
assert records["schema_version"] == 1
for record in records["operations"].values():
    assert record["classification"] in ("faithful", "translated", "extension", "unsupported")
for record in records["unsupported"]:
    assert record["classification"] == "unsupported" and record["reason"]
unsupported_basis = capabilities("general_eigen_defective_or_near_defective_basis")
assert unsupported_basis["unsupported"][0]["classification"] == "unsupported"

cancelled = sparse_eigen(
    CSRMatrix.from_dense([[4.0, 1.0], [1.0, 3.0]]),
    cancel=lambda: True,
)
assert not cancelled.success and cancelled.status == "cancelled"
assert not cancelled.validation.passed

limited = fft([1.0] * 16, max_iterations=1)
assert not limited.success and limited.status == "maximum_iterations"
assert not limited.validation.passed

truncated = fft(list(range(64)), trace="iterations", max_trace_events=4)
assert truncated.success and truncated.trace.truncated
assert len(truncated.trace.events) <= 4

try:
    sparse_eigen(CSRMatrix.from_dense([[2.0, 0.0], [0.0, 1.0]]), k=2)
    raise AssertionError("unsupported k=2 request was accepted")
except NotImplementedError:
    pass

try:
    symmetric_eigen([[1.0, 2.0], [0.0, 1.0]])
    raise AssertionError("non-Hermitian symmetric request was accepted")
except ValueError:
    pass

try:
    fft([1.0, 2.0, 3.0], max_points=4)
    raise AssertionError("FFT workspace cap was ignored")
except ValueError:
    pass

try:
    svd([[1.0, 2.0], [3.0, 4.0]], max_matrix_elements=3)
    raise AssertionError("dense allocation cap was ignored")
except ValueError:
    pass

try:
    sparse_solve([[2.0, 1.0], [0.0, 2.0]], [1.0, 1.0], method="cg")
    raise AssertionError("CG accepted a nonsymmetric operator")
except ValueError:
    pass

try:
    sparse_eigen([[2.0, 1.0], [0.0, 2.0]])
    raise AssertionError("sparse Hermitian restriction was ignored")
except ValueError:
    pass

general_cancelled = general_eigen(
    [[3.0, -1.0, 2.0], [2.0, 5.0, -5.0], [-2.0, -3.0, 7.0]],
    cancel=lambda: True,
)
assert not general_cancelled.success and general_cancelled.status == "cancelled"

print("spectral numerical laboratory passed")
`;

test("spectral corpus and evidence contracts agree in CPython", () => {
  assert.equal(runCPython(witness), "spectral numerical laboratory passed");
});

test("spectral corpus and evidence contracts run in Sage.js", () => {
  assert.equal(runSagejs(witness), "spectral numerical laboratory passed");
});
