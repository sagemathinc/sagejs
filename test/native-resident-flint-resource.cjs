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
const sourcePath = resolve(root, "bench/native-resident-flint-matrix.py");

function runNode(modulePath, source) {
  const result = spawnSync(process.execPath, ["-e", source, modulePath], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("arena-owned FLINT resources remain resident through resource calls", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.version, 38);
  const fn = ir.functions[0];
  const arena = fn.body.find((operation) =>
    operation.kind === "integer.arena.scope"
  );
  assert.deepEqual(arena.children.map((child) => ({
    owner: child.owner,
    kind: child.childKind,
    resource: child.resourceId,
    clear: child.clearSymbol,
    size: child.sizeSymbol,
  })), [{
    owner: "source",
    kind: "foreign-resource",
    resource: "fmpz_matrix",
    clear: "sagejs_fmpz_matrix_clear",
    size: "sagejs_fmpz_matrix_allocated_bytes",
  }, {
    owner: "hermite",
    kind: "foreign-resource",
    resource: "fmpz_matrix",
    clear: "sagejs_fmpz_matrix_clear",
    size: "sagejs_fmpz_matrix_allocated_bytes",
  }]);
  assert.deepEqual(
    arena.body.filter((operation) =>
      operation.kind === "ffi.arena.resource.allocate"
    ).map((operation) => operation.foreign.declarationId),
    ["flint:fmpz_matrix", "flint:fmpz_matrix_hnf"],
  );
  assert.deepEqual(
    fn.analysis.liveExactWorkspace.scopes[0].children.map((child) =>
      child.storage
    ),
    ["declared-owned-ffi-resource", "declared-owned-ffi-resource"],
  );
  const core = generateHostCore(ir);
  assert.doesNotMatch(JSON.stringify(arena.body), /packed|buffer/);
  const create = core.source.indexOf("sagejs_fmpz_matrix_init(");
  const hnf = core.source.indexOf("sagejs_fmpz_matrix_hnf(");
  const checkpoint = core.source.indexOf(
    "sagejs_native_gmp_checkpoint_begin(", hnf,
  );
  assert.ok(create >= 0 && hnf > create && checkpoint > hnf);
  const reverseCleanup = core.source.indexOf(
    "sagejs_fmpz_matrix_clear(sagejs_hermite)", checkpoint,
  );
  const sourceCleanup = core.source.indexOf(
    "sagejs_fmpz_matrix_clear(sagejs_source)", reverseCleanup,
  );
  const arenaCleanup = core.source.indexOf(
    "sagejs_native_exact_arena_clear(&sagejs_arena)", sourceCleanup,
  );
  assert.ok(reverseCleanup > checkpoint && sourceCleanup > reverseCleanup);
  const checkpointCleanup = core.source.indexOf(
    "sagejs_flint_exact_checkpoint_cleanup()", sourceCleanup,
  );
  assert.ok(checkpointCleanup > sourceCleanup);
  assert.ok(arenaCleanup > checkpointCleanup);
});

test("resident FLINT HNF agrees across generated JavaScript and native tiers", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-resident-flint-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runNode(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
for (let round = 0; round < 100; round += 1) {
  for (const implementation of [
    module.resident_flint_hnf,
    module.resident_flint_hnf.javascript,
    module.resident_flint_hnf.gmp,
    module.resident_flint_hnf.tagged,
  ]) {
    assert.deepEqual(
      Array.from(implementation(1048576n, 1048576n)),
      [2n, 0n, 0n, 4n, 8n],
    );
  }
}
for (const implementation of [
  module.resident_flint_hnf,
  module.resident_flint_hnf.gmp,
  module.resident_flint_hnf.tagged,
]) {
  assert.throws(
    () => implementation(1048576n, 0n),
    /temporary capacity exhausted/,
  );
}
for (let round = 0; round < 100; round += 1) {
  assert.equal(
    module.resident_flint_checkpoint_cache(1048576n, 1048576n),
    1n,
  );
}
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("tagged exact helpers compose through borrowed FLINT resources", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-resource-helper-"));
  try {
    const helperPath = join(temporary, "resource-helper.py");
    writeFileSync(helperPath, String.raw`
from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_set_entry,
)
from sagejs.native import NativeExactArena, native, uint64

@native
def _resource_helper(matrix: FmpzMatrix, value: int) -> int:
    if not fmpz_matrix_set_entry(matrix, 0, 0, value):
        return -1
    return fmpz_matrix_entry(matrix, 0, 0) + value * value

@native
def resident_resource_helper(
    value: int,
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        if value != 0:
            matrix = arena.foreign_resource(fmpz_matrix, 1, 1)
            return _resource_helper(matrix, value)
        return 0
`);
    const compiled = await compileKernel({
      sourcePath: helperPath,
      cacheRoot: join(temporary, "cache"),
      functions: ["resident_resource_helper"],
    });
    runNode(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const value = 1n << 80n;
assert.equal(
  module.resident_resource_helper(value, 1048576n, 1048576n),
  value + value * value,
);
assert.equal(module.resident_resource_helper(0n, 1048576n, 1048576n), 0n);
`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("arena foreign-resource ownership counterfeits fail lowering", async () => {
  const header =
    "from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix\n" +
    "from sagejs.native import NativeExactArena, native, uint64\n" +
    "@native\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        value = fmpz_matrix(1, 1)\n" +
        "        return 0\n",
      "arena-resource-implicit.py",
    ),
    /explicitly with NativeExactArena\.foreign_resource/,
  );
  await lowerSource(
    header +
      "def f(n: uint64) -> int:\n" +
      "    with NativeExactArena(n, n) as arena:\n" +
      "        value = arena.foreign_resource(fmpz_matrix, 1, 1)\n" +
      "        alias = value\n" +
      "        return 0\n",
    "arena-resource-alias.py",
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        value = arena.foreign_resource(fmpz_matrix, 1, 1)\n" +
        "        if n > 0:\n" +
        "            alias = value\n" +
        "        return 0\n",
      "arena-resource-conditional-alias.py",
    ),
    /aliases cannot depend on native control flow/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> FmpzMatrix:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        value = arena.foreign_resource(fmpz_matrix, 1, 1)\n" +
        "        return value\n",
      "arena-resource-return.py",
    ),
    /newly owned local resource/,
  );
});

test("resident FLINT cleanup is sanitizer-clean", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-resident-flint-asan-"));
  const prefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), String.raw`
#include <assert.h>
#include <gmp.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t a, b, c, d, determinant;
    mpz_inits(a, b, c, d, determinant, NULL);
    for (unsigned round = 0; round < 100; round += 1)
    {
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(sagejs_kernel_resident_flint_hnf(
            &status, a, b, c, d, determinant, 1048576, 1048576));
        assert(mpz_cmp_ui(a, 2) == 0);
        assert(mpz_cmp_ui(d, 4) == 0);
        assert(mpz_cmp_ui(determinant, 8) == 0);
        assert(sagejs_kernel_resident_flint_checkpoint_cache(
            &status, determinant, 1048576, 1048576));
        assert(mpz_cmp_ui(determinant, 1) == 0);
    }
    mpz_clears(a, b, c, d, determinant, NULL);
    return 0;
}
`);
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const executable = join(temporary, "resident-flint-sanitizer");
    const build = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`, `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "driver.c"),
      "-Wl,--start-group", join(prefix, "lib", "libflint.a"),
      join(prefix, "lib", "libmpfr.a"), join(prefix, "lib", "libgmp.a"),
      join(prefix, "lib", "libopenblas.a"), "-Wl,--end-group",
      "-lm", "-lpthread", "-ldl", "-o", executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
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

test("resident FLINT resources run through the isolated WASI core", async (context) => {
  let toolchain;
  try {
    toolchain = require(
      "../packages/wasm-toolchain/scripts/toolchain.cjs"
    ).resolveToolchain({ root });
  } catch {
    context.skip("a prepared FLINT WASI toolchain is not available");
    return;
  }
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-resident-flint-wasi-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), String.raw`
#include <assert.h>
#include <gmp.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t a, b, c, d, determinant;
    mpz_inits(a, b, c, d, determinant, NULL);
    assert(sagejs_kernel_resident_flint_hnf(
        &status, a, b, c, d, determinant, 1048576, 1048576));
    assert(mpz_cmp_ui(a, 2) == 0);
    assert(mpz_cmp_ui(determinant, 8) == 0);
    mpz_clears(a, b, c, d, determinant, NULL);
    return 0;
}
`);
    const libraries = toolchain.paths.libraries;
    const wasm = join(temporary, "resident-flint.wasm");
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1", `--sysroot=${toolchain.paths.sysroot}`, "-O2",
      `-I${temporary}`, `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(libraries.flint.prefix, "include")}`,
      `-I${join(libraries.gmp.prefix, "include")}`,
      `-I${join(libraries.mpfr.prefix, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "driver.c"),
      join(root, "packages", "flint-wasm", "src", "wasi-stubs.c"),
      `-L${join(libraries.flint.prefix, "lib")}`, "-lflint",
      `-L${join(libraries.mpfr.prefix, "lib")}`, "-lmpfr",
      `-L${join(libraries.gmp.prefix, "lib")}`, "-lgmp",
      "-lm", "-lwasi-emulated-signal", "-o", wasm,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, ["-e", String.raw`
const { readFileSync } = require("node:fs");
const { WASI } = require("node:wasi");
(async () => {
  const wasi = new WASI({ version: "preview1", args: [], env: {}, returnOnExit: true });
  const module = await WebAssembly.compile(readFileSync(process.argv[1]));
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const status = wasi.start(instance);
  if (status !== 0) process.exitCode = status;
})().catch((error) => { console.error(error); process.exitCode = 1; });
`, wasm], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
