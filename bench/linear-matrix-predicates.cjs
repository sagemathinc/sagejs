#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { compile } = require("@sagemath/sagejs/native");

const root = resolve(__dirname, "..");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "linear_algebra",
  "matrix_predicates.py",
);
const check = process.argv.includes("--check");

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function timeMilliseconds(operation, warmups = 2, samples = 7) {
  for (let index = 0; index < warmups; index += 1) operation();
  const times = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    operation();
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return median(times);
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-predicate-bench-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: temporary });
    const native = require(compiled.addonPath);
    const flint = require(join(root, "packages", "flint"));
    const size = 1000;
    const length = size * size;
    const sparsePrime = new BigUint64Array(length);
    const densePrime = new BigUint64Array(length).fill(1n);
    for (let index = 0; index < size; index += 1)
      sparsePrime[index * size + index] = 1n;
    const primeRows = new BigUint64Array(length);
    const primeColumns = new BigUint64Array(length);

    const integer = flint.ffiFmpzMatrixCreate(BigInt(size), BigInt(size));
    const rational = flint.ffiFmpqMatrixCreate(BigInt(size), BigInt(size));
    const integerRows = new BigInt64Array(length);
    const integerColumns = new BigInt64Array(length);
    const rationalRows = new BigInt64Array(length);
    const rationalColumns = new BigInt64Array(length);
    try {
      for (let index = 0; index < size; index += 1) {
        assert.equal(
          flint.ffiFmpzMatrixSetEntry(
            integer, BigInt(index), BigInt(index), 1n,
          ),
          true,
        );
        assert.equal(
          flint.ffiFmpqMatrixSetEntry(
            rational, BigInt(index), BigInt(index), 1n, 1n,
          ),
          true,
        );
      }

      const measurements = {
        primeSparseDiagonalMs: timeMilliseconds(() =>
          native.dense_prime_field_matrix_is_diagonal(
            sparsePrime, 1000n, 1000n, 65521n,
          )),
        primeDensePositionsMs: timeMilliseconds(() =>
          native.dense_prime_field_matrix_nonzero_positions_row_order(
            primeRows,
            primeColumns,
            densePrime,
            1000n,
            1000n,
            65521n,
          )),
        integerSparseDiagonalMs: timeMilliseconds(() =>
          native.dense_integer_matrix_is_diagonal(integer)),
        integerSparsePositionsMs: timeMilliseconds(() =>
          native.dense_integer_matrix_nonzero_positions(
            integerRows, integerColumns, integer, false,
          )),
        rationalSparseDiagonalMs: timeMilliseconds(() =>
          native.dense_rational_matrix_is_diagonal(rational)),
        rationalSparsePositionsMs: timeMilliseconds(() =>
          native.dense_rational_matrix_nonzero_positions(
            rationalRows, rationalColumns, rational, false,
          )),
      };
      assert.equal(primeRows[length - 1], 999n);
      assert.equal(primeColumns[length - 1], 999n);
      assert.equal(integerRows[size - 1], 999n);
      assert.equal(rationalColumns[size - 1], 999n);

      if (check) {
        for (const [name, milliseconds] of Object.entries(measurements)) {
          assert.ok(
            milliseconds < 1500,
            `${name} took ${milliseconds.toFixed(3)}ms`,
          );
        }
      }
      console.log(JSON.stringify({
        schema: "sagejs.benchmark/linear-matrix-predicates-v1",
        workload: {
          shape: [size, size],
          warmups: 2,
          samples: 7,
          sparse: "identity matrix",
          dense: "all-one GF(65521) matrix",
        },
        paths: {
          integer: "borrowed generated FmpzMatrix resource",
          rational: "borrowed generated FmpqMatrix resource",
          prime: "compiler-owned row-major UInt64Buffer",
        },
        measurements,
      }, null, 2));
    } finally {
      flint.ffiFmpzMatrixClose(integer);
      flint.ffiFmpqMatrixClose(rational);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
