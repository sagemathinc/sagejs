#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left;
}

function normalize([numerator, denominator]) {
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function add(left, right) {
  return normalize([
    left[0] * right[1] + right[0] * left[1],
    left[1] * right[1],
  ]);
}

function multiply(left, right) {
  return normalize([left[0] * right[0], left[1] * right[1]]);
}

function appendExactInteger(output, value, signed) {
  value = BigInt(value);
  if (!signed && value <= 0n) {
    throw new RangeError("a rational denominator must be positive");
  }
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  const bytes = [];
  while (magnitude !== 0n) {
    bytes.push(Number(magnitude & 255n));
    magnitude >>= 8n;
  }
  let header = bytes.length;
  if (negative) header += 0x80000000;
  output.push(
    header & 255,
    (header >>> 8) & 255,
    (header >>> 16) & 255,
    (header >>> 24) & 255,
    ...bytes,
  );
}

function matrixEntries(size) {
  const entries = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const offDiagonal = BigInt((row * 17 + column * 29) % 23 - 11);
      const numerator = row === column
        ? offDiagonal + BigInt(size * 3 + row)
        : offDiagonal;
      const denominator = BigInt(1 + ((row * 5 + column * 3) % 11));
      entries.push(normalize([numerator, denominator]));
    }
  }
  return entries;
}

function packedRationals(entries) {
  const output = [];
  for (const [numerator, denominator] of entries) {
    appendExactInteger(output, numerator, true);
    appendExactInteger(output, denominator, false);
  }
  return Uint8Array.from(output);
}

function firstSquareEntry(entries, size) {
  let result = [0n, 1n];
  for (let index = 0; index < size; index += 1) {
    result = add(
      result,
      multiply(entries[index], entries[index * size]),
    );
  }
  return result;
}

async function main() {
  const wasmPath = join(
    root,
    "packages",
    "flint-wasm",
    "dist",
    "flint-factor.wasm",
  );
  const wasm = readFileSync(wasmPath);
  const { instantiateFlintFactor } = await import(
    pathToFileURL(join(root, "packages", "flint-wasm", "index.mjs"))
  );
  const coldStarted = performance.now();
  const flint = await instantiateFlintFactor(wasm);
  const coldMilliseconds = performance.now() - coldStarted;
  const size = 32;
  const entries = matrixEntries(size);
  const packed = packedRationals(entries);

  const constructionStarted = performance.now();
  const input = flint.ffiFlintByteRegionFromBytes(packed);
  const matrix = flint.ffiFmpqMatrixDeserialize(
    input,
    BigInt(size),
    BigInt(size),
  );
  flint.ffiFlintByteRegionClose(input);
  const constructionMilliseconds = performance.now() - constructionStarted;

  const expectedFirstEntry = firstSquareEntry(entries, size);
  const firstStarted = performance.now();
  const firstProduct = flint.ffiFmpqMatrixMul(matrix, matrix);
  const firstMultiplyMilliseconds = performance.now() - firstStarted;
  assert.equal(
    flint.ffiFmpqMatrixEntryNumerator(firstProduct, 0n, 0n),
    expectedFirstEntry[0],
  );
  assert.equal(
    flint.ffiFmpqMatrixEntryDenominator(firstProduct, 0n, 0n),
    expectedFirstEntry[1],
  );
  flint.ffiFmpqMatrixClose(firstProduct);

  const warmSamples = [];
  for (let sample = 0; sample < 9; sample += 1) {
    const started = performance.now();
    const product = flint.ffiFmpqMatrixMul(matrix, matrix);
    warmSamples.push(performance.now() - started);
    flint.ffiFmpqMatrixClose(product);
  }

  const rrefStarted = performance.now();
  const reduced = flint.ffiFmpqMatrixRref(matrix);
  const rrefMilliseconds = performance.now() - rrefStarted;
  const rank = flint.ffiFmpqMatrixRank(reduced);
  flint.ffiFmpqMatrixClose(reduced);

  const roundtripStarted = performance.now();
  const serialized = flint.ffiFmpqMatrixSerialize(matrix);
  const copied = flint.ffiFlintByteRegionCopyBytes(serialized);
  flint.ffiFlintByteRegionClose(serialized);
  const copiedInput = flint.ffiFlintByteRegionFromBytes(copied);
  const restored = flint.ffiFmpqMatrixDeserialize(
    copiedInput,
    BigInt(size),
    BigInt(size),
  );
  flint.ffiFlintByteRegionClose(copiedInput);
  const roundtripMilliseconds = performance.now() - roundtripStarted;
  assert.equal(flint.ffiFmpqMatrixNrows(restored), BigInt(size));
  assert.equal(flint.ffiFmpqMatrixNcols(restored), BigInt(size));
  assert.equal(
    flint.ffiFmpqMatrixEntryNumerator(restored, 0n, 0n),
    entries[0][0],
  );
  assert.equal(
    flint.ffiFmpqMatrixEntryDenominator(restored, 0n, 0n),
    entries[0][1],
  );
  flint.ffiFmpqMatrixClose(restored);
  flint.ffiFmpqMatrixClose(matrix);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.benchmark/wasm-fmpq-matrix-resources-v1",
    wasm_bytes: wasm.byteLength,
    size,
    variable_packed_entry_bytes: packed.byteLength,
    serialized_entry_bytes: copied.byteLength,
    rank: Number(rank),
    cold_instantiate_ms: coldMilliseconds,
    first_bulk_construction_ms: constructionMilliseconds,
    first_multiply_ms: firstMultiplyMilliseconds,
    warm_multiply_median_ms: median(warmSamples),
    first_rref_ms: rrefMilliseconds,
    serialize_copy_ingress_deserialize_ms: roundtripMilliseconds,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
