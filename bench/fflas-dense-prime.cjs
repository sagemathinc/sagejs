#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

// Keep the performance gate deterministic without relying on POSIX shell
// assignment syntax; this benchmark also runs on native Windows.
process.env.OPENBLAS_NUM_THREADS ??= "1";

const fflas = require("../packages/fflas");
const flint = require("../packages/flint");

const check = process.argv.includes("--check");
const sizes = check ? [64, 128, 256] : [32, 64, 128, 256, 384, 512];
const rawAtSize = new Map();

function residues(size, modulus, initialSeed) {
  let seed = BigInt(initialSeed) & ((1n << 64n) - 1n);
  const output = new BigUint64Array(size * size);
  for (let index = 0; index < output.length; index += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    output[index] = seed % BigInt(modulus);
  }
  return output;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(invoke, repetitions) {
  invoke();
  const samples = [];
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    invoke();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

if (!fflas.ffiFflasModularFloatAvailable()) {
  process.stdout.write("FFLAS capability unavailable on this host\n");
  process.exit(0);
}

process.stdout.write("dense GF(97) square matrices; median milliseconds\n");
process.stdout.write(
  "size  fflas-mul  flint-mul  fflas-rank  flint-rank  fflas-rref  flint-rref\n",
);
for (const size of sizes) {
  const modulus = 97n;
  const left = residues(size, modulus, 1729 + size);
  const right = residues(size, modulus, 65537 + size);
  const fflasMulOutput = new BigUint64Array(size * size);
  const flintMulOutput = new BigUint64Array(size * size);
  const fflasRrefOutput = new BigUint64Array(size * size);
  const flintRrefOutput = new BigUint64Array(size * size);
  const fflasRankOutput = new BigUint64Array(1);
  const fflasRrefRankOutput = new BigUint64Array(1);

  assert.equal(fflas.ffiFflasModularFloatMul(
    fflasMulOutput, left, right,
    BigInt(fflasMulOutput.length), BigInt(left.length), BigInt(right.length),
    BigInt(size), BigInt(size), BigInt(size), modulus,
  ), true);
  assert.equal(flint.ffiNmodMatMul(
    flintMulOutput, left, right,
    BigInt(size), BigInt(size), BigInt(size), modulus,
  ), true);
  assert.deepEqual([...fflasMulOutput], [...flintMulOutput]);

  assert.equal(fflas.ffiFflasModularFloatRref(
    fflasRrefOutput, fflasRrefRankOutput, left,
    BigInt(fflasRrefOutput.length), 1n, BigInt(left.length),
    BigInt(size), BigInt(size), modulus,
  ), true);
  const flintRrefRank = flint.ffiNmodMatRref(
    flintRrefOutput, left, BigInt(size), BigInt(size), modulus,
  );
  const flintStandaloneRank = flint.ffiNmodMatRank(
    left, BigInt(size), BigInt(size), modulus,
  );
  assert.equal(fflas.ffiFflasModularFloatRank(
    fflasRankOutput, left,
    1n, BigInt(left.length), BigInt(size), BigInt(size), modulus,
  ), true);
  assert.equal(fflasRrefRankOutput[0], flintRrefRank);
  assert.equal(fflasRankOutput[0], flintStandaloneRank);
  assert.deepEqual([...fflasRrefOutput], [...flintRrefOutput]);

  const repetitions = size <= 128 ? 7 : 3;
  const fflasMul = measure(() => fflas.ffiFflasModularFloatMul(
    fflasMulOutput, left, right,
    BigInt(fflasMulOutput.length), BigInt(left.length), BigInt(right.length),
    BigInt(size), BigInt(size), BigInt(size), modulus,
  ), repetitions);
  const flintMul = measure(() => flint.ffiNmodMatMul(
    flintMulOutput, left, right,
    BigInt(size), BigInt(size), BigInt(size), modulus,
  ), repetitions);
  const fflasRank = measure(() => fflas.ffiFflasModularFloatRank(
    fflasRankOutput, left,
    1n, BigInt(left.length),
    BigInt(size), BigInt(size), modulus,
  ), repetitions);
  const flintRank = measure(() => flint.ffiNmodMatRank(
    left, BigInt(size), BigInt(size), modulus,
  ), repetitions);
  const fflasRref = measure(() => fflas.ffiFflasModularFloatRref(
    fflasRrefOutput, fflasRrefRankOutput, left,
    BigInt(fflasRrefOutput.length), 1n, BigInt(left.length),
    BigInt(size), BigInt(size), modulus,
  ), repetitions);
  const flintRref = measure(() => flint.ffiNmodMatRref(
    flintRrefOutput, left, BigInt(size), BigInt(size), modulus,
  ), repetitions);
  process.stdout.write(
    `${String(size).padStart(4)}  ${fflasMul.toFixed(3).padStart(9)}  ` +
      `${flintMul.toFixed(3).padStart(9)}  ${fflasRank.toFixed(3).padStart(10)}  ` +
      `${flintRank.toFixed(3).padStart(10)}  ` +
      `${fflasRref.toFixed(3).padStart(11)}  ` +
      `${flintRref.toFixed(3).padStart(10)}\n`,
  );
  rawAtSize.set(size, { fflasMul, fflasRank, fflasRref });
  if (check) {
    assert.ok(
      fflasMul <= flintMul * 1.5,
      `FFLAS multiplication ${fflasMul}ms exceeds FLINT ${flintMul}ms`,
    );
    assert.ok(
      fflasRref <= flintRref * 1.5,
      `FFPACK RREF ${fflasRref}ms exceeds FLINT ${flintRref}ms`,
    );
    if (size >= 64) {
      assert.ok(
        fflasRank <= flintRank * 1.5,
        `FFPACK rank ${fflasRank}ms exceeds FLINT ${flintRank}ms`,
      );
    }
  }
}

function publicBenchmark(size) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fflas-benchmark-"));
  try {
    const filename = join(directory, "public.py");
    writeFileSync(filename, String.raw`
import time

size = ${size}
field = GF(97)
entries = [(37*k*k + 19*k + 11) % 97 for k in range(size*size)]
left = matrix(field, size, size, entries)
right = matrix(field, size, size, list(reversed(entries)))

# Load the compiled module and native addon before taking warm samples.
left * right
matrix(field, size, size, entries).rref()
matrix(field, size, size, entries).rank()

multiply = []
for _ in range(5):
    started = time.perf_counter()
    result = left * right
    multiply.append(1000 * (time.perf_counter() - started))

rref_inputs = [matrix(field, size, size, entries) for _ in range(5)]
rref = []
for source in rref_inputs:
    started = time.perf_counter()
    reduced = source.rref()
    rref.append(1000 * (time.perf_counter() - started))

multiply.sort()
rref.sort()
rank_inputs = [matrix(field, size, size, entries) for _ in range(5)]
rank = []
for source in rank_inputs:
    started = time.perf_counter()
    value = source.rank()
    rank.append(1000 * (time.perf_counter() - started))

rank.sort()
print('PUBLIC_FFLAS', size, multiply[2], rank[2], rref[2])
`);
    const result = spawnSync(process.execPath, [join(__dirname, "..", "bin", "sagejs"), filename], {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_TRACE: "1" },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      result.stdout,
      new RegExp(`Matrix\\.multiply GF\\(97\\) ${size}x${size} -> declared-fflas-isolated`),
    );
    assert.match(
      result.stdout,
      new RegExp(`Matrix\\.rref GF\\(97\\) ${size}x${size} -> declared-fflas-isolated`),
    );
    assert.match(
      result.stdout,
      new RegExp(`Matrix\\.rank GF\\(97\\) ${size}x${size} -> declared-fflas-isolated`),
    );
    const match = result.stdout.match(
      /PUBLIC_FFLAS\s+(\d+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)/,
    );
    assert.ok(match, result.stdout);
    return {
      multiply: Number(match[2]),
      rank: Number(match[3]),
      rref: Number(match[4]),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const publicSize = 256;
const publicTimings = publicBenchmark(publicSize);
process.stdout.write(
  `public Matrix default ${publicSize}x${publicSize}: ` +
    `multiply ${publicTimings.multiply.toFixed(3)}ms, ` +
    `rank ${publicTimings.rank.toFixed(3)}ms, ` +
    `rref ${publicTimings.rref.toFixed(3)}ms\n`,
);
if (check) {
  const raw = rawAtSize.get(publicSize);
  assert.ok(
    publicTimings.multiply <= Math.max(25, raw.fflasMul * 10),
    `public multiplication overhead is ${publicTimings.multiply}ms`,
  );
  assert.ok(
    publicTimings.rank <= Math.max(25, raw.fflasRank * 10),
    `public rank overhead is ${publicTimings.rank}ms`,
  );
  assert.ok(
    publicTimings.rref <= Math.max(25, raw.fflasRref * 10),
    `public RREF overhead is ${publicTimings.rref}ms`,
  );
}
