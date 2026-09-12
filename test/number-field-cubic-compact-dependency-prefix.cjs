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
const fixturePath = join(__dirname, "fixtures/cubic-compact-dependency-prefix.py");
const helpers = [
  "_cubic_compact_relation_plan", "_cubic_prepare_compact_presentation",
  "_cubic_verify_compact_presentation_index", "_cubic_reduce_dependency_prefix",
  "_cubic_fill_dependency_logs", "_cubic_discover_dependency_unit",
];
function resolver(path) {
  return createNativeImportResolver({ root, lowerSource, initialSourcePath: path });
}
function run(command, args, timeout = 180000, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, env });
  assert.equal(result.status, 0, String(result.error || "") + "\n" + result.stdout + result.stderr);
  return result.stdout;
}
function expandedFixture() {
  return readFileSync(productionPath, "utf8") + "\n" + readFileSync(fixturePath, "utf8")
    .replace(/^from sagejs\.(?:ffi\.flint|native) import .*\n/gm, "");
}

test("actual one-shot allocation barriers and fatal/insufficient caller gates are preserved", (t) => {
  const candidates = process.platform === "win32"
    ? [["py", "-3"], ["python"], ["python3"]]
    : [["python3"], ["python"]];
  const command = candidates.find(([exe, ...args]) =>
    spawnSync(exe, [...args, "--version"], { encoding: "utf8" }).status === 0);
  if (!command) return t.skip("CPython is needed for actual-source control-flow checks");
  const [exe, ...args] = command;
  assert.match(run(exe, [...args, join(__dirname, "fixtures/cubic-compact-dependency-status.py"),
    productionPath, fixturePath, runtimePath]), /compact-dependency-status-ok/);
});

test("compact dependency helpers retain the actual one-arena fmpz closure", {
  timeout: 180000,
}, async (t) => {
  const ir = await lowerSource(readFileSync(productionPath, "utf8"), productionPath, {
    functions: ["certified_complex_cubic_class_group_v1"],
    resolveNativeImport: resolver(productionPath),
  });
  for (const name of helpers) {
    const fn = ir.functions.find((f) => f.name === name);
    assert.ok(fn, name);
    assert.equal(fn.hostCallable, false, name + " must remain a private borrowed helper");
    assert.equal(fn.analysis.backend.kind, "fmpz");
    assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0, 0);
    assert.doesNotMatch(JSON.stringify(fn), /arena\.foreign_resource/);
  }
  const entry = ir.functions.find((f) => f.name === "certified_complex_cubic_class_group_v1");
  assert.equal(ir.functions.filter((fn) => fn.hostCallable !== false).length, 21);
  assert.equal(entry.analysis.liveExactWorkspace.scopes.length, 1);
  assert.match(JSON.stringify(entry), /fmpz_matrix_hnf_transform_prefix/);
  const helperText = JSON.stringify(ir.functions.filter((f) => helpers.includes(f.name)));
  for (const ffi of ["hnf_prefix_into", "snf_prefix_into", "lll_transform_prefix"])
    assert.match(helperText, new RegExp("fmpz_matrix_" + ffi));
  assert.doesNotMatch(helperText, /"id":"fmpz_matrix_(?:hnf_into|snf_into|lll_transform)"/);
  t.diagnostic("Current source closure: " + ir.functions.length + " functions.");
});

function arithmeticWitness(modulePath) {
  const assert = require("node:assert/strict");
  const kernels = require(modulePath);
  const fn = kernels.compact_prefix_schedule;
  const reference = kernels.compact_one_shot_reference;
  const coefficients = [-1n, -1n, 0n, 1n];
  const elements = [2,0,0, 0,2,0, 0,0,2, 2,2,0].map(BigInt);
  const packed = [coefficients, elements].map((v) => fn.packIntegerBuffer(v, 16));
  const call = (entry, args, steps) => {
    const diagnostics = fn.createIntegerBuffer(64, 16);
    const out = fn.createIntegerBuffer(16 * steps, 16);
    assert.equal(entry(...packed, diagnostics, out, ...args, 3 << 20), true,
      JSON.stringify(diagnostics.toArray().map(String)));
    return out.toArray();
  };
  const baselines = new Map();
  for (const backend of ["javascript", "gmp", "fmpz"]) {
    for (const cheap of [false, true]) {
      const small = call(reference[backend], [2, cheap], 1);
      const large = call(reference[backend], [4, cheap], 1);
      for (const [rows, expected] of [[2, small], [4, large]]) {
        assert.equal(expected[0], BigInt(rows));
        assert.equal(expected[1], 1n);
        assert.ok(expected[2] > 0n && expected[3] >= expected[2]);
        assert.equal(expected[15], cheap ? 0n : 1n);
        const key = rows + ":" + cheap;
        if (!baselines.has(key)) baselines.set(key, expected);
        else assert.deepEqual(expected, baselines.get(key));
        assert.deepEqual(call(fn[backend], [rows, 0, 1, rows, cheap], 1), expected);
      }
      for (let repetition = 0; repetition < 3; repetition++) {
        assert.deepEqual(call(fn[backend], [7, 2, 4, 2, cheap], 4),
          [...small, ...large, ...small, ...large]);
        packed.forEach((v, i) => assert.deepEqual(v.toArray(), [coefficients, elements][i]));
      }
    }
  }
  console.log("compact-prefix-arithmetic-ok");
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
    BUFFER(elements, 12);
    BUFFER(diagnostics, 64);
    BUFFER(observations, 64);
    const int coefficients_data[4] = {-1,-1,0,1};
    const int elements_data[12] = {2,0,0, 0,2,0, 0,0,2, 2,2,0};
    fill(coefficients, coefficients_data);
    fill(elements, elements_data);
    for (int gmp = 0; gmp < 2; gmp++) {
        size_t peak = 0;
        for (int round = 0; round < 3; round++) {
            for (int trial = 0; trial < 3; trial++) {
                const uint64_t budget = trial == 1 ? 16 : 3u << 20;
                sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
                int answer = -733;
                const int ok = gmp
                    ? native_compact_prefix_schedule(&status, &answer,
                        coefficients, elements, diagnostics, observations,
                        7, 2, 4, 2, 0, budget)
                    : sagejs_kernel_compact_prefix_schedule(&status, &answer,
                        coefficients, elements, diagnostics, observations,
                        7, 2, 4, 2, 0, budget);
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
                        assert(observations.sizes[16 * step + 1] == 1);
                        assert(observations.limbs[8 * (16 * step + 1)] == 1);
                        assert(observations.sizes[16 * step + 15] == 1);
                        assert(observations.limbs[8 * (16 * step + 15)] == 1);
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

test("actual compact and dependency arithmetic equals frozen one-shot on poisoned grow/shrink prefixes", {
  timeout: 240000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cubic-compact-prefix-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const sourcePath = join(temporary, "compact.py");
  writeFileSync(sourcePath, expandedFixture());
  const compiled = await compileKernel({ sourcePath,
    functions: ["compact_prefix_schedule", "compact_one_shot_reference"],
    cacheRoot: join(temporary, "cache") });
  assert.ok(compiled.ir.functions.every((fn) => fn.analysis.backend.kind === "fmpz"),
    JSON.stringify(compiled.ir.functions.filter((fn) => fn.analysis.backend.kind !== "fmpz")
      .map((fn) => [fn.name, fn.analysis.backend])));
  assert.match(run(process.execPath, ["-e", "(" + arithmeticWitness.toString()
    + ")(" + JSON.stringify(compiled.modulePath) + ")"]), /compact-prefix-arithmetic-ok/);
  if (process.platform !== "win32") t.diagnostic(checkpointWitness(compiled, temporary).trim());
  else t.diagnostic("Standalone ASan/UBSan checkpoint witness is Unix-only.");
});
