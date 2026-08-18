#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const flint = require("../packages/flint");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "word_prime_krylov.py",
);
const dimension = 32;
const modulus = 1073741789n;

function entries() {
  let state = 1729n;
  const answer = [];
  for (let index = 0; index < dimension * dimension; index += 1) {
    state = (1664525n * state + 1013904223n) & 0xffffffffn;
    answer.push(state % modulus);
  }
  return answer;
}

function median(samples) {
  return samples.toSorted((left, right) => left - right)[samples.length >> 1];
}

function runSage(cache, disabled) {
  const witness = String.raw`
import sagejs.runtime as runtime
from sagejs.kernels.matrix.word_prime_krylov import (
    word_prime_krylov_minimal_polynomial,
    word_prime_krylov_workspace_length,
)
from sagejs.native import is_compiled
import time

n = ${dimension}
raw_modulus = ${modulus}
state = 1729
entries = []
for _index in range(n*n):
    state = (1664525*state + 1013904223) % (2**32)
    entries.append(state % raw_modulus)
compiled = is_compiled(word_prime_krylov_minimal_polynomial)
if compiled:
    p = runtime.integer_bigint(raw_modulus)
    matrix = runtime.uint64_buffer(entries)
    output = runtime.uint64_buffer(n + 1)
    workspace = runtime.uint64_buffer(word_prime_krylov_workspace_length(n))
else:
    p = raw_modulus
    matrix = entries
    output = [0] * (n + 1)
    workspace = [0] * word_prime_krylov_workspace_length(n)
for _repeat in range(3):
    degree = word_prime_krylov_minimal_polynomial(output, matrix, workspace, n, p)
samples = []
for _repeat in range(9):
    started = time.perf_counter()
    degree = word_prime_krylov_minimal_polynomial(output, matrix, workspace, n, p)
    samples.append(1000*(time.perf_counter() - started))
samples.sort()
print(compiled)
print(round(samples[len(samples)//2], 6))
print((degree, list(output)[:degree + 1]))
`;
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    input: witness,
    timeout: 120_000,
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: cache,
      ...(disabled
        ? { SAGEJS_NATIVE_DISABLE: "1" }
        : { SAGEJS_NATIVE_REQUIRED: "1" }),
    },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const lines = result.stdout.trim().split("\n");
  return { compiled: lines[0], milliseconds: Number(lines[1]), result: lines[2] };
}

const cache = mkdtempSync(join(tmpdir(), "sagejs-word-prime-krylov-bench-"));
try {
  const compilation = spawnSync(
    process.execPath,
    [sagejs, "native", "compile", source, "--cache-root", cache],
    { cwd: root, encoding: "utf8", timeout: 60_000 },
  );
  if (compilation.error) throw compilation.error;
  assert.equal(compilation.status, 0, compilation.stderr || compilation.stdout);

  const native = runSage(cache, false);
  const dynamic = runSage(cache, true);
  assert.equal(native.compiled, "True");
  assert.equal(dynamic.compiled, "False");
  assert.equal(native.result, dynamic.result);

  const sourceMatrix = flint.nmodMatrix(
    dimension,
    dimension,
    entries(),
    modulus,
  );
  for (let repeat = 0; repeat < 3; repeat += 1) {
    flint.matrixMinpoly(sourceMatrix);
  }
  const flintSamples = [];
  for (let repeat = 0; repeat < 9; repeat += 1) {
    const started = performance.now();
    flint.matrixMinpoly(sourceMatrix);
    flintSamples.push(performance.now() - started);
  }

  console.log(JSON.stringify({
    workload: "dense 32x32 first-coordinate Krylov relation over GF(1073741789)",
    warmup: 3,
    samples: 9,
    statistic: "median milliseconds",
    dynamic_sagejs: dynamic.milliseconds,
    compiled_sagejs: native.milliseconds,
    flint_nmod_minpoly: Number(median(flintSamples).toFixed(6)),
    result_equivalent: true,
  }, null, 2));
} finally {
  rmSync(cache, { recursive: true, force: true });
}
