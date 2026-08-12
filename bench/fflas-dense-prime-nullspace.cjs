#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

process.env.OPENBLAS_NUM_THREADS ??= "1";

const root = join(__dirname, "..");
const fflas = require("../packages/fflas");
const flint = require("../packages/flint");
const check = process.argv.includes("--check");
const rows = 200;
const columns = 300;
const modulus = 97n;

function residues(length, initialSeed) {
  let seed = BigInt(initialSeed) & ((1n << 64n) - 1n);
  const output = new BigUint64Array(length);
  for (let index = 0; index < output.length; index += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    output[index] = seed % modulus;
  }
  return output;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(invoke, repetitions = 9) {
  invoke();
  const samples = [];
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now();
    invoke();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

function publicTiming(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fflas-nullspace-"));
  try {
    const filename = join(directory, "public.py");
    writeFileSync(filename, String.raw`
import time

field = GF(97)
rows = ${rows}
columns = ${columns}
entries = ${JSON.stringify([...source], (_key, value) =>
      typeof value === "bigint" ? Number(value) : value)}

# Load the typed kernel and generated adapter outside the measured samples.
matrix(field, rows, columns, entries).right_kernel_matrix()
samples = []
for _index in range(7):
    source = matrix(field, rows, columns, entries)
    started = time.perf_counter()
    basis = source.right_kernel_matrix()
    samples.append(1000 * (time.perf_counter() - started))
assert source * basis.transpose() == zero_matrix(field, rows, basis.nrows())
samples.sort()
print('PUBLIC_FFLAS_NULLSPACE', samples[len(samples) // 2])
`);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), filename], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_TRACE: "1" },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      result.stdout,
      /Matrix\.right_kernel GF\(97\) 200x300 -> declared-fflas-isolated/,
    );
    const match = result.stdout.match(/PUBLIC_FFLAS_NULLSPACE\s+([0-9.eE+-]+)/);
    assert.ok(match, result.stdout);
    return Number(match[1]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (!fflas.ffiFflasModularFloatAvailable()) {
  process.stdout.write("FFLAS capability unavailable on this host\n");
  process.exit(0);
}

const source = residues(rows * columns, 20260812);
const fflasOutput = new BigUint64Array(columns * columns);
const fflasNullity = new BigUint64Array(1);
const flintOutput = new BigUint64Array(columns * columns);

const fflasTime = measure(() => {
  fflas.ffiFflasModularFloatRightNullspace(
    fflasOutput,
    fflasNullity,
    source,
    BigInt(fflasOutput.length),
    1n,
    BigInt(source.length),
    BigInt(rows),
    BigInt(columns),
    modulus,
  );
});
let flintNullity = 0n;
const flintTime = measure(() => {
  flintNullity = flint.ffiNmodMatRightKernel(
    flintOutput,
    source,
    BigInt(rows),
    BigInt(columns),
    modulus,
  );
});

assert.equal(fflasNullity[0], flintNullity);
assert.deepEqual([...fflasOutput], [...flintOutput]);
const publicTime = publicTiming(source);

process.stdout.write(
  `GF(97) ${rows}x${columns} canonical right nullspace, median ms\n` +
    `FFPACK generated boundary: ${fflasTime.toFixed(3)}\n` +
    `FLINT declared boundary:   ${flintTime.toFixed(3)}\n` +
    `public Matrix:             ${publicTime.toFixed(3)}\n`,
);

if (check) {
  assert.ok(
    fflasTime < flintTime * 0.6,
    `FFPACK ${fflasTime}ms is not materially faster than FLINT ${flintTime}ms`,
  );
  assert.ok(fflasTime < 4, `FFPACK boundary took ${fflasTime}ms`);
  assert.ok(publicTime < 7.5, `public right nullspace took ${publicTime}ms`);
}
