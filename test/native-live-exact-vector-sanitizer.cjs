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
const sourcePath = resolve(root, "bench/native_live_exact_vector.py");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include <gmp.h>
#include "kernel_core.h"

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    mpz_t seed, left, right, result, first, second, index;
    mpz_inits(seed, left, right, result, first, second, index, NULL);
    mpz_set_si(seed, -7);
    mpz_ui_pow_ui(left, 2, 257);
    mpz_add_ui(left, left, 17);
    mpz_ui_pow_ui(right, 2, 199);
    mpz_neg(right, right);
    mpz_add_ui(right, right, 3);

    for (unsigned round = 0; round < 500; round += 1)
    {
        assert(sagejs_kernel_live_addmul(
            &status, result, 1, 4096, seed, left, right, 19));
        assert(status.code == SAGEJS_NATIVE_OK);
    }

    mpz_set_ui(result, 123);
    assert(!sagejs_kernel_live_addmul(
        &status, result, 1, 32, left, left, right, 1));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    assert(mpz_cmp_ui(result, 123) == 0);

    assert(sagejs_kernel_live_vector_operations(
        &status, first, second, 4096, left, right));
    assert(status.code == SAGEJS_NATIVE_OK);

    mpz_set_si(index, -1);
    assert(!sagejs_kernel_live_vector_index(&status, result, 64, index));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);

    assert(sagejs_kernel_live_addmul(
        &status, result, 1, 4096, seed, left, right, 1));
    assert(status.code == SAGEJS_NATIVE_OK);

    mpz_clears(seed, left, right, result, first, second, index, NULL);
    return 0;
}
`;

test("live exact vectors clean up transactionally under ASan and UBSan", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-vector-asan-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), harness);
    const executable = join(temporary, "live-vector-sanitizer");
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-Wno-error=unused-function",
      "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined",
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"),
      join(temporary, "harness.c"),
      join(prefix, "lib", "libgmp.a"),
      "-lm",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(
      compile.status,
      0,
      `sanitizer compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed:\n${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
