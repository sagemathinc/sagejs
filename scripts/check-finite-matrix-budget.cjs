#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

function positiveNumber(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be positive, got ${value}`);
  }
  return number;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function range(values) {
  return {
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function formatRange(values) {
  const summary = range(values);
  return `${summary.minimum.toFixed(1)} / ${summary.median.toFixed(1)} / ` +
    `${summary.maximum.toFixed(1)} ms`;
}

function nativeSample(seed) {
  const started = performance.now();
  const matrix = flint.nmodMatrixRandom(
    300, 300, 7n, BigInt(seed), 314159265n,
  );
  flint.matrixMul(matrix, matrix);
  return performance.now() - started;
}

async function run(environment = process.env) {
  if (!flint.blasEnabled()) {
    throw new Error("native FLINT was built without CBLAS acceleration");
  }
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_SAMPLES,
    "SAGEJS_FINITE_MATRIX_SAMPLES",
    7,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_BUDGET_MS,
    "SAGEJS_FINITE_MATRIX_BUDGET_MS",
    50,
  );
  const referenceNativeMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_REFERENCE_MS,
    "SAGEJS_FINITE_MATRIX_REFERENCE_MS",
    4,
  );
  const hardLimitMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS,
    "SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS",
    300,
  );

  const nativeCache = mkdtempSync(join(tmpdir(), "sagejs-matrix-budget-"));
  const savedNativeCache = process.env.SAGEJS_NATIVE_CACHE_DIR;
  const savedNativeRequired = process.env.SAGEJS_NATIVE_REQUIRED;
  try {
    for (const sourcePath of [
      join(root, "src", "lib", "sagejs", "kernels", "dense_prime.py"),
      join(root, "src", "lib", "sagejs", "kernels", "dense_prime_flint.py"),
    ]) {
      await compile({ sourcePath, cacheRoot: nativeCache });
    }
    process.env.SAGEJS_NATIVE_CACHE_DIR = nativeCache;
    process.env.SAGEJS_NATIVE_REQUIRED = "1";

    nativeSample(1);
    const nativeTimes = Array.from(
      { length: samples }, (_, index) => nativeSample(index + 2));
    const nativeMedianMs = median(nativeTimes);
    const loadFactor = Math.max(1, nativeMedianMs / referenceNativeMs);

    const session = await createSage();
    const targetTimes = [];
    const requestTimes = [];
    try {
      const tiers = await session.evaluate([
        "from sagejs.kernels.dense_prime import dense_prime_random_fill",
        "from sagejs.kernels.dense_prime_flint import flint_dense_prime_mul",
        "print(dense_prime_random_fill.nativeAvailable)",
        "print(flint_dense_prime_mul.nativeAvailable)",
      ].join("\n"));
      if (tiers.stdout.trim() !== "True\nTrue") {
        throw new Error(
          `matrix performance gate did not resolve isolated kernels: ` +
          JSON.stringify(tiers.stdout.trim()),
        );
      }
      await session.evaluate([
        "import sagejs.runtime as _matrix_budget_runtime",
        "def _matrix_budget_sample():",
        "    started = _matrix_budget_runtime.wall_time()",
        "    result = random_matrix(GF(7), 300)^2",
        "    return (_matrix_budget_runtime.wall_time() - started) * 1000",
      ].join("\n"));
      await session.evaluate("_matrix_budget_sample()");
      for (let index = 0; index < samples; index += 1) {
        const started = performance.now();
        const result = await session.evaluate("_matrix_budget_sample()");
        requestTimes.push(performance.now() - started);
        const elapsed = Number(result.repr);
        if (!Number.isFinite(elapsed) || elapsed <= 0) {
          throw new Error(`unexpected internal timing: ${result.repr}`);
        }
        targetTimes.push(elapsed);
      }
    } finally {
      session.close();
    }

    const targetMedianMs = median(targetTimes);
    const normalizedMs = targetMedianMs / loadFactor;
    console.log(`Finite-field matrix budget (${samples} warm samples)`);
    console.log("  implementations:        typed-python-isolated + declared-flint-isolated");
    console.log(`  samples:                 min / median / max`);
    console.log(`  native random + square: ${formatRange(nativeTimes)}`);
    console.log(`  Sage.js expression:     ${formatRange(targetTimes)}`);
    console.log(`  full session request:   ${formatRange(requestTimes)}`);
    console.log(`  measured load factor:   ${loadFactor.toFixed(2)}x`);
    console.log(`  normalized expression:  ${normalizedMs.toFixed(1)} ms`);
    console.log(`  normalized budget:      ${budgetMs.toFixed(1)} ms`);
    console.log(`  catastrophic ceiling:   ${hardLimitMs.toFixed(1)} ms raw`);
    if (normalizedMs > budgetMs || targetMedianMs > hardLimitMs) {
      throw new Error(
        "finite-field random_matrix(GF(7),300)^2 performance regression",
      );
    }
  } finally {
    if (savedNativeCache === undefined) {
      delete process.env.SAGEJS_NATIVE_CACHE_DIR;
    } else {
      process.env.SAGEJS_NATIVE_CACHE_DIR = savedNativeCache;
    }
    if (savedNativeRequired === undefined) {
      delete process.env.SAGEJS_NATIVE_REQUIRED;
    } else {
      process.env.SAGEJS_NATIVE_REQUIRED = savedNativeRequired;
    }
    rmSync(nativeCache, { recursive: true, force: true });
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  formatRange,
  median,
  nativeSample,
  positiveNumber,
  range,
  run,
};
