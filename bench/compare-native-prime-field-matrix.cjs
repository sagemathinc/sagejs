#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { statSync } = require("node:fs");
const os = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");

const sourcePath = join(__dirname, "native_prime_field_matrix.py");
const cacheRoot = process.env.SAGEJS_NATIVE_PRIME_FIELD_CACHE_ROOT ||
  join(__dirname, ".native-prime-field-cache");
const quick = process.argv.includes("--quick");
const json = process.argv.includes("--json");
const samples = Number(process.env.SAGEJS_NATIVE_PRIME_FIELD_SAMPLES || 7);
if (!Number.isInteger(samples) || samples < 1)
  throw new RangeError("SAGEJS_NATIVE_PRIME_FIELD_SAMPLES must be positive");
const operationFilter = new Set(
  (process.env.SAGEJS_NATIVE_PRIME_FIELD_OPERATIONS || "")
    .split(",")
    .filter(Boolean),
);
const sizes = (process.env.SAGEJS_NATIVE_PRIME_FIELD_SIZES ||
  (quick ? "16,32" : "16,32,64,128,256"))
  .split(",")
  .map(Number);
const moduli = [
  { name: "u32", value: 65521n },
  { name: "u61", value: 2305843009213693951n },
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function repetitions(size) {
  if (size <= 16) return 50;
  if (size <= 32) return 20;
  if (size <= 64) return 8;
  if (size <= 128) return 3;
  return 1;
}

function measure(operation, count, samples = 7) {
  for (let warmup = 0; warmup < 3; warmup += 1) operation();
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let repetition = 0; repetition < count; repetition += 1)
      operation();
    timings.push((performance.now() - started) / count);
  }
  return median(timings);
}

function inverseMod(value, modulus) {
  let oldRemainder = modulus;
  let remainder = value;
  let oldCoefficient = 0n;
  let coefficient = 1n;
  while (remainder !== 0n) {
    const quotient = oldRemainder / remainder;
    [oldRemainder, remainder] = [
      remainder,
      oldRemainder - quotient * remainder,
    ];
    [oldCoefficient, coefficient] = [
      coefficient,
      oldCoefficient - quotient * coefficient,
    ];
  }
  return (oldCoefficient % modulus + modulus) % modulus;
}

function cauchyMatrix(rows, columns, modulus) {
  const entries = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      entries.push(inverseMod(BigInt(row + column + 1), modulus));
    }
  }
  return flint.nmodMatrix(rows, columns, entries, modulus);
}

function rightSide(rows, columns, modulus, offset = 0) {
  const entries = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1)
      entries.push(
        BigInt(
          (row + 1) * (column + 2) + offset * (row + column + 1),
        ) % modulus,
      );
  }
  return flint.nmodMatrix(rows, columns, entries, modulus);
}

function interpretedFallback(size) {
  const result = spawnSync(
    process.execPath,
    [
      join(__dirname, "..", "bin", "sagejs-source.cjs"),
      "--python",
      join(__dirname, "native_prime_field_workload.py"),
    ],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_PRIME_FIELD_FALLBACK_SIZE: String(size),
        SAGEJS_SITE_PACKAGES: __dirname,
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`interpreted fallback exited with ${result.status}`);
  }
  return [...result.stdout.matchAll(/^RESULT\s+(\S+)\s+(\S+)$/gm)]
    .map((match) => ({
      operation: match[1],
      milliseconds: Number(match[2]) * 1000,
    }));
}

(async () => {
  const generated = await compile({ sourcePath, cacheRoot });
  const kernel = require(generated.addonPath);
  const rows = [];
  for (const modulus of moduli) {
    for (const size of sizes) {
      const matrix = cauchyMatrix(size, size, modulus.value);
      const right = rightSide(size, 4, modulus.value);
      const repeatedRights = Array.from(
        { length: 8 },
        (_unused, index) => rightSide(size, 4, modulus.value, index),
      );
      const factor = kernel.prime_field_factor(matrix);
      const nativeEchelon = kernel.prime_field_echelon(matrix);
      const nativeSolution = kernel.prime_field_solve(matrix, right);
      assert.equal(
        kernel.prime_field_rank(matrix),
        flint.matrixRank(matrix),
      );
      assert.equal(
        kernel.prime_field_determinant(matrix),
        flint.matrixDet(matrix),
      );
      assert.equal(
        flint.matrixEqual(nativeEchelon, flint.matrixRref(matrix)),
        true,
      );
      assert.equal(
        flint.matrixEqual(flint.matrixMul(matrix, nativeSolution), right),
        true,
      );
      assert.equal(kernel.prime_field_factor_rank(factor), size);
      assert.equal(
        kernel.prime_field_factor_determinant(factor),
        flint.matrixDet(matrix),
      );
      assert.equal(
        flint.matrixEqual(
          flint.matrixMul(
            matrix,
            kernel.prime_field_factor_solve(factor, right),
          ),
          right,
        ),
        true,
      );
      const count = repetitions(size);
      const operations = [
        [
          "rank",
          () => kernel.prime_field_rank(matrix),
          () => flint.matrixRank(matrix),
        ],
        [
          "determinant",
          () => kernel.prime_field_determinant(matrix),
          () => flint.matrixDet(matrix),
        ],
        [
          "echelon",
          () => kernel.prime_field_echelon(matrix),
          () => flint.matrixRref(matrix),
        ],
        [
          "solve-4",
          () => kernel.prime_field_solve(matrix, right),
          () => flint.matrixSolve(matrix, right),
        ],
        [
          "factor",
          () => kernel.prime_field_factor(matrix),
          () => flint.matrixRank(matrix),
        ],
        [
          "solve-4-reuse",
          () => kernel.prime_field_factor_solve(factor, right),
          () => flint.matrixSolve(matrix, right),
        ],
        [
          "solve-4x8-reuse",
          () => {
            for (const repeatedRight of repeatedRights)
              kernel.prime_field_factor_solve(factor, repeatedRight);
          },
          () => {
            for (const repeatedRight of repeatedRights)
              flint.matrixSolve(matrix, repeatedRight);
          },
        ],
      ];
      for (const [operation, native, direct] of operations) {
        if (operationFilter.size > 0 && !operationFilter.has(operation))
          continue;
        const nativeMilliseconds = measure(native, count, samples);
        const flintMilliseconds = measure(direct, count, samples);
        rows.push({
          modulus: modulus.name,
          prime: String(modulus.value),
          size,
          factorAlgorithm: factor.algorithm,
          operation,
          nativeMilliseconds,
          flintMilliseconds,
          versusFlint: nativeMilliseconds / flintMilliseconds,
        });
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
      cc: process.env.CC || "platform default",
    },
    sourcePath,
    cacheKey: generated.cacheKey,
    cached: generated.cached,
    artifacts: {
      addonBytes: statSync(generated.addonPath).size,
      generatedCBytes: statSync(join(generated.outputPath, "kernel.c")).size,
      manifestBytes: statSync(join(generated.outputPath, "manifest.json")).size,
    },
    interpretedFallback: interpretedFallback(
      Number(process.env.SAGEJS_NATIVE_PRIME_FIELD_FALLBACK_SIZE || 16),
    ),
    rows,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `Native Kernel v9 prime-field matrices; addon ` +
      `${report.artifacts.addonBytes} bytes`,
  );
  console.log(
    "field".padEnd(7),
    "n".padStart(5),
    "operation".padEnd(13),
    "native".padStart(12),
    "FLINT".padStart(12),
    "ratio".padStart(9),
  );
  console.log("-".repeat(64));
  for (const row of rows) {
    console.log(
      row.modulus.padEnd(7),
      String(row.size).padStart(5),
      row.operation.padEnd(13),
      `${row.nativeMilliseconds.toFixed(3)} ms`.padStart(12),
      `${row.flintMilliseconds.toFixed(3)} ms`.padStart(12),
      `${row.versusFlint.toFixed(2)}x`.padStart(9),
    );
  }
  console.log("\nReadable Sage.js/Python fallback:");
  for (const row of report.interpretedFallback) {
    console.log(
      row.operation.padEnd(13),
      `${row.milliseconds.toFixed(3)} ms`.padStart(12),
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
