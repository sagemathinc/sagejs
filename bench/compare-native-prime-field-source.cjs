#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const os = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");

const root = join(__dirname, "..");
const sourcePath = join(__dirname, "native_prime_field_source.py");
const handwrittenPath = join(__dirname, "native_prime_field_matrix.py");
const cacheRoot = process.env.SAGEJS_NATIVE_PRIME_SOURCE_CACHE_ROOT ||
  join(__dirname, ".native-prime-source-cache");
const samples = Number(process.env.SAGEJS_NATIVE_PRIME_SOURCE_SAMPLES || 7);
const sizes = (process.env.SAGEJS_NATIVE_PRIME_SOURCE_SIZES ||
  (process.argv.includes("--quick") ? "32,64" : "32,64,128,256,384"))
  .split(",")
  .map(Number);
const json = process.argv.includes("--json");

if (!Number.isInteger(samples) || samples < 1)
  throw new RangeError("SAGEJS_NATIVE_PRIME_SOURCE_SAMPLES must be positive");
if (sizes.some((size) => !Number.isInteger(size) || size < 1))
  throw new RangeError("SAGEJS_NATIVE_PRIME_SOURCE_SIZES must be positive");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function repetitions(size) {
  if (size <= 32) return 40;
  if (size <= 64) return 16;
  if (size <= 128) return 4;
  return 1;
}

function measure(operation, count) {
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

function randomMatrix(rows, columns, modulus, seed) {
  return flint.nmodMatrixRandom(
    rows,
    columns,
    modulus,
    BigInt(seed),
    BigInt(seed * 65537 + 17),
  );
}

async function compileHandwrittenClassical() {
  const environment = "SAGEJS_NATIVE_PRIME_BLOCK_THRESHOLD_U32";
  const previous = process.env[environment];
  try {
    process.env[environment] = "4096";
    return await compile({
      sourcePath: handwrittenPath,
      cacheRoot: join(cacheRoot, "handwritten-classical"),
    });
  } finally {
    if (previous === undefined) delete process.env[environment];
    else process.env[environment] = previous;
  }
}

function interpretedFallback() {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs-source.cjs"),
      "--python",
      join(__dirname, "native_prime_field_source_workload.py"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_AUTOLOAD: "0",
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
  const handwritten = await compile({
    sourcePath: handwrittenPath,
    cacheRoot: join(cacheRoot, "handwritten-blocked"),
  });
  const classical = await compileHandwrittenClassical();
  const source = require(generated.addonPath);
  const handwrittenBlocked = require(handwritten.addonPath);
  const handwrittenClassical = require(classical.addonPath);
  const manifest = JSON.parse(
    readFileSync(join(generated.outputPath, "manifest.json"), "utf8"),
  );
  const rows = [];
  const modulus = 65521n;
  for (const size of sizes) {
    const left = randomMatrix(size, size, modulus, size * 2 + 1);
    const right = randomMatrix(size, size, modulus, size * 2 + 2);
    const expectedRank = flint.matrixRank(left);
    const expectedProduct = flint.matrixMul(left, right);
    assert.equal(source.source_prime_rank(left), expectedRank);
    assert.equal(
      flint.matrixEqual(source.source_prime_matmul(left, right), expectedProduct),
      true,
    );
    const count = repetitions(size);
    const sourceRank = measure(() => source.source_prime_rank(left), count);
    const classicalRank = measure(
      () => handwrittenClassical.prime_field_rank(left),
      count,
    );
    const blockedRank = measure(
      () => handwrittenBlocked.prime_field_rank(left),
      count,
    );
    const flintRank = measure(() => flint.matrixRank(left), count);
    const sourceMatmul = measure(
      () => source.source_prime_matmul(left, right),
      count,
    );
    const flintMatmul = measure(() => flint.matrixMul(left, right), count);
    rows.push({
      size,
      rank: {
        source: sourceRank,
        handwrittenClassical: classicalRank,
        handwrittenBlocked: blockedRank,
        flint: flintRank,
        sourceVersusClassical: sourceRank / classicalRank,
        sourceVersusBlocked: sourceRank / blockedRank,
        sourceVersusFlint: sourceRank / flintRank,
      },
      matmul: {
        source: sourceMatmul,
        flint: flintMatmul,
        sourceVersusFlint: sourceMatmul / flintMatmul,
      },
    });
  }
  const generatedC = join(generated.outputPath, "kernel.c");
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
      compiler: process.env.CC || "platform default",
      compilerVersion: spawnSync(process.env.CC || "cc", ["--version"], {
        encoding: "utf8",
      }).stdout?.split("\n", 1)[0] || "unknown",
    },
    sourcePath,
    cacheKey: generated.cacheKey,
    sourceBoundsChecked: manifest.sourceBoundsChecked,
    optimizations: manifest.ir.functions.map((fn) => ({
      name: fn.name,
      optimizations: fn.optimizations,
    })),
    artifacts: {
      pythonBytes: statSync(sourcePath).size,
      generatedCBytes: statSync(generatedC).size,
      addonBytes: statSync(generated.addonPath).size,
    },
    interpretedFallback: interpretedFallback(),
    rows,
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(
    `Source-transparent prime-field experiment; ${report.environment.cpu}`,
  );
  console.log(
    `${report.environment.compilerVersion}; bounds checked: ` +
      `${report.sourceBoundsChecked}; addon ${report.artifacts.addonBytes} bytes`,
  );
  console.log(
    "n".padStart(5),
    "source LU".padStart(11),
    "C classical".padStart(12),
    "C blocked".padStart(11),
    "FLINT LU".padStart(10),
    "src/C".padStart(8),
    "source mul".padStart(11),
    "FLINT mul".padStart(11),
  );
  console.log("-".repeat(89));
  for (const row of rows) {
    console.log(
      String(row.size).padStart(5),
      `${row.rank.source.toFixed(3)} ms`.padStart(11),
      `${row.rank.handwrittenClassical.toFixed(3)} ms`.padStart(12),
      `${row.rank.handwrittenBlocked.toFixed(3)} ms`.padStart(11),
      `${row.rank.flint.toFixed(3)} ms`.padStart(10),
      `${row.rank.sourceVersusClassical.toFixed(2)}x`.padStart(8),
      `${row.matmul.source.toFixed(3)} ms`.padStart(11),
      `${row.matmul.flint.toFixed(3)} ms`.padStart(11),
    );
  }
  console.log("\nInterpreted Sage.js/Python fallback:");
  for (const row of report.interpretedFallback)
    console.log(row.operation.padEnd(8), `${row.milliseconds.toFixed(3)} ms`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
