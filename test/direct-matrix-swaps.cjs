#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function run(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-direct-swaps-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_FORBID_MATRIX_NAPI: "1", ...environment },
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const source = String.raw`
def expect_failure(function, exception):
    try:
        function()
        raise AssertionError("operation unexpectedly succeeded")
    except exception:
        pass


for base in [ZZ, QQ, GF(2), GF(97)]:
    value = matrix(base, 3, 4, range(12))
    original = value.__copy__()
    value.swap_rows(0, 2)
    assert value.list() == [
        base(entry) for entry in [8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]
    ]
    value.swap_columns(0, 3)
    assert value.list() == [
        base(entry) for entry in [11, 9, 10, 8, 7, 5, 6, 4, 3, 1, 2, 0]
    ]
    before = value.__copy__()
    expect_failure(lambda: value.swap_rows(-1, 0), IndexError)
    expect_failure(lambda: value.swap_rows(0, 3), IndexError)
    expect_failure(lambda: value.swap_columns(-1, 0), IndexError)
    expect_failure(lambda: value.swap_columns(0, 4), IndexError)
    assert value == before
    value.swap_rows(1, 1)
    value.swap_columns(2, 2)
    assert value == before
    assert original.list() == [base(entry) for entry in range(12)]

print("direct-matrix-swaps-ok")
`;

assert.equal(run(source), "direct-matrix-swaps-ok");
assert.equal(
  run(source, { SAGEJS_NATIVE_DISABLE: "1" }),
  "direct-matrix-swaps-ok",
);

assert.equal(
  run(String.raw`
value = matrix(GF(97), 32, 47, range(32 * 47))
storage = value._prime_residues_cache
value.swap_rows(0, 31)
value.swap_columns(0, 46)
assert value._prime_residues_cache is storage
print("direct-prime-swap-borrows-storage")
`),
  "direct-prime-swap-borrows-storage",
);

console.log("direct matrix swap tests passed");
