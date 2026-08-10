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

const root = join(__dirname, "..");
const sourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_prime.py",
);
const flintSourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_prime_flint.py",
);
const cacheRoot = process.env.SAGEJS_DENSE_PRIME_CACHE_ROOT ||
  join(__dirname, ".dense-prime-migration-cache");
const samples = Number(process.env.SAGEJS_DENSE_PRIME_SAMPLES || 7);
const sizes = (process.env.SAGEJS_DENSE_PRIME_SIZES ||
  (process.argv.includes("--quick") ? "8,16,32,64" : "8,16,32,64,128,256"))
  .split(",")
  .map(Number);
const modulus = BigInt(process.env.SAGEJS_DENSE_PRIME_MODULUS || "65521");
const json = process.argv.includes("--json");

if (!Number.isInteger(samples) || samples < 1) {
  throw new RangeError("SAGEJS_DENSE_PRIME_SAMPLES must be positive");
}
if (sizes.some((size) => !Number.isInteger(size) || size < 1)) {
  throw new RangeError("SAGEJS_DENSE_PRIME_SIZES must be positive");
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function repetitions(size) {
  if (size <= 8) return 100;
  if (size <= 16) return 40;
  if (size <= 32) return 12;
  if (size <= 64) return 4;
  return 1;
}

function measure(operation, count) {
  for (let warmup = 0; warmup < 2; warmup += 1) operation();
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let repetition = 0; repetition < count; repetition += 1) {
      operation();
    }
    timings.push((performance.now() - started) / count);
  }
  return median(timings);
}

function randomEntries(rows, columns, initialSeed) {
  let seed = BigInt(initialSeed) & ((1n << 64n) - 1n);
  const entries = [];
  for (let index = 0; index < rows * columns; index += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    entries.push(seed % modulus);
  }
  return entries;
}

function triangularEntries(size, seed) {
  const entries = [];
  const modulusNumber = Number(modulus);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      entries.push(column > row
        ? 0n
        : column === row
          ? BigInt((row + seed) % (modulusNumber - 1) + 1)
          : BigInt((row * 97 + column * 53 + seed) % modulusNumber));
    }
  }
  return entries;
}

function operationTimes(
  coreOperation,
  productionOperation,
  declaredFlintCoreOperation,
  declaredFlintProductionOperation,
  legacyOperation,
  count,
) {
  const core = measure(coreOperation, count);
  const production = measure(productionOperation, count);
  const declaredFlintCore = measure(declaredFlintCoreOperation, count);
  const declaredFlintProduction = measure(
    declaredFlintProductionOperation, count,
  );
  const legacyNapi = measure(legacyOperation, count);
  return {
    core,
    production,
    declaredFlintCore,
    declaredFlintProduction,
    legacyNapi,
    coreOverDeclaredFlint: core / declaredFlintCore,
    productionOverDeclaredFlint: production / declaredFlintProduction,
  };
}

function firstWin(rows, operation, implementation, baseline) {
  const winner = rows.find((row) =>
    row[operation][implementation] <= row[operation][baseline]
  );
  return winner?.size ?? null;
}

(async () => {
  const compiled = await compile({ sourcePath, cacheRoot });
  const compiledFlint = await compile({
    sourcePath: flintSourcePath,
    cacheRoot,
  });
  const kernel = require(compiled.modulePath);
  const flintKernel = require(compiledFlint.modulePath);
  const packed = (source) => kernel.createUInt64Buffer(source);
  const record = (entries, rows, columns) => ({
    entries, rows, columns, modulus,
  });
  const rows = [];
  for (const size of sizes) {
    const wideRows = Math.max(1, Math.floor(size * 3 / 4));
    const squareEntries = randomEntries(size, size, size * 101 + 1);
    const wideEntries = randomEntries(wideRows, size, size * 101 + 2);
    const leftEntries = triangularEntries(size, size * 101 + 3);
    const rightEntries = randomEntries(size, 4, size * 101 + 4);
    const square = flint.nmodMatrix(
      size, size, squareEntries, modulus,
    );
    const wide = flint.nmodMatrix(
      wideRows, size, wideEntries, modulus,
    );
    const left = flint.nmodMatrix(size, size, leftEntries, modulus);
    const right = flint.nmodMatrix(size, 4, rightEntries, modulus);
    const squareSource = packed(squareEntries);
    const wideSource = packed(wideEntries);
    const leftSource = packed(leftEntries);
    const rightSource = packed(rightEntries);
    const squareRecord = record(squareSource, size, size);
    const wideRecord = record(wideSource, wideRows, size);
    const leftRecord = record(leftSource, size, size);
    const rightRecord = record(rightSource, size, 4);
    const rankWorkspace = packed(size * size);
    const rrefOutput = packed(size * size);
    const kernelWorkspace = packed(wideRows * size);
    const kernelOutput = packed(size * size);
    const solveWorkspace = packed(size * (size + 4));
    const solveOutput = packed(size * 4);
    const declaredRrefOutput = packed(size * size);
    const declaredKernelOutput = packed(size * size);
    const declaredSolveOutput = packed(size * 4);

    const expectedRank = flint.matrixRank(square);
    assert.equal(kernel.dense_prime_rank(
      squareRecord, rankWorkspace,
    ), expectedRank);
    assert.equal(kernel.dense_prime_rref(
      squareRecord, rrefOutput,
    ), expectedRank);
    assert.equal(flint.matrixEqual(
      flint.nmodMatrix(size, size, Array.from(rrefOutput), modulus),
      flint.matrixRref(square),
    ), true);
    const expectedWideRank = flint.matrixRank(wide);
    const nullity = kernel.dense_prime_right_kernel(
      wideRecord,
      kernelWorkspace,
      kernelOutput,
    );
    assert.equal(nullity, size - expectedWideRank);
    assert.equal(flint.matrixEqual(
      flint.nmodMatrix(
        nullity,
        size,
        Array.from(kernelOutput).slice(0, nullity * size),
        modulus,
      ),
      flint.matrixRightKernel(wide),
    ), true);
    assert.equal(kernel.dense_prime_solve(
      leftRecord,
      rightRecord,
      solveWorkspace,
      solveOutput,
    ), 1);
    assert.equal(flint.matrixEqual(
      flint.nmodMatrix(size, 4, Array.from(solveOutput), modulus),
      flint.matrixSolve(left, right),
    ), true);
    assert.equal(
      Number(flintKernel.flint_dense_prime_rank(
        squareSource, size, size, modulus,
      )),
      expectedRank,
    );
    assert.equal(
      Number(flintKernel.flint_dense_prime_rref(
        declaredRrefOutput, squareSource, size, size, modulus,
      )),
      expectedRank,
    );
    assert.equal(
      Number(flintKernel.flint_dense_prime_right_kernel(
        declaredKernelOutput, wideSource, wideRows, size, modulus,
      )),
      nullity,
    );
    assert.equal(flintKernel.flint_dense_prime_solve(
      declaredSolveOutput,
      leftSource,
      rightSource,
      size,
      4,
      modulus,
    ), true);

    const count = repetitions(size);
    rows.push({
      size,
      rank: operationTimes(
        () => kernel.dense_prime_rank(
          squareRecord, rankWorkspace),
        () => kernel.dense_prime_rank(
          squareRecord, packed(size * size)),
        () => flintKernel.flint_dense_prime_rank(
          squareSource, size, size, modulus),
        () => flintKernel.flint_dense_prime_rank(
          squareSource, size, size, modulus),
        () => flint.matrixRank(square),
        count,
      ),
      rref: operationTimes(
        () => kernel.dense_prime_rref(
          squareRecord, rrefOutput),
        () => kernel.dense_prime_rref(
          squareRecord, packed(size * size)),
        () => flintKernel.flint_dense_prime_rref(
          declaredRrefOutput, squareSource, size, size, modulus),
        () => flintKernel.flint_dense_prime_rref(
          packed(size * size), squareSource, size, size, modulus),
        () => flint.matrixRref(square),
        count,
      ),
      rightKernel: operationTimes(
        () => kernel.dense_prime_right_kernel(
          wideRecord,
          kernelWorkspace,
          kernelOutput,
        ),
        () => kernel.dense_prime_right_kernel(
          wideRecord,
          packed(wideRows * size),
          packed(size * size),
        ),
        () => flintKernel.flint_dense_prime_right_kernel(
          declaredKernelOutput, wideSource, wideRows, size, modulus),
        () => flintKernel.flint_dense_prime_right_kernel(
          packed(size * size), wideSource, wideRows, size, modulus),
        () => flint.matrixRightKernel(wide),
        count,
      ),
      solve: operationTimes(
        () => kernel.dense_prime_solve(
          leftRecord,
          rightRecord,
          solveWorkspace,
          solveOutput,
        ),
        () => kernel.dense_prime_solve(
          leftRecord,
          rightRecord,
          packed(size * (size + 4)),
          packed(size * 4),
        ),
        () => flintKernel.flint_dense_prime_solve(
          declaredSolveOutput,
          leftSource,
          rightSource,
          size,
          4,
          modulus,
        ),
        () => flintKernel.flint_dense_prime_solve(
          packed(size * 4),
          leftSource,
          rightSource,
          size,
          4,
          modulus,
        ),
        () => flint.matrixSolve(left, right),
        count,
      ),
    });
  }

  const operations = ["rank", "rref", "rightKernel", "solve"];
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: {
      core: "canonical input and caller-owned workspace are preallocated",
      production: "canonical input is retained; caller-owned workspace/output allocation is timed",
      declaredFlint: "generated FFI reconstructs FLINT matrices from the same canonical packed input",
      legacyNapi: "current handwritten N-API/FLINT operation on a retained opaque matrix",
      warmups: 2,
      samples,
    },
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
    modulus: modulus.toString(),
    cacheKey: compiled.cacheKey,
    flintCacheKey: compiledFlint.cacheKey,
    artifacts: {
      pythonBytes: statSync(sourcePath).size,
      coreCBytes: statSync(compiled.coreSourcePath).size,
      addonBytes: statSync(compiled.addonPath).size,
      declaredFlintCoreCBytes: statSync(compiledFlint.coreSourcePath).size,
    },
    crossover: Object.fromEntries(operations.map((operation) => [
      operation,
      {
        core: firstWin(
          rows, operation, "core", "declaredFlintCore"),
        production: firstWin(
          rows,
          operation,
          "production",
          "declaredFlintProduction",
        ),
      },
    ])),
    rows,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Dense GF(p) migration, p=${modulus}; ${report.environment.cpu}`);
  console.log(
    `${report.environment.compilerVersion}; typed Python ` +
      `${report.artifacts.pythonBytes} B -> ` +
      `${report.artifacts.coreCBytes} B isolated core`,
  );
  console.log(
    "n".padStart(5),
    ...operations.flatMap((operation) => [
      `${operation} core`.padStart(15),
      `${operation} prod`.padStart(15),
      `${operation} FFI`.padStart(15),
      `${operation} NAPI`.padStart(15),
      "prod/FFI".padStart(9),
    ]),
  );
  console.log("-".repeat(5 + operations.length * 69));
  for (const row of rows) {
    console.log(
      String(row.size).padStart(5),
      ...operations.flatMap((operation) => [
        `${row[operation].core.toFixed(3)} ms`.padStart(15),
        `${row[operation].production.toFixed(3)} ms`.padStart(15),
        `${row[operation].declaredFlintProduction.toFixed(3)} ms`.padStart(15),
        `${row[operation].legacyNapi.toFixed(3)} ms`.padStart(15),
        `${row[operation].productionOverDeclaredFlint.toFixed(2)}x`.padStart(9),
      ]),
    );
  }
  console.log("Measured first typed-Python wins:", report.crossover);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
