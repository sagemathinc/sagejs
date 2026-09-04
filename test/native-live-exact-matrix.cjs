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
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const sourcePath = resolve(__dirname, "../bench/native_live_exact_matrix.py");

function runCompiledWitness(modulePath, source) {
  const result = spawnSync(
    process.execPath,
    ["-e", source, modulePath],
    { encoding: "utf8", timeout: 120_000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("the ordinary CPython matrix source remains the exact oracle", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
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
assert source["live_matrix_addmul"](
    2, 3, 4096, 1, 2, 7, left, right, 11
) == 7 + 11 * left * right
matrix_value, vector_value = source["live_matrix_and_vector"](
    4096, 4096, left, right
)
assert matrix_value == left + right * right
assert vector_value == right + matrix_value * left
assert source["live_matrix_operations"](4096, left, right) == (
    right, left * (1 - right), 2
)
try:
    source["live_matrix_index"](256, 0, 3)
except IndexError as error:
    assert str(error) == "NativeIntegerMatrix index out of range"
else:
    raise AssertionError("one-past-column access succeeded")
`], {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("live exact matrices have shaped lexical GMP ownership", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  assert.equal(ir.version, 36);
  const addmul = ir.functions.find((fn) => fn.name === "live_matrix_addmul");
  assert.equal(addmul.analysis.backend.kind, "gmp");
  assert.equal(addmul.analysis.backend.requiresExactWorkspace, true);
  assert.equal(addmul.analysis.execution.liveExactScopes, 1);
  assert.deepEqual(addmul.analysis.effects.mayRaise, [
    "IndexError",
    "MemoryError",
  ]);
  assert.deepEqual(addmul.analysis.liveExactWorkspace.scopes, [{
    owner: "values",
    rows: "rows",
    columns: "columns",
    memoryLimit: "memory_limit",
    storage: "lexical-owned-row-major-mpz-matrix",
    cleanup: "all-exit-idempotent",
    canonicalAuthority: false,
  }]);
  const scope = addmul.body.find(
    (operation) => operation.kind === "integer.matrix.scope",
  );
  assert.ok(scope);
  assert.ok(scope.body.some(
    (operation) => operation.kind === "loop.range" &&
      operation.body.some(
        (nested) => nested.kind === "integer.matrix.addmul",
      ),
  ));

  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /sagejs_native_integer_matrix_init/);
  assert.match(core.source, /sagejs_native_integer_matrix_addmul/);
  assert.match(core.source, /sagejs_native_integer_matrix_clear/);
  assert.doesNotMatch(core.source, /sagejs_integer_buffer_get_mpz/);

  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-live-matrix-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runCompiledWitness(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
const seed = -(1n << 300n);
const left = (1n << 257n) + 17n;
const right = -(1n << 199n) + 3n;
const repetitions = 11n;
const expected = seed + repetitions * left * right;
for (const implementation of [
  module.live_matrix_addmul,
  module.live_matrix_addmul.javascript,
  module.live_matrix_addmul.gmp,
  module.live_matrix_addmul.tagged,
]) {
  assert.equal(
    implementation(2n, 3n, 4096n, 1n, 2n, seed, left, right, repetitions),
    expected,
  );
}

const mixedMatrix = left + right * right;
const mixedVector = right + mixedMatrix * left;
for (const implementation of [
  module.live_matrix_and_vector,
  module.live_matrix_and_vector.javascript,
  module.live_matrix_and_vector.gmp,
  module.live_matrix_and_vector.tagged,
]) {
  assert.deepEqual(
    Array.from(implementation(4096n, 4096n, left, right)),
    [mixedMatrix, mixedVector],
  );
}

const operationExpected = -12345678901234567890n * (1n - 97n);
for (const implementation of [
  module.live_matrix_operations,
  module.live_matrix_operations.javascript,
  module.live_matrix_operations.gmp,
  module.live_matrix_operations.tagged,
]) {
  assert.deepEqual(
    Array.from(implementation(4096n, -12345678901234567890n, 97n)),
    [97n, operationExpected, 2n],
  );
}

for (const implementation of [
  module.live_matrix_addmul,
  module.live_matrix_addmul.javascript,
]) {
  assert.throws(
    () => implementation(2n, 3n, 191n, 0n, 0n, 1n, 1n, 1n, 0n),
    /NativeIntegerMatrix memory limit exceeded/,
  );
  assert.throws(
    () => implementation(
      1n, 1n, 64n, 0n, 0n, 1n << 1000n, 1n, 1n, 0n,
    ),
    /NativeIntegerMatrix memory limit exceeded/,
  );
  assert.throws(
    () => implementation(
      (1n << 64n) - 1n, 2n, (1n << 64n) - 1n,
      0n, 0n, 1n, 1n, 1n, 0n,
    ),
    /NativeIntegerMatrix dimensions are too large/,
  );
  assert.equal(
    implementation(2n, 3n, 256n, 1n, 2n, 2n, 3n, 5n, 7n),
    107n,
  );
}
for (const implementation of [
  module.live_matrix_index,
  module.live_matrix_index.javascript,
]) {
  assert.throws(
    () => implementation(256n, -1n, 0n),
    /NativeIntegerMatrix index out of range/,
  );
  assert.throws(
    () => implementation(256n, 0n, 3n),
    /NativeIntegerMatrix index out of range/,
  );
  assert.throws(
    () => implementation(256n, 2n, 0n),
    /NativeIntegerMatrix index out of range/,
  );
}
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("live exact matrix owners cannot escape or alias", async () => {
  const header =
    "from sagejs.native import NativeIntegerMatrix, native, uint64\n" +
    "@native\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerMatrix(1, 1, n) as values:\n" +
        "        alias = values\n" +
        "        return 0\n",
      "live-matrix-alias.py",
    ),
    /live exact owners cannot be copied, passed, or returned/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerMatrix(1, 1, n) as values:\n" +
        "        values[0, 0] = 1\n" +
        "    return values[0, 0]\n",
      "live-matrix-after-scope.py",
    ),
    /outside its lexical scope/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "def f(n: uint64) -> int:\n" +
        "    with NativeIntegerMatrix(1, 1, n) as values:\n" +
        "        values.close()\n" +
        "        return 0\n",
      "live-matrix-close.py",
    ),
    /unsupported NativeIntegerMatrix method close/,
  );
});

test("the exact matrix core compiles and runs through WASI", async (context) => {
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
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-matrix-wasi-"));
  try {
    const coreSource = join(temporary, "kernel_core.c");
    const coreHeader = join(temporary, "kernel_core.h");
    const driver = join(temporary, "driver.c");
    const wasm = join(temporary, "live-matrix.wasm");
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
    mpz_t left, right, first, second;
    uint64_t rows = 0;
    mpz_inits(left, right, first, second, NULL);
    mpz_set_si(left, -17);
    mpz_set_ui(right, 5);
    assert(sagejs_kernel_live_matrix_operations(
        &status, first, second, &rows, 4096, left, right));
    assert(status.code == SAGEJS_NATIVE_OK);
    assert(mpz_cmp_ui(first, 5) == 0);
    assert(mpz_cmp_si(second, 68) == 0);
    assert(rows == 2);
    mpz_clears(left, right, first, second, NULL);
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
      resolve(
        __dirname,
        "../packages/flint-wasm/src/wasi-stubs.c",
      ),
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
