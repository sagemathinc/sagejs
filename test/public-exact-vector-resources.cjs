#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function run(executable, source, environment = {}, argumentsBeforePath = []) {
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-exact-vector-"));
  try {
    const path = resolve(directory, "witness.sage");
    writeFileSync(path, source);
    const result = spawnSync(executable, [...argumentsBeforePath, path], {
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

function runSagejs(source, environment = {}) {
  return run(process.execPath, source, environment, [sagejs]);
}

const semantics = String.raw`
def check(base, left_entries, right_entries, scalar, expected_dot):
    left = vector(base, left_entries)
    right = vector(base, right_entries)
    original = left.list()
    copied = left.list()
    copied[0] = base(999)
    assert left.list() == original
    assert list(iter(left)) == original
    assert left[0] == original[0]
    assert left[-1] == original[-1]
    assert list(left[1:]) == original[1:]
    assert left + right == vector(base, [
        original[index] + right_entries[index]
        for index in range(len(left))])
    assert left - right == vector(base, [
        original[index] - right_entries[index]
        for index in range(len(left))])
    assert -left == vector(base, [-value for value in original])
    assert left * scalar == vector(base, [value * scalar for value in original])
    assert scalar * left == left * scalar
    assert left * right == expected_dot
    assert left.dot_product(right) == expected_dot
    assert left == vector(base, original)
    assert left != right
    left[-1] = scalar
    assert left[-1] == base(scalar)
    left.set_immutable()
    try:
        left[0] = 0
        raise AssertionError("immutable exact vector changed")
    except ValueError as error:
        assert str(error).startswith("vector is immutable;")


huge = 2^521 + 123456789
check(ZZ, [huge, -13, 7, 0], [3, 5, -11, 2], -17,
      3*huge - 142)
check(QQ, [huge/17, -13/19, 7/23, 0],
      [3/29, 5/31, -11/37, 2/41], -17/43,
      huge*3/(17*29) - 65/(19*31) - 77/(23*37))

z = vector(ZZ, [1, 2, 3])
q = vector(QQ, [1/2, 1/3, 1/5])
assert z + q == vector(QQ, [3/2, 7/3, 16/5])
assert z * q == 53/30
assert z.change_ring(QQ) == vector(QQ, [1, 2, 3])
assert vector(ZZ, []) + vector(ZZ, []) == vector(ZZ, [])
assert vector(QQ, []) * vector(QQ, []) == 0

A = matrix(ZZ, 2, 3, [1, 2, 3, 4, 5, 6])
v = vector(ZZ, [7, 8, 9])
assert A*v == vector(ZZ, [50, 122])
assert vector(ZZ, [10, 11])*A == vector(ZZ, [54, 75, 96])
B = matrix(QQ, 2, 2, [1/2, 2/3, 3/5, 4/7])
w = vector(QQ, [5/11, 6/13])
assert B*w == vector(QQ, [5/22 + 4/13, 3/11 + 24/91])

assert z.row() == matrix(ZZ, 1, 3, [1, 2, 3])
assert z.column() == matrix(ZZ, 3, 1, [1, 2, 3])
assert A.row(0) == vector(ZZ, [1, 2, 3])
assert A.column(1) == vector(ZZ, [2, 5])
print("public-exact-vector-semantics-ok")
`;

assert.equal(runSagejs(semantics), "public-exact-vector-semantics-ok");
assert.equal(
  runSagejs(semantics, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-exact-vector-semantics-ok",
);

const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  assert.equal(run(sage, semantics), "public-exact-vector-semantics-ok");
}

const representation = String.raw`
import sagejs.runtime as runtime

z = vector(ZZ, [2^521 + 1, -2, 3])
q = vector(QQ, [1/2, 2/3, 3/5])
assert z._has_fmpz_vector_resource()
assert q._has_fmpq_vector_resource()

# Resource arithmetic and matrix-vector publication must not decode a host
# element list.  Scalar indexing remains available through declared calls.
saved = runtime.exact_integer_values_from_packed_bytes
def forbid_host_list(*args):
    raise AssertionError("exact vector unexpectedly materialized a host list")
runtime.exact_integer_values_from_packed_bytes = forbid_host_list
try:
    total = z + z
    scaled = q * (7/11)
    assert total._has_fmpz_vector_resource()
    assert scaled._has_fmpq_vector_resource()
    assert total[0] == 2*(2^521 + 1)
    assert scaled[1] == 14/33
    assert z*z == (2^521 + 1)^2 + 13
    assert q*q == 1/4 + 4/9 + 9/25

    A = matrix(ZZ, 2, 3, [1, 2, 3, 4, 5, 6])
    right = A*z
    left = vector(ZZ, [7, 8])*A
    assert right._has_fmpz_vector_resource()
    assert left._has_fmpz_vector_resource()
    assert right[0] == 2^521 + 6
    assert left[2] == 69

    B = matrix(QQ, 2, 3, [1/2, 2/3, 3/5, 4/7, 5/11, 6/13])
    rational_result = B*q
    assert rational_result._has_fmpq_vector_resource()
    assert rational_result[0] == 1/4 + 4/9 + 9/25
finally:
    runtime.exact_integer_values_from_packed_bytes = saved

assert total.list()[0] == 2*(2^521 + 1)
assert rational_result.list()[0] == 1/4 + 4/9 + 9/25
print("public-exact-vector-resource-ok")
`;

assert.equal(runSagejs(representation), "public-exact-vector-resource-ok");
assert.equal(
  runSagejs(representation, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-exact-vector-resource-ok",
);

console.log("public exact vector resources passed");
