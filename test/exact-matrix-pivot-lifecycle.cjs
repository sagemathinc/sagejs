#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

test("public exact pivot and basis owners survive lifecycle stress", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-subspace-lifecycle-"));
  try {
    const script = join(directory, "lifecycle.py");
    writeFileSync(script, String.raw`
import gc
from copy import copy

for repeat in range(100):
    for base in [ZZ, QQ, GF(2), GF(7)]:
        source = matrix(base, 12, 18, [
            (row + 1) * (column + 3) if row < 6 else 0
            for row in range(12)
            for column in range(18)
        ])
        row_basis = source.row_space().basis_matrix()
        column_basis = source.column_space().basis_matrix()
        row_copy = copy(row_basis)
        column_copy = copy(column_basis)
        row_expected = row_basis.str()
        column_expected = column_basis.str()
        pivots = source.pivots()
        del source, row_basis, column_basis
        if repeat % 10 == 0:
            gc.collect()
        assert row_copy.str() == row_expected
        assert column_copy.str() == column_expected
        assert tuple(sorted(pivots)) == pivots

print("exact-matrix-subspace-lifecycle-ok")
`);
    const result = spawnSync(
      process.execPath,
      ["--expose-gc", sagejs, "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 180_000,
        env: {
          ...process.env,
          SAGEJS_FORBID_MATRIX_NAPI: "1",
          SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
          SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
        },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim(), "exact-matrix-subspace-lifecycle-ok");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
