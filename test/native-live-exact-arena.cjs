// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  generateArtifacts,
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const sourcePath = resolve(__dirname, "../bench/native_live_exact_arena.py");

function runCompiledWitness(modulePath, source) {
  const result = spawnSync(
    process.execPath,
    ["-e", source, modulePath],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("the portable exact arena shares one deterministic budget", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import importlib.util, runpy, sys, types
package = types.ModuleType("sagejs")
package.__path__ = []
sys.modules["sagejs"] = package
spec = importlib.util.spec_from_file_location(
    "sagejs.native",
    ${JSON.stringify(resolve(__dirname, "../src/lib/sagejs/native.py"))},
)
native_module = importlib.util.module_from_spec(spec)
sys.modules["sagejs.native"] = native_module
spec.loader.exec_module(native_module)
source = runpy.run_path(${JSON.stringify(sourcePath)})
left = -(1 << 300)
right = (1 << 199) + 3
repetitions = 5
relation = left
pivot = right
for _iteration in range(repetitions):
    relation += pivot * right
    pivot -= relation * left
assert source["live_arena_relation_step"](
    8192, 1048576, 4096, left, right, repetitions
) == (relation, pivot, 2)
for limit in (261, 262, 263):
    try:
        source["live_arena_shared_limit"](limit, 1)
    except MemoryError as error:
        assert str(error) == "NativeExactArena memory limit exceeded"
    else:
        raise AssertionError(f"aggregate arena limit {limit} unexpectedly passed")
assert source["live_arena_shared_limit"](264, 1) == 2
`], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the compiler emits one shared-budget exact ownership graph", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  assert.equal(ir.version, 36);
  const fn = ir.functions.find(
    (candidate) => candidate.name === "live_arena_relation_step",
  );
  assert.equal(fn.analysis.backend.kind, "gmp");
  assert.equal(fn.analysis.execution.liveExactScopes, 1);
  assert.deepEqual(fn.analysis.storage.borrowedLocals, [
    "sagejs_native_tmp_13",
    "sagejs_native_tmp_9",
  ]);
  assert.deepEqual(fn.analysis.liveExactWorkspace.scopes, [{
    owner: "workspace",
    memoryLimit: "memory_limit",
    temporaryLimit: "temporary_limit",
    storage: "shared-budget-lexical-exact-arena",
    children: [{
      owner: "relations",
      storage: "row-major-mpz-matrix",
      rows: "sagejs_native_tmp_0",
      columns: "sagejs_native_tmp_1",
      maximumBits: "maximum_bits",
    }, {
      owner: "pivots",
      storage: "mpz-vector",
      capacity: "sagejs_native_tmp_2",
      maximumBits: "maximum_bits",
    }],
    cleanup: "reverse-child-order-all-exit-idempotent",
    canonicalAuthority: false,
  }]);
  const arena = fn.body.find(
    (operation) => operation.kind === "integer.arena.scope",
  );
  assert.deepEqual(arena.children.map((child) => child.type), [
    "NativeIntegerMatrix",
    "NativeIntegerVector",
  ]);
  assert.deepEqual(arena.body.filter(
    (operation) => operation.kind.includes("arena") &&
      operation.kind.includes("allocate"),
  ).map((operation) => operation.kind), [
    "integer.arena.matrix.allocate",
    "integer.arena.vector.allocate",
  ]);

  const core = generateHostCore(ir);
  assert.match(core.source, /sagejs_native_exact_budget_replace/);
  assert.match(core.source, /sagejs_native_integer_matrix_init_in_budget/);
  assert.match(core.source, /sagejs_native_integer_vector_init_in_budget/);
  assert.match(core.source, /mpz_init2/);
  assert.match(core.source, /mpz_srcptr sagejs_sagejs_native_tmp_9/);
  assert.match(core.source, /mpz_srcptr sagejs_sagejs_native_tmp_13/);
  assert.match(core.source, /arithmetic_scratch/);
  assert.match(core.source, /NativeExactArena memory limit exceeded/);
  assert.match(core.source, /SAGEJS_NATIVE_RETRY/);
  assert.match(
    core.source,
    /static int native_live_arena_machine_result[\s\S]*?soft_limit_exhaustions != 0[\s\S]*?upstream_allocations != 0[\s\S]*?\*sagejs_native_output =/,
  );
  assert.match(generateArtifacts(ir).adapterSource, /sagejs_checkpoint_shift/);
  assert.match(
    generateArtifacts(ir).adapterSource,
    /sagejs_native_gmp_recommended_retry_shift/,
  );
  assert.match(
    core.source,
    /success:\n(?:(?!fail:)[\s\S])*mpz_clear\(sagejs_scratch_0\);(?:(?!fail:)[\s\S])*sagejs_native_exact_arena_clear\(&sagejs_workspace\);/,
    "checkpoint-backed exact scratch must clear before arena rewind",
  );

  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-live-arena-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runCompiledWitness(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const left = -(1n << 300n);
const right = (1n << 199n) + 3n;
const repetitions = 5n;
let relation = left;
let pivot = right;
for (let index = 0n; index < repetitions; index += 1n) {
  relation += pivot * right;
  pivot -= relation * left;
}
for (const implementation of [
  module.live_arena_relation_step,
  module.live_arena_relation_step.javascript,
  module.live_arena_relation_step.gmp,
  module.live_arena_relation_step.tagged,
]) {
  assert.deepEqual(
    Array.from(implementation(
      8192n, 1048576n, 4096n, left, right, repetitions,
    )),
    [relation, pivot, 2n],
  );
}
for (const implementation of [
  module.live_arena_machine_result,
  module.live_arena_machine_result.gmp,
  module.live_arena_machine_result.tagged,
]) {
  assert.equal(
    implementation(8192n, 16n, 4096n, left, right, repetitions),
    2n,
  );
}
for (const implementation of [
  module.live_arena_relation_step,
  module.live_arena_relation_step.gmp,
  module.live_arena_relation_step.tagged,
]) {
  assert.deepEqual(
    Array.from(implementation(8192n, 16n, 4096n, left, right, repetitions)),
    [relation, pivot, 2n],
  );
}
for (const implementation of [
  module.live_arena_shared_limit,
  module.live_arena_shared_limit.javascript,
  module.live_arena_shared_limit.gmp,
  module.live_arena_shared_limit.tagged,
]) {
  for (const limit of [261n, 262n, 263n]) {
    assert.throws(
      () => implementation(limit, 1n),
      /NativeExactArena memory limit exceeded/,
    );
  }
  assert.equal(implementation(264n, 1n), 2n);
  assert.throws(
    () => implementation(264n, 1n << 20n),
    /NativeExactArena memory limit exceeded/,
  );
  assert.equal(implementation(512n, 7n), 14n);
}
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("arena children may be conditional but cannot escape, alias, or repeat", async () => {
  const header =
    "from sagejs.native import NativeExactArena, native, uint64\n" +
    "@native\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as workspace:\n" +
        "        values = workspace.integer_vector(1, 64)\n" +
        "        alias = values\n" +
        "        return 0\n",
      "live-arena-child-alias.py",
    ),
    /live exact owners cannot be copied, passed, or returned/,
  );
  await lowerSource(
    header +
      "def f(n: uint64) -> int:\n" +
      "    with NativeExactArena(n, n) as workspace:\n" +
      "        if n > 0:\n" +
      "            values = workspace.integer_vector(1, 64)\n" +
      "            values[0] = n\n" +
      "        return 0\n",
    "live-arena-conditional.py",
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as workspace:\n" +
        "        while n > 0:\n" +
        "            values = workspace.integer_vector(1, 64)\n" +
        "            n -= 1\n" +
        "        return 0\n",
      "live-arena-repeated.py",
    ),
    /cannot be allocated repeatedly in a native loop/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as workspace:\n" +
        "        return workspace\n",
      "live-arena-return.py",
    ),
    /live exact owners cannot be copied, passed, or returned/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as workspace:\n" +
        "        values = workspace.integer_vector(1, 64)\n" +
        "        value = values[0]\n" +
        "    return value\n",
      "live-arena-scalar-escape.py",
    ),
    /body must end with an unconditional return/,
  );
});

test("the shared-budget arena core compiles and runs through WASI", async (context) => {
  let toolchain;
  try {
    toolchain = require(
      "../packages/wasm-toolchain/scripts/toolchain.cjs"
    ).resolveToolchain({ root: resolve(__dirname, "..") });
  } catch {
    context.skip("a prepared WASI GMP toolchain is not available");
    return;
  }
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-arena-wasi-"));
  try {
    const coreSource = join(temporary, "kernel_core.c");
    const coreHeader = join(temporary, "kernel_core.h");
    const driver = join(temporary, "driver.c");
    const wasm = join(temporary, "live-arena.wasm");
    writeFileSync(coreSource, core.source);
    writeFileSync(coreHeader, core.header);
    writeFileSync(driver, String.raw`
#include <assert.h>
#include <stdint.h>
#include <gmp.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t value, result;
    mpz_inits(value, result, NULL);
    mpz_set_ui(value, 1);
    assert(!sagejs_kernel_live_arena_shared_limit(
        &status, result, 263, value));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    status.code = SAGEJS_NATIVE_OK;
    status.message = 0;
    assert(sagejs_kernel_live_arena_shared_limit(
        &status, result, 264, value));
    assert(mpz_cmp_ui(result, 2) == 0);
    mpz_clears(value, result, NULL);
    return 0;
}
`);
    const wasiGmp = toolchain.paths.libraries.gmp.prefix;
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1",
      `--sysroot=${toolchain.paths.sysroot}`,
      "-O3",
      `-I${temporary}`,
      `-I${join(wasiGmp, "include")}`,
      coreSource,
      driver,
      resolve(__dirname, "../packages/flint-wasm/src/wasi-stubs.c"),
      `-L${join(wasiGmp, "lib")}`,
      "-lgmp",
      "-lm",
      "-lwasi-emulated-signal",
      "-o",
      wasm,
    ], { encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, ["-e", String.raw`
const { readFileSync } = require("node:fs");
const { WASI } = require("node:wasi");
(async () => {
  const wasi = new WASI({
    version: "preview1", args: [], env: {}, returnOnExit: true,
  });
  const module = await WebAssembly.compile(readFileSync(process.argv[1]));
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const status = wasi.start(instance);
  if (status !== 0) process.exitCode = status;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`, wasm], { encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
