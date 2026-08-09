#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = join(__dirname, "..");
const sourcePath = join(__dirname, "native-ffi-flint-matrix.py");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function timing(callable, repeats = 15) {
  const values = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const start = performance.now();
    callable();
    values.push(performance.now() - start);
  }
  return median(values);
}

function matrixEntries(size, modulus) {
  const result = new BigUint64Array(size * size);
  let state = 0x9e3779b97f4a7c15n;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      state ^= state << 7n;
      state ^= state >> 9n;
      result[row * size + column] = BigInt.asUintN(64, state) % modulus;
    }
    result[row * size + row] = (result[row * size + row] + 1n) % modulus;
  }
  return result;
}

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-matrix-bench-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot: temporary });
    const kernel = require(compiled.modulePath);
    const size = Number(process.env.SAGEJS_FFI_MATRIX_SIZE || 64);
    const modulus = 1000003n;
    const entries = matrixEntries(size, modulus);
    const nativeOutput = kernel.createUInt64Buffer(size * size);
    const dynamicOutput = Array(size * size).fill(0n);
    const rank = kernel.flint_nmod_rank(
      entries, BigInt(size), BigInt(size), modulus,
    );
    const dynamicRank = kernel.flint_nmod_rank.javascript(
      entries, BigInt(size), BigInt(size), modulus,
    );
    if (rank !== dynamicRank) throw new Error("rank oracle disagreement");
    kernel.flint_nmod_inverse(
      nativeOutput, entries, BigInt(size), modulus,
    );
    kernel.flint_nmod_inverse.javascript(
      dynamicOutput, entries, BigInt(size), modulus,
    );
    const report = {
      schema: "sagejs.benchmark/ffi-packed-matrix-v1",
      size,
      modulus: modulus.toString(),
      rank: rank.toString(),
      milliseconds: {
        native_rank: timing(() => kernel.flint_nmod_rank(
          entries, BigInt(size), BigInt(size), modulus,
        )),
        dynamic_rank: timing(() => kernel.flint_nmod_rank.javascript(
          entries, BigInt(size), BigInt(size), modulus,
        )),
        native_inverse: timing(() => kernel.flint_nmod_inverse(
          nativeOutput, entries, BigInt(size), modulus,
        ), 7),
        dynamic_inverse: timing(() => kernel.flint_nmod_inverse.javascript(
          dynamicOutput, entries, BigInt(size), modulus,
        ), 7),
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
