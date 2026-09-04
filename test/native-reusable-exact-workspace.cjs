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
const sourcePath = resolve(root, "bench/native-reusable-exact-workspace.py");

function installResourceRuntime() {
  const previousRequire = globalThis.__sagejs_runtime_require__;
  const previousLoader = globalThis.__sagejs_load_module__;
  globalThis.__sagejs_runtime_require__ = (packageName) => {
    assert.equal(packageName, "@sagemath/sagejs-flint");
    return require("../packages/flint");
  };
  globalThis.__sagejs_load_module__ = (moduleName) => {
    assert.equal(moduleName, "sagejs.ffi.flint");
    return {
      NativeExactWorkspace(token) {
        return { _ffi_borrow() { return token; } };
      },
    };
  };
  return () => {
    if (previousRequire === undefined)
      delete globalThis.__sagejs_runtime_require__;
    else
      globalThis.__sagejs_runtime_require__ = previousRequire;
    if (previousLoader === undefined)
      delete globalThis.__sagejs_load_module__;
    else
      globalThis.__sagejs_load_module__ = previousLoader;
  };
}

function closePublicResource(value) {
  const token = value._ffi_borrow();
  const tag = globalThis.__sagejs_ffi_resource_tag__;
  const state = token[tag];
  if (state.closed) return;
  Reflect.apply(state.close, state.backend, [state.handle]);
  state.closed = true;
  state.handle = null;
  state.registry?.unregister(token);
}

test("C5b exposes one authenticated owner and one lexical mutable borrow", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.version, 36);
  const [create, accumulate, reset] = ir.functions;
  assert.equal(create.returnType, "NativeExactWorkspace");
  assert.equal(create.params.length, 5);
  assert.deepEqual(create.foreignResources.map((resource) => resource.id), [
    "native_exact_workspace",
  ]);
  assert.deepEqual(accumulate.foreignResources.map((resource) => resource.id), [
    "native_exact_workspace",
    "native_exact_workspace_borrow",
  ]);
  const arena = accumulate.body.find((operation) =>
    operation.kind === "integer.arena.scope"
  );
  assert.ok(arena);
  assert.deepEqual(arena.children.map((child) => ({
    kind: child.childKind,
    resource: child.resourceId,
    owner: child.owner,
  })), [{
    kind: "foreign-resource",
    resource: "native_exact_workspace_borrow",
    owner: "borrow",
  }]);
  assert.equal(
    accumulate.analysis.liveExactWorkspace.scopes[0].children[0].storage,
    "declared-owned-ffi-resource",
  );
  assert.deepEqual(reset.analysis.effects.externalWrites, ["workspace"]);

  const core = generateHostCore(ir);
  assert.equal(core.audit.hostCallbacks, 0);
  assert.match(core.source, /sagejs_native_exact_workspace_init\(/);
  assert.match(core.source, /sagejs_native_exact_workspace_borrow_init\(/);
  assert.match(core.source, /sagejs_native_exact_workspace_borrow_addmul_mpz\(/);
  assert.match(core.source, /sagejs_native_exact_workspace_borrow_submul_mpz\(/);
  assert.doesNotMatch(core.source, /fmpz_t sagejs_ffi_sagejs_native_tmp/);
  assert.deepEqual(accumulate.analysis.residentCodeQuality, {
    authenticatedBorrows: 1,
    authenticationPlacement: "once-before-resident-operations",
    hoistedInvariants: [
      "exclusive-mutable-borrow",
      "generation",
      "owner-open-state",
      "specification-identity",
    ],
    exactBridgeCalls: 6,
    exactBridgeLoopCalls: 2,
    exactBridgeSymbols: [
      "sagejs_native_exact_workspace_borrow_addmul_mpz",
      "sagejs_native_exact_workspace_borrow_entry_mpz",
      "sagejs_native_exact_workspace_borrow_set_mpz",
      "sagejs_native_exact_workspace_borrow_submul_mpz",
    ],
    eliminatedFmpzConversions: 8,
    fusedExactUpdates: 2,
    allocationFreeLoopCalls: 2,
    scratchPolicy:
      "one-owner-preallocated-nonoverlapping-product-and-result",
    cleanup:
      "reverse-owner-order-on-success-error-cancellation-and-publication-failure",
  });
  assert.match(core.source, /sagejs_native_exact_workspace_borrow_clear\(/);
  assert.doesNotMatch(core.source, /packed_(?:fmpz|integer)|JSON|PyObject|napi_/);
  const borrow = core.source.indexOf(
    "sagejs_native_exact_workspace_borrow_init(",
  );
  const release = core.source.indexOf(
    "sagejs_native_exact_workspace_borrow_clear(sagejs_borrow)", borrow,
  );
  const arenaRelease = core.source.indexOf(
    "sagejs_native_exact_arena_clear(&sagejs_arena)", release,
  );
  assert.ok(borrow >= 0 && release > borrow && arenaRelease > release);
});

test("reusable workspace agrees across native and JavaScript tiers", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-workspace-"));
  const restore = installResourceRuntime();
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot: temporary });
    const module = require(compiled.modulePath);
    for (const tier of ["native", "javascript"]) {
      const create = tier === "native"
        ? module.create_relation_workspace
        : module.create_relation_workspace.javascript;
      const accumulate = tier === "native"
        ? module.accumulate_relation_workspace
        : module.accumulate_relation_workspace.javascript;
      const reset = tier === "native"
        ? module.reset_relation_workspace
        : module.reset_relation_workspace.javascript;
      const workspace = create(4n, 128n, 1_000_000n, 11n, 22n);
      try {
        assert.deepEqual(
          Array.from(accumulate(
            workspace, 1n, 11n, 22n, 7n, 5n, 4n, 1_048_576n, 1_048_576n,
          )),
          [-37n, 37n, 1n],
        );
        assert.equal(reset(workspace, 1n, 11n, 22n), 2n);
        assert.deepEqual(
          Array.from(accumulate(
            workspace, 2n, 11n, 22n, 2n, 3n, 2n, 1_048_576n, 1_048_576n,
          )),
          [1n, 5n, 2n],
        );
        assert.throws(
          () => accumulate(
            workspace, 1n, 11n, 22n, 1n, 1n, 1n,
            1_048_576n, 1_048_576n,
          ),
          /borrow authentication failed/,
        );
        assert.throws(
          () => accumulate(
            workspace, 2n, 11n, 23n, 1n, 1n, 1n,
            1_048_576n, 1_048_576n,
          ),
          /borrow authentication failed/,
        );
      } finally {
        closePublicResource(workspace);
      }

      const narrow = create(4n, 16n, 1_000_000n, 33n, 44n);
      try {
        assert.throws(
          () => accumulate(
            narrow, 1n, 33n, 44n, 30_000n, 30_000n, 4n,
            1_048_576n, 1_048_576n,
          ),
          /checked bound|bit bound|addmul exceeds/,
        );
        // The failed call must release its borrow on the generated all-exit
        // edge so the same owner can be authenticated and reused immediately.
        assert.deepEqual(
          Array.from(accumulate(
            narrow, 1n, 33n, 44n, 2n, 3n, 2n,
            1_048_576n, 1_048_576n,
          )),
          [1n, 5n, 1n],
        );
      } finally {
        closePublicResource(narrow);
      }
    }
  } finally {
    restore();
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("workspace lifecycle rejects overlap, stale identity, and partial updates", () => {
  const flint = require("../packages/flint");
  const workspace = flint.ffiNativeExactWorkspaceCreate(
    3n, 8n, 1_000_000n, 101n, 202n,
  );
  const borrow = flint.ffiNativeExactWorkspaceBorrow(
    workspace, 1n, 101n, 202n,
  );
  try {
    assert.throws(
      () => flint.ffiNativeExactWorkspaceBorrow(
        workspace, 1n, 101n, 202n,
      ),
      /borrow authentication failed/,
    );
    assert.throws(
      () => flint.ffiNativeExactWorkspaceReset(
        workspace, 1n, 101n, 202n,
      ),
      /reset authentication failed/,
    );
    assert.equal(flint.ffiNativeExactWorkspaceBorrowSet(borrow, 0n, 7n), true);
    assert.throws(
      () => flint.ffiNativeExactWorkspaceBorrowAddmul(
        borrow, 0n, 200n, 200n,
      ),
      /addmul exceeds/,
    );
    assert.equal(flint.ffiNativeExactWorkspaceBorrowEntry(borrow, 0n), 7n);
  } finally {
    flint.ffiNativeExactWorkspaceBorrowClose(borrow);
  }
  assert.equal(
    flint.ffiNativeExactWorkspaceReset(workspace, 1n, 101n, 202n),
    true,
  );
  assert.equal(flint.ffiNativeExactWorkspaceGeneration(workspace), 2n);
  assert.throws(
    () => flint.ffiNativeExactWorkspaceBorrow(
      workspace, 1n, 101n, 202n,
    ),
    /borrow authentication failed/,
  );
  const finalBorrow = flint.ffiNativeExactWorkspaceBorrow(
    workspace, 2n, 101n, 202n,
  );
  flint.ffiNativeExactWorkspaceClose(workspace);
  assert.throws(
    () => flint.ffiNativeExactWorkspaceBorrowEntry(finalBorrow, 0n),
    /lifetime is invalid/,
  );
  flint.ffiNativeExactWorkspaceBorrowClose(finalBorrow);
});

test("workspace ownership and transfer counterfeits fail lowering", async () => {
  const header =
    "from sagejs.ffi.flint import NativeExactWorkspace, " +
      "NativeExactWorkspaceBorrow, native_exact_workspace_borrow\n" +
    "from sagejs.native import NativeExactArena, native, uint64\n" +
    "@native\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(workspace: NativeExactWorkspace) -> NativeExactWorkspace:\n" +
        "    return workspace\n",
      "workspace-owner-return.py",
    ),
    /must transfer a newly owned local resource/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(workspace: NativeExactWorkspace, n: uint64) -> " +
          "NativeExactWorkspaceBorrow:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        borrow = arena.foreign_resource(" +
          "native_exact_workspace_borrow, workspace, 1, 2, 3)\n" +
        "        return borrow\n",
      "workspace-borrow-return.py",
    ),
    /newly owned local resource/,
  );
});

test("C6 generated resident code stays within the direct-reference budget", {
  skip: process.platform !== "linux"
    ? "ELF symbol-size comparison is Linux-only"
    : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-workspace-c6-"));
  const prefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  try {
    const reference = readFileSync(join(
      root, "test", "fixtures", "native-exact-workspace-direct-reference.c",
    ), "utf8");
    writeFileSync(join(temporary, "kernel_core.c"), `${core.source}\n${reference}`);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), String.raw`
#include <assert.h>
#include <gmp.h>
#include "kernel_core.h"
int sagejs_direct_accumulate_relation_workspace(
    sagejs_native_status *, mpz_t, mpz_t, uint64_t *,
    sagejs_native_exact_workspace_t, uint64_t, uint64_t, uint64_t,
    const mpz_t, const mpz_t, uint64_t, uint64_t, uint64_t);
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    sagejs_native_exact_workspace_t generated = {{0}}, direct = {{0}};
    mpz_t first, second, generated0, generated1, direct0, direct1;
    uint64_t generated_generation = 0, direct_generation = 0;
    mpz_inits(first, second, generated0, generated1, direct0, direct1, NULL);
    mpz_set_ui(first, 7);
    mpz_set_ui(second, 5);
    assert(sagejs_kernel_create_relation_workspace(
        &status, generated, 4, 128, 1000000, 11, 22));
    assert(sagejs_kernel_create_relation_workspace(
        &status, direct, 4, 128, 1000000, 11, 22));
    assert(sagejs_kernel_accumulate_relation_workspace(
        &status, generated0, generated1, &generated_generation,
        generated, 1, 11, 22, first, second, 4, 1048576, 1048576));
    assert(sagejs_direct_accumulate_relation_workspace(
        &status, direct0, direct1, &direct_generation,
        direct, 1, 11, 22, first, second, 4, 1048576, 1048576));
    assert(mpz_cmp(generated0, direct0) == 0);
    assert(mpz_cmp(generated1, direct1) == 0);
    assert(generated_generation == direct_generation);
    sagejs_native_exact_workspace_clear(direct);
    sagejs_native_exact_workspace_clear(generated);
    mpz_clears(direct1, direct0, generated1, generated0, second, first, NULL);
    return 0;
}
`);
    const executable = join(temporary, "workspace-quality");
    const build = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O3", "-ffunction-sections",
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
      cwd: root, encoding: "utf8", timeout: 120_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const symbols = spawnSync("nm", ["-S", "--defined-only", executable], {
      cwd: root, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(symbols.status, 0, symbols.stderr || symbols.stdout);
    const sizes = new Map();
    for (const line of symbols.stdout.split("\n")) {
      const match = line.trim().match(
        /^[0-9a-fA-F]+\s+([0-9a-fA-F]+)\s+[Tt]\s+(\S+)$/,
      );
      if (match) sizes.set(match[2], Number.parseInt(match[1], 16));
    }
    const generatedSize = sizes.get(
      "sagejs_kernel_accumulate_relation_workspace",
    );
    const referenceSize = sizes.get(
      "sagejs_direct_accumulate_relation_workspace",
    );
    assert.ok(generatedSize > 0 && referenceSize > 0, symbols.stdout);
    assert.ok(
      generatedSize <= Math.ceil(referenceSize * 1.5),
      `generated ${generatedSize} bytes exceeds 1.5x direct ${referenceSize}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("workspace owner and borrow cleanup are sanitizer-clean", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-workspace-asan-"));
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
    sagejs_native_exact_workspace_t workspace = {{0}};
    mpz_t first, second, output0, output1;
    uint64_t generation = 0;
    mpz_inits(first, second, output0, output1, NULL);
    assert(sagejs_kernel_create_relation_workspace(
        &status, workspace, 4, 128, 1000000, 11, 22));
    mpz_set_ui(first, 7);
    mpz_set_ui(second, 5);
    for (unsigned round = 0; round < 100; round++)
    {
        status.code = SAGEJS_NATIVE_OK;
        status.message = NULL;
        assert(sagejs_kernel_accumulate_relation_workspace(
            &status, output0, output1, &generation, workspace,
            1, 11, 22, first, second, 4, 1048576, 1048576));
        assert(mpz_cmp_si(output0, -37) == 0);
        assert(mpz_cmp_ui(output1, 37) == 0);
        assert(generation == 1);
    }
    status.code = SAGEJS_NATIVE_OK;
    assert(!sagejs_kernel_accumulate_relation_workspace(
        &status, output0, output1, &generation, workspace,
        1, 11, 23, first, second, 4, 1048576, 1048576));
    assert(status.code != SAGEJS_NATIVE_OK);
    status.code = SAGEJS_NATIVE_OK;
    assert(sagejs_kernel_reset_relation_workspace(
        &status, &generation, workspace, 1, 11, 22));
    assert(generation == 2);
    sagejs_native_exact_workspace_clear(workspace);
    mpz_clears(first, second, output0, output1, NULL);
    return 0;
}
`);
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const executable = join(temporary, "workspace-sanitizer");
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

test("reusable workspace runs through the isolated WASI core", async (context) => {
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
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-workspace-wasi-"));
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
    sagejs_native_exact_workspace_t workspace = {{0}};
    mpz_t first, second, output0, output1;
    uint64_t generation = 0;
    mpz_inits(first, second, output0, output1, NULL);
    mpz_set_ui(first, 7);
    mpz_set_ui(second, 5);
    assert(sagejs_kernel_create_relation_workspace(
        &status, workspace, 4, 128, 1000000, 11, 22));
    assert(sagejs_kernel_accumulate_relation_workspace(
        &status, output0, output1, &generation, workspace,
        1, 11, 22, first, second, 4, 1048576, 1048576));
    assert(mpz_cmp_si(output0, -37) == 0);
    assert(mpz_cmp_ui(output1, 37) == 0);
    assert(generation == 1);
    assert(sagejs_kernel_reset_relation_workspace(
        &status, &generation, workspace, 1, 11, 22));
    assert(generation == 2);
    sagejs_native_exact_workspace_clear(workspace);
    mpz_clears(first, second, output0, output1, NULL);
    return 0;
}
`);
    const libraries = toolchain.paths.libraries;
    const wasm = join(temporary, "workspace.wasm");
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
