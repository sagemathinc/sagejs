#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const {
  GMP_CHECKPOINT_ALLOCATOR_C_SOURCE,
} = require("../tools/native-kernel/gmp-checkpoint-allocator.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_live_exact_arena.py");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

const harness = String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <gmp.h>
#include "kernel_core.h"

static void run_case(
    const char *label,
    uint64_t repetitions,
    mpz_t first,
    mpz_t second,
    const mpz_t left,
    const mpz_t right)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    sagejs_native_gmp_checkpoint_stats stats = {0};
    uint64_t rows = 0;
    assert(sagejs_kernel_live_arena_relation_step(
        &status, first, second, &rows, UINT64_C(67108864),
        UINT64_C(2097152), UINT64_C(1048576),
        left, right, repetitions));
    assert(status.code == SAGEJS_NATIVE_OK);
    assert(rows == 2);
    assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
    printf(
        "%s|%llu|%llu|%llu|%llu|%llu|%llu\n",
        label,
        (unsigned long long) stats.allocation_calls,
        (unsigned long long) stats.reallocation_calls,
        (unsigned long long) stats.free_calls,
        (unsigned long long) stats.requested_bytes,
        (unsigned long long) stats.high_water,
        (unsigned long long) stats.spill_allocations);
}

int main(void)
{
    mpz_t left, right, first, second;
    assert(sagejs_native_gmp_allocator_install());
    mpz_init2(left, 512);
    mpz_init2(right, 512);
    mpz_init2(first, 1048576);
    mpz_init2(second, 1048576);
    mpz_ui_pow_ui(left, 2, 300);
    mpz_neg(left, left);
    mpz_ui_pow_ui(right, 2, 199);
    mpz_add_ui(right, right, 3);
    run_case("zero", 0, first, second, left, right);
    run_case("one", 1, first, second, left, right);
    run_case("thousand", 1000, first, second, left, right);
    mpz_clears(left, right, first, second, NULL);
    return 0;
}
`;

async function main() {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-gmp-allocation-audit-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(
      join(temporary, "harness.c"),
      `#define SAGEJS_NATIVE_GMP_ALLOCATOR_API\n` +
        `${GMP_CHECKPOINT_ALLOCATOR_C_SOURCE}\n${harness}`,
    );
    const executable = join(temporary, "allocation-audit");
    const coreObject = join(temporary, "kernel_core.o");
    const compileCore = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O3",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-Wno-error=unused-function",
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      "-DSAGEJS_NATIVE_GMP_ALLOCATOR_EXTERNAL=1",
      "-c",
      join(temporary, "kernel_core.c"),
      "-o",
      coreObject,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(
      compileCore.status,
      0,
      `allocation-audit core compile failed:\n` +
        `${compileCore.stdout}${compileCore.stderr}`,
    );
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O3",
      "-Wall",
      "-Wextra",
      "-Werror",
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "harness.c"),
      coreObject,
      join(prefix, "lib", "libgmp.a"),
      "-lm",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(
      compile.status,
      0,
      `allocation-audit compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `allocation-audit failed: ${run.error?.message || ""}\n` +
        `${run.stdout}${run.stderr}`,
    );
    const records = run.stdout.trim().split("\n").map((line) => {
      const [
        label,
        allocations,
        reallocations,
        frees,
        bytes,
        highWater,
        spills,
      ] = line.split("|");
      return {
        label,
        allocations: Number(allocations),
        reallocations: Number(reallocations),
        frees: Number(frees),
        allocatedBytes: Number(bytes),
        highWaterBytes: Number(highWater),
        spills: Number(spills),
      };
    });
    const setup = records[0];
    for (const record of records) {
      assert.equal(
        record.allocations,
        setup.allocations,
        `${record.label} introduced iteration-scaled GMP allocations`,
      );
      assert.equal(
        record.reallocations,
        0,
        `${record.label} introduced GMP reallocations`,
      );
      assert.equal(record.frees, record.allocations);
      assert.equal(record.spills, 0);
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.native-exact-allocation-audit/v1",
      irVersion: ir.version,
      sourcePath: "bench/native_live_exact_arena.py",
      invariant: "allocator-call-count-independent-of-loop-iterations",
      records,
    }, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
