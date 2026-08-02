#!/usr/bin/env node
"use strict";

const { performance } = require("node:perf_hooks");

const flint = require("../packages/flint");
const { createSage } = require("../dist/tools/kernel.js");

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

function nativeSample(seed) {
  const started = performance.now();
  const matrix = flint.nmodMatrixRandom(
    300, 300, 7n, BigInt(seed), 314159265n,
  );
  flint.matrixMul(matrix, matrix);
  return performance.now() - started;
}

async function run(environment = process.env) {
  const samples = Math.floor(positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_SAMPLES,
    "SAGEJS_FINITE_MATRIX_SAMPLES",
    7,
  ));
  if (samples < 3) throw new Error("at least three samples are required");
  const budgetMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_BUDGET_MS,
    "SAGEJS_FINITE_MATRIX_BUDGET_MS",
    100,
  );
  const referenceNativeMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_REFERENCE_MS,
    "SAGEJS_FINITE_MATRIX_REFERENCE_MS",
    4,
  );
  const hardLimitMs = positiveNumber(
    environment.SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS,
    "SAGEJS_FINITE_MATRIX_HARD_LIMIT_MS",
    750,
  );

  nativeSample(1);
  const nativeTimes = Array.from(
    { length: samples }, (_, index) => nativeSample(index + 2));
  const nativeMedianMs = median(nativeTimes);
  const loadFactor = Math.max(1, nativeMedianMs / referenceNativeMs);

  const session = await createSage();
  const targetTimes = [];
  try {
    const source = "random_matrix(GF(7),300)^2";
    const warm = await session.evaluate(source);
    if (!warm.repr.startsWith("300 x 300 dense matrix over Finite Field")) {
      throw new Error(`unexpected matrix result: ${warm.repr}`);
    }
    for (let index = 0; index < samples; index += 1) {
      const started = performance.now();
      const result = await session.evaluate(source);
      targetTimes.push(performance.now() - started);
      if (!result.repr.startsWith("300 x 300 dense matrix over Finite Field")) {
        throw new Error(`unexpected matrix result: ${result.repr}`);
      }
    }
  } finally {
    session.close();
  }

  const targetMedianMs = median(targetTimes);
  const normalizedMs = targetMedianMs / loadFactor;
  console.log(`Finite-field matrix budget (${samples} warm samples, median)`);
  console.log(`  native random + square: ${nativeMedianMs.toFixed(1)} ms`);
  console.log(`  Sage.js expression:     ${targetMedianMs.toFixed(1)} ms`);
  console.log(`  measured load factor:   ${loadFactor.toFixed(2)}x`);
  console.log(`  normalized expression:  ${normalizedMs.toFixed(1)} ms`);
  console.log(`  normalized budget:      ${budgetMs.toFixed(1)} ms`);
  console.log(`  catastrophic ceiling:   ${hardLimitMs.toFixed(1)} ms raw`);
  if (normalizedMs > budgetMs || targetMedianMs > hardLimitMs) {
    throw new Error(
      "finite-field random_matrix(GF(7),300)^2 performance regression",
    );
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { median, nativeSample, positiveNumber, run };
