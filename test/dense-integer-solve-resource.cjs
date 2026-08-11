#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-integer-solve-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
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
import sagejs.runtime as runtime

def forbid_packed(*args):
    raise AssertionError('hidden packed conversion')

A = matrix(ZZ, 2, 2, [2, 1, 0, 3])
B = matrix(ZZ, 2, 2, [1, 2, 3, 4])
A_before = A.__copy__()
B_before = B.__copy__()
A._packed_integers = forbid_packed
B._packed_integers = forbid_packed
X = A.solve_right(B)
assert X.base_ring() is QQ
assert X._has_fmpq_matrix_resource()
assert X == matrix(QQ, 2, 2, [0, QQ(1, 3), 1, QQ(4, 3)])
assert A*X == B
assert A == A_before and B == B_before
storage = X._rational_storage_cache
assert runtime.reflect.get(storage, 'numerators') is runtime.undefined
assert runtime.reflect.get(storage, 'denominators') is runtime.undefined

vector_right = vector(ZZ, [1, 1])
vector_solution = A.solve_right(vector_right)
assert vector_solution == vector(QQ, [QQ(1, 3), QQ(1, 3)])
assert A*vector_solution == vector_right

huge = 2**4096 + 12345
skew = matrix(ZZ, 3, 3, [
    huge, 2**17 + 1, -3,
    0, -(2**521 + 7), 5,
    0, 0, 2**257 + 11,
])
skew_right = matrix(ZZ, 3, 2, [1, huge, -7, 11, 13, -(2**333 + 9)])
skew_before = skew.__copy__()
skew_right_before = skew_right.__copy__()
skew._packed_integers = forbid_packed
skew_right._packed_integers = forbid_packed
skew_solution = skew.solve_right(skew_right)
assert skew_solution._has_fmpq_matrix_resource()
assert skew*skew_solution == skew_right
assert skew == skew_before and skew_right == skew_right_before

singular = matrix(ZZ, 2, 2, [1, 2, 2, 4])
consistent = matrix(ZZ, 2, 1, [3, 6])
consistent_solution = singular.solve_right(consistent)
assert consistent_solution._has_fmpq_matrix_resource()
assert singular*consistent_solution == consistent
try:
    singular.solve_right(matrix(ZZ, 2, 1, [0, 1]))
    raise AssertionError('inconsistent system unexpectedly solved')
except ValueError:
    pass

try:
    A.solve_right(matrix(ZZ, 3, 1, [1, 2, 3]))
    raise AssertionError('dimension mismatch unexpectedly solved')
except ValueError:
    pass

# Rectangular systems retain Sage.js's explicit pivot/free-variable convention.
wide = matrix(ZZ, 1, 2, [1, 1])
wide_solution = wide.solve_right(matrix(ZZ, 1, 1, [3]))
assert wide_solution == matrix(QQ, 2, 1, [3, 0])
assert wide*wide_solution == matrix(ZZ, 1, 1, [3])
tall = matrix(ZZ, 2, 1, [1, 2])
tall_solution = tall.solve_right(matrix(ZZ, 2, 1, [3, 6]))
assert tall_solution == matrix(QQ, 1, 1, [3])
try:
    tall.solve_right(matrix(ZZ, 2, 1, [3, 7]))
    raise AssertionError('inconsistent rectangular system unexpectedly solved')
except ValueError:
    pass

# Mixed rings retain common-base coercion and the existing rational resource path.
mixed_solution = A.solve_right(matrix(QQ, 2, 1, [QQ(1, 2), QQ(2, 3)]))
assert mixed_solution._has_fmpq_matrix_resource()
assert A*mixed_solution == matrix(QQ, 2, 1, [QQ(1, 2), QQ(2, 3)])

print('dense-integer-solve-resource-ok')
`;

const forbidden = { SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1" };
assert.equal(runSage(behavior, forbidden), "dense-integer-solve-resource-ok");
assert.equal(
  runSage(behavior, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
  "dense-integer-solve-resource-ok",
);

const trace = runSage(String.raw`
A = matrix(ZZ, 2, 2, [2, 1, 0, 3])
B = matrix(ZZ, 2, 1, [1, 1])
X = A.solve_right(B)
assert A*X == B
print('trace-ok')
`, {
  ...forbidden,
  SAGEJS_NATIVE_DISABLE: "1",
  SAGEJS_NATIVE_TRACE: "1",
});
assert.match(
  trace,
  /Matrix\.solve_right ZZ 2x1 -> generated-flint-resource/,
);
assert.match(trace, /trace-ok/);

console.log("dense integer resource solve tests passed");
