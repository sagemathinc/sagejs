// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

test("a private local alias of a borrowed fmpz owner retains the direct backend", async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-borrowed-fmpz-alias-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "alias.py");
  writeFileSync(sourcePath, `
from sagejs.native import NativeExactArena, native
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

def borrowed(matrix: FmpzMatrix, value: int) -> int:
    alias = matrix
    alias[0, 0] = value
    return alias[0, 0] + 1

@native
def entry(value: int) -> int:
    with NativeExactArena(1048576, 3145728) as arena:
        result = arena.integer_vector(1, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 1)
        result[0] = borrowed(matrix, value)
        return result[0] + borrowed(matrix, -value)
`);
  const result = await compileKernel({ sourcePath, functions: ["entry"],
    cacheRoot: join(directory, "cache") });
  assert.ok(result.ir.functions.every(f => f.analysis.backend.kind === "fmpz"));
  const helper = result.ir.functions.find(f => f.name === "borrowed");
  assert.equal(helper.hostCallable, false);
  assert.deepEqual(helper.resourceAliases, { alias: "matrix" });
  const entry = require(result.modulePath).entry;
  for (const value of [0n, 31n, -(1n << 255n)]) {
    for (const backend of ["javascript", "gmp", "fmpz"]) {
      assert.equal(entry[backend](value), 2n);
    }
  }
});
