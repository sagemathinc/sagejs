// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_live_exact_arena.py");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <gmp.h>
#include "kernel_core.h"

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    mpz_t value, result;
    mpz_inits(value, result, NULL);
    mpz_set_ui(value, 1);
    for (unsigned round = 0; round < 1000; round += 1)
    {
        assert(!sagejs_kernel_live_arena_shared_limit(
            &status, result, 193, value));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
        assert(sagejs_kernel_live_arena_shared_limit(
            &status, result, 194, value));
        assert(status.code == SAGEJS_NATIVE_OK);
        assert(mpz_cmp_ui(result, 2) == 0);
    }
    mpz_ui_pow_ui(value, 2, 4096);
    assert(!sagejs_kernel_live_arena_shared_limit(
        &status, result, 512, value));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    mpz_set_ui(value, 7);
    assert(sagejs_kernel_live_arena_shared_limit(
        &status, result, 512, value));
    assert(mpz_cmp_ui(result, 14) == 0);
    mpz_clears(value, result, NULL);
    return 0;
}
`;

test("exact arenas release every shared charge under sanitizers", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-arena-asan-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), harness);
    const executable = join(temporary, "live-arena-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-Wno-error=unused-function",
      "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"),
      join(temporary, "harness.c"),
      join(prefix, "lib", "libgmp.a"),
      "-lm",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(
      compile.status,
      0,
      `sanitizer compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed: ${run.error?.message || ""}\n` +
        `${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
