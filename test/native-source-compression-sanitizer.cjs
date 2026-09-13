// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

test("slice and bundle failures release the arena without publishing partial output", {
  skip: process.platform === "win32" ? "standalone sanitizer harness is Unix-only" : false,
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), "source-compression-asan-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname, "../bench/native_source_compression_safety.py");
  const core = generateHostCore(await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath));
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "harness.c"), `
#include <assert.h>
#include <gmp.h>
#include "kernel_core.h"
int main(void) {
    mpz_t value, output;
    mpz_inits(value, output, NULL);
    mpz_ui_pow_ui(value, 2, 300);
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    for (int round = 0; round < 1000; ++round) {
        mpz_set_ui(output, 97);
        assert(!sagejs_kernel_checked(&status, output, value, 1, 3));
        assert(mpz_cmp_ui(output, 97) == 0);
        assert(!sagejs_kernel_checked(&status, output, value, 8192, 4));
        assert(mpz_cmp_ui(output, 97) == 0);
        assert(!sagejs_kernel_checked(&status, output, value, 8192, 2));
        assert(mpz_cmp_ui(output, 97) == 0);
        assert(sagejs_kernel_checked(&status, output, value, 8192, 3));
        assert(mpz_cmp(output, value) == 0);
    }
    mpz_clears(value, output, NULL);
    return 0;
}
`);
  const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(__dirname, "../packages/flint/.native/prefix"));
  const executable = join(directory, "check");
  const compile = spawnSync(process.env.CC || "cc", ["-std=c11", "-O1", "-g",
    "-fno-omit-frame-pointer", process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${directory}`, `-I${join(prefix, "include")}`, join(directory, "kernel_core.c"),
    join(directory, "harness.c"), join(prefix, "lib/libflint.a"), join(prefix, "lib/libmpfr.a"),
    join(prefix, "lib/libgmp.a"), join(prefix, "lib/libopenblas.a"), "-lm", "-lpthread", "-o", executable],
  { encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const result = spawnSync(executable, [], { encoding: "utf8", timeout: 120000, env: sanitizerEnvironment() });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("fixed slices and borrowed bundles execute in a WASI core", async t => {
  let toolchain;
  try {
    toolchain = require("../packages/wasm-toolchain/scripts/toolchain.cjs").resolveToolchain({ root: resolve(__dirname, "..") });
  } catch {
    t.skip("a prepared WASI GMP toolchain is not available");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "compression-wasi-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = resolve(__dirname, "../bench/native_source_compression_safety.py");
  // A bounded vector selects the portable GMP core, using the same bundle
  // and slice lowering without requiring a separate Wasm FLINT installation.
  const source = readFileSync(sourcePath, "utf8").replace("integer_vector(3, 0)", "integer_vector(3, 512)");
  const core = generateHostCore(await lowerSource(source, sourcePath));
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "driver.c"), `
#include <assert.h>
#include <gmp.h>
#include "kernel_core.h"
int main(void) {
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    mpz_t value, output;
    mpz_inits(value, output, NULL);
    mpz_ui_pow_ui(value, 2, 300);
    mpz_set_ui(output, 97);
    assert(!sagejs_kernel_checked(&status, output, value, 8192, 2));
    assert(mpz_cmp_ui(output, 97) == 0);
    assert(sagejs_kernel_checked(&status, output, value, 8192, 3));
    assert(mpz_cmp(output, value) == 0);
    mpz_clears(value, output, NULL);
    return 0;
}
`);
  const prefix = toolchain.paths.libraries.gmp.prefix;
  const wasm = join(directory, "check.wasm");
  const built = spawnSync(toolchain.paths.clang, ["--target=wasm32-wasip1", `--sysroot=${toolchain.paths.sysroot}`,
    "-O3", `-I${directory}`, `-I${join(prefix, "include")}`, join(directory, "kernel_core.c"), join(directory, "driver.c"),
    resolve(__dirname, "../packages/flint-wasm/src/wasi-stubs.c"), `-L${join(prefix, "lib")}`, "-lgmp", "-lm", "-lwasi-emulated-signal", "-o", wasm],
  { encoding: "utf8", timeout: 120000 });
  assert.equal(built.status, 0, built.stderr);
  const result = spawnSync(process.execPath, ["-e", `
const {WASI}=require('node:wasi');
const fs=require('node:fs');
(async()=>{const wasi=new WASI({version:'preview1',args:[],env:{},returnOnExit:true});
const module=await WebAssembly.compile(fs.readFileSync(process.argv[1]));
const instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});
process.exitCode=wasi.start(instance) || 0;})().catch(e=>{console.error(e);process.exitCode=1});
`, wasm], { encoding: "utf8", timeout: 120000 });
  assert.equal(result.status, 0, result.stderr);
});
