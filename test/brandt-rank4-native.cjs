// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(
  __dirname,
  "../src/lib/sagejs/kernels/quaternion/brandt_rank4.py",
);
const diagonalGram = [
  2n, 0n, 0n, 0n,
  0n, 2n, 0n, 0n,
  0n, 0n, 2n, 0n,
  0n, 0n, 0n, 2n,
];

function runThetaNative(fn) {
  const output = fn.createUInt64Buffer(4);
  assert.equal(
    fn(
      output,
      fn.packIntegerBuffer(diagonalGram),
      fn.createUInt64Buffer([2n, 2n, 2n, 2n]),
      1n,
      2n,
      4n,
      65536n,
    ),
    true,
  );
  return Array.from(output);
}

function runVectorsNative(fn, capacity = 8) {
  const output = fn.createIntegerBuffer(4 * capacity, 4);
  const metadata = fn.createUInt64Buffer(1);
  const ok = fn(
    output,
    metadata,
    fn.packIntegerBuffer(diagonalGram),
    fn.createUInt64Buffer([1n, 1n, 1n, 1n]),
    1n,
    2n,
    65536n,
  );
  return { ok, count: Array.from(metadata)[0], values: output.toArray() };
}

test("Brandt rank-four kernels have isolated exact workspace IR", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  assert.deepEqual(
    ir.functions.map((fn) => fn.name),
    ["brandt_rank4_theta_counts", "brandt_rank4_vectors_of_norm"],
  );
  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "gmp");
    assert.equal(fn.analysis.execution.liveExactScopes, 1);
    assert.equal(fn.analysis.execution.nativeCalls, 0);
    assert.deepEqual(fn.analysis.effects.calls, []);
    assert.equal(fn.analysis.effects.threadSafe, true);
    assert.equal(fn.analysis.liveExactWorkspace.scopes[0].cleanup, "all-exit-idempotent");
  }
  const core = generateHostCore(ir);
  assert.equal(core.audit.isolated, true);
  assert.match(core.source, /mpz_addmul/);
  assert.match(core.source, /sagejs_native_integer_vector_clear/);
  assert.doesNotMatch(core.source, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
});

test("Brandt rank-four native and JavaScript kernels agree exactly", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-brandt-rank4-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    const module = require(compiled.modulePath);
    const theta = module.brandt_rank4_theta_counts;
    const vectors = module.brandt_rank4_vectors_of_norm;

    assert.deepEqual(runThetaNative(theta), [1n, 8n, 24n, 32n]);
    const dynamicTheta = Array(4).fill(0n);
    assert.equal(
      theta.javascript(
        dynamicTheta,
        diagonalGram,
        [2n, 2n, 2n, 2n],
        1n,
        2n,
        4n,
        65536n,
      ),
      true,
    );
    assert.deepEqual(dynamicTheta, [1n, 8n, 24n, 32n]);

    const native = runVectorsNative(vectors);
    assert.equal(native.ok, true);
    assert.equal(native.count, 8n);
    const dynamicOutput = Array(32).fill(0n);
    const dynamicMetadata = [0n];
    assert.equal(
      vectors.javascript(
        dynamicOutput,
        dynamicMetadata,
        diagonalGram,
        [1n, 1n, 1n, 1n],
        1n,
        2n,
        65536n,
      ),
      true,
    );
    assert.deepEqual(dynamicMetadata, [8n]);
    assert.deepEqual(native.values, dynamicOutput);

    const bounded = runVectorsNative(vectors, 7);
    assert.equal(bounded.ok, false);
    assert.equal(bounded.count, 0n);
    assert.throws(
      () => theta(
        theta.createUInt64Buffer(4),
        theta.packIntegerBuffer(diagonalGram),
        theta.createUInt64Buffer([2n, 2n, 2n, 2n]),
        1n,
        2n,
        4n,
        1n,
      ),
      /memory limit exceeded/,
    );
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("Brandt rank-four generated core is a standalone GMP program", {
  skip: process.platform === "win32" ? "POSIX static-link witness" : false,
}, async (context) => {
  const nativePrefix = join(root, "packages", "flint", ".native", "prefix");
  const gmp = join(nativePrefix, "lib", "libgmp.a");
  if (!existsSync(gmp) || spawnSync(process.env.CC || "cc", ["--version"]).status !== 0) {
    context.skip("a native C compiler and the prepared static GMP are required");
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-brandt-rank4-core-"));
  try {
    const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
    const core = generateHostCore(ir);
    const corePath = join(temporary, "kernel_core.c");
    const headerPath = join(temporary, "kernel_core.h");
    const driverPath = join(temporary, "driver.c");
    const executable = join(temporary, "brandt-rank4");
    writeFileSync(corePath, core.source);
    writeFileSync(headerPath, core.header);
    writeFileSync(driverPath, `#include <stdint.h>
#include <stdio.h>
#include "kernel_core.h"

int main(void)
{
    int32_t gram_sizes[16] = {0};
    uint64_t gram_limbs[16] = {0};
    uint64_t counts[4] = {0};
    uint64_t count_bounds[4] = {2, 2, 2, 2};
    int32_t vector_sizes[32] = {0};
    uint64_t vector_limbs[32] = {0};
    uint64_t vector_bounds[4] = {1, 1, 1, 1};
    uint64_t metadata[1] = {0};
    sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
    sagejs_integer_buffer gram = {gram_sizes, gram_limbs, 16, 1};
    sagejs_uint64_buffer count_output = {counts, 4};
    sagejs_uint64_buffer bounds = {count_bounds, 4};
    sagejs_integer_buffer vectors = {vector_sizes, vector_limbs, 32, 1};
    sagejs_uint64_buffer vector_metadata = {metadata, 1};
    sagejs_uint64_buffer exact_bounds = {vector_bounds, 4};
    mpz_t one, two;
    int output = 0;
    int index;
    for (index = 0; index < 4; index++)
    {
        gram_sizes[5 * index] = 1;
        gram_limbs[5 * index] = 2;
    }
    mpz_init_set_ui(one, 1);
    mpz_init_set_ui(two, 2);
    if (!sagejs_kernel_brandt_rank4_theta_counts(
            &status, &output, count_output, gram, bounds,
            one, two, 4, 65536) || !output)
        return 1;
    if (counts[0] != 1 || counts[1] != 8 ||
        counts[2] != 24 || counts[3] != 32)
        return 2;
    output = 0;
    if (!sagejs_kernel_brandt_rank4_vectors_of_norm(
            &status, &output, vectors, vector_metadata, gram, exact_bounds,
            one, two, 65536) || !output || metadata[0] != 8)
        return 3;
    printf("%llu %llu %llu %llu vectors=%llu\\n",
        (unsigned long long)counts[0], (unsigned long long)counts[1],
        (unsigned long long)counts[2], (unsigned long long)counts[3],
        (unsigned long long)metadata[0]);
    mpz_clear(two);
    mpz_clear(one);
    return 0;
}
`);
    const compiled = spawnSync(process.env.CC || "cc", [
      "-O3",
      `-I${temporary}`,
      `-I${join(nativePrefix, "include")}`,
      corePath,
      driverPath,
      gmp,
      "-lm",
      "-o",
      executable,
    ], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
    const executed = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(executed.stdout.trim(), "1 8 24 32 vectors=8");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
