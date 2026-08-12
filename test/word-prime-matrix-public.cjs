#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const result = spawnSync(join(root, "bin", "sagejs"), ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_FORBID_MATRIX_NAPI: "1",
      SAGEJS_NATIVE_TRACE: "1",
      ...environment,
    },
    input: source,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /generated-flint-resource/);
  return result.stdout.trim().split("\n").at(-1);
}

const source = String.raw`
from sagejs_serialization import dumps, loads

def assert_resource(value):
    assert value._has_nmod_matrix_resource()
    assert not value._has_packed_prime_storage()

p = 2305843009213693951
F = GF(p)
A = matrix(F, 3, 3, [1,2,3, 0,1,4, 5,6,0])
assert_resource(A)
assert A[0, 2] == 3 and A[-1, -2] == 6
assert A.is_one() is False and A.is_zero() is False
assert A.density() == 7/9
copy = A.__copy__()
copy[0, 0] = p - 1
assert copy[0, 0] == F(p - 1) and A[0, 0] == 1
assert_resource(copy)
assert_resource(A + copy)
assert (A + copy) - copy == A
assert -(-A) == A
assert A * 0 == 0 and A * 1 == A
assert A.transpose().transpose() == A
assert_resource(A * copy)
assert A.trace() == 2
assert A.determinant() == 1
assert A.rank() == 3
R = A.rref()
assert_resource(R)
assert R.is_one() and R.is_immutable()
inverse = A.inverse()
assert_resource(inverse)
assert A * inverse == 1
rhs = matrix(F, 3, 2, [1,2, 3,4, 5,6])
solution = A.solve_right(rhs)
assert_resource(solution)
assert A * solution == rhs

Ksource = matrix(F, 2, 4, [1,2,3,4, 2,4,6,8])
kernel = Ksource.right_kernel_matrix()
assert_resource(kernel)
assert Ksource * kernel.transpose() == 0
assert kernel.nrows() == 3 and Ksource.rank() == 1

Q = matrix(F, 2, 2, [1,2,3,5])
assert Q.charpoly().list() == [F(p - 1), F(p - 6), F(1)]
assert Q.minpoly().list() == [F(p - 1), F(p - 6), F(1)]

A.swap_rows(0, 2)
A.swap_columns(0, 1)
assert A.list() == [F(6),F(5),F(0), F(1),F(0),F(4), F(2),F(1),F(3)]
assert "2305843009213693950" in copy.str()

A.list = lambda: 1/0
encoded = dumps(A)
restored = loads(encoded)
assert_resource(restored)
assert restored == A

random_value = random_matrix(F, 16, 12)
assert_resource(random_value)
assert random_value.nrows() == 16 and random_value.ncols() == 12

largest = 18446744073709551557
G = GF(largest)
L = matrix(G, 1, 2, [largest - 1, largest - 2])
assert_resource(L)
assert L[0, 0] == G(largest - 1)
L[0, 1] = largest - 3
assert loads(dumps(L)) == L
Z = zero_matrix(G, 0, 7)
assert_resource(Z)
assert Z.str() == "[]" and Z.rank() == 0
assert Z.transpose().dimensions() == (7, 0)
assert Z.right_kernel_matrix().is_one()
print("word-prime-public-ok")
`;

assert.equal(runSage(source), "word-prime-public-ok");
assert.equal(
  runSage(source, { SAGEJS_NATIVE_DISABLE: "1" }),
  "word-prime-public-ok",
);

console.log("public word-prime matrix resource tests passed");
