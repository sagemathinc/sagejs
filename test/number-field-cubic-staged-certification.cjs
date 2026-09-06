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
const { createNativeImportResolver } = require("../tools/native-kernel/native-imports.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "test/fixtures/cubic-staged-certification.py");

function expandedFixture() {
  // The production helpers are deliberately private, not imported public
  // native entry points. Exercise their actual bodies verbatim in a single
  // test module rather than introducing a second mathematical implementation.
  const production = readFileSync(join(root,
    "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const names = ["_cubic_relation_row_in_hnf", "_cubic_online_relation_lattice_update",
    "_cubic_prepare_proof_relation_support"];
  const helpers = names.map((name) => {
    const start = production.indexOf(`\ndef ${name}(`) + 1;
    assert.ok(start > 0, name);
    const remaining = production.slice(start + 1);
    const next = remaining.search(/\n(?:@native\n)?(?:def |class )/);
    assert.ok(next > 0, name);
    return production.slice(start, start + 1 + next);
  }).join("\n\n");
  return readFileSync(sourcePath, "utf8").replace(
    /from sagejs\.number_fields\.cubic_class_number_native import \([\s\S]*?\)\n/,
    helpers + "\n");
}

test("proof support borrows scratch within the same closed fmpz program", async () => {
  const ir = await lowerSource(expandedFixture(), sourcePath, {
    functions: ["proof_support_schedule"],
    resolveNativeImport: createNativeImportResolver({ root, lowerSource,
      initialSourcePath: sourcePath }),
  });
  assert.ok(ir.functions.some((fn) => fn.name === "_cubic_prepare_proof_relation_support"));
  for (const fn of ir.functions) {
    assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
    assert.equal(fn.analysis.liveExactWorkspace?.scopes.length || 0,
      fn.name === "proof_support_schedule" ? 1 : 0, fn.name);
  }
});

test("real exact support survives repeated attempts without mutating discovery", {
  timeout: 240_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-staged-support-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const fixturePath = join(temporary, "support_schedule.py");
  writeFileSync(fixturePath, expandedFixture());
  const compiled = await compileKernel({ sourcePath: fixturePath,
    cacheRoot: join(temporary, "cache") });
  const run = spawnSync(process.execPath, ["-e", String.raw`
const assert = require("node:assert/strict");
const fn = require(process.argv[1]).proof_support_schedule;
const rows = [
  [0, 0, 0], [0, 2, 0], [0, 4, 0], [1, 0, 0],
  [0, 0, 3], [1, 2, 3], [0, 1, 0], [0, 0, 1],
];
// Independent lattice argument: row 2 doubles row 1; row 5 sums
// rows 1, 3, 4; rows 6 and 7 strictly enlarge that lattice by indices
// 2 and 3. Scaling by any nonzero integer preserves these relations.
const support = [0n, 1n, 0n, 1n, 1n, 0n, 1n, 1n];
const expected = [];
for (const prefix of [5, 8, 5, 8]) {
  for (let mode = 0; mode < 3; mode++) {
    const bits = support.map((value, row) =>
      row >= prefix ? -911n : mode === 2 ? 1n : value);
    expected.push(mode === 2 ? BigInt(prefix) : prefix === 5 ? 3n : 5n,
      BigInt(prefix), ...bits);
  }
}
for (const scale of [1n, -3n, (1n << 80n) + 13n, -(1n << 255n) + 11n]) {
  const data = rows.flat().map((value) => BigInt(value) * scale);
  for (const implementation of [fn.javascript, fn.gmp, fn.fmpz]) {
    const input = fn.packIntegerBuffer(data, 16);
    const output = fn.createIntegerBuffer(120, 16);
    const diagnostics = fn.createIntegerBuffer(64, 16);
    assert.equal(implementation(input, output, diagnostics, 3 << 20, 3 << 20), true);
    assert.deepEqual(output.toArray(), expected);
    assert.deepEqual(input.toArray(), data);
    assert.throws(() => implementation(input, output, diagnostics, 0, 3 << 20),
      /capacity|memory|budget|range/i);
    assert.equal(implementation(input, output, diagnostics, 3 << 20, 3 << 20), true);
    assert.deepEqual(output.toArray(), expected);
  }
}
`, compiled.modulePath], { cwd: root, encoding: "utf8", timeout: 180_000 });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
});

test("actual proof-support attempts survive checkpoint exhaustion under sanitizers", {
  skip: process.platform === "win32" ? "standalone sanitizer harness is Unix-only" : false,
  timeout: 240_000,
}, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-staged-support-sanitizer-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const ir = await lowerSource(expandedFixture(), sourcePath);
  const core = generateHostCore(ir);
  writeFileSync(join(temporary, "kernel_core.c"), core.source);
  writeFileSync(join(temporary, "kernel_core.h"), core.header);
  writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <gmp.h>
#include <flint/flint.h>
#include "kernel_core.c"

int main(void)
{
    enum { WORDS = 8, ROWS = 24, OBS = 120, DIAG = 64 };
    const int coefficients[ROWS] = {
        0,0,0, 0,2,0, 0,4,0, 1,0,0,
        0,0,3, 1,2,3, 0,1,0, 0,0,1
    };
    const int support[8] = {0,1,0,1,1,0,1,1};
    int32_t row_sizes[ROWS] = {0}, obs_sizes[OBS] = {0}, diag_sizes[DIAG] = {0};
    uint64_t row_words[ROWS * WORDS] = {0};
    uint64_t obs_words[OBS * WORDS] = {0}, diag_words[DIAG * WORDS] = {0};
    sagejs_integer_buffer rows = {row_sizes, row_words, ROWS, WORDS};
    sagejs_integer_buffer obs = {obs_sizes, obs_words, OBS, WORDS};
    sagejs_integer_buffer diag = {diag_sizes, diag_words, DIAG, WORDS};
    mpz_t value;
    mpz_init(value);
    for (int backend = 0; backend < 2; backend++) {
      size_t peak = 0;
      for (unsigned round = 0; round < 12; round++) {
        memset(row_words, 0, sizeof(row_words));
        for (size_t i = 0; i < ROWS; i++) {
          mpz_set_si(value, coefficients[i]);
          mpz_mul_2exp(value, value, round % 2 ? 255 : 0);
          if (round % 3 == 0) mpz_neg(value, value);
          size_t count = 0;
          mpz_export(row_words + WORDS * i, &count, -1,
              sizeof(uint64_t), 0, 0, value);
          row_sizes[i] = mpz_sgn(value) < 0 ? -(int32_t)count : (int32_t)count;
        }
        for (int trial = 0; trial < 3; trial++) {
          sagejs_native_status status = {SAGEJS_NATIVE_OK, NULL};
          int answer = -733;
          uint64_t temporary_limit = trial == 1 && round % 2 ? 16 : 3u << 20;
          int ok = backend
              ? native_proof_support_schedule(&status, &answer,
                  rows, obs, diag, 3u << 20, temporary_limit)
              : sagejs_kernel_proof_support_schedule(&status, &answer,
                  rows, obs, diag, 3u << 20, temporary_limit);
          if (trial == 1 && round % 2) {
            assert(!ok && status.code == SAGEJS_NATIVE_RETRY);
            assert(answer == -733);
            continue;
          }
          assert(ok && status.code == SAGEJS_NATIVE_OK && answer == 1);
          sagejs_native_gmp_checkpoint_stats stats = {0};
          assert(sagejs_native_gmp_last_checkpoint_stats(&stats));
          assert(stats.high_water <= (3u << 20));
          /* fmpz small integers need not allocate GMP limbs. Promotion must
             exercise the checkpoint; zero is legitimate for a small run. */
          if (round % 2) assert(stats.high_water > 0);
          assert(stats.upstream_allocations == 0 && stats.soft_limit_exhaustions == 0);
          if (stats.high_water > peak) peak = stats.high_water;
          for (int stage = 0; stage < 4; stage++) {
            int prefix = stage % 2 ? 8 : 5;
            for (int mode = 0; mode < 3; mode++) {
              int offset = 10 * (3 * stage + mode);
              for (int entry = 0; entry < 10; entry++) {
                int expected = entry == 0
                    ? (mode == 2 ? prefix : prefix == 5 ? 3 : 5)
                    : entry == 1 ? prefix
                    : entry - 2 >= prefix ? -911
                    : mode == 2 ? 1 : support[entry - 2];
                int sign = expected < 0 ? -1 : expected > 0 ? 1 : 0;
                assert(obs_sizes[offset + entry] == sign);
                if (sign) assert(obs_words[WORDS * (offset + entry)] ==
                    (uint64_t)(expected < 0 ? -expected : expected));
              }
            }
          }
        }
      }
      printf("%s support-schedule checkpoint high-water: %zu bytes\n",
          backend ? "GMP" : "fmpz", peak);
    }
    mpz_clear(value);
    flint_cleanup();
    return 0;
}
`);
  const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages/flint/.native/prefix"));
  const executable = join(temporary, "support-sanitizer");
  const build = spawnSync(process.env.CC || "cc", [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${temporary}`, `-I${join(prefix, "include")}`,
    `-I${join(root, "packages/flint/include")}`, join(temporary, "harness.c"),
    `-L${join(prefix, "lib")}`, "-lflint", "-lopenblas", "-lmpfr", "-lgmp",
    "-lm", "-lpthread", "-o", executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(build.status, 0, `${build.error || ""}\n${build.stdout}${build.stderr}`);
  const run = spawnSync(executable, [], { cwd: root, encoding: "utf8",
    timeout: 120_000, env: sanitizerEnvironment({ strictStringChecks: true }) });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}${run.stderr}`);
  t.diagnostic(run.stdout.trim());
});
