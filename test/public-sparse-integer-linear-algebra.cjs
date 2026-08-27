#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSageJs(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sparse-zz-kernel-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [resolve(root, "bin", "sagejs"), "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
        timeout: 180_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const source = String.raw`
A = matrix(ZZ, 3, 5, [
    1, 2, 0, 0, 1,
    0, 1, 1, 0, 1,
    0, 0, 1, 1, 1,
], sparse=True)
K = A.right_kernel_matrix()
assert K.list() == [1, 0, 1, 0, -1, 0, 1, 1, 1, -2]
assert A * K.transpose() == zero_matrix(ZZ, 3, 2)
assert K.dimensions() == (2, 5)

large = 2**160 + 41
B = matrix(ZZ, 2, 4, [large, 0, large, 0, 0, 1, 0, -1], sparse=True)
L = B.right_kernel_matrix()
assert L.list() == [1, 0, -1, 0, 0, 1, 0, 1]
assert B * L.transpose() == zero_matrix(ZZ, 2, 2)

wide_empty = matrix(ZZ, 0, 7, sparse=True)
assert wide_empty.right_kernel_matrix() == identity_matrix(ZZ, 7)
empty = matrix(ZZ, 3, 0, sparse=True).right_kernel_matrix()
assert empty.dimensions() == (0, 0)

rows = 48
columns = 56
entries = [0 for _ in range(rows * columns)]
for row in range(rows):
    entries[row * columns + row] = 1
    for shift, value in [(1, -2), (7, 3), (13, -1)]:
        column = row + shift
        if column < columns:
            entries[row * columns + column] = value
S = matrix(ZZ, rows, columns, entries, sparse=True)
N = S.right_kernel_matrix()
assert N.dimensions() == (8, 56)
assert S.rank() == 48
assert S * N.transpose() == zero_matrix(ZZ, 48, 8)
print(K.str().replace("\n", ";"))
print(L.str().replace("\n", ";"))
print(N.dimensions(), S.rank())
`;

const native = runSageJs(source);
const disabled = runSageJs(source, { SAGEJS_NATIVE_DISABLE: "1" });
assert.equal(disabled, native, "native and disabled-native exact kernels differ");
assert.equal(
  native,
  [
    "[ 1  0  1  0 -1];[ 0  1  1  1 -2]",
    "[ 1  0 -1  0];[ 0  1  0  1]",
    "(8, 56) 48",
    "",
  ].join("\n"),
);

console.log("public sparse integer linear algebra passed");
