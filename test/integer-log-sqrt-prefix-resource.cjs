#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const generated = join(root, "packages/flint/build/generated-ffi");
const witness = join(__dirname, "fixtures/integer-log-sqrt-prefix-resource.py");

function addon() {
  return require(join(generated, require(join(generated, "manifest.json")).addon));
}

function matrix(flint, rows, columns, values) {
  const resource = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    values.forEach((value, i) => {
      assert.equal(flint.ffiFmpzMatrixSetEntry(resource,
        BigInt(Math.floor(i / columns)), BigInt(i % columns), BigInt(value)), true);
    });
    return resource;
  } catch (error) {
    flint.ffiFmpzMatrixClose(resource);
    throw error;
  }
}

function entries(flint, resource) {
  const rows = Number(flint.ffiFmpzMatrixNrows(resource));
  const columns = Number(flint.ffiFmpzMatrixNcols(resource));
  return Array.from({ length: rows * columns }, (_, i) =>
    flint.ffiFmpzMatrixEntry(resource, BigInt(Math.floor(i / columns)), BigInt(i % columns)));
}

function close(flint, resources) {
  for (const resource of resources.reverse()) {
    flint.ffiFmpzMatrixClose(resource);
    assert.equal(flint.__sagejsFfiResourceExternalMemory(resource), 0n);
    flint.ffiFmpzMatrixClose(resource);
  }
}

test("Arb prefix equals exact-shape batch through grow/shrink reuse and poisoned tails", () => {
  const flint = addon();
  const sentinel = -(1n << 200n) - 17n;
  const values = [1n, 4n, 9n, 2n, 25n, 97n, 0n, -1n, 1n << 256n, -13n];
  const source = matrix(flint, 10, 1, values);
  // Not a multiple of four: only the requested logical prefix matters.
  const output = matrix(flint, 43, 1, Array(43).fill(sentinel));
  const owned = [source, output];
  try {
    for (const [count, precision] of [[1, 64], [6, 96], [2, 80], [4, 128]]) {
      const exactSource = matrix(flint, count, 1, values.slice(0, count));
      const exactOutput = matrix(flint, 4 * count, 1, []);
      owned.push(exactSource, exactOutput);
      const before = entries(flint, output);
      assert.equal(flint.ffiIntegerLogSqrtBallsResource(
        exactOutput, exactSource, BigInt(precision)), true);
      assert.equal(flint.ffiIntegerLogSqrtBallsPrefixResource(
        output, source, BigInt(count), BigInt(precision)), true);
      const after = entries(flint, output);
      assert.deepEqual(after.slice(0, 4 * count), entries(flint, exactOutput));
      assert.deepEqual(after.slice(4 * count), before.slice(4 * count));
      assert.deepEqual(entries(flint, source), values);
      // Independent exact endpoints for log(1) and sqrt of perfect squares.
      assert.deepEqual(after.slice(0, 4), [0n, 0n, 1n << BigInt(precision), 1n << BigInt(precision)]);
      if (count >= 2) assert.deepEqual(after.slice(6, 8), [2n << BigInt(precision), 2n << BigInt(precision)]);
      if (count >= 3) assert.deepEqual(after.slice(10, 12), [3n << BigInt(precision), 3n << BigInt(precision)]);
      assert.ok(flint.__sagejsFfiResourceExternalMemory(output) > 0n);
    }
  } finally {
    close(flint, owned);
  }
});

test("Arb prefix rejects invalid active data, dimensions, precision and aliases before mutation", () => {
  const flint = addon();
  const source = matrix(flint, 3, 1, [1n, 4n, 9n]);
  const output = matrix(flint, 13, 1, Array(13).fill(-991n));
  const alias = matrix(flint, 8, 1, Array(8).fill(4n));
  const wrongSource = matrix(flint, 3, 2, Array(6).fill(4n));
  const wrongOutput = matrix(flint, 13, 2, Array(26).fill(-991n));
  const shortOutput = matrix(flint, 7, 1, Array(7).fill(-991n));
  const owned = [source, output, alias, wrongSource, wrongOutput, shortOutput];
  function rejected(out, input, count, precision) {
    const beforeOutput = entries(flint, out);
    const beforeSource = entries(flint, input);
    const bytes = flint.__sagejsFfiResourceExternalMemory(out);
    assert.throws(() => flint.ffiIntegerLogSqrtBallsPrefixResource(
      out, input, count, precision), /invalid/);
    assert.deepEqual(entries(flint, out), beforeOutput);
    assert.deepEqual(entries(flint, input), beforeSource);
    assert.equal(flint.__sagejsFfiResourceExternalMemory(out), bytes);
  }
  try {
    for (const [count, precision] of [[0n, 64n], [4n, 64n], [1000001n, 64n],
      [1n << 63n, 64n], [2n, 15n], [2n, 4097n]]) {
      rejected(output, source, count, precision);
    }
    rejected(alias, alias, 1n, 64n);
    rejected(output, wrongSource, 2n, 64n);
    rejected(wrongOutput, source, 2n, 64n);
    rejected(shortOutput, source, 2n, 64n);
    for (const bad of [0n, -1n, 1n << 256n]) {
      flint.ffiFmpzMatrixSetEntry(source, 1n, 0n, bad);
      rejected(output, source, 2n, 64n);
      // The same invalid entry is permitted when it is outside the prefix.
      assert.equal(flint.ffiIntegerLogSqrtBallsPrefixResource(output, source, 1n, 64n), true);
    }
    flint.ffiFmpzMatrixSetEntry(source, 1n, 0n, 4n);
    assert.equal(flint.ffiIntegerLogSqrtBallsPrefixResource(output, source, 2n, 4096n), true);
    assert.equal(flint.ffiFmpzMatrixEntry(output, 6n, 0n), 2n << 4096n);
    assert.equal(flint.ffiFmpzMatrixEntry(output, 7n, 0n), 2n << 4096n);
  } finally {
    close(flint, owned);
  }
});

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 120000,
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("actual Python prefix witness agrees dynamically and in its isolated native core", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-log-sqrt-prefix-"));
  const cacheRoot = join(temporary, "cache");
  const temporaryWitness = join(temporary, "integer_log_sqrt_prefix_resource.py");
  const script = join(temporary, "check.py");
  try {
    writeFileSync(temporaryWitness, readFileSync(witness, "utf8"));
    const compiled = await compileKernel({
      sourcePath: temporaryWitness, cacheRoot,
    });
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(core, /sagejs_flint_integer_log_sqrt_balls_prefix_resource/);
    assert.doesNotMatch(core, /\bnapi_|\bPyObject\b/);
    for (const native of [true, false]) {
      writeFileSync(script, `
from integer_log_sqrt_prefix_resource import integer_log_sqrt_prefix
from sagejs.ffi.flint import fmpz_matrix, integer_log_sqrt_balls_resource

source = fmpz_matrix(5, 1)
output = fmpz_matrix(25, 1)
exact_source = fmpz_matrix(2, 1)
exact_output = fmpz_matrix(8, 1)
source[0, 0] = 1
source[1, 0] = 4
source[2, 0] = 0
source[3, 0] = -3
source[4, 0] = 1 << 256
exact_source[0, 0] = 1
exact_source[1, 0] = 4
for i in range(25):
    output[i, 0] = -991
assert integer_log_sqrt_prefix(output, source, 2, 64)
assert integer_log_sqrt_prefix.nativeAvailable is ${native ? "True" : "False"}
assert integer_log_sqrt_balls_resource(exact_output, exact_source, 64)
assert [output[i, 0] for i in range(8)] == [exact_output[i, 0] for i in range(8)]
before = [output[i, 0] for i in range(25)]
assert before[8:] == [-991] * 17
try:
    integer_log_sqrt_prefix(output, source, 3, 64)
    raise AssertionError("invalid active input accepted")
except ValueError:
    pass
assert [output[i, 0] for i in range(25)] == before
for value in (exact_output, exact_source, output, source):
    value.close()
print("log-sqrt-prefix-ok")
`);
      assert.match(run(process.execPath, [join(root, "bin/sagejs"), script], {
        SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
        ...(native ? { SAGEJS_NATIVE_REQUIRED: "1" } : { SAGEJS_NATIVE_DISABLE: "1" }),
      }), /log-sqrt-prefix-ok/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("repeated resident prefixes keep one arena in dynamic, GMP and fmpz execution", async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-log-sqrt-resident-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const compiled = await compileKernel({ sourcePath: witness,
    functions: ["integer_log_sqrt_resident"], cacheRoot: join(temporary, "cache") });
  assert.match(run(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const fn = require(process.argv[1]).integer_log_sqrt_resident;
for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
  for (let round = 0; round < 4; round++) {
    assert.equal(implementation(3n << 20n, false), 10n * (1n << 64n) - 991n);
    assert.throws(() => implementation(3n << 20n, true), /invalid/);
    assert.equal(implementation(3n << 20n, false), 10n * (1n << 64n) - 991n);
  }
}
console.log("resident-prefix-ok");
`, compiled.modulePath]), /resident-prefix-ok/);
});

test("resident prefix lifetimes and zero-retry checkpoint remain valid under sanitizers", {
  skip: process.platform === "win32" ? "standalone sanitizer harness is Unix-only" : false,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-log-sqrt-sanitizer-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(readFileSync(witness, "utf8"), witness,
    { functions: ["integer_log_sqrt_resident"] });
  assert.ok(ir.functions.every((fn) => fn.analysis.backend.kind === "fmpz"));
  const core = generateHostCore(ir);
  assert.doesNotMatch(core.source, /checkpoint_rewind/);
  writeFileSync(join(temporary, "kernel_core.c"), core.source);
  writeFileSync(join(temporary, "kernel_core.h"), core.header);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <gmp.h>
#include <flint/flint.h>
#include <stdio.h>
#include "kernel_core.c"

int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, NULL };
    mpz_t output, expected;
    mpz_inits(output, expected, NULL);
    mpz_set_ui(expected, 10);
    mpz_mul_2exp(expected, expected, 64);
    mpz_sub_ui(expected, expected, 991);
    for (unsigned gmp = 0; gmp < 2; gmp++) {
      size_t high_water = 0;
      for (unsigned round = 0; round < 8; round++) {
        status.code = SAGEJS_NATIVE_OK;
        int success = gmp ? native_integer_log_sqrt_resident(&status, output, 3u << 20, 0)
          : sagejs_kernel_integer_log_sqrt_resident(&status, output, 3u << 20, 0);
        if (!success) fprintf(stderr, "backend=%u code=%d message=%s\n", gmp,
            status.code, status.message ? status.message : "none");
        assert(success);
        assert(mpz_cmp(output, expected) == 0);
        sagejs_native_gmp_checkpoint_stats stats = {0};
        assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
        assert(stats.capacity == (3u << 20) && stats.retry_shift == 0);
        assert(stats.high_water <= (3u << 20));
        assert(stats.soft_limit_exhaustions == 0 && stats.upstream_allocations == 0);
        if (stats.high_water > high_water) high_water = stats.high_water;
        status.code = SAGEJS_NATIVE_OK;
        assert(!(gmp ? native_integer_log_sqrt_resident(&status, output, 3u << 20, 1)
          : sagejs_kernel_integer_log_sqrt_resident(&status, output, 3u << 20, 1)));
        assert(status.code != SAGEJS_NATIVE_OK);
        assert(mpz_cmp(output, expected) == 0);
        status.code = SAGEJS_NATIVE_OK;
        assert(!(gmp ? native_integer_log_sqrt_resident(&status, output, 16, 0)
          : sagejs_kernel_integer_log_sqrt_resident(&status, output, 16, 0)));
        assert(status.code == SAGEJS_NATIVE_RETRY);
        assert(mpz_cmp(output, expected) == 0);
      }
      printf("%s prefix checkpoint high-water: %zu bytes\n", gmp ? "GMP" : "fmpz", high_water);
    }
    mpz_clears(output, expected, NULL);
    flint_cleanup();
    return 0;
}
`);
  const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix"));
  const executable = join(temporary, "prefix-sanitizer");
  run(process.env.CC || "cc", ["-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${temporary}`, `-I${join(prefix, "include")}`, `-I${join(root, "packages/flint/include")}`,
    join(temporary, "harness.c"), `-L${join(prefix, "lib")}`, "-lflint", "-lopenblas",
    "-lmpfr", "-lgmp", "-lm", "-lpthread", "-o", executable]);
  t.diagnostic(run(executable, [], sanitizerEnvironment({ strictStringChecks: true })).trim());
});
