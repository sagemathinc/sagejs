#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-word-prime-public-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_FORBID_MATRIX_NAPI: "1",
          SAGEJS_NATIVE_TRACE: "1",
          ...environment,
        },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return {
      output: result.stdout.trim().split("\n").at(-1),
      trace: result.stdout,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
v = vector(F, [1,2,3])
assert A * v == vector(F, [14,14,17])
assert v * A == vector(F, [16,22,11])
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
assert [v.list() for v in A.rows()] == [[F(6),F(5),F(0)], [F(1),F(0),F(4)], [F(2),F(1),F(3)]]
assert [v.list() for v in A.columns()] == [[F(6),F(1),F(2)], [F(5),F(0),F(1)], [F(0),F(4),F(3)]]
A.set_row(0, [10,11,12])
A.set_column(2, [13,14,15])
assert A.list() == [F(10),F(11),F(13), F(1),F(0),F(14), F(2),F(1),F(15)]
block = matrix(F, 2, 2, [20,21,22,23])
A.set_block(1, 1, block)
assert A.list() == [F(10),F(11),F(13), F(1),F(20),F(21), F(2),F(22),F(23)]
assert A.matrix_from_rows([2,0,2]).list() == [F(2),F(22),F(23), F(10),F(11),F(13), F(2),F(22),F(23)]
assert A.matrix_from_columns([2,0]).list() == [F(13),F(10), F(21),F(1), F(23),F(2)]
assert A.matrix_from_rows_and_columns([2,0], [1,1,0]).list() == [F(22),F(22),F(2), F(11),F(11),F(10)]
assert A.submatrix(1,1,2,2).list() == [F(20),F(21),F(22),F(23)]
assert A.delete_rows([1]).list() == [F(10),F(11),F(13), F(2),F(22),F(23)]
assert A.delete_columns([1]).list() == [F(10),F(13), F(1),F(21), F(2),F(23)]
assert_resource(A.stack(A))
assert A.stack(A).dimensions() == (6,3)
assert_resource(A.augment(A))
assert A.augment(A).dimensions() == (3,6)
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

const compiled = runSage(source);
assert.equal(compiled.output, "word-prime-public-ok");
assert.match(
  compiled.trace,
  /Matrix\.density GF\(2305843009213693951\) 3x3 -> typed-python-isolated/,
);
const dynamic = runSage(source, { SAGEJS_NATIVE_DISABLE: "1" });
assert.equal(dynamic.output, "word-prime-public-ok");
assert.match(
  dynamic.trace,
  /Matrix\.density GF\(2305843009213693951\) 3x3 -> generated-flint-resource/,
);
assert.throws(
  () => runSage("assert False, 'intentional harness failure'"),
  /intentional harness failure/,
);

console.log("public word-prime matrix resource tests passed");
