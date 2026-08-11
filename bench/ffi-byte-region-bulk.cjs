#!/usr/bin/env node
"use strict";

const { performance } = require("node:perf_hooks");
const flint = require("../packages/flint");

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function checksum(bytes) {
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value + bytes[index]) >>> 0;
  }
  return value;
}

const matrix = flint.ffiFmpqMatrixRandbits(250n, 250n, 31n, 17n, 29n);
const region = flint.ffiFmpqMatrixSerialize(matrix);
const length = Number(flint.ffiFlintByteRegionLength(region));
const samples = [];
let bulkChecksum = 0;
for (let round = 0; round < 9; round += 1) {
  const started = performance.now();
  const bytes = flint.ffiFlintByteRegionCopyBytes(region);
  samples.push(performance.now() - started);
  bulkChecksum = checksum(bytes);
}

let scalarChecksum = 0;
const scalarStarted = performance.now();
for (let index = 0; index < length; index += 1) {
  scalarChecksum = (
    scalarChecksum + Number(flint.ffiFlintByteRegionGet(region, BigInt(index)))
  ) >>> 0;
}
const scalarMilliseconds = performance.now() - scalarStarted;

flint.ffiFlintByteRegionClose(region);
flint.ffiFmpqMatrixClose(matrix);

if (bulkChecksum !== scalarChecksum) {
  throw new Error("bulk and scalar byte transfers disagree");
}
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.ffi/copied-bytes-benchmark-v1",
  workload: "serialized 250x250 random 31-bit dense QQ matrix",
  bytes: length,
  bulk_median_ms: median(samples),
  scalar_getter_ms: scalarMilliseconds,
  speedup: scalarMilliseconds / median(samples),
  checksum: bulkChecksum,
}, null, 2)}\n`);
