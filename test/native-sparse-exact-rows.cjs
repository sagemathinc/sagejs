// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_sparse_exact_rows.py");

function runNode(modulePath, source) {
  const result = spawnSync(process.execPath, ["-e", source, modulePath], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("portable sparse exact rows preserve order, shape, and budget", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import importlib.util, sys, types
package = types.ModuleType("sagejs")
package.__path__ = []
sys.modules["sagejs"] = package
spec = importlib.util.spec_from_file_location(
    "sagejs.native", ${JSON.stringify(resolve(root, "src/lib/sagejs/native.py"))}
)
module = importlib.util.module_from_spec(spec)
sys.modules["sagejs.native"] = module
spec.loader.exec_module(module)

with module.NativeExactArena(264, 4096) as arena:
    rows = arena.sparse_integer_rows(3, 5, 3, 64)
    rows.append(0, 1, 12)
    rows.append(0, 4, -7)
    rows.append(2, 0, 9)
    assert rows.get(0, 1, 5) == 12
    assert rows.get(1, 3, 5) == 5
    assert rows.row_length(0) == 2
    assert rows.row_length(1) == 0
    assert len(rows) == 3
    try:
        rows.append(2, 3, 11)
    except MemoryError as error:
        assert str(error) == "NativeSparseIntegerRows capacity exceeded"
    else:
        raise AssertionError("full sparse rows unexpectedly grew")
try:
    len(rows)
except ValueError as error:
    assert str(error) == "NativeSparseIntegerRows is closed"
else:
    raise AssertionError("closed sparse rows remained usable")
for budget in (0, 263):
    try:
        with module.NativeExactArena(budget, 4096) as arena:
            arena.sparse_integer_rows(3, 5, 3, 64)
    except MemoryError as error:
        assert str(error) == "NativeExactArena memory limit exceeded"
    else:
        raise AssertionError("undersized sparse budget unexpectedly passed")
with module.NativeExactArena(264, 4096) as arena:
    rows = arena.sparse_integer_rows(3, 5, 3, 64)
    rows.append(1, 2, 12)
    try:
        rows.append(1, 2, 13)
    except ValueError as error:
        assert str(error) == "NativeSparseIntegerRows entries must be strictly row-major"
    else:
        raise AssertionError("duplicate sparse coordinate unexpectedly passed")
`], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("sparse exact IR records shape, capacity, source, and failure effects", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.version, 37);
  const fn = ir.functions.find((candidate) =>
    candidate.name === "sparse_relation_summary"
  );
  assert.deepEqual(fn.analysis.liveExactWorkspace.scopes[0].children, [{
    owner: "rows",
    storage: "append-only-row-major-sparse-mpz-rows",
    rows: "sagejs_native_tmp_0",
    columns: "sagejs_native_tmp_1",
    entryCapacity: "sagejs_native_tmp_2",
    maximumBits: "sagejs_native_tmp_3",
    metadataBaseCharge: 32,
    rowCharge: 8,
    entryCharge: 16,
  }]);
  assert.deepEqual(fn.analysis.effects.mayRaise.sort(), [
    "IndexError", "MemoryError", "ValueError",
  ]);
  const arena = fn.body.find((operation) =>
    operation.kind === "integer.arena.scope"
  );
  const allocation = arena.body.find((operation) =>
    operation.kind === "sparse.rows.arena.allocate"
  );
  assert.equal(allocation.provenance.file, sourcePath);
  assert.match(allocation.id, /^sparse_relation_summary:/);
  const kinds = JSON.stringify(arena.body);
  for (const kind of [
    "sparse.rows.arena.allocate", "sparse.rows.append", "sparse.rows.get",
    "sparse.rows.row_length", "sparse.rows.length",
  ]) assert.match(kinds, new RegExp(kind.replaceAll(".", "\\.")));
  const core = generateHostCore(ir);
  assert.match(core.source, /sagejs_native_sparse_integer_rows_init_in_budget/);
  assert.match(core.source, /entries must be strictly row-major/);
  assert.match(core.source, /NativeSparseIntegerRows capacity exceeded/);
});

test("sparse rows agree across JavaScript and compiled native tiers", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-sparse-rows-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runNode(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
for (const implementation of [
  module.sparse_relation_summary,
  module.sparse_relation_summary.javascript,
  module.sparse_relation_summary.gmp,
  module.sparse_relation_summary.tagged,
]) {
  assert.equal(implementation(264n, 4096n), 15n);
  assert.throws(() => implementation(263n, 4096n), /memory limit exceeded/);
}
for (const implementation of [
  module.sparse_relation_full,
  module.sparse_relation_full.javascript,
  module.sparse_relation_full.gmp,
  module.sparse_relation_full.tagged,
]) assert.throws(() => implementation(264n, 4096n), /capacity exceeded/);
for (const implementation of [
  module.sparse_relation_order,
  module.sparse_relation_order.javascript,
  module.sparse_relation_order.gmp,
  module.sparse_relation_order.tagged,
]) assert.throws(() => implementation(264n, 4096n), /strictly row-major/);
for (const implementation of [
  module.sparse_relation_index,
  module.sparse_relation_index.javascript,
  module.sparse_relation_index.gmp,
  module.sparse_relation_index.tagged,
]) assert.throws(() => implementation(264n, 4096n, 3n), /index out of range/);
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("sparse-row success and failure cleanup is sanitizer-clean", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-sparse-rows-asan-"));
  const prefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t result;
    mpz_init(result);
    for (unsigned round = 0; round < 1000; round += 1)
    {
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(sagejs_kernel_sparse_relation_summary(
            &status, result, 264, 4096));
        assert(mpz_cmp_ui(result, 15) == 0);
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(!sagejs_kernel_sparse_relation_order(
            &status, result, 264, 4096));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    }
    mpz_clear(result);
    return 0;
}
`);
    const executable = join(temporary, "sparse-rows-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
      "-Wno-error=unused-function", "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`, `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "harness.c"),
      join(prefix, "lib", "libgmp.a"), "-lm", "-o", executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("sparse-row core runs through WASI", async (context) => {
  let toolchain;
  try {
    toolchain = require(
      "../packages/wasm-toolchain/scripts/toolchain.cjs"
    ).resolveToolchain({ root });
  } catch {
    context.skip("a prepared WASI GMP toolchain is not available");
    return;
  }
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-sparse-rows-wasi-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), String.raw`
#include <assert.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t result;
    mpz_init(result);
    assert(sagejs_kernel_sparse_relation_summary(&status, result, 264, 4096));
    assert(mpz_cmp_ui(result, 15) == 0);
    mpz_clear(result);
    return 0;
}
`);
    const wasiGmp = toolchain.paths.libraries.gmp.prefix;
    const wasm = join(temporary, "sparse-rows.wasm");
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1", `--sysroot=${toolchain.paths.sysroot}`, "-O3",
      `-I${temporary}`, `-I${join(wasiGmp, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "driver.c"),
      resolve(root, "packages/flint-wasm/src/wasi-stubs.c"),
      `-L${join(wasiGmp, "lib")}`, "-lgmp", "-lm", "-lwasi-emulated-signal",
      "-o", wasm,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, ["-e", String.raw`
const { readFileSync } = require("node:fs");
const { WASI } = require("node:wasi");
const wasi = new WASI({ version: "preview1", args: [], env: {} });
(async () => {
  const module = await WebAssembly.compile(readFileSync(process.argv[1]));
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
  wasi.start(instance);
})().catch((error) => { console.error(error); process.exit(1); });
`, wasm], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
