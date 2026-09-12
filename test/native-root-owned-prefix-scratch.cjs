// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "bench/native_root_owned_prefix_scratch.py");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages/flint/.native/prefix"));

test("fixed root scratch retains one checkpoint and qualifies borrowed prefix helpers", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.deepEqual(ir.functions.map((fn) => fn.analysis.backend.kind), ["fmpz", "fmpz"]);
  assert.equal(ir.functions[0].analysis.liveExactWorkspace.scopes.length, 1);
  assert.equal(ir.functions[1].analysis.liveExactWorkspace, undefined);
  const core = generateHostCore(ir);
  for (const backend of ["native_", "fmpz_native_"]) {
    for (const [name, checkpoints] of [
      ["root_owned_prefix_scratch", 1], ["_root_scratch_closure", 0],
    ]) {
      const implementation = core.source.match(new RegExp(
        `static int ${backend}${name}\\([^;]+?\\n\\{[\\s\\S]*?\\n\\}`,
      ));
      assert.ok(implementation, `${backend}${name} implementation missing`);
      assert.equal((implementation[0].match(/checkpoint_begin/g) || []).length,
        checkpoints);
    }
  }
  assert.match(core.source, /sagejs_fmpz_matrix_hnf_transform_prefix/);
  assert.match(core.source, /sagejs_fmpz_matrix_lll_transform_prefix/);
  assert.doesNotMatch(core.source, /checkpoint_rewind/);
});

test("repeated changing prefixes agree in dynamic, GMP and fmpz execution", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-root-prefix-differential-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const compiled = await compileKernel({ sourcePath,
    cacheRoot: join(temporary, "cache") });
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
// An isolated worktree may reuse a read-only prepared dynamic FFI installation.
if (process.env.SAGEJS_TEST_FFI_ROOT) {
  const { createRequire } = require("node:module");
  globalThis.__sagejs_runtime_require__ = createRequire(
    process.env.SAGEJS_TEST_FFI_ROOT + "/package.json");
}
const fn = require(process.argv[1]).root_owned_prefix_scratch;
for (const value of [3n, -7n, (1n << 80n) + 13n, -(1n << 255n) + 11n]) {
  for (const repeats of [1n, 3n]) {
    const expected = value * value + 17n + 90n * repeats;
    for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
      assert.equal(implementation(value, 3n << 20n, 3n << 20n,
        repeats, false), expected);
      assert.throws(() => implementation(value, 3n << 20n,
        3n << 20n, 1n, true), /division by zero/);
      assert.equal(implementation(value, 3n << 20n, 3n << 20n,
        1n, false), value * value + 107n);
    }
  }
}
`, compiled.modulePath], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});

test("fixed root scratch survives exhaustion and helper exceptions under sanitizers", {
  skip: process.platform === "win32" ? "standalone sanitizer harness is Unix-only" : false,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-root-prefix-sanitizer-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  writeFileSync(join(temporary, "kernel_core.c"), core.source);
  writeFileSync(join(temporary, "kernel_core.h"), core.header);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <gmp.h>
#include <flint/flint.h>
#include <stdio.h>
#include "kernel_core.c"

static int test_gmp = 0;
static int run_root(sagejs_native_status *status, mpz_t output,
    const mpz_t value, uint64_t memory, uint64_t temporary,
    uint64_t repeats, int fail)
{
    status->code = SAGEJS_NATIVE_OK;
    status->message = NULL;
    /* Exercise the generated GMP entry as well as the public fmpz adapter.
       This translation-unit harness does not change emitted algorithms. */
    return test_gmp
        ? native_root_owned_prefix_scratch(
            status, output, value, memory, temporary, repeats, fail)
        : sagejs_kernel_root_owned_prefix_scratch(
            status, output, value, memory, temporary, repeats, fail);
}

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    mpz_t value, output, expected;
    mpz_inits(value, output, expected, NULL);
    for (test_gmp = 0; test_gmp < 2; test_gmp++) {
      size_t high_water = 0;
      for (unsigned round = 0; round < 24; round++) {
        mpz_set_ui(value, 1);
        mpz_mul_2exp(value, value, round % 2 ? 255 : 80);
        mpz_add_ui(value, value, round + 3);
        mpz_mul(expected, value, value);
        mpz_add_ui(expected, expected, 287);
        assert(run_root(
            &status, output, value, 3u << 20, 3u << 20, 3, 0));
        assert(mpz_cmp(output, expected) == 0);
        sagejs_native_gmp_checkpoint_stats stats = {0};
        assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
        assert(stats.high_water > 0 && stats.high_water <= (3u << 20));
        assert(stats.soft_limit_exhaustions == 0);
        assert(stats.upstream_allocations == 0);
        if (stats.high_water > high_water) high_water = stats.high_water;
        assert(!run_root(
            &status, output, value, 3u << 20, 3u << 20, 1, 1));
        assert(status.code != SAGEJS_NATIVE_OK);
        assert(mpz_cmp(output, expected) == 0);
        assert(!run_root(
            &status, output, value, 0, 3u << 20, 1, 0));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
        assert(mpz_cmp(output, expected) == 0);
        assert(!run_root(
            &status, output, value, 3u << 20, 16, 1, 0));
        assert(status.code == SAGEJS_NATIVE_RETRY);
        assert(mpz_cmp(output, expected) == 0);
        assert(run_root(
            &status, output, value, 3u << 20, 3u << 20, 3, 0));
        assert(mpz_cmp(output, expected) == 0);
      }
      printf("%s checkpoint high-water: %zu bytes\n",
          test_gmp ? "GMP" : "fmpz", high_water);
    }
    mpz_clears(value, output, expected, NULL);
    flint_cleanup();
    return 0;
}
`);
  const executable = join(temporary, "root-prefix-sanitizer");
  const compile = spawnSync(process.env.CC || "cc", [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${temporary}`, `-I${join(prefix, "include")}`,
    `-I${join(root, "packages/flint/include")}`,
    join(temporary, "harness.c"),
    `-L${join(prefix, "lib")}`, "-lflint", "-lopenblas", "-lmpfr", "-lgmp",
    "-lm", "-lpthread", "-o", executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(compile.status, 0, `${compile.error || ""}\n${compile.stdout}${compile.stderr}`);
  const run = spawnSync(executable, [], { cwd: root, encoding: "utf8",
    timeout: 120_000, env: sanitizerEnvironment({ strictStringChecks: true }) });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
  t.diagnostic(run.stdout.trim());
});
