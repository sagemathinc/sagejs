"use strict";

const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const sourcePath = resolve(__dirname, "../bench/native_live_exact_vector.py");
const productionSourcePath = resolve(
  __dirname,
  "../src/lib/sagejs/number_fields/bl_composite_kernel.py",
);

test("live exact vectors have one lexical GMP ownership implementation", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const addmul = ir.functions.find((fn) => fn.name === "live_addmul");
  assert.equal(addmul.analysis.backend.kind, "gmp");
  assert.equal(addmul.analysis.backend.requiresExactWorkspace, true);
  assert.equal(addmul.analysis.execution.liveExactScopes, 1);
  assert.equal(addmul.analysis.effects.mayAllocate, true);
  assert.deepEqual(
    addmul.analysis.effects.mayRaise,
    ["IndexError", "MemoryError"],
  );
  const scope = addmul.body.find(
    (operation) => operation.kind === "integer.vector.scope",
  );
  assert.ok(scope);
  assert.ok(scope.body.some(
    (operation) => operation.kind === "loop.range" &&
      operation.body.some(
        (nested) => nested.kind === "integer.vector.addmul",
      ),
  ));

  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /mpz_addmul\(/);
  assert.match(core.source, /sagejs_native_integer_vector_clear/);
  assert.doesNotMatch(core.source, /sagejs_integer_buffer_get_mpz/);
  assert.doesNotMatch(core.source, /sagejs_integer_buffer_set_mpz/);

  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-live-vector-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const module = require(compiled.modulePath);
    assert.deepEqual(module.live_addmul.liveExactWorkspace, {
      count: 1,
      scopes: [{
        owner: "values",
        capacity: "capacity",
        memoryLimit: "memory_limit",
        storage: "lexical-owned-mpz-vector",
        cleanup: "all-exit-idempotent",
        canonicalAuthority: false,
      }],
      ownership: "compiler-owned-lexical",
      allocation: "bounded-capacity-and-semantic-charge",
      physicalMemory: "reported-by-receipt-not-semantic-limit",
      automaticSelection: "receipt-gated",
    });
    const seed = -(1n << 300n);
    const left = (1n << 257n) + 17n;
    const right = -(1n << 199n) + 3n;
    const repetitions = 11n;
    const expected = seed + repetitions * left * right;
    for (const implementation of [
      module.live_addmul,
      module.live_addmul.javascript,
      module.live_addmul.gmp,
      module.live_addmul.tagged,
    ]) {
      assert.equal(
        implementation(1n, 4096n, seed, left, right, repetitions),
        expected,
      );
    }

    const operationExpected = -12345678901234567890n * (1n - 97n);
    for (const implementation of [
      module.live_vector_operations,
      module.live_vector_operations.javascript,
      module.live_vector_operations.gmp,
      module.live_vector_operations.tagged,
    ]) {
      assert.deepEqual(
        Array.from(implementation(4096n, -12345678901234567890n, 97n)),
        [97n, operationExpected],
      );
    }

    for (const implementation of [
      module.live_addmul,
      module.live_addmul.javascript,
    ]) {
      assert.throws(
        () => implementation(1n, 32n, 1n << 1000n, 1n, 1n, 0n),
        /NativeIntegerVector memory limit exceeded/,
      );
      assert.equal(implementation(1n, 64n, 2n, 3n, 5n, 7n), 107n);
    }
    for (const implementation of [
      module.live_vector_index,
      module.live_vector_index.javascript,
    ]) {
      assert.throws(
        () => implementation(64n, -1n),
        /NativeIntegerVector index out of range/,
      );
      assert.throws(
        () => implementation(64n, 1n),
        /NativeIntegerVector index out of range/,
      );
    }
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("live exact vector owners cannot escape or alias", async () => {
  const header =
    "from sagejs.native import NativeIntegerVector, native, uint64\n" +
    "@native\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerVector(1, n) as values:\n" +
        "        alias = values\n" +
        "        return 0\n",
      "live-vector-alias.py",
    ),
    /owners cannot be copied, passed, or returned/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerVector(1, n) as values:\n" +
        "        values[0] = 1\n" +
        "    return values[0]\n",
      "live-vector-after-scope.py",
    ),
    /outside its lexical scope/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerVector(1, n) as outer:\n" +
        "        with NativeIntegerVector(1, n) as inner:\n" +
        "            return inner[0]\n",
      "live-vector-nested.py",
    ),
    /nested NativeIntegerVector scopes are not supported/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerVector(1, n) as values:\n" +
        "        values.close()\n" +
        "        return 0\n",
      "live-vector-close.py",
    ),
    /unsupported NativeIntegerVector method close/,
  );
});

test("the cubic relation row witness keeps exact accumulation live", async () => {
  const source = readFileSync(productionSourcePath, "utf8");
  const ir = await lowerSource(source, productionSourcePath);
  const rows = ir.functions.find(
    (fn) => fn.name === "packed_factor_base_rows_in_place",
  );
  assert.ok(rows);
  assert.equal(rows.analysis.execution.liveExactScopes, 1);
  assert.equal(rows.analysis.backend.kind, "gmp");
  assert.equal(rows.analysis.backend.requiresExactWorkspace, true);
  assert.equal(
    rows.analysis.liveExactWorkspace.scopes[0].owner,
    "exact_coordinates",
  );
  assert.equal(
    rows.analysis.liveExactWorkspace.scopes[0].capacity,
    "maximum_degree",
  );
  const scope = rows.body.find(
    (operation) => operation.kind === "integer.vector.scope",
  );
  assert.ok(scope);
  assert.ok(JSON.stringify(scope).includes("integer.vector.addmul"));

  const core = generateHostCore(ir);
  assert.match(
    core.source,
    /native_packed_factor_base_rows_in_place[\s\S]*?sagejs_native_integer_vector_addmul\(/,
  );
});
