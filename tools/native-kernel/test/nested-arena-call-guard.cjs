// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");
const { lowerSource } = require("../ir.cjs");
const { createNativeImportResolver } = require("../native-imports.cjs");

const preamble = `
from sagejs.native import native, NativeExactArena, IntegerBuffer, uint64
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix, fmpz_matrix_set_entry, fmpz_matrix_entry
`;
const inner = `
@native
def inner(matrix: FmpzMatrix, value: int) -> bool:
    with NativeExactArena(1048576, 1048576) as child:
        scratch = child.foreign_resource(fmpz_matrix, 1, 1)
        fmpz_matrix_set_entry(matrix, 0, 0, value * value)
        return True
`;
const outer = (call) => `
@native
def outer(out: IntegerBuffer, value: int) -> bool:
    with NativeExactArena(1048576, 1048576) as parent:
        matrix = parent.foreign_resource(fmpz_matrix, 1, 1)
        accepted = ${call}(matrix, value)
        out[0] = fmpz_matrix_entry(matrix, 0, 0)
        return accepted
`;

test("nested arena mutation of an outer zero matrix fails before native generation", async () => {
  // Before the guard, this qualified for GMP generation: promotion with
  // value=2**80 could allocate the outer matrix entry in the child checkpoint,
  // leaving a dangling entry when inner returns. Never execute that program.
  await assert.rejects(() => lowerSource(preamble + inner + outer("inner"),
    "nested-arena.py"), /nested NativeExactArena.*outer -> inner/);
});

test("arena effects propagate through undecorated helpers and requested subsets", async () => {
  const middle = `
def middle(matrix: FmpzMatrix, value: int) -> bool:
    return inner(matrix, value)
`;
  await assert.rejects(() => lowerSource(preamble + inner + middle + outer("middle"),
    "transitive-arena.py", { functions: ["outer"] }),
  /nested NativeExactArena.*outer -> middle -> inner/);
});

test("conditional and short-circuit calls retain their enclosing arena lifetime", async () => {
  for (const call of [
    "accepted = value > 0 and inner(matrix, value)",
    "accepted = True\n        if value > 0:\n            accepted = inner(matrix, value)",
    "accepted = True\n        while value > 0 and inner(matrix, value):\n            value = value - 1",
  ]) {
    const source = (preamble + inner + outer("inner")).replace(
      "accepted = inner(matrix, value)", call,
    );
    await assert.rejects(() => lowerSource(source, "conditional-arena.py"),
      /nested NativeExactArena.*outer -> inner/);
  }
});

test("imported helper arena effects cannot bypass the lifetime guard", async () => {
  const imported = await lowerSource(preamble + inner, "imported-arena.py");
  await assert.rejects(() => lowerSource(preamble +
    "from sagejs.test_arena import inner\n" + outer("inner"),
  "importer-arena.py", {
    functions: ["outer"],
    resolveNativeImport: async () => ({
      ir: imported, moduleName: "sagejs.test_arena",
      sourcePath: "imported-arena.py", sourceHash: "a".repeat(64),
    }),
  }), /nested NativeExactArena.*outer -> inner/);
});

test("ordinary helpers inside one arena and separate arena calls remain supported", async () => {
  const source = preamble + `
@native
def increment(value: int) -> int:
    return value + 1
@native
def owned(value: int) -> int:
    with NativeExactArena(1048576, 1048576) as arena:
        values = arena.integer_vector(1, 0)
        values[0] = increment(value)
        return values[0]
@native
def sequential(value: int) -> int:
    first = owned(value)
    return owned(first)
`;
  const ir = await lowerSource(source, "separate-arenas.py");
  assert.deepEqual(ir.callGraph.sequential, ["owned"]);
  assert.deepEqual(ir.callGraph.owned, ["increment"]);
});

test("the existing cubic program retains one root arena and its fmpz qualification", async () => {
  const root = resolve(__dirname, "../../..");
  const registry = JSON.parse(readFileSync(
    resolve(root, "architecture/native-kernels.json"), "utf8",
  ));
  const kernel = registry.kernels.find(
    (entry) => entry.id === "complex-cubic-class-group-production",
  );
  const sourcePath = resolve(root, kernel.source);
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath, {
    functions: kernel.functions,
    resolveNativeImport: createNativeImportResolver({ root, lowerSource,
      initialSourcePath: sourcePath }),
  });
  const entry = ir.functions.find((fn) => fn.name === kernel.functions[0]);
  assert.equal(entry.analysis.backend.kind, "fmpz");
  assert.equal(entry.analysis.liveExactWorkspace.scopes.length, 1);
});
