#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const rows = 100;
const columns = 150;
const warmups = 1;
const samples = 5;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sourceValues() {
  let state = 0x12345678;
  return Array.from({ length: rows * columns }, () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return BigInt((state % 31) - 15);
  });
}

const values = sourceValues();
const source = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
for (let index = 0; index < values.length; index += 1) {
  assert.equal(flint.ffiFmpzMatrixSetEntry(
    source,
    BigInt(Math.floor(index / columns)),
    BigInt(index % columns),
    values[index],
  ), true);
}

function invoke() {
  const answer = flint.ffiFmpzMatrixRightKernel(source);
  assert.equal(flint.ffiFmpzMatrixNrows(answer), 50n);
  assert.equal(flint.ffiFmpzMatrixNcols(answer), 150n);
  return answer;
}

for (let index = 0; index < warmups; index += 1) {
  flint.ffiFmpzMatrixClose(invoke());
}
const measured = [];
for (let index = 0; index < samples; index += 1) {
  const started = performance.now();
  const answer = invoke();
  measured.push(performance.now() - started);
  flint.ffiFmpzMatrixClose(answer);
}
flint.ffiFmpzMatrixClose(source);

// The previous resource implementation performed exact rank, transpose HNF
// with a full square transform, extraction, and final HNF. Build that checked
// baseline outside production so the benchmark records the implementation
// crossover without preserving two public algorithms.
const oldHeader = spawnSync("git", [
  "show",
  "origin/dense-qq-resources:packages/flint/include/sagejs/fmpz_matrix_ffi.h",
], { cwd: root, encoding: "utf8" });
assert.equal(oldHeader.status, 0, oldHeader.stderr);
const comparisonSource = String.raw`
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <time.h>
#include <sagejs/fmpz_matrix_ffi.h>
static double seconds(void) {
    struct timespec value;
    clock_gettime(CLOCK_MONOTONIC, &value);
    return value.tv_sec + value.tv_nsec * 1e-9;
}
int main(void) {
    sagejs_fmpz_matrix_t source, result;
    fmpz_t entry;
    unsigned long long state = 0x12345678ULL;
    fmpz_init(entry);
    sagejs_fmpz_matrix_init(source, ${rows}, ${columns});
    for (slong row = 0; row < ${rows}; row++)
        for (slong column = 0; column < ${columns}; column++) {
            state = 1664525ULL * state + 1013904223ULL;
            fmpz_set_si(entry, (long) (state % 31ULL) - 15L);
            sagejs_fmpz_matrix_set_entry(source, row, column, entry);
        }
    const double started = seconds();
    if (!sagejs_fmpz_matrix_right_kernel(result, source)) return 2;
    printf("%.9f\n", 1000.0 * (seconds() - started));
    sagejs_fmpz_matrix_clear(result);
    sagejs_fmpz_matrix_clear(source);
    fmpz_clear(entry);
    flint_cleanup();
    return 0;
}`;
const temporary = join("/tmp", `sagejs-fmpz-kernel-${process.pid}`);
const oldInclude = join(temporary, "sagejs");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
mkdirSync(oldInclude, { recursive: true });
writeFileSync(join(oldInclude, "fmpz_matrix_ffi.h"), oldHeader.stdout);
writeFileSync(join(temporary, "compare.c"), comparisonSource);
const prefix = join(root, "packages", "flint", ".native", "prefix");
const executable = join(temporary, "compare");
const compile = spawnSync(process.env.CC || "cc", [
  "-std=c11", "-O3",
  `-I${temporary}`,
  `-I${join(root, "packages", "flint", "include")}`,
  `-I${join(prefix, "include")}`,
  join(temporary, "compare.c"),
  `-L${join(prefix, "lib")}`,
  "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
  "-o", executable,
], { cwd: root, encoding: "utf8" });
assert.equal(compile.status, 0, compile.stderr);
const previous = spawnSync(executable, [], { cwd: root, encoding: "utf8" });
assert.equal(previous.status, 0, previous.stderr);
const previousMilliseconds = Number(previous.stdout.trim());
rmSync(temporary, { recursive: true, force: true });

const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
let sageMilliseconds = null;
if (existsSync(sage)) {
  const source = [
    "import json",
    "import time",
    "state = 0x12345678",
    "values = []",
    `for _ in range(${rows * columns}):`,
    "    state = (1664525*state + 1013904223) % 2**32",
    "    values.append(state % 31 - 15)",
    `A = matrix(ZZ, ${rows}, ${columns}, values)`,
    "A.__copy__().right_kernel_matrix(basis='echelon')",
    "started = time.perf_counter()",
    "A.__copy__().right_kernel_matrix(basis='echelon')",
    "print(json.dumps((time.perf_counter() - started)*1000))",
  ].join("\n");
  const result = spawnSync(sage, ["-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  sageMilliseconds = JSON.parse(result.stdout.trim().split("\n").at(-1));
}

process.stdout.write(JSON.stringify({
  schema: "sagejs.benchmark/fmpz-matrix-right-kernel-v1",
  workload: {
    rows,
    columns,
    entries: "deterministic integers in [-15, 15]",
    constructionExcluded: true,
    warmups,
    samples,
  },
  generatedFlintMilliseconds: median(measured),
  generatedSamplesMilliseconds: measured,
  previousGeneratedFlintMilliseconds: previousMilliseconds,
  sageMathMilliseconds: sageMilliseconds,
}, null, 2) + "\n");
