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

function appendInteger(output, value) {
  value = BigInt(value);
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

function packedEntries(size) {
  const output = [];
  for (let index = 0; index < size * size; index += 1) {
    appendInteger(output, BigInt((index * 17) % 101 - 50));
  }
  return Uint8Array.from(output);
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
  const size = 48;
  const entries = packedEntries(size);

  const constructionStarted = performance.now();
  const input = flint.ffiFlintByteRegionFromBytes(entries);
  const matrix = flint.ffiFmpzMatrixDeserializeEntries(
    input,
    BigInt(size),
    BigInt(size),
  );
  flint.ffiFlintByteRegionClose(input);
  const constructionMilliseconds = performance.now() - constructionStarted;

  const firstStarted = performance.now();
  const firstProduct = flint.ffiFmpzMatrixMul(matrix, matrix);
  const firstMultiplyMilliseconds = performance.now() - firstStarted;
  assert.equal(flint.ffiFmpzMatrixNrows(firstProduct), BigInt(size));
  flint.ffiFmpzMatrixClose(firstProduct);

  const warmSamples = [];
  for (let sample = 0; sample < 9; sample += 1) {
    const started = performance.now();
    const product = flint.ffiFmpzMatrixMul(matrix, matrix);
    warmSamples.push(performance.now() - started);
    flint.ffiFmpzMatrixClose(product);
  }

  const roundtripStarted = performance.now();
  const serialized = flint.ffiFmpzMatrixSerialize(matrix);
  const copied = flint.ffiFlintByteRegionCopyBytes(serialized);
  flint.ffiFlintByteRegionClose(serialized);
  const copiedInput = flint.ffiFlintByteRegionFromBytes(copied);
  const restored = flint.ffiFmpzMatrixDeserialize(copiedInput);
  flint.ffiFlintByteRegionClose(copiedInput);
  const roundtripMilliseconds = performance.now() - roundtripStarted;
  assert.equal(flint.ffiFmpzMatrixNcols(restored), BigInt(size));
  flint.ffiFmpzMatrixClose(restored);
  flint.ffiFmpzMatrixClose(matrix);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.benchmark/wasm-fmpz-matrix-resources-v1",
    wasm_bytes: wasm.byteLength,
    size,
    packed_entry_bytes: entries.byteLength,
    cold_instantiate_ms: coldMilliseconds,
    first_bulk_construction_ms: constructionMilliseconds,
    first_multiply_ms: firstMultiplyMilliseconds,
    warm_multiply_median_ms: median(warmSamples),
    serialize_copy_ingress_deserialize_ms: roundtripMilliseconds,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
