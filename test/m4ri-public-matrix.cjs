#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_FORBID_MATRIX_NAPI: "1", ...environment },
      input: source,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

const publicScript = process.platform === "win32"
  ? String.raw`
from sagejs_serialization import dumps, loads

F = GF(2)
A = matrix(F, 3, 4, [1,0,1,1, 0,1,1,0, 1,1,0,1])
B = matrix(F, 3, 4, [0,1,0,1, 1,0,1,0, 1,0,1,1])
assert not A._has_m4ri_matrix_resource()
assert A[-1,-1] == 1
old = A.list()
try:
    A[0,0] = "not a bit"
    raise AssertionError("invalid mutation succeeded")
except Exception:
    pass
assert A.list() == old
A[0,0] = 0
for value in [A+B, A-B, -A, A*1, A*0, A.transpose(), A*A.transpose()]:
    assert not value._has_m4ri_matrix_resource()
copy = A.__copy__()
copy[0,0] = 1
assert A[0,0] == 0 and copy[0,0] == 1
assert A.rank() == 3
try:
    A.rank(algorithm="m4ri")
    raise AssertionError("unavailable M4RI algorithm succeeded")
except ValueError:
    pass
reduced = A.rref()
assert not reduced._has_m4ri_matrix_resource()
assert A * A.right_kernel_matrix().transpose() == 0
Q = matrix(F, 2, 2, [1,1,1,0])
assert Q.determinant() == 1
inverse = Q.inverse()
assert not inverse._has_m4ri_matrix_resource()
assert Q * inverse == 1
rhs = matrix(F, 2, 1, [1,0])
solution = Q.solve_right(rhs)
assert not solution._has_m4ri_matrix_resource()
assert Q * solution == rhs
restored = loads(dumps(A))
assert not restored._has_m4ri_matrix_resource()
assert restored == A
print("m4ri-windows-fallback-ok")
`
  : String.raw`
import sagejs.runtime as runtime
from sagejs_serialization import dumps, loads

def assert_resource(value):
    assert value._has_m4ri_matrix_resource()
    assert not hasattr(value, "_prime_residues_cache")

F = GF(2)
A = matrix(F, 3, 4, [1,0,1,1, 0,1,1,0, 1,1,0,1])
assert_resource(A)
assert A[-1,-1] == 1
old = A.list()
try:
    A[0,0] = "not a bit"
    raise AssertionError("invalid mutation succeeded")
except Exception:
    pass
assert A.list() == old
A[0,0] = 0
assert_resource(A)
B = matrix(F, 3, 4, [0,1,0,1, 1,0,1,0, 1,0,1,1])
for value in [A+B, A-B, -A, A*1, A*0, A.transpose(), A*A.transpose()]:
    assert_resource(value)
copy = A.__copy__()
copy[0,0] = 1
assert A[0,0] == 0 and copy[0,0] == 1
assert A.rank() == A.rank(algorithm="m4ri")
reduced = A.rref()
assert_resource(reduced)
assert reduced.is_immutable()
assert A * A.right_kernel_matrix().transpose() == 0
Q = matrix(F, 2, 2, [1,1,1,0])
assert Q.determinant() == 1
inverse = Q.inverse()
assert_resource(inverse)
assert Q * inverse == 1
rhs = matrix(F, 2, 1, [1,0])
solution = Q.solve_right(rhs)
assert_resource(solution)
assert Q * solution == rhs
rectangular = matrix(F, 2, 3, [1,0,1,0,1,1])
rectangular_rhs = matrix(F, 2, 1, [1,0])
assert rectangular * rectangular.solve_right(rectangular_rhs) == rectangular_rhs
try:
    matrix(F, 2, 2, [1,1,1,1]).inverse()
    raise AssertionError("singular inverse succeeded")
except ZeroDivisionError:
    pass
for algorithm in ["flint", "fflas", "modp"]:
    assert A.rank(algorithm=algorithm) == A.rank()
    assert A.rref(algorithm=algorithm) == A.rref()
assert not hasattr(A, "_prime_residues_cache")
assert A.density() == 7/12
assert not hasattr(A, "_prime_residues_cache")
assert zero_matrix(F, 0, 7).str() == "[]"
assert identity_matrix(F, 3).is_one()
A.subdivide([1], [2])
assert A.str() == "[0 0|1 1]\n[-------]\n[0 1|1 0]\n[1 1|0 1]"
A.subdivide([], [])
A.list = lambda: 1/0
encoded = dumps(A)
restored = loads(encoded)
assert_resource(restored)
assert restored == A
print("m4ri-public-ok")
`;

assert.equal(
  runSage(publicScript),
  process.platform === "win32"
    ? "m4ri-windows-fallback-ok"
    : "m4ri-public-ok",
);

const lifecycleScript = String.raw`
F = GF(2)
for iteration in range(100):
    A = matrix(F, 24, 24, lambda i,j: (i*17+j*31+iteration) % 2)
    B = A.__copy__()
    C = A*B + A
    R = C.rref()
    K = C.right_kernel_matrix()
    assert C*K.transpose() == 0
print("m4ri-lifecycle-ok")
`;
assert.equal(runSage(lifecycleScript), "m4ri-lifecycle-ok");

const benchmarkScript = String.raw`
from time import perf_counter
F = GF(2)
A = matrix(F, 384, 384, lambda i,j: (i*104729+j*13007+i*j+17) % 2)
B = matrix(F, 384, 384, lambda i,j: (i*65537+j*8191+i*j+29) % 2)
assert A._has_m4ri_matrix_resource() and B._has_m4ri_matrix_resource()
start = perf_counter(); C = A*B; multiply = perf_counter()-start
start = perf_counter(); rank = A.rank(); rank_time = perf_counter()-start
start = perf_counter(); reduced = A.rref(); rref_time = perf_counter()-start
start = perf_counter(); reduced_rank = reduced.rank(); reduced_rank_time = perf_counter()-start
assert C._has_m4ri_matrix_resource() and reduced._has_m4ri_matrix_resource()
assert not hasattr(A, "_prime_residues_cache")
assert reduced_rank == rank
print(multiply, rank_time, rref_time, reduced_rank_time, rank)
`;
if (process.platform !== "win32") {
  const fields = runSage(benchmarkScript).split(/\s+/).map(Number);
  assert.equal(fields.length, 5);
  assert.ok(fields[0] < 0.1, `warm public M4RI multiply took ${fields[0]}s`);
  assert.ok(fields[1] < 0.1, `warm public M4RI rank took ${fields[1]}s`);
  assert.ok(fields[2] < 0.1, `warm public M4RI RREF took ${fields[2]}s`);
  assert.ok(fields[3] < 0.01, `cached RREF rank query took ${fields[3]}s`);
}

// Keep a cheap JS timing witness so this file itself cannot accidentally
// become a multi-second process-orchestration test outside mathematical work.
const start = performance.now();
assert.equal(runSage("print(matrix(GF(2), 1, 1, [1]).str())"), "[1]");
assert.ok(performance.now() - start < 5000);

console.log("public M4RI matrix resource tests passed");
