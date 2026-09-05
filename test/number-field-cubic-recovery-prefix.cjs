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
const { createNativeImportResolver } = require("../tools/native-kernel/native-imports.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const productionPath = join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
const runtimePath = join(root, "src/lib/sagejs/number_fields/cubic_class_number_native_runtime.py");
const fixturePath = join(__dirname, "fixtures/cubic-recovery-prefix.py");
function expandedFixture() {
  // Private production helpers remain private. Prepend their actual module
  // verbatim; selecting only the witness root retains its real transitive body.
  return readFileSync(productionPath, "utf8") + "\n" + readFileSync(fixturePath, "utf8")
    .replace(/^from sagejs\.(?:ffi\.flint|native) import .*\n/gm, "");
}
function resolver(path) {
  return createNativeImportResolver({ root, lowerSource, initialSourcePath: path });
}
function run(command, args, timeout = 180000, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, env });
  assert.equal(result.status, 0, String(result.error || "") + "\n" + result.stdout + result.stderr);
  return result.stdout;
}

test("recovery statuses, result publication and caller/host retry gate fail closed", () => {
  assert.match(run("python3", [join(__dirname, "fixtures/cubic-recovery-status-faults.py"),
    productionPath, runtimePath]), /recovery-status-contract-ok/);
});

test("actual production recovery remains in the full closed fmpz call graph", {
  timeout: 180000,
}, async () => {
  const ir = await lowerSource(readFileSync(productionPath, "utf8"), productionPath, {
    functions: ["certified_complex_cubic_class_group_v1"],
    resolveNativeImport: resolver(productionPath),
  });
  const fn = ir.functions.find((f) => f.name === "_cubic_relation_prefix_has_archimedean_unit");
  assert.ok(fn);
  assert.equal(fn.analysis.backend.kind, "fmpz");
  assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0, 0);
  assert.equal(ir.functions.find((f) => f.name === "certified_complex_cubic_class_group_v1")
    .analysis.liveExactWorkspace.scopes.length, 1);
  const text = JSON.stringify(fn);
  assert.match(text, /fmpz_matrix_hnf_transform_prefix/);
  assert.match(text, /fmpz_matrix_lll_transform_prefix/);
  assert.doesNotMatch(text, /"id":"fmpz_matrix_(?:hnf|lll)_transform"/);
});

function exactRecoveryWitness(modulePath) {
  const assert = require("node:assert/strict");
  const fn = require(modulePath).recovery_prefix_schedule;
  const coefficients = [-1n, -1n, 0n, 1n];
  // Multiplication in Z[a], a^3=a+1, and determinant-derived norm form.
  const table = [1,0,0, 0,1,0, 0,0,1, 0,1,0, 0,0,1, 1,1,0, 0,0,1, 1,1,0, 0,1,1].map(BigInt);
  const norm = [1,0,-1,1,2,1,1,0,-1,-3].map(BigInt);
  const elements = [2,0,0, 0,2,0, 0,0,2, 2,2,0].map(BigInt);
  const packed = [coefficients, table, norm, elements].map((v) => fn.packIntegerBuffer(v, 16));
  const run = (implementation, capacity, extra, steps, rows) => {
    const out = fn.createIntegerBuffer(6 * steps, 16);
    assert.equal(implementation(...packed, out, capacity, extra, steps, rows, 3 << 20), true,
      JSON.stringify(out.toArray().map(String)));
    return out.toArray();
  };
  let reference = null;
  for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
    const small = run(implementation, 2, 0, 1, 2);
    const large = run(implementation, 4, 0, 1, 4);
    assert.deepEqual(small.slice(0,4), [1n,0n,1n,0n]);
    assert.deepEqual(large, small);
    assert.ok(small[4] > 0n && small[5] >= small[4]);
    if (reference === null) reference = small;
    else assert.deepEqual(small, reference);
    for (let round = 0; round < 3; round++) {
      assert.deepEqual(run(implementation, 7, 2, 4, 2),
        [...small, ...large, ...small, ...large]);
      // Same source data and norm table remain untouched by every attempt.
      packed.forEach((v, i) => assert.deepEqual(v.toArray(),
        [coefficients, table, norm, elements][i]));
    }
  }
  console.log("exact-recovery-prefix-ok");
}
function checkpointWitness(compiled, temporary) {
  const cSource = String.raw`#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <flint/flint.h>
#include "kernel_core.c"

#define BUFFER(name, count) \
    int32_t name##_sizes[count] = {0}; \
    uint64_t name##_words[(count) * 8] = {0}; \
    sagejs_integer_buffer name = {name##_sizes, name##_words, count, 8}

static void fill(sagejs_integer_buffer buffer, const int *values)
{
    for (size_t i = 0; i < buffer.length; i++) {
        buffer.sizes[i] = values[i] == 0 ? 0 : values[i] < 0 ? -1 : 1;
        buffer.limbs[8 * i] = values[i] < 0 ? -values[i] : values[i];
    }
}

int main(void)
{
    BUFFER(coefficients, 4);
    BUFFER(table, 27);
    BUFFER(norm, 10);
    BUFFER(elements, 12);
    BUFFER(observations, 24);
    const int coefficients_data[4] = {-1,-1,0,1};
    const int table_data[27] = {
        1,0,0, 0,1,0, 0,0,1, 0,1,0, 0,0,1, 1,1,0,
        0,0,1, 1,1,0, 0,1,1
    };
    const int norm_data[10] = {1,0,-1,1,2,1,1,0,-1,-3};
    const int elements_data[12] = {2,0,0, 0,2,0, 0,0,2, 2,2,0};
    fill(coefficients, coefficients_data);
    fill(table, table_data);
    fill(norm, norm_data);
    fill(elements, elements_data);
    for (int gmp = 0; gmp < 2; gmp++) {
        size_t peak = 0;
        for (int round = 0; round < 3; round++) {
            for (int trial = 0; trial < 3; trial++) {
                const uint64_t budget = trial == 1 ? 16 : 3u << 20;
                sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
                int answer = -733;
                const int ok = gmp
                    ? native_recovery_prefix_schedule(&status, &answer,
                        coefficients, table, norm, elements, observations,
                        7, 2, 4, 2, budget)
                    : sagejs_kernel_recovery_prefix_schedule(&status, &answer,
                        coefficients, table, norm, elements, observations,
                        7, 2, 4, 2, budget);
                if (trial == 1) {
                    assert(!ok && status.code == SAGEJS_NATIVE_RETRY);
                    assert(answer == -733);
                } else {
                    if (!ok || !answer) fprintf(stderr,
                        "backend=%d ok=%d answer=%d code=%d message=%s\n",
                        gmp, ok, answer, status.code,
                        status.message ? status.message : "none");
                    assert(ok && answer && status.code == SAGEJS_NATIVE_OK);
                    sagejs_native_gmp_checkpoint_stats stats = {0};
                    assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
                    assert(stats.capacity == (3u << 20) && stats.retry_shift == 0);
                    assert(stats.soft_limit_exhaustions == 0);
                    assert(stats.upstream_allocations == 0);
                    assert(stats.high_water <= stats.capacity);
                    if (stats.high_water > peak) peak = stats.high_water;
                    for (size_t step = 0; step < 4; step++) {
                        assert(observations.sizes[6 * step] == 1);
                        assert(observations.limbs[8 * 6 * step] == 1);
                        assert(observations.sizes[6 * step + 1] == 0);
                        assert(observations.sizes[6 * step + 2] == 1);
                        assert(observations.limbs[8 * (6 * step + 2)] == 1);
                        assert(observations.sizes[6 * step + 3] == 0);
                    }
                }
            }
        }
        printf("%s four-prefix checkpoint high-water: %zu bytes\n",
            gmp ? "GMP" : "fmpz", peak);
    }
    flint_cleanup();
    return 0;
}
`;
  writeFileSync(join(temporary, "kernel_core.c"), readFileSync(compiled.coreSourcePath));
  writeFileSync(join(temporary, "kernel_core.h"), readFileSync(join(compiled.outputPath, "kernel_core.h")));
  writeFileSync(join(temporary, "checkpoint.c"), cSource);
  const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix"));
  const executable = join(temporary, "checkpoint");
  run(process.env.CC || "cc", ["-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined", "-I" + temporary, "-I" + join(prefix, "include"),
    "-I" + join(root, "packages/flint/include"), join(temporary, "checkpoint.c"),
    "-L" + join(prefix, "lib"), "-lflint", "-lopenblas", "-lmpfr", "-lgmp",
    "-lm", "-lpthread", "-o", executable]);
  return run(executable, [], 180000, sanitizerEnvironment({ strictStringChecks: true }));
}

test("actual exact unit recovery agrees for exact and poisoned growing/shrinking prefixes", {
  timeout: 240000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cubic-recovery-prefix-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "recovery.py");
  writeFileSync(sourcePath, expandedFixture());
  const compiled = await compileKernel({ sourcePath, functions: ["recovery_prefix_schedule"],
    cacheRoot: join(temporary, "cache") });
  assert.ok(compiled.ir.functions.some((fn) =>
    fn.name === "_cubic_reconstruct_archimedean_unit"));
  assert.ok(compiled.ir.functions.every((fn) => fn.analysis.backend.kind === "fmpz"));
  const source = readFileSync(compiled.coreSourcePath, "utf8");
  assert.doesNotMatch(source, /\bnapi_|\bPyObject\b/);
  assert.match(run(process.execPath, ["-e", "(" + exactRecoveryWitness.toString()
    + ")(" + JSON.stringify(compiled.modulePath) + ")"]), /exact-recovery-prefix-ok/);
  if (process.platform !== "win32") t.diagnostic(checkpointWitness(compiled, temporary).trim());
  else t.diagnostic("Standalone ASan/UBSan checkpoint witness is Unix-only.");
});
