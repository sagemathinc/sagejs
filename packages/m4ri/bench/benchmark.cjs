#!/usr/bin/env node
"use strict";

const { performance } = require("node:perf_hooks");
const m4ri = require("..");

if (!m4ri.ffiM4riAvailable()) {
  process.stdout.write(JSON.stringify({ capability: false, platform: process.platform }) + "\n");
  process.exit(0);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measured(repeats, operation) {
  const values = [];
  operation();
  for (let iteration = 0; iteration < repeats; iteration += 1) {
    const started = performance.now();
    operation();
    values.push(performance.now() - started);
  }
  return median(values);
}

function close(resource, closer) {
  closer(resource);
}

function randomLogicalWords(rows, columns, seed) {
  const width = Math.ceil(columns / 64);
  const bytes = Buffer.alloc(rows * width * 8);
  let state = seed >>> 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes.writeUInt32LE(state, offset);
  }
  if (columns % 64 !== 0) {
    const mask = (1n << BigInt(columns % 64)) - 1n;
    for (let row = 0; row < rows; row += 1) {
      const offset = (row * width + width - 1) * 8;
      bytes.writeBigUInt64LE(bytes.readBigUInt64LE(offset) & mask, offset);
    }
  }
  return bytes;
}

function fromWords(bytes, rows, columns) {
  const region = m4ri.ffiM4riByteRegionFromBytes(bytes);
  try {
    return m4ri.ffiM4riMatrixFromLogicalWords(
      region,
      BigInt(rows),
      BigInt(columns),
    );
  } finally {
    close(region, m4ri.ffiM4riByteRegionClose);
  }
}

const size = Number(process.env.SAGEJS_M4RI_BENCH_SIZE || 512);
const sourceBytes = randomLogicalWords(size, size, 0x79_13_27_55);
const left = fromWords(sourceBytes, size, size);
const right = fromWords(randomLogicalWords(size, size, 0x25_81_44_39), size, size);
const samples = {
  schema: "sagejs.m4ri/resource-benchmark-v1",
  size,
  logicalBytes: sourceBytes.length,
  importMs: measured(9, () => {
    close(fromWords(sourceBytes, size, size), m4ri.ffiM4riMatrixClose);
  }),
  exportMs: measured(9, () => {
    const bytes = m4ri.ffiM4riMatrixLogicalWords(left);
    m4ri.ffiM4riByteRegionCopyBytes(bytes);
    close(bytes, m4ri.ffiM4riByteRegionClose);
  }),
  addMs: measured(9, () => {
    close(m4ri.ffiM4riMatrixAdd(left, right), m4ri.ffiM4riMatrixClose);
  }),
  multiplyMs: measured(7, () => {
    close(m4ri.ffiM4riMatrixMul(left, right), m4ri.ffiM4riMatrixClose);
  }),
  rankMs: measured(7, () => m4ri.ffiM4riMatrixRank(left)),
  rrefMs: measured(7, () => {
    close(m4ri.ffiM4riMatrixRref(left), m4ri.ffiM4riMatrixClose);
  }),
  rrefThenRankMs: measured(7, () => {
    const reduced = m4ri.ffiM4riMatrixRref(left);
    m4ri.ffiM4riMatrixRank(reduced);
    close(reduced, m4ri.ffiM4riMatrixClose);
  }),
};
close(right, m4ri.ffiM4riMatrixClose);
close(left, m4ri.ffiM4riMatrixClose);
process.stdout.write(JSON.stringify(samples, null, 2) + "\n");
