#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const oracle = require(join(root, "packages", "flint"));
const accounted = flint.__sagejsFfiResourceExternalMemory;

assert.equal(typeof accounted, "function");

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function matrix(rows, columns, entries) {
  const result = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    for (let index = 0; index < entries.length; index += 1) {
      assert.equal(flint.ffiFmpzMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        BigInt(entries[index]),
      ), true);
    }
    return result;
  } catch (error) {
    flint.ffiFmpzMatrixClose(result);
    throw error;
  }
}

function entries(resource) {
  const rows = Number(flint.ffiFmpzMatrixNrows(resource));
  const columns = Number(flint.ffiFmpzMatrixNcols(resource));
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

function bytes(region) {
  const length = Number(flint.ffiFlintByteRegionLength(region));
  return Uint8Array.from(
    { length },
    (_, index) => Number(flint.ffiFlintByteRegionGet(region, BigInt(index))),
  );
}

function readU32(source, offset) {
  return (source[offset] |
    (source[offset + 1] << 8) |
    (source[offset + 2] << 16) |
    (source[offset + 3] << 24)) >>> 0;
}

function readU64(source, offset) {
  let result = 0n;
  for (let byte = 7; byte >= 0; byte -= 1) {
    result = (result << 8n) | BigInt(source[offset + byte]);
  }
  return result;
}

function readInteger(source, state) {
  const header = readU32(source, state.offset);
  state.offset += 4;
  const negative = (header & 0x80000000) !== 0;
  const length = header & 0x7fffffff;
  let magnitude = 0n;
  for (let byte = length - 1; byte >= 0; byte -= 1) {
    magnitude = (magnitude << 8n) | BigInt(source[state.offset + byte]);
  }
  state.offset += length;
  return negative ? -magnitude : magnitude;
}

function decodeMatrix(source) {
  assert.deepEqual([...source.subarray(0, 5)], [83, 74, 90, 77, 1]);
  assert.deepEqual([...source.subarray(5, 8)], [0, 0, 0]);
  const rows = Number(readU64(source, 8));
  const columns = Number(readU64(source, 16));
  const state = { offset: 24 };
  const values = Array.from(
    { length: rows * columns },
    () => readInteger(source, state),
  );
  assert.equal(state.offset, source.length);
  return { rows, columns, entries: values };
}

function text(region) {
  return new TextDecoder().decode(bytes(region));
}

function oracleEntries(resource, rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) =>
    BigInt(oracle.matrixEntry(
      resource,
      Math.floor(index / columns),
      index % columns,
    )));
}

{
  const huge = (1n << 521n) + 17n;
  const leftValues = [huge, -13n, 5n, 11n];
  const rightValues = [7n, 19n, -23n, (1n << 333n) + 9n];
  const left = matrix(2, 2, leftValues);
  const right = matrix(2, 2, rightValues);
  const resources = [];
  try {
    assert.deepEqual(entries(left), leftValues);
    assert.equal(flint.ffiFmpzMatrixNrows(left), 2n);
    assert.equal(flint.ffiFmpzMatrixNcols(left), 2n);
    assert.equal(flint.ffiFmpzMatrixEqual(left, left), true);
    assert.equal(flint.ffiFmpzMatrixEqual(left, right), false);
    assert.equal(flint.ffiFmpzMatrixIsZero(left), false);
    assert.equal(flint.ffiFmpzMatrixIsOne(left), false);
    assert.equal(flint.ffiFmpzMatrixTrace(left), huge + 11n);
    assert.equal(flint.ffiFmpzMatrixDet(left), huge * 11n + 65n);

    const copy = flint.ffiFmpzMatrixCopy(left);
    const sum = flint.ffiFmpzMatrixAdd(left, right);
    const difference = flint.ffiFmpzMatrixSub(sum, right);
    const negated = flint.ffiFmpzMatrixNeg(left);
    const scaled = flint.ffiFmpzMatrixScalarMul(left, -17n);
    const transposed = flint.ffiFmpzMatrixTranspose(left);
    const product = flint.ffiFmpzMatrixMul(left, right);
    const power = flint.ffiFmpzMatrixPow(left, 3n);
    const square = flint.ffiFmpzMatrixMul(left, left);
    const cubeOracle = flint.ffiFmpzMatrixMul(square, left);
    resources.push(
      copy, sum, difference, negated, scaled, transposed, product, power,
      square, cubeOracle,
    );
    assert.deepEqual(entries(copy), leftValues);
    assert.deepEqual(entries(difference), leftValues);
    assert.deepEqual(entries(negated), leftValues.map((value) => -value));
    assert.deepEqual(entries(scaled), leftValues.map((value) => -17n * value));
    assert.deepEqual(entries(transposed), [huge, 5n, -13n, 11n]);
    assert.deepEqual(entries(product), [
      huge * 7n + 299n,
      huge * 19n - 13n * ((1n << 333n) + 9n),
      35n - 253n,
      95n + 11n * ((1n << 333n) + 9n),
    ]);
    assert.equal(flint.ffiFmpzMatrixRank(left), 2n);
    assert.deepEqual(entries(power), entries(cubeOracle));

    const serialized = flint.ffiFmpzMatrixSerialize(left);
    assert.deepEqual(decodeMatrix(bytes(serialized)), {
      rows: 2,
      columns: 2,
      entries: leftValues,
    });
    closeTwice(serialized, flint.ffiFlintByteRegionClose);

    const formatSource = matrix(2, 3, [
      -2n, 17n, 0n,
      101n, -3n, 9n,
    ]);
    const formatted = flint.ffiFmpzMatrixFormat(formatSource);
    assert.equal(text(formatted), "[ -2  17   0]\n[101  -3   9]");
    closeTwice(formatted, flint.ffiFlintByteRegionClose);
    closeTwice(formatSource, flint.ffiFmpzMatrixClose);
  } finally {
    for (const resource of resources.reverse()) {
      flint.ffiFmpzMatrixClose(resource);
    }
    flint.ffiFmpzMatrixClose(right);
    flint.ffiFmpzMatrixClose(left);
  }
}

for (const [rows, columns, expected] of [
  [0, 0, "[]"],
  [0, 4, "[]"],
  [3, 0, "[]\n[]\n[]"],
]) {
  const source = matrix(rows, columns, []);
  const formatted = flint.ffiFmpzMatrixFormat(source);
  const serialized = flint.ffiFmpzMatrixSerialize(source);
  assert.equal(text(formatted), expected);
  assert.deepEqual(decodeMatrix(bytes(serialized)), {
    rows,
    columns,
    entries: [],
  });
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(formatted, flint.ffiFlintByteRegionClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);
}

{
  let seed = 0x12345678;
  function randomWord() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return BigInt((seed % 41) - 20);
  }
  for (let round = 0; round < 30; round += 1) {
    const leftValues = Array.from({ length: 9 }, randomWord);
    const rightValues = Array.from({ length: 9 }, randomWord);
    const left = matrix(3, 3, leftValues);
    const right = matrix(3, 3, rightValues);
    const oracleLeft = oracle.zzMatrix(3, 3, leftValues);
    const oracleRight = oracle.zzMatrix(3, 3, rightValues);
    const results = [
      [flint.ffiFmpzMatrixAdd(left, right),
        oracle.matrixAdd(oracleLeft, oracleRight)],
      [flint.ffiFmpzMatrixSub(left, right),
        oracle.matrixSub(oracleLeft, oracleRight)],
      [flint.ffiFmpzMatrixMul(left, right),
        oracle.matrixMul(oracleLeft, oracleRight)],
      [flint.ffiFmpzMatrixTranspose(left),
        oracle.matrixTranspose(oracleLeft)],
    ];
    try {
      for (const [actual, expected] of results) {
        assert.deepEqual(entries(actual), oracleEntries(expected, 3, 3));
      }
      assert.equal(
        flint.ffiFmpzMatrixRank(left),
        BigInt(oracle.matrixRank(oracleLeft)),
      );
      assert.equal(
        flint.ffiFmpzMatrixDet(left),
        BigInt(oracle.matrixDet(oracleLeft)),
      );
    } finally {
      for (const [resource] of results.reverse()) {
        flint.ffiFmpzMatrixClose(resource);
      }
      flint.ffiFmpzMatrixClose(right);
      flint.ffiFmpzMatrixClose(left);
    }
  }
}

{
  const diagonal = matrix(3, 3, [
    6n, 0n, 0n,
    0n, 10n, 0n,
    0n, 0n, 15n,
  ]);
  const hnf = flint.ffiFmpzMatrixHnf(diagonal);
  const snf = flint.ffiFmpzMatrixSnf(diagonal);
  assert.deepEqual(entries(hnf), [6n, 0n, 0n, 0n, 10n, 0n, 0n, 0n, 15n]);
  assert.deepEqual(entries(snf), [1n, 0n, 0n, 0n, 30n, 0n, 0n, 0n, 30n]);
  closeTwice(snf, flint.ffiFmpzMatrixClose);
  closeTwice(hnf, flint.ffiFmpzMatrixClose);
  closeTwice(diagonal, flint.ffiFmpzMatrixClose);
}

{
  const skew = flint.ffiFmpzMatrixCreate(1n, 100_000n);
  const before = accounted(skew);
  assert.equal(flint.ffiFmpzMatrixSetEntry(
    skew, 0n, 99_999n, 1n << 32768n,
  ), true);
  assert.ok(accounted(skew) > before + 4000n);
  assert.ok(
    accounted(skew) < 2n * 1024n * 1024n,
    `skew matrix retained ${accounted(skew)} bytes`,
  );
  closeTwice(skew, flint.ffiFmpzMatrixClose);
}

{
  const rectangular = matrix(2, 3, [1n, 2n, 3n, 4n, 5n, 6n]);
  const incompatible = matrix(4, 1, [1n, 2n, 3n, 4n]);
  assert.throws(
    () => flint.ffiFmpzMatrixSetEntry(rectangular, 3n, 0n, 1n),
    /out of bounds/,
  );
  assert.throws(
    () => flint.ffiFmpzMatrixEntry(rectangular, 0n, 3n),
    /out of bounds/,
  );
  assert.throws(() => flint.ffiFmpzMatrixDet(rectangular), /square/);
  assert.throws(() => flint.ffiFmpzMatrixTrace(rectangular), /square/);
  assert.throws(() => flint.ffiFmpzMatrixPow(rectangular, 2n), /square/);
  assert.throws(
    () => flint.ffiFmpzMatrixAdd(rectangular, incompatible),
    /incompatible/,
  );
  assert.throws(
    () => flint.ffiFmpzMatrixMul(rectangular, incompatible),
    /incompatible/,
  );
  closeTwice(incompatible, flint.ffiFmpzMatrixClose);
  closeTwice(rectangular, flint.ffiFmpzMatrixClose);

  const closed = flint.ffiFmpzMatrixCreate(1n, 1n);
  closeTwice(closed, flint.ffiFmpzMatrixClose);
  for (const operation of [
    () => flint.ffiFmpzMatrixNrows(closed),
    () => flint.ffiFmpzMatrixSetEntry(closed, 0n, 0n, 1n),
    () => flint.ffiFmpzMatrixCopy(closed),
    () => flint.ffiFmpzMatrixSerialize(closed),
  ]) {
    assert.throws(operation, /closed|invalid resource/i);
  }
}

function median(values) {
  return [...values].sort((left, right) => left - right)[1];
}

function timedOperation(size) {
  const left = flint.ffiFmpzMatrixCreate(BigInt(size), BigInt(size));
  const right = flint.ffiFmpzMatrixCreate(BigInt(size), BigInt(size));
  for (let index = 0; index < size; index += 1) {
    flint.ffiFmpzMatrixSetEntry(left, BigInt(index), BigInt(index), 2n);
    flint.ffiFmpzMatrixSetEntry(right, BigInt(index), BigInt(index), 3n);
  }
  const started = process.hrtime.bigint();
  const sum = flint.ffiFmpzMatrixAdd(left, right);
  const product = flint.ffiFmpzMatrixMul(left, right);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  flint.ffiFmpzMatrixClose(product);
  flint.ffiFmpzMatrixClose(sum);
  flint.ffiFmpzMatrixClose(right);
  flint.ffiFmpzMatrixClose(left);
  return elapsed;
}

const cold = timedOperation(120);
const steady = median([
  timedOperation(120),
  timedOperation(120),
  timedOperation(120),
]);
assert.ok(cold < 250, `cold resource operations took ${cold.toFixed(2)} ms`);
assert.ok(steady < 100, `steady resource operations took ${steady.toFixed(2)} ms`);

if (process.platform !== "win32") {
  const source = String.raw`
#include <stdint.h>
#include <sagejs/fmpz_matrix_ffi.h>

int main(void)
{
    fmpz_t entry, determinant, trace;
    fmpz_init(entry);
    fmpz_init(determinant);
    fmpz_init(trace);
    for (slong round = 0; round < 300; round++)
    {
        sagejs_fmpz_matrix_t left, right, sum, difference, negated;
        sagejs_fmpz_matrix_t scaled, transposed, product, power, hnf, snf;
        sagejs_flint_byte_region_t formatted, serialized;
        if (!sagejs_fmpz_matrix_init(left, 4, 4) ||
            !sagejs_fmpz_matrix_init(right, 4, 4))
            return 2;
        for (slong row = 0; row < 4; row++)
            for (slong column = 0; column < 4; column++)
            {
                fmpz_set_si(entry,
                    row == column ? round + row + 1 : 3 * row - 2 * column);
                if (!sagejs_fmpz_matrix_set_entry(
                        left, (uint64_t) row, (uint64_t) column, entry))
                    return 3;
                fmpz_set_si(entry, 5 * row + column - 7);
                if (!sagejs_fmpz_matrix_set_entry(
                        right, (uint64_t) row, (uint64_t) column, entry))
                    return 4;
            }
        fmpz_set_si(entry, -17);
        if (!sagejs_fmpz_matrix_add(sum, left, right) ||
            !sagejs_fmpz_matrix_sub(difference, sum, right) ||
            !sagejs_fmpz_matrix_neg(negated, left) ||
            !sagejs_fmpz_matrix_scalar_mul(scaled, left, entry) ||
            !sagejs_fmpz_matrix_transpose(transposed, left) ||
            !sagejs_fmpz_matrix_mul(product, left, right) ||
            !sagejs_fmpz_matrix_pow(power, left, 3) ||
            !sagejs_fmpz_matrix_hnf(hnf, left) ||
            !sagejs_fmpz_matrix_snf(snf, left) ||
            !sagejs_fmpz_matrix_det(determinant, left) ||
            !sagejs_fmpz_matrix_trace(trace, left) ||
            !sagejs_fmpz_matrix_format(formatted, left) ||
            !sagejs_fmpz_matrix_serialize(serialized, left) ||
            !sagejs_fmpz_matrix_equal(left, difference))
            return 5;
        if (sagejs_fmpz_matrix_allocated_bytes(left) == 0 ||
            sagejs_flint_byte_region_length(formatted) == 0 ||
            sagejs_flint_byte_region_length(serialized) < 24)
            return 6;
        sagejs_flint_byte_region_clear(serialized);
        sagejs_flint_byte_region_clear(formatted);
        sagejs_fmpz_matrix_clear(snf);
        sagejs_fmpz_matrix_clear(hnf);
        sagejs_fmpz_matrix_clear(power);
        sagejs_fmpz_matrix_clear(product);
        sagejs_fmpz_matrix_clear(transposed);
        sagejs_fmpz_matrix_clear(scaled);
        sagejs_fmpz_matrix_clear(negated);
        sagejs_fmpz_matrix_clear(difference);
        sagejs_fmpz_matrix_clear(sum);
        sagejs_fmpz_matrix_clear(right);
        sagejs_fmpz_matrix_clear(left);
    }
    sagejs_fmpz_matrix_t skew;
    if (!sagejs_fmpz_matrix_init(skew, 1, 100000))
        return 7;
    fmpz_one(entry);
    fmpz_mul_2exp(entry, entry, 32768);
    if (!sagejs_fmpz_matrix_set_entry(skew, 0, 99999, entry) ||
        sagejs_fmpz_matrix_allocated_bytes(skew) >= 2 * 1024 * 1024)
        return 8;
    sagejs_fmpz_matrix_clear(skew);
    fmpz_clear(trace);
    fmpz_clear(determinant);
    fmpz_clear(entry);
    return 0;
}
`;
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-matrix-ffi-"));
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, source);
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined",
      `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(flintPrefix, "include")}`,
      sourcePath,
      `-L${join(flintPrefix, "lib")}`,
      "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
      "-o", executable,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(
      compile.status,
      0,
      `sanitizer harness compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      env: {
        ...process.env,
        ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
        UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
      },
      encoding: "utf8",
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed:\n${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

process.stdout.write(JSON.stringify({
  schema: "sagejs.ffi/fmpz-matrix-resource-v1",
  randomizedRounds: 30,
  lifecycleRounds: process.platform === "win32" ? 0 : 300,
  coldMilliseconds: cold,
  steadyMilliseconds: steady,
}) + "\n");
