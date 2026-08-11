#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const integerKernel = join(
  root, "src", "lib", "sagejs", "kernels", "matrix",
  "dense_integer_flint.py",
);
const rationalKernel = join(
  root, "src", "lib", "sagejs", "kernels", "matrix",
  "dense_rational_flint.py",
);

function runSage(source, environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-fmpz-matrix-"));
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
A = matrix(ZZ, 3, 3, [2, 4, 4, 6, 6, 12, 10, 4, 16])
B = matrix(ZZ, 3, 3, range(9))
assert A._has_fmpz_matrix_resource()
assert B._has_fmpz_matrix_resource()

# Resource-to-resource operations must not silently materialize the complete
# matrix into a uniform-capacity IntegerBuffer.
def packed_forbidden(*args):
    raise AssertionError('hidden packed conversion')
A._packed_integers = packed_forbidden
B._packed_integers = packed_forbidden

assert (A + B) - B == A
assert A * identity_matrix(ZZ, 3) == A
assert -(-A) == A
assert A.transpose().transpose() == A
assert A.det() == 48
assert A.rank() == 3
assert A.trace() == 24
assert A.density() == 1
assert A.charpoly()(A).is_zero()
assert A.minpoly()(A).is_zero()
H, U = A.hermite_form(transformation=True)
assert U*A == H
D, L, R = A.smith_form()
assert L*A*R == D
assert A.stack(B).matrix_from_rows([4, 0]).list() == B.row(1).list() + A.row(0).list()
assert A.augment(B).matrix_from_columns([4, 0]).list() == [
    B[0, 1], A[0, 0], B[1, 1], A[1, 0], B[2, 1], A[2, 0]
]
assert A.str() == '[ 2  4  4]\n[ 6  6 12]\n[10  4 16]'
assert A.change_ring(QQ).change_ring(ZZ) == A

wide = matrix(ZZ, 2, 4, [1, 2, 3, 4, 2, 4, 6, 8])
kernel = wide.right_kernel_matrix()
assert kernel._has_fmpz_matrix_resource()
assert wide*kernel.transpose() == zero_matrix(ZZ, 2, kernel.nrows())

copy = A.__copy__()
copy[0, 0] = 2**521 + 1
assert copy[0, 0] == 2**521 + 1
assert A[0, 0] == 2
copy.set_immutable()
try:
    copy[0, 0] = 0
    raise AssertionError('immutable resource matrix was mutated')
except ValueError:
    pass

print('public-fmpz-resource-ok')
`;

const performance = String.raw`
import time

def elapsed(function):
    start = time.perf_counter()
    value = function()
    return value, (time.perf_counter() - start) * 1000

A, random_ms = elapsed(lambda: random_matrix(ZZ, 300, x=-1000, y=1001))
B, second_ms = elapsed(lambda: random_matrix(ZZ, 300, x=-1000, y=1001))
C, add_ms = elapsed(lambda: A + B)
M = A.matrix_from_rows(range(80)).matrix_from_columns(range(80))
P, multiply_ms = elapsed(lambda: M*M)
text, format_ms = elapsed(lambda: A.str())
assert C._has_fmpz_matrix_resource()
assert P._has_fmpz_matrix_resource()
assert len(text) > 100000
print('TIMES', random_ms, second_ms, add_ms, multiply_ms, format_ms)
`;

(async () => {
  const cache = mkdtempSync(join(tmpdir(), "sagejs-public-fmpz-cache-"));
  try {
    await compile({ sourcePath: integerKernel, cacheRoot: cache });
    await compile({ sourcePath: rationalKernel, cacheRoot: cache });

    const required = {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
    };
    assert.equal(runSage(behavior, required), "public-fmpz-resource-ok");
    assert.equal(
      runSage(behavior, {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      }),
      "public-fmpz-resource-ok",
    );

    const timing = runSage(performance, required);
    const match = /^TIMES\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/m.exec(timing);
    assert.ok(match, timing);
    const [randomMs, secondMs, addMs, multiplyMs, formatMs] =
      match.slice(1).map(Number);
    assert.ok(Math.max(randomMs, secondMs) < 250, timing);
    assert.ok(addMs < 100, timing);
    assert.ok(multiplyMs < 250, timing);
    assert.ok(formatMs < 500, timing);

    console.log(`dense integer public resource tests passed (${timing})`);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
