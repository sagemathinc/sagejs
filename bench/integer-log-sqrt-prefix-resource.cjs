#!/usr/bin/env node
"use strict";

// Primitive-only local benchmark. This does not measure class-group speed or
// replace the campaign's controlled opt measurements.
const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const generated = resolve(__dirname, "../packages/flint/build/generated-ffi");
const flint = require(join(generated, require(join(generated, "manifest.json")).addon));
const source = flint.ffiFmpzMatrixCreate(256n, 1n);
const output = flint.ffiFmpzMatrixCreate(1024n, 1n);
try {
  for (let i = 0; i < 256; i++) flint.ffiFmpzMatrixSetEntry(source, BigInt(i), 0n, 1n);
  const records = [];
  for (const count of [16, 64, 128, 248]) {
    for (let i = 0; i < 256; i++) {
      flint.ffiFmpzMatrixSetEntry(source, BigInt(i), 0n, i < count ? BigInt(i + 1) : 1n);
    }
    const prefix = () => flint.ffiIntegerLogSqrtBallsPrefixResource(output, source, BigInt(count), 64n);
    const padded = () => flint.ffiIntegerLogSqrtBallsResource(output, source, 64n);
    for (let i = 0; i < 5; i++) { assert.equal(prefix(), true); assert.equal(padded(), true); }
    const samples = { prefix: [], padded: [] };
    for (let sample = 0; sample < 7; sample++) {
      for (const [label, action] of sample % 2 ? [["padded", padded], ["prefix", prefix]] : [["prefix", prefix], ["padded", padded]]) {
        const start = performance.now();
        for (let i = 0; i < 100; i++) action();
        samples[label].push((performance.now() - start) / 100);
      }
    }
    for (const values of Object.values(samples)) values.sort((a, b) => a - b);
    records.push({ count, capacity: 256, prefixMs: samples.prefix[3], paddedMs: samples.padded[3] });
  }
  console.log(JSON.stringify({ kind: "shared-host-primitive-only", samples: 7, iterations: 100, records }, null, 2));
} finally {
  flint.ffiFmpzMatrixClose(output);
  flint.ffiFmpzMatrixClose(source);
}
