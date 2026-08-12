#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-public-matvec-"));
  try {
    const path = resolve(directory, "witness.sage");
    writeFileSync(path, source);
    const result = spawnSync(process.execPath, [sagejs, path], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, ...environment },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
def scalar_right(A, v):
    return vector(A.base_ring(), [
        sum(A[row, column] * v[column] for column in range(A.ncols()))
        for row in range(A.nrows())
    ])


def scalar_left(v, A):
    return vector(A.base_ring(), [
        sum(v[row] * A[row, column] for row in range(A.nrows()))
        for column in range(A.ncols())
    ])


cases = [
    (ZZ, [1, -2, 3, 4, 5, -6], [7, -8, 9], [10, -11]),
    (QQ, [1/2, -2/3, 3/5, 4/7, 5/11, -6/13],
         [7/17, -8/19, 9/23], [10/29, -11/31]),
    (GF(2), [1, 0, 1, 1, 1, 0], [1, 1, 0], [0, 1]),
    (GF(7), [1, 2, 3, 4, 5, 6], [7, 8, 9], [10, 11]),
]
for base, entries, right_entries, left_entries in cases:
    A = matrix(base, 2, 3, entries)
    right = vector(base, right_entries)
    left = vector(base, left_entries)
    right_result = A * right
    left_result = left * A
    assert right_result == scalar_right(A, right)
    assert left_result == scalar_left(left, A)
    assert right_result.parent() == VectorSpace(base, 2)
    assert left_result.parent() == VectorSpace(base, 3)
    assert right_result.is_mutable()
    assert left_result.is_mutable()
    assert right_result is not right and left_result is not left

for matrix_base, vector_base, result_base in [
    (ZZ, QQ, QQ),
    (QQ, ZZ, QQ),
    (GF(7), ZZ, GF(7)),
    (ZZ, GF(7), GF(7)),
    (GF(2), ZZ, GF(2)),
]:
    A = matrix(matrix_base, 2, 3, [1, 2, 3, 4, 5, 6])
    right = vector(vector_base, [7, 8, 9])
    left = vector(vector_base, [10, 11])
    assert (A * right).base_ring() == result_base
    assert (left * A).base_ring() == result_base
    converted = A.change_ring(result_base)
    assert A * right == scalar_right(converted, right.change_ring(result_base))
    assert left * A == scalar_left(left.change_ring(result_base), converted)

huge = 2^65537 + 123
A = matrix(ZZ, 2, 2, [huge, -huge, 3, 5])
v = vector(ZZ, [huge + 1, 2])
assert A * v == scalar_right(A, v)
assert v * A == scalar_left(v, A)

for rows, columns in [(0, 0), (0, 3), (3, 0)]:
    for base in [ZZ, QQ, GF(2), GF(7)]:
        A = matrix(base, rows, columns)
        right = vector(base, [0] * columns)
        left = vector(base, [0] * rows)
        right_result = A * right
        left_result = left * A
        assert len(right_result) == rows
        assert len(left_result) == columns
        assert right_result.is_mutable()
        assert left_result.is_mutable()

for invalid in [
    lambda: matrix(ZZ, 1, 2, [1, 2]) * vector(ZZ, [1]),
    lambda: vector(ZZ, [1]) * matrix(ZZ, 2, 1, [1, 2]),
]:
    try:
        invalid()
        raise AssertionError("incompatible product succeeded")
    except TypeError as error:
        assert str(error) == "matrix and vector dimensions are incompatible"

try:
    matrix(GF(7), 1, 2, [1, 2]) * vector(GF(2), [1, 0])
    raise AssertionError("distinct finite fields multiplied")
except TypeError:
    pass

try:
    vector(GF(2), [1]) * matrix(GF(7), 1, 2, [1, 2])
    raise AssertionError("distinct finite fields multiplied on the left")
except TypeError:
    pass

print("public-matrix-vector-ok")
`;

assert.equal(runSage(behavior), "public-matrix-vector-ok");
assert.equal(
  runSage(behavior, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-matrix-vector-ok",
);

const tracedBehavior = String.raw`
cases = [
    (ZZ, [1, 2, 3, 4], [5, 6]),
    (QQ, [1/2, 2/3, 3/4, 4/5], [5/6, 6/7]),
    (GF(2), [1, 0, 1, 1], [1, 1]),
    (GF(7), [1, 2, 3, 4], [5, 6]),
]
for base, entries, vector_entries in cases:
    A = matrix(base, 2, 2, entries)
    v = vector(base, vector_entries)
    assert A * v == vector(base, [
        A[0, 0] * v[0] + A[0, 1] * v[1],
        A[1, 0] * v[0] + A[1, 1] * v[1],
    ])
    assert v * A == vector(base, [
        v[0] * A[0, 0] + v[1] * A[1, 0],
        v[0] * A[0, 1] + v[1] * A[1, 1],
    ])
print("public-matrix-vector-trace-ok")
`;

function assertTraceEnabled(environment = {}) {
  const output = runSage(tracedBehavior, {
    SAGEJS_NATIVE_TRACE: "1",
    ...environment,
  });
  assert.match(output, /Matrix\.matrix_vector Integer Ring 2x2/);
  assert.match(output, /Matrix\.vector_matrix Integer Ring 2x2/);
  assert.match(output, /Matrix\.matrix_vector Rational Field 2x2/);
  assert.match(output, /Matrix\.vector_matrix Rational Field 2x2/);
  assert.match(output, /Matrix\.matrix_vector Finite Field of size 2 2x2/);
  assert.match(output, /Matrix\.vector_matrix Finite Field of size 2 2x2/);
  assert.match(output, /Matrix\.matrix_vector Finite Field of size 7 2x2/);
  assert.match(output, /Matrix\.vector_matrix Finite Field of size 7 2x2/);
  assert.match(output, /public-matrix-vector-trace-ok$/);
}

assertTraceEnabled();
assertTraceEnabled({ SAGEJS_NATIVE_DISABLE: "1" });

const directFfi = String.raw`
import sagejs.runtime as runtime
import sagejs.ffi.flint as ffi

matrix_value = ffi.fmpz_matrix(2, 3)
for index, value in enumerate([1, 2, 3, 4, 5, 6]):
    ffi.fmpz_matrix_set_entry(matrix_value, index // 3, index % 3, value)
vector_region = ffi.FlintByteRegion.from_bytes(
    runtime.exact_integer_values_to_packed_bytes([7, 8, 9]))
try:
    answer = ffi.fmpz_matrix_mul_vector(matrix_value, vector_region)
    assert runtime.exact_integer_values_from_packed_bytes(
        answer.take_bytes(), 2) == [50, 122]
finally:
    vector_region.close()
    matrix_value.close()
print("direct-matrix-vector-ffi-ok")
`;

assert.equal(runSage(directFfi), "direct-matrix-vector-ffi-ok");

console.log("public matrix-vector products passed");
