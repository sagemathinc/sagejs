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
const packedOracle = oracle.__sagejs_ffi_oracles__;
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

function polynomialCoefficients(resource) {
  const length = Number(flint.ffiFmpzPolynomialLength(resource));
  return Array.from({ length }, (_, index) =>
    flint.ffiFmpzPolynomialCoefficient(resource, BigInt(index)));
}

function rationalMatrix(rows, columns, values) {
  const result = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    for (let index = 0; index < values.length; index += 1) {
      const [numerator, denominator] = values[index];
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        BigInt(numerator),
        BigInt(denominator),
      ), true);
    }
    return result;
  } catch (error) {
    flint.ffiFmpqMatrixClose(result);
    throw error;
  }
}

function bytes(region) {
  const length = Number(flint.ffiFlintByteRegionLength(region));
  return Uint8Array.from(
    { length },
    (_, index) => Number(flint.ffiFlintByteRegionGet(region, BigInt(index))),
  );
}

function byteRegion(source) {
  const result = flint.ffiFlintByteRegionCreate(BigInt(source.length));
  try {
    for (let index = 0; index < source.length; index += 1) {
      assert.equal(
        flint.ffiFlintByteRegionSet(
          result,
          BigInt(index),
          BigInt(source[index]),
        ),
        true,
      );
    }
    return result;
  } catch (error) {
    flint.ffiFlintByteRegionClose(result);
    throw error;
  }
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

function writeU64(target, offset, value) {
  for (let byte = 0; byte < 8; byte += 1) {
    target[offset + byte] = Number((value >> BigInt(8 * byte)) & 0xffn);
  }
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
    const deserialized = flint.ffiFmpzMatrixDeserialize(serialized);
    assert.deepEqual(entries(deserialized), leftValues);
    assert.equal(flint.ffiFmpzMatrixEqual(left, deserialized), true);
    closeTwice(deserialized, flint.ffiFmpzMatrixClose);
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
  const deserialized = flint.ffiFmpzMatrixDeserialize(serialized);
  assert.equal(text(formatted), expected);
  assert.deepEqual(decodeMatrix(bytes(serialized)), {
    rows,
    columns,
    entries: [],
  });
  assert.equal(flint.ffiFmpzMatrixNrows(deserialized), BigInt(rows));
  assert.equal(flint.ffiFmpzMatrixNcols(deserialized), BigInt(columns));
  assert.deepEqual(entries(deserialized), []);
  closeTwice(deserialized, flint.ffiFmpzMatrixClose);
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(formatted, flint.ffiFlintByteRegionClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);
}

{
  const zero = matrix(1, 1, [0n]);
  const one = matrix(1, 1, [1n]);
  const zeroSerialized = flint.ffiFmpzMatrixSerialize(zero);
  const oneSerialized = flint.ffiFmpzMatrixSerialize(one);
  const zeroBytes = bytes(zeroSerialized);
  const oneBytes = bytes(oneSerialized);
  const malformed = [];

  malformed.push(new Uint8Array());
  malformed.push(zeroBytes.subarray(0, 23));

  const badMagic = zeroBytes.slice();
  badMagic[0] ^= 0xff;
  malformed.push(badMagic);

  const badVersion = zeroBytes.slice();
  badVersion[4] = 2;
  malformed.push(badVersion);

  const badReserved = zeroBytes.slice();
  badReserved[7] = 1;
  malformed.push(badReserved);

  const oversizedDimensions = zeroBytes.slice();
  writeU64(oversizedDimensions, 8, (1n << 64n) - 1n);
  malformed.push(oversizedDimensions);

  const impossibleProduct = zeroBytes.slice();
  writeU64(impossibleProduct, 8, 1n << 32n);
  writeU64(impossibleProduct, 16, 1n << 32n);
  malformed.push(impossibleProduct);

  const negativeZero = zeroBytes.slice();
  negativeZero[27] = 0x80;
  malformed.push(negativeZero);

  const leadingZero = oneBytes.slice();
  leadingZero[28] = 0;
  malformed.push(leadingZero);

  const truncatedMagnitude = oneBytes.slice(0, -1);
  malformed.push(truncatedMagnitude);

  const invalidLength = zeroBytes.slice();
  invalidLength[24] = 0xff;
  invalidLength[25] = 0xff;
  invalidLength[26] = 0xff;
  invalidLength[27] = 0x7f;
  malformed.push(invalidLength);

  const trailingBytes = new Uint8Array(zeroBytes.length + 1);
  trailingBytes.set(zeroBytes);
  trailingBytes[trailingBytes.length - 1] = 17;
  malformed.push(trailingBytes);

  for (const source of malformed) {
    const region = byteRegion(source);
    assert.throws(
      () => flint.ffiFmpzMatrixDeserialize(region),
      /invalid SJZM v1/,
    );
    closeTwice(region, flint.ffiFlintByteRegionClose);
  }

  const region = byteRegion(new Uint8Array([0]));
  assert.throws(
    () => flint.ffiFlintByteRegionSet(region, 1n, 0n),
    /out of bounds/,
  );
  assert.throws(
    () => flint.ffiFlintByteRegionSet(region, 0n, 256n),
    /out of bounds/,
  );
  closeTwice(region, flint.ffiFlintByteRegionClose);

  closeTwice(oneSerialized, flint.ffiFlintByteRegionClose);
  closeTwice(zeroSerialized, flint.ffiFlintByteRegionClose);
  closeTwice(one, flint.ffiFmpzMatrixClose);
  closeTwice(zero, flint.ffiFmpzMatrixClose);
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
  const sourceValues = [2n, 4n, 4n, -6n, 6n, 12n];
  const source = matrix(2, 3, sourceValues);
  const hermite = matrix(2, 3, [0n, 0n, 0n, 0n, 0n, 0n]);
  const hermiteTransform = matrix(2, 2, [0n, 0n, 0n, 0n]);
  const smith = matrix(2, 3, [0n, 0n, 0n, 0n, 0n, 0n]);
  const leftTransform = matrix(2, 2, [0n, 0n, 0n, 0n]);
  const rightTransform = matrix(3, 3, Array(9).fill(0n));
  const resources = [];
  try {
    assert.equal(flint.ffiFmpzMatrixHnfTransform(
      hermite, hermiteTransform, source,
    ), true);
    const transformedHermite = flint.ffiFmpzMatrixMul(
      hermiteTransform, source,
    );
    resources.push(transformedHermite);
    assert.deepEqual(entries(transformedHermite), entries(hermite));

    assert.equal(flint.ffiFmpzMatrixSnfTransform(
      smith, leftTransform, rightTransform, source,
    ), true);
    const leftProduct = flint.ffiFmpzMatrixMul(leftTransform, source);
    const transformedSmith = flint.ffiFmpzMatrixMul(
      leftProduct, rightTransform,
    );
    resources.push(leftProduct, transformedSmith);
    assert.deepEqual(entries(transformedSmith), entries(smith));
    assert.deepEqual(entries(smith), [2n, 0n, 0n, 0n, 6n, 0n]);

    const wrong = matrix(1, 1, [91n]);
    resources.push(wrong);
    const hermiteBefore = entries(hermite);
    const transformBefore = entries(hermiteTransform);
    assert.throws(
      () => flint.ffiFmpzMatrixHnfTransform(
        wrong, hermiteTransform, source,
      ),
      /dimensions or aliases/,
    );
    assert.deepEqual(entries(wrong), [91n]);
    assert.deepEqual(entries(hermiteTransform), transformBefore);
    assert.throws(
      () => flint.ffiFmpzMatrixHnfTransform(
        hermite, hermiteTransform, hermite,
      ),
      /dimensions or aliases/,
    );
    assert.deepEqual(entries(hermite), hermiteBefore);
    assert.deepEqual(entries(hermiteTransform), transformBefore);

    const smithBefore = entries(smith);
    const leftBefore = entries(leftTransform);
    const rightBefore = entries(rightTransform);
    assert.throws(
      () => flint.ffiFmpzMatrixSnfTransform(
        smith, leftTransform, wrong, source,
      ),
      /dimensions or aliases/,
    );
    assert.deepEqual(entries(smith), smithBefore);
    assert.deepEqual(entries(leftTransform), leftBefore);
    assert.deepEqual(entries(wrong), [91n]);
    assert.deepEqual(entries(rightTransform), rightBefore);
  } finally {
    for (const resource of resources.reverse()) {
      flint.ffiFmpzMatrixClose(resource);
    }
    closeTwice(rightTransform, flint.ffiFmpzMatrixClose);
    closeTwice(leftTransform, flint.ffiFmpzMatrixClose);
    closeTwice(smith, flint.ffiFmpzMatrixClose);
    closeTwice(hermiteTransform, flint.ffiFmpzMatrixClose);
    closeTwice(hermite, flint.ffiFmpzMatrixClose);
    closeTwice(source, flint.ffiFmpzMatrixClose);
  }
}

{
  const source = matrix(2, 3, [1n, 2n, 3n, 2n, 4n, 6n]);
  const kernel = flint.ffiFmpzMatrixRightKernel(source);
  const kernelTranspose = flint.ffiFmpzMatrixTranspose(kernel);
  const zero = flint.ffiFmpzMatrixMul(source, kernelTranspose);
  assert.equal(flint.ffiFmpzMatrixNrows(kernel), 2n);
  assert.equal(flint.ffiFmpzMatrixNcols(kernel), 3n);
  assert.deepEqual(entries(kernel), [1n, 1n, -1n, 0n, 3n, -2n]);
  assert.equal(flint.ffiFmpzMatrixIsZero(zero), true);
  closeTwice(zero, flint.ffiFmpzMatrixClose);
  closeTwice(kernelTranspose, flint.ffiFmpzMatrixClose);
  closeTwice(kernel, flint.ffiFmpzMatrixClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);

  const zeroRows = matrix(0, 3, []);
  const fullKernel = flint.ffiFmpzMatrixRightKernel(zeroRows);
  assert.equal(flint.ffiFmpzMatrixNrows(fullKernel), 3n);
  assert.deepEqual(entries(fullKernel), [
    1n, 0n, 0n,
    0n, 1n, 0n,
    0n, 0n, 1n,
  ]);
  closeTwice(fullKernel, flint.ffiFmpzMatrixClose);
  closeTwice(zeroRows, flint.ffiFmpzMatrixClose);

  const zeroColumns = matrix(3, 0, []);
  const trivialKernel = flint.ffiFmpzMatrixRightKernel(zeroColumns);
  assert.equal(flint.ffiFmpzMatrixNrows(trivialKernel), 0n);
  assert.equal(flint.ffiFmpzMatrixNcols(trivialKernel), 0n);
  closeTwice(trivialKernel, flint.ffiFmpzMatrixClose);
  closeTwice(zeroColumns, flint.ffiFmpzMatrixClose);
}

{
  const source = matrix(2, 2, [1n, 2n, 3n, 4n]);
  const characteristic = flint.ffiFmpzMatrixCharpoly(source);
  const minimal = flint.ffiFmpzMatrixMinpoly(source);
  assert.deepEqual(polynomialCoefficients(characteristic), [-2n, -5n, 1n]);
  assert.deepEqual(polynomialCoefficients(minimal), [-2n, -5n, 1n]);
  closeTwice(minimal, flint.ffiFmpzPolynomialClose);
  closeTwice(characteristic, flint.ffiFmpzPolynomialClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);

  const rectangular = matrix(2, 3, Array(6).fill(0n));
  assert.throws(
    () => flint.ffiFmpzMatrixCharpoly(rectangular),
    /requires a square/,
  );
  assert.throws(
    () => flint.ffiFmpzMatrixMinpoly(rectangular),
    /requires a square/,
  );
  closeTwice(rectangular, flint.ffiFmpzMatrixClose);

  const empty = matrix(0, 0, []);
  const emptyCharacteristic = flint.ffiFmpzMatrixCharpoly(empty);
  const emptyMinimal = flint.ffiFmpzMatrixMinpoly(empty);
  assert.deepEqual(polynomialCoefficients(emptyCharacteristic), [1n]);
  assert.deepEqual(polynomialCoefficients(emptyMinimal), [1n]);
  closeTwice(emptyMinimal, flint.ffiFmpzPolynomialClose);
  closeTwice(emptyCharacteristic, flint.ffiFmpzPolynomialClose);
  closeTwice(empty, flint.ffiFmpzMatrixClose);
}

{
  const sourceValues = [1n << 300n, -7n, 11n, 0n, 5n, 19n];
  const source = matrix(2, 3, sourceValues);
  const rational = flint.ffiFmpqMatrixFromFmpz(source);
  for (let index = 0; index < sourceValues.length; index += 1) {
    const row = BigInt(Math.floor(index / 3));
    const column = BigInt(index % 3);
    assert.equal(
      flint.ffiFmpqMatrixEntryNumerator(rational, row, column),
      sourceValues[index],
    );
    assert.equal(
      flint.ffiFmpqMatrixEntryDenominator(rational, row, column),
      1n,
    );
  }
  const roundTrip = flint.ffiFmpzMatrixFromFmpqIntegral(rational);
  assert.deepEqual(entries(roundTrip), sourceValues);
  closeTwice(roundTrip, flint.ffiFmpzMatrixClose);
  closeTwice(rational, flint.ffiFmpqMatrixClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);

  const nonintegral = rationalMatrix(1, 2, [[3n, 2n], [7n, 1n]]);
  assert.throws(
    () => flint.ffiFmpzMatrixFromFmpqIntegral(nonintegral),
    /nonintegral entry/,
  );
  closeTwice(nonintegral, flint.ffiFmpqMatrixClose);
}

{
  const source = matrix(3, 4, [
    1n, 2n, 3n, 4n,
    5n, 0n, 7n, 8n,
    9n, 10n, 11n, 0n,
  ]);
  const submatrix = flint.ffiFmpzMatrixSubmatrix(
    source, 1n, 3n, 1n, 4n,
  );
  assert.deepEqual(entries(submatrix), [0n, 7n, 8n, 10n, 11n, 0n]);
  assert.equal(flint.ffiFmpzMatrixNonzeroCount(source), 10n);

  const top = matrix(1, 2, [1n, 2n]);
  const bottom = matrix(2, 2, [3n, 4n, 5n, 6n]);
  const stacked = flint.ffiFmpzMatrixStack(top, bottom);
  assert.deepEqual(entries(stacked), [1n, 2n, 3n, 4n, 5n, 6n]);

  const left = matrix(2, 1, [1n, 2n]);
  const right = matrix(2, 2, [3n, 4n, 5n, 6n]);
  const augmented = flint.ffiFmpzMatrixAugment(left, right);
  assert.deepEqual(entries(augmented), [1n, 3n, 4n, 2n, 5n, 6n]);

  const target = matrix(4, 5, Array(20).fill(-1n));
  const block = matrix(2, 3, [1n, 2n, 3n, 4n, 5n, 6n]);
  assert.equal(flint.ffiFmpzMatrixSetBlock(target, 1n, 1n, block), true);
  const targetBeforeFailure = entries(target);
  assert.throws(
    () => flint.ffiFmpzMatrixSetBlock(target, 3n, 3n, block),
    /bounds or aliases/,
  );
  assert.deepEqual(entries(target), targetBeforeFailure);
  assert.throws(
    () => flint.ffiFmpzMatrixSetBlock(target, 0n, 0n, target),
    /bounds or aliases/,
  );
  assert.deepEqual(entries(target), targetBeforeFailure);
  assert.throws(
    () => flint.ffiFmpzMatrixSubmatrix(source, 2n, 1n, 0n, 1n),
    /bounds are invalid/,
  );

  closeTwice(block, flint.ffiFmpzMatrixClose);
  closeTwice(target, flint.ffiFmpzMatrixClose);
  closeTwice(augmented, flint.ffiFmpzMatrixClose);
  closeTwice(right, flint.ffiFmpzMatrixClose);
  closeTwice(left, flint.ffiFmpzMatrixClose);
  closeTwice(stacked, flint.ffiFmpzMatrixClose);
  closeTwice(bottom, flint.ffiFmpzMatrixClose);
  closeTwice(top, flint.ffiFmpzMatrixClose);
  closeTwice(submatrix, flint.ffiFmpzMatrixClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);
}

for (const [rows, columns, values] of [
  [0, 0, []],
  [0, 3, []],
  [3, 0, []],
  [2, 3, [2n, 4n, 4n, -6n, 6n, 12n]],
  [3, 2, [2n, 4n, 4n, -6n, 6n, 12n]],
]) {
  const source = matrix(rows, columns, values);
  const hnf = flint.ffiFmpzMatrixHnf(source);
  const snf = flint.ffiFmpzMatrixSnf(source);
  try {
    assert.equal(flint.ffiFmpzMatrixNrows(hnf), BigInt(rows));
    assert.equal(flint.ffiFmpzMatrixNcols(hnf), BigInt(columns));
    assert.equal(flint.ffiFmpzMatrixNrows(snf), BigInt(rows));
    assert.equal(flint.ffiFmpzMatrixNcols(snf), BigInt(columns));
    if (rows !== 0 && columns !== 0) {
      const oracleSource = oracle.zzMatrix(rows, columns, values);
      assert.deepEqual(
        entries(hnf),
        oracleEntries(oracle.matrixHermite(oracleSource), rows, columns),
      );
      assert.deepEqual(
        entries(snf),
        oracleEntries(oracle.matrixSmith(oracleSource)[0], rows, columns),
      );
    } else {
      assert.deepEqual(entries(hnf), []);
      assert.deepEqual(entries(snf), []);
    }
  } finally {
    closeTwice(snf, flint.ffiFmpzMatrixClose);
    closeTwice(hnf, flint.ffiFmpzMatrixClose);
    closeTwice(source, flint.ffiFmpzMatrixClose);
  }
}

{
  // FLINT's ulong is unsigned long long under FLINT_LONG_LONG on LLP64.
  // This exponent therefore fits on 64-bit Windows even though C ULONG_MAX
  // there is only 2^32 - 1.
  const identity = matrix(1, 1, [1n]);
  const power = flint.ffiFmpzMatrixPow(identity, (1n << 64n) - 1n);
  assert.deepEqual(entries(power), [1n]);
  closeTwice(power, flint.ffiFmpzMatrixClose);
  closeTwice(identity, flint.ffiFmpzMatrixClose);
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
  const huge = 1n << 32768n;
  const source = matrix(2, 2, [1n, huge, 0n, 1n]);
  const hermite = matrix(2, 2, [0n, 0n, 0n, 0n]);
  const transform = matrix(2, 2, [0n, 0n, 0n, 0n]);
  const before = accounted(transform);
  assert.equal(flint.ffiFmpzMatrixHnfTransform(
    hermite, transform, source,
  ), true);
  assert.ok(accounted(transform) > before + 4000n);
  const transformed = flint.ffiFmpzMatrixMul(transform, source);
  assert.deepEqual(entries(transformed), entries(hermite));
  closeTwice(transformed, flint.ffiFmpzMatrixClose);
  closeTwice(transform, flint.ffiFmpzMatrixClose);
  closeTwice(hermite, flint.ffiFmpzMatrixClose);
  closeTwice(source, flint.ffiFmpzMatrixClose);
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
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(operation, dispose, warmupCount, sampleCount) {
  for (let index = 0; index < warmupCount; index += 1) {
    dispose(operation());
  }
  return Array.from({ length: sampleCount }, () => {
    const started = process.hrtime.bigint();
    const result = operation();
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    dispose(result);
    return elapsed;
  });
}

const performanceSize = 96;
const performanceWarmups = 2;
const performanceSamples = 7;
const leftValues = Array.from(
  { length: performanceSize * performanceSize },
  (_, index) => {
    const row = Math.floor(index / performanceSize);
    const column = index % performanceSize;
    return BigInt(((17 * row + 31 * column + 7 * row * column) % 101) - 50);
  },
);
const rightValues = Array.from(
  { length: performanceSize * performanceSize },
  (_, index) => {
    const row = Math.floor(index / performanceSize);
    const column = index % performanceSize;
    return BigInt(((29 * row + 11 * column + 3 * row * column) % 103) - 51);
  },
);
const resourceLeft = matrix(performanceSize, performanceSize, leftValues);
const resourceRight = matrix(performanceSize, performanceSize, rightValues);
const oracleLeft = oracle.zzMatrix(
  performanceSize,
  performanceSize,
  leftValues,
);
const oracleRight = oracle.zzMatrix(
  performanceSize,
  performanceSize,
  rightValues,
);
const resourceSum = flint.ffiFmpzMatrixAdd(resourceLeft, resourceRight);
const resourceProduct = flint.ffiFmpzMatrixMul(resourceLeft, resourceRight);
const oracleSum = oracle.matrixAdd(oracleLeft, oracleRight);
const oracleProduct = oracle.matrixMul(oracleLeft, oracleRight);
assert.deepEqual(
  entries(resourceSum),
  oracleEntries(oracleSum, performanceSize, performanceSize),
);
const expectedProduct = oracleEntries(
  oracleProduct,
  performanceSize,
  performanceSize,
);
assert.deepEqual(entries(resourceProduct), expectedProduct);
const packedProduct = Array(performanceSize * performanceSize).fill(0n);
assert.equal(
  packedOracle.ffiFmpzMatMul(
    packedProduct,
    leftValues,
    rightValues,
    BigInt(performanceSize),
    BigInt(performanceSize),
    BigInt(performanceSize),
  ),
  true,
);
assert.deepEqual(packedProduct, expectedProduct);
closeTwice(resourceProduct, flint.ffiFmpzMatrixClose);
closeTwice(resourceSum, flint.ffiFmpzMatrixClose);

const closeResource = (resource) => flint.ffiFmpzMatrixClose(resource);
const ignoreLegacyResource = () => {};
const generatedAddSamples = measure(
  () => flint.ffiFmpzMatrixAdd(resourceLeft, resourceRight),
  closeResource,
  performanceWarmups,
  performanceSamples,
);
const legacyAddSamples = measure(
  () => oracle.matrixAdd(oracleLeft, oracleRight),
  ignoreLegacyResource,
  performanceWarmups,
  performanceSamples,
);
const generatedMulSamples = measure(
  () => flint.ffiFmpzMatrixMul(resourceLeft, resourceRight),
  closeResource,
  performanceWarmups,
  performanceSamples,
);
const legacyMulSamples = measure(
  () => oracle.matrixMul(oracleLeft, oracleRight),
  ignoreLegacyResource,
  performanceWarmups,
  performanceSamples,
);
const packedMulSamples = measure(
  () => {
    const output = Array(performanceSize * performanceSize).fill(0n);
    assert.equal(
      packedOracle.ffiFmpzMatMul(
        output,
        leftValues,
        rightValues,
        BigInt(performanceSize),
        BigInt(performanceSize),
        BigInt(performanceSize),
      ),
      true,
    );
    return output;
  },
  ignoreLegacyResource,
  performanceWarmups,
  performanceSamples,
);
const generatedAdd = median(generatedAddSamples);
const legacyAdd = median(legacyAddSamples);
const generatedMul = median(generatedMulSamples);
const legacyMul = median(legacyMulSamples);
const packedMul = median(packedMulSamples);
assert.ok(
  generatedAdd <= legacyAdd * 3 + 5,
  `generated add ${generatedAdd.toFixed(2)} ms vs legacy ${legacyAdd.toFixed(2)} ms`,
);
assert.ok(
  generatedMul <= legacyMul * 3 + 5,
  `generated mul ${generatedMul.toFixed(2)} ms vs legacy ${legacyMul.toFixed(2)} ms`,
);
assert.ok(
  generatedMul < 500,
  `generated non-diagonal multiplication took ${generatedMul.toFixed(2)} ms`,
);
closeTwice(resourceRight, flint.ffiFmpzMatrixClose);
closeTwice(resourceLeft, flint.ffiFmpzMatrixClose);

const kernelRows = 48;
const kernelColumns = 64;
const kernelValues = Array.from(
  { length: kernelRows * kernelColumns },
  (_, index) => {
    const row = Math.floor(index / kernelColumns);
    const column = index % kernelColumns;
    if (column < kernelRows) return row === column ? 1n : 0n;
    return BigInt(((17 * row + 29 * column + 5) % 13) - 6);
  },
);
const kernelSource = matrix(kernelRows, kernelColumns, kernelValues);
const resourceKernel = flint.ffiFmpzMatrixRightKernel(kernelSource);
const packedKernel = Array(kernelColumns * kernelColumns).fill(0n);
const packedNullity = Number(packedOracle.ffiFmpzMatRightKernel(
  packedKernel,
  kernelValues,
  BigInt(kernelRows),
  BigInt(kernelColumns),
));
assert.equal(flint.ffiFmpzMatrixNrows(resourceKernel), BigInt(packedNullity));
assert.equal(flint.ffiFmpzMatrixNcols(resourceKernel), BigInt(kernelColumns));
assert.deepEqual(
  entries(resourceKernel),
  packedKernel.slice(0, packedNullity * kernelColumns),
);
closeTwice(resourceKernel, flint.ffiFmpzMatrixClose);
const generatedKernelSamples = measure(
  () => flint.ffiFmpzMatrixRightKernel(kernelSource),
  closeResource,
  performanceWarmups,
  performanceSamples,
);
const packedKernelSamples = measure(
  () => {
    const output = Array(kernelColumns * kernelColumns).fill(0n);
    packedOracle.ffiFmpzMatRightKernel(
      output,
      kernelValues,
      BigInt(kernelRows),
      BigInt(kernelColumns),
    );
    return output;
  },
  ignoreLegacyResource,
  performanceWarmups,
  performanceSamples,
);
const generatedKernel = median(generatedKernelSamples);
const packedKernelBoundary = median(packedKernelSamples);
assert.ok(
  generatedKernel <= packedKernelBoundary * 3 + 5,
  `generated kernel ${generatedKernel.toFixed(2)} ms vs packed ` +
    `${packedKernelBoundary.toFixed(2)} ms`,
);
assert.ok(
  generatedKernel < 500,
  `generated exact right kernel took ${generatedKernel.toFixed(2)} ms`,
);
closeTwice(kernelSource, flint.ffiFmpzMatrixClose);

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
        sagejs_fmpz_matrix_t hnf_transform, hnf_transformed;
        sagejs_fmpz_matrix_t snf_transform, snf_left, snf_right;
        sagejs_fmpz_matrix_t kernel, rational_round_trip, submatrix;
        sagejs_fmpz_matrix_t stacked, augmented, block_target;
        sagejs_fmpz_matrix_t decoded, rejected;
        sagejs_fmpq_matrix_t rational;
        sagejs_fmpz_polynomial_t characteristic, minimal;
        sagejs_flint_byte_region_t formatted, serialized;
        if (!sagejs_fmpz_matrix_init(left, 4, 4) ||
            !sagejs_fmpz_matrix_init(right, 4, 4) ||
            !sagejs_fmpz_matrix_init(hnf_transform, 4, 4) ||
            !sagejs_fmpz_matrix_init(hnf_transformed, 4, 4) ||
            !sagejs_fmpz_matrix_init(snf_transform, 4, 4) ||
            !sagejs_fmpz_matrix_init(snf_left, 4, 4) ||
            !sagejs_fmpz_matrix_init(snf_right, 4, 4) ||
            !sagejs_fmpz_matrix_init(block_target, 6, 6))
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
            !sagejs_fmpz_matrix_hnf_transform(
                hnf_transformed, hnf_transform, left) ||
            !sagejs_fmpz_matrix_snf_transform(
                snf_transform, snf_left, snf_right, left) ||
            !sagejs_fmpz_matrix_right_kernel(kernel, left) ||
            !sagejs_fmpz_matrix_charpoly(characteristic, left) ||
            !sagejs_fmpz_matrix_minpoly(minimal, left) ||
            !sagejs_fmpq_matrix_from_fmpz(rational, left) ||
            !sagejs_fmpz_matrix_from_fmpq_integral(
                rational_round_trip, rational) ||
            !sagejs_fmpz_matrix_submatrix(
                submatrix, left, 1, 3, 1, 4) ||
            !sagejs_fmpz_matrix_stack(stacked, left, right) ||
            !sagejs_fmpz_matrix_augment(augmented, left, right) ||
            !sagejs_fmpz_matrix_set_block(block_target, 1, 1, left) ||
            !sagejs_fmpz_matrix_det(determinant, left) ||
            !sagejs_fmpz_matrix_trace(trace, left) ||
            !sagejs_fmpz_matrix_format(formatted, left) ||
            !sagejs_fmpz_matrix_serialize(serialized, left) ||
            !sagejs_fmpz_matrix_deserialize(decoded, serialized) ||
            !sagejs_fmpz_matrix_equal(left, decoded) ||
            !sagejs_fmpz_matrix_equal(left, difference) ||
            !sagejs_fmpz_matrix_equal(left, rational_round_trip) ||
            sagejs_fmpz_matrix_nonzero_count(left) > 16)
            return 5;
        if (sagejs_fmpz_matrix_allocated_bytes(left) == 0 ||
            sagejs_flint_byte_region_length(formatted) == 0 ||
            sagejs_flint_byte_region_length(serialized) < 24)
            return 6;
        serialized->data[0] = 'X';
        if (sagejs_fmpz_matrix_deserialize(rejected, serialized))
            return 9;
        serialized->data[0] = 'S';
        sagejs_fmpz_matrix_clear(decoded);
        sagejs_flint_byte_region_clear(serialized);
        sagejs_flint_byte_region_clear(formatted);
        sagejs_fmpz_matrix_clear(augmented);
        sagejs_fmpz_matrix_clear(stacked);
        sagejs_fmpz_matrix_clear(submatrix);
        sagejs_fmpz_matrix_clear(rational_round_trip);
        sagejs_fmpq_matrix_clear(rational);
        sagejs_fmpz_polynomial_clear(minimal);
        sagejs_fmpz_polynomial_clear(characteristic);
        sagejs_fmpz_matrix_clear(kernel);
        sagejs_fmpz_matrix_clear(block_target);
        sagejs_fmpz_matrix_clear(snf_right);
        sagejs_fmpz_matrix_clear(snf_left);
        sagejs_fmpz_matrix_clear(snf_transform);
        sagejs_fmpz_matrix_clear(hnf_transformed);
        sagejs_fmpz_matrix_clear(hnf_transform);
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
    sagejs_flint_byte_region_t byte_region;
    sagejs_fmpz_matrix_t malformed_result;
    if (!sagejs_flint_byte_region_init(byte_region, 24) ||
        !sagejs_flint_byte_region_set(byte_region, 0, 'X') ||
        sagejs_flint_byte_region_set(byte_region, 24, 0) ||
        sagejs_flint_byte_region_set(byte_region, 0, 256) ||
        sagejs_fmpz_matrix_deserialize(malformed_result, byte_region))
        return 10;
    sagejs_flint_byte_region_clear(byte_region);
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
  performance: {
    host: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    workload: {
      operation: "dense non-diagonal exact integer matrix add/multiply",
      size: performanceSize,
      warmups: performanceWarmups,
      samples: performanceSamples,
      constructionExcluded: true,
      resultEquivalenceChecked: true,
    },
    generatedResource: {
      addMedianMilliseconds: generatedAdd,
      mulMedianMilliseconds: generatedMul,
      addSamplesMilliseconds: generatedAddSamples,
      mulSamplesMilliseconds: generatedMulSamples,
    },
    legacyFlintOracle: {
      addMedianMilliseconds: legacyAdd,
      mulMedianMilliseconds: legacyMul,
      addSamplesMilliseconds: legacyAddSamples,
      mulSamplesMilliseconds: legacyMulSamples,
    },
    packedDynamicBoundary: {
      mulMedianMilliseconds: packedMul,
      mulSamplesMilliseconds: packedMulSamples,
    },
    exactRightKernel: {
      rows: kernelRows,
      columns: kernelColumns,
      generatedMedianMilliseconds: generatedKernel,
      generatedSamplesMilliseconds: generatedKernelSamples,
      packedBoundaryMedianMilliseconds: packedKernelBoundary,
      packedBoundarySamplesMilliseconds: packedKernelSamples,
      exactShapeChecked: true,
      resultEquivalenceChecked: true,
    },
  },
}) + "\n");
