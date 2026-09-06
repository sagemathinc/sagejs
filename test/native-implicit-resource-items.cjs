// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");

function source({ imports = "fmpz_matrix", factory = "fmpz_matrix",
  body = "value[0, 0] = seed\nreturn value[0, 0]", arena = true } = {}) {
  const indent = arena ? "        " : "    ";
  return [
    `from sagejs.ffi.flint import ${imports}`,
    "from sagejs.native import native, NativeExactArena",
    "@native",
    "def fixture(seed: int) -> int:",
    ...(arena ? ["    with NativeExactArena(1048576, 1048576) as arena:"] : []),
    `${indent}value = ${arena ? `arena.foreign_resource(${factory}, 1, 1)` : `${factory}(1, 1)`}`,
    ...body.split("\n").map((line) => `${indent}${line}`),
    "",
  ].join("\n");
}

function foreignCalls(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) foreignCalls(item, found);
  } else if (value && typeof value === "object") {
    if (value.kind === "ffi.call") found.push(value.foreign);
    for (const [key, item] of Object.entries(value)) {
      if (key !== "foreign") foreignCalls(item, found);
    }
  }
  return found;
}

function withoutSourceOffsets(value) {
  // Adding a type import shifts byte offsets but not source lines, lowered
  // operations, declaration identities, or their complete source spans.
  return JSON.parse(JSON.stringify(value, (key, item) =>
    key === "offset" ? undefined : item));
}

test("constructor-inferred indexed resources lower identically to explicit type imports", async () => {
  for (const arena of [false, true]) {
    const implicit = await lowerSource(source({ arena }), "resource-items.py");
    const explicit = await lowerSource(source({
      arena, imports: "FmpzMatrix, fmpz_matrix",
    }), "resource-items.py");
    assert.deepEqual(withoutSourceOffsets(implicit.functions[0].body),
      withoutSourceOffsets(explicit.functions[0].body));
    assert.deepEqual(implicit.functions[0].foreignResources,
      explicit.functions[0].foreignResources);
    assert.deepEqual(implicit.foreignLibraries, explicit.foreignLibraries);
    const calls = foreignCalls(implicit.functions[0].body);
    for (const operation of ["fmpz_matrix_set_entry", "fmpz_matrix_entry"]) {
      const call = calls.find((entry) => entry.function.pythonName === operation);
      assert.ok(call, operation);
      assert.equal(call.import.module, "sagejs.ffi.flint");
      assert.equal(call.import.name, operation);
      assert.match(call.declarationIdentity, /^flint@/);
      assert.match(call.declarationHash, /^[0-9a-f]{64}$/);
    }
    const core = generateHostCore(implicit).source;
    assert.match(core, /sagejs_fmpz_matrix_set_entry/);
    assert.match(core, /sagejs_fmpz_matrix_entry/);
    assert.doesNotMatch(core, /\bnapi_|\bPyObject\b|\bPyEval_/);
  }
});

test("constructor-only indexed reads and writes qualify independently", async () => {
  for (const body of ["return value[0, 0]", "value[0, 0] = seed\nreturn seed"]) {
    const ir = await lowerSource(source({ body }), "single-resource-item.py");
    assert.ok(["gmp", "fmpz"].includes(ir.functions[0].analysis.backend.kind));
    assert.equal(ir.functions[0].foreignResources[0].python_name, "FmpzMatrix");
  }
});

test("constructor and unused resource aliases preserve inferred canonical operations", async () => {
  for (const imports of [
    "fmpz_matrix as make_matrix",
    "FmpzMatrix as Matrix, fmpz_matrix as make_matrix",
  ]) {
    const ir = await lowerSource(source({ imports, factory: "make_matrix" }),
      "resource-alias.py");
    const get = foreignCalls(ir.functions[0].body)
      .find((entry) => entry.function.pythonName === "fmpz_matrix_entry");
    assert.equal(get.import.localName, "FmpzMatrix.__getitem__");
    assert.equal(ir.functions[0].foreignResources[0].python_name, "FmpzMatrix");
  }
});

test("implicit resource metadata does not introduce an unimported annotation", async () => {
  const body = [
    "from sagejs.ffi.flint import fmpz_matrix",
    "from sagejs.native import native",
    "@native",
    "def fixture(value: FmpzMatrix) -> int:",
    "    return value[0, 0]",
  ].join("\n");
  await assert.rejects(lowerSource(body, "unimported-resource-type.py"),
    /unsupported argument annotation FmpzMatrix/);
  const ir = await lowerSource(body.replace("import fmpz_matrix",
    "import FmpzMatrix, fmpz_matrix"), "imported-resource-type.py");
  assert.equal(ir.functions[0].params[0].type, "FmpzMatrix");
});

test("resources without declared indexed operations fail deliberately", async () => {
  for (const imports of ["fmpq_matrix", "FmpqMatrix, fmpq_matrix"]) {
    for (const [body, operation] of [
      ["return value[0, 0]", "read"],
      ["value[0, 0] = seed\nreturn seed", "assignment"],
    ]) {
      await assert.rejects(lowerSource(source({
        imports, factory: "fmpq_matrix", body,
      }), "unsupported-resource-items.py"), (error) => {
        assert.equal(error instanceof TypeError, false);
        assert.match(error.message, new RegExp(
          `FmpqMatrix does not declare a qualified native indexed ${operation}`));
        return true;
      });
    }
  }
});

test("inferred resources preserve index arity and augmented-assignment guards", async () => {
  for (const imports of ["fmpz_matrix", "FmpzMatrix, fmpz_matrix"]) {
    for (const [body, expected] of [
      ["return value[0]", /FmpzMatrix indexing expects 2 indices, got 1/],
      ["value[0] = seed\nreturn seed", /FmpzMatrix indexing expects 2 indices, got 1/],
      ["value[0, 0] += seed\nreturn seed", /does not support augmented indexed assignment/],
    ]) {
      await assert.rejects(lowerSource(source({ imports, body }),
        "invalid-resource-index.py"), expected);
    }
  }
});
