// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

// This records the current compiler boundary motivating the staged-closure
// design. The borrowed-arena implementation must replace this rejection test
// with ownership, shared-budget, all-exit cleanup and continued-use witnesses.
test("staged exact closure cannot silently borrow an unsupported arena", async () => {
  const source = `from sagejs.native import native, NativeExactArena, uint64
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

@native
def staged_proof(arena: NativeExactArena, dimension: uint64) -> bool:
    basis = arena.foreign_resource(fmpz_matrix, dimension, dimension)
    basis[0, 0] = 1
    return basis[0, 0] == 1
`;
  await assert.rejects(
    lowerSource(source, resolve(__dirname, "staged-arena-borrow.py")),
    /staged_proof: unsupported argument annotation NativeExactArena/,
  );
});
