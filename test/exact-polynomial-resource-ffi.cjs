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
const accounted = flint.__sagejsFfiResourceExternalMemory;

assert.equal(typeof accounted, "function");

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function bytes(region) {
  const length = Number(flint.ffiFlintByteRegionLength(region));
  return Uint8Array.from(
    { length },
    (_, index) => Number(flint.ffiFlintByteRegionGet(region, BigInt(index))),
  );
}

function payload(source) {
  const hexadecimal = Buffer.from(source).reverse().toString("hex");
  return hexadecimal.length === 0 ? 0n : BigInt(`0x${hexadecimal}`);
}

function deserializeInteger(source) {
  return flint.ffiFmpzPolynomialDeserialize(
    payload(source), BigInt(source.byteLength),
  );
}

function deserializeRational(source) {
  return flint.ffiFmpqPolynomialDeserialize(
    payload(source), BigInt(source.byteLength),
  );
}

function polynomialBytes(magic, coefficients) {
  const body = [];
  for (const coefficient of coefficients) {
    const parts = Array.isArray(coefficient) ? coefficient : [coefficient];
    for (const part of parts) {
      const negative = part < 0n;
      let magnitude = negative ? -part : part;
      const encoded = [];
      while (magnitude !== 0n) {
        encoded.push(Number(magnitude & 255n));
        magnitude >>= 8n;
      }
      const header = encoded.length | (negative ? 0x8000_0000 : 0);
      body.push(
        header & 255,
        (header >>> 8) & 255,
        (header >>> 16) & 255,
        (header >>> 24) & 255,
        ...encoded,
      );
    }
  }
  const header = Buffer.alloc(16);
  header.write(magic, 0, "ascii");
  header[4] = 1;
  header.writeBigUInt64LE(BigInt(coefficients.length), 8);
  return Uint8Array.from([...header, ...body]);
}

function readU32(source, offset) {
  return source[offset] |
    (source[offset + 1] << 8) |
    (source[offset + 2] << 16) |
    (source[offset + 3] << 24);
}

function readU64(source, offset) {
  let result = 0n;
  for (let byte = 7; byte >= 0; byte -= 1) {
    result = (result << 8n) | BigInt(source[offset + byte]);
  }
  return result;
}

function readInteger(source, state) {
  const header = readU32(source, state.offset) >>> 0;
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

function decodePolynomial(source, rational) {
  assert.deepEqual(
    [...source.subarray(0, 5)],
    rational ? [83, 74, 80, 81, 1] : [83, 74, 80, 90, 1],
  );
  assert.deepEqual([...source.subarray(5, 8)], [0, 0, 0]);
  const count = Number(readU64(source, 8));
  const state = { offset: 16 };
  const coefficients = [];
  for (let index = 0; index < count; index += 1) {
    if (rational) {
      const numerator = readInteger(source, state);
      const denominator = readInteger(source, state);
      assert.ok(denominator > 0n);
      coefficients.push([numerator, denominator]);
    } else {
      coefficients.push(readInteger(source, state));
    }
  }
  assert.equal(state.offset, source.length);
  return coefficients;
}

function resourceCoefficients(resource, rational) {
  const region = rational
    ? flint.ffiFmpqPolynomialSerialize(resource)
    : flint.ffiFmpzPolynomialSerialize(resource);
  try {
    return decodePolynomial(bytes(region), rational);
  } finally {
    closeTwice(region, flint.ffiFlintByteRegionClose);
  }
}

function fmpzPolynomial(coefficients) {
  const result = flint.ffiFmpzPolynomialCreate(BigInt(coefficients.length));
  try {
    for (let index = 0; index < coefficients.length; index += 1) {
      assert.equal(flint.ffiFmpzPolynomialSetCoefficient(
        result, BigInt(index), BigInt(coefficients[index]),
      ), true);
    }
    assert.equal(flint.ffiFmpzPolynomialSeal(result), true);
    return result;
  } catch (error) {
    flint.ffiFmpzPolynomialClose(result);
    throw error;
  }
}

function fmpqPolynomial(coefficients) {
  const result = flint.ffiFmpqPolynomialCreate(BigInt(coefficients.length));
  try {
    for (let index = 0; index < coefficients.length; index += 1) {
      const [numerator, denominator] = coefficients[index];
      assert.equal(flint.ffiFmpqPolynomialSetCoefficient(
        result, BigInt(index), BigInt(numerator), BigInt(denominator),
      ), true);
    }
    assert.equal(flint.ffiFmpqPolynomialSeal(result), true);
    return result;
  } catch (error) {
    flint.ffiFmpqPolynomialClose(result);
    throw error;
  }
}

{
  const left = fmpzPolynomial([1n, 1n]);
  const right = fmpzPolynomial([-1n, 2n]);
  const sum = flint.ffiFmpzPolynomialAdd(left, right);
  const difference = flint.ffiFmpzPolynomialSub(left, right);
  const negated = flint.ffiFmpzPolynomialNeg(left);
  const scalarFloor = flint.ffiFmpzPolynomialScalarFloorDiv(right, -2n);
  const derivative = flint.ffiFmpzPolynomialDerivative(left);
  const product = flint.ffiFmpzPolynomialMul(left, right);
  const truncated = flint.ffiFmpzPolynomialTruncate(product, 2n);
  const common = flint.ffiFmpzPolynomialGcd(product, left);
  const quotient = flint.ffiFmpzPolynomialDivExact(product, left);
  const zero = fmpzPolynomial([]);
  const zeroQuotient = flint.ffiFmpzPolynomialDivExact(zero, right);
  const power = flint.ffiFmpzPolynomialPow(left, 12n);
  const divisionDividend = fmpzPolynomial([1n, 0n, 1n]);
  const divisionDivisor = fmpzPolynomial([1n, 1n]);
  const division = flint.ffiFmpzPolynomialQuoRemResource(
    divisionDividend, divisionDivisor,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialQuoRemResource(divisionDividend, zero),
    /division requires sealed resources and a nonzero divisor/,
  );
  const divisionQuotient =
    flint.ffiFmpzPolynomialDivisionResultQuotient(division);
  const divisionRemainder =
    flint.ffiFmpzPolynomialDivisionResultRemainder(division);
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(sum, index)),
    [0n, 3n],
  );
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(difference, index)),
    [2n, -1n],
  );
  assert.equal(flint.ffiFmpzPolynomialCoefficient(negated, 1n), -1n);
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(scalarFloor, index)),
    [0n, -1n],
  );
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(truncated, index)),
    [-1n, 1n],
  );
  assert.equal(flint.ffiFmpzPolynomialCoefficient(derivative, 0n), 1n);
  assert.deepEqual(
    [0n, 1n, 2n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(product, index)),
    [-1n, 1n, 2n],
  );
  assert.equal(flint.ffiFmpzPolynomialEqual(quotient, right), 1n);
  assert.equal(flint.ffiFmpzPolynomialEqual(common, left), 1n);
  assert.ok(accounted(common) > 0n);
  assert.ok(accounted(quotient) > 0n);
  assert.equal(flint.ffiFmpzPolynomialLength(zeroQuotient), 0n);
  assert.throws(
    () => flint.ffiFmpzPolynomialDivExact(left, right),
    /exact division requires sealed resources, a nonzero divisor, and an exact quotient/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialDivExact(left, zero),
    /exact division requires sealed resources, a nonzero divisor, and an exact quotient/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialScalarFloorDiv(left, 0n),
    /scalar division requires a sealed resource and a nonzero divisor/,
  );
  for (let iteration = 0; iteration < 64; iteration += 1) {
    assert.throws(
      () => flint.ffiFmpzPolynomialDivExact(left, right),
      /exact division requires sealed resources/,
    );
  }
  assert.equal(flint.ffiFmpzPolynomialCoefficient(left, 1n), 1n);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(right, 1n), 2n);
  assert.equal(flint.ffiFmpzPolynomialLength(power), 13n);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(power, 6n), 924n);
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(divisionQuotient, index)),
    [-1n, 1n],
  );
  assert.equal(
    flint.ffiFmpzPolynomialCoefficient(divisionRemainder, 0n), 2n,
  );
  assert.ok(accounted(division) > 0n);
  assert.equal(flint.ffiFmpzPolynomialEvaluate(power, 2n), 531441n);
  const rationalValue = flint.ffiFmpzPolynomialEvaluateRational(left, 1n, 2n);
  assert.equal(flint.ffiFmpqValueNumerator(rationalValue), 3n);
  assert.equal(flint.ffiFmpqValueDenominator(rationalValue), 2n);
  assert.throws(
    () => flint.ffiFmpzPolynomialEvaluateRational(left, 1n, 0n),
    /invalid rational argument/,
  );
  const serialized = flint.ffiFmpzPolynomialSerialize(product);
  const serializedBytes = bytes(serialized);
  assert.deepEqual(decodePolynomial(serializedBytes, false), [-1n, 1n, 2n]);
  const restored = deserializeInteger(serializedBytes);
  assert.deepEqual(
    [0n, 1n, 2n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(restored, index)),
    [-1n, 1n, 2n],
  );
  assert.ok(accounted(product) > 0n);
  closeTwice(restored, flint.ffiFmpzPolynomialClose);
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(rationalValue, flint.ffiFmpqValueClose);
  closeTwice(divisionRemainder, flint.ffiFmpzPolynomialClose);
  closeTwice(divisionQuotient, flint.ffiFmpzPolynomialClose);
  closeTwice(division, flint.ffiFmpzPolynomialDivisionResultClose);
  assert.throws(
    () => flint.ffiFmpzPolynomialDivisionResultQuotient(division),
    /resource is closed/,
  );
  closeTwice(divisionDivisor, flint.ffiFmpzPolynomialClose);
  closeTwice(divisionDividend, flint.ffiFmpzPolynomialClose);
  closeTwice(power, flint.ffiFmpzPolynomialClose);
  closeTwice(zeroQuotient, flint.ffiFmpzPolynomialClose);
  closeTwice(zero, flint.ffiFmpzPolynomialClose);
  closeTwice(quotient, flint.ffiFmpzPolynomialClose);
  closeTwice(common, flint.ffiFmpzPolynomialClose);
  closeTwice(product, flint.ffiFmpzPolynomialClose);
  closeTwice(derivative, flint.ffiFmpzPolynomialClose);
  closeTwice(negated, flint.ffiFmpzPolynomialClose);
  closeTwice(scalarFloor, flint.ffiFmpzPolynomialClose);
  closeTwice(truncated, flint.ffiFmpzPolynomialClose);
  closeTwice(difference, flint.ffiFmpzPolynomialClose);
  closeTwice(sum, flint.ffiFmpzPolynomialClose);
  closeTwice(right, flint.ffiFmpzPolynomialClose);
  closeTwice(left, flint.ffiFmpzPolynomialClose);
}

{
  const left = fmpqPolynomial([[1n, 2n], [1n, 3n]]);
  const right = fmpqPolynomial([[-2n, 5n], [3n, 7n]]);
  const sum = flint.ffiFmpqPolynomialAdd(left, right);
  const difference = flint.ffiFmpqPolynomialSub(left, right);
  const negated = flint.ffiFmpqPolynomialNeg(left);
  const scalarDivided = flint.ffiFmpqPolynomialScalarDiv(left, -2n, 3n);
  const derivative = flint.ffiFmpqPolynomialDerivative(left);
  const product = flint.ffiFmpqPolynomialMul(left, right);
  const truncated = flint.ffiFmpqPolynomialTruncate(product, 2n);
  const common = flint.ffiFmpqPolynomialGcd(product, left);
  const quotient = flint.ffiFmpqPolynomialDivExact(product, left);
  const zero = fmpqPolynomial([]);
  const zeroQuotient = flint.ffiFmpqPolynomialDivExact(zero, right);
  const power = flint.ffiFmpqPolynomialPow(left, 3n);
  const divisionDividend = fmpqPolynomial([
    [1n, 1n], [0n, 1n], [1n, 1n],
  ]);
  const divisionDivisor = fmpqPolynomial([[-1n, 1n], [2n, 1n]]);
  const division = flint.ffiFmpqPolynomialQuoRemResource(
    divisionDividend, divisionDivisor,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialQuoRemResource(divisionDividend, zero),
    /division requires sealed resources and a nonzero divisor/,
  );
  const divisionQuotient =
    flint.ffiFmpqPolynomialDivisionResultQuotient(division);
  const divisionRemainder =
    flint.ffiFmpqPolynomialDivisionResultRemainder(division);
  assert.deepEqual(
    [
      flint.ffiFmpqPolynomialCoefficientNumerator(sum, 0n),
      flint.ffiFmpqPolynomialCoefficientDenominator(sum, 0n),
      flint.ffiFmpqPolynomialCoefficientNumerator(sum, 1n),
      flint.ffiFmpqPolynomialCoefficientDenominator(sum, 1n),
    ],
    [1n, 10n, 16n, 21n],
  );
  assert.deepEqual(
    [
      flint.ffiFmpqPolynomialCoefficientNumerator(difference, 0n),
      flint.ffiFmpqPolynomialCoefficientDenominator(difference, 0n),
      flint.ffiFmpqPolynomialCoefficientNumerator(difference, 1n),
      flint.ffiFmpqPolynomialCoefficientDenominator(difference, 1n),
    ],
    [9n, 10n, -2n, 21n],
  );
  assert.deepEqual(
    [
      flint.ffiFmpqPolynomialCoefficientNumerator(negated, 0n),
      flint.ffiFmpqPolynomialCoefficientDenominator(negated, 0n),
      flint.ffiFmpqPolynomialCoefficientNumerator(negated, 1n),
      flint.ffiFmpqPolynomialCoefficientDenominator(negated, 1n),
    ],
    [-1n, 2n, -1n, 3n],
  );
  assert.deepEqual(
    [0n, 1n].flatMap((index) => [
      flint.ffiFmpqPolynomialCoefficientNumerator(scalarDivided, index),
      flint.ffiFmpqPolynomialCoefficientDenominator(scalarDivided, index),
    ]),
    [-3n, 4n, -1n, 2n],
  );
  assert.equal(flint.ffiFmpqPolynomialLength(truncated), 2n);
  assert.equal(flint.ffiFmpqPolynomialCoefficientNumerator(derivative, 0n), 1n);
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientDenominator(derivative, 0n), 3n,
  );
  assert.equal(flint.ffiFmpqPolynomialLength(product), 3n);
  assert.equal(flint.ffiFmpqPolynomialEqual(quotient, right), 1n);
  const monicLeft = fmpqPolynomial([[3n, 2n], [1n, 1n]]);
  assert.equal(flint.ffiFmpqPolynomialEqual(common, monicLeft), 1n);
  assert.ok(accounted(common) > 0n);
  assert.ok(accounted(quotient) > 0n);
  assert.equal(flint.ffiFmpqPolynomialLength(zeroQuotient), 0n);
  assert.throws(
    () => flint.ffiFmpqPolynomialDivExact(left, product),
    /exact division requires sealed resources, a nonzero divisor, and an exact quotient/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialDivExact(left, zero),
    /exact division requires sealed resources, a nonzero divisor, and an exact quotient/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialScalarDiv(left, 0n, 1n),
    /scalar division requires a sealed resource and a nonzero divisor/,
  );
  for (let iteration = 0; iteration < 64; iteration += 1) {
    assert.throws(
      () => flint.ffiFmpqPolynomialDivExact(left, product),
      /exact division requires sealed resources/,
    );
  }
  assert.equal(flint.ffiFmpqPolynomialCoefficientNumerator(left, 0n), 1n);
  assert.equal(flint.ffiFmpqPolynomialCoefficientDenominator(left, 0n), 2n);
  assert.equal(flint.ffiFmpqPolynomialLength(power), 4n);
  assert.deepEqual(
    [0n, 1n].flatMap((index) => [
      flint.ffiFmpqPolynomialCoefficientNumerator(divisionQuotient, index),
      flint.ffiFmpqPolynomialCoefficientDenominator(divisionQuotient, index),
    ]),
    [1n, 4n, 1n, 2n],
  );
  assert.deepEqual(
    [
      flint.ffiFmpqPolynomialCoefficientNumerator(divisionRemainder, 0n),
      flint.ffiFmpqPolynomialCoefficientDenominator(divisionRemainder, 0n),
    ],
    [5n, 4n],
  );
  assert.ok(accounted(division) > 0n);
  const value = flint.ffiFmpqPolynomialEvaluate(left, 3n, 2n);
  assert.equal(flint.ffiFmpqValueNumerator(value), 1n);
  assert.equal(flint.ffiFmpqValueDenominator(value), 1n);
  const serialized = flint.ffiFmpqPolynomialSerialize(product);
  const serializedBytes = bytes(serialized);
  assert.deepEqual(
    decodePolynomial(serializedBytes, true),
    [[-1n, 5n], [17n, 210n], [1n, 7n]],
  );
  const restored = deserializeRational(serializedBytes);
  assert.deepEqual(
    [0n, 1n, 2n].flatMap((index) => [
      flint.ffiFmpqPolynomialCoefficientNumerator(restored, index),
      flint.ffiFmpqPolynomialCoefficientDenominator(restored, index),
    ]),
    [-1n, 5n, 17n, 210n, 1n, 7n],
  );
  closeTwice(restored, flint.ffiFmpqPolynomialClose);
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(value, flint.ffiFmpqValueClose);
  closeTwice(divisionRemainder, flint.ffiFmpqPolynomialClose);
  closeTwice(divisionQuotient, flint.ffiFmpqPolynomialClose);
  closeTwice(division, flint.ffiFmpqPolynomialDivisionResultClose);
  assert.throws(
    () => flint.ffiFmpqPolynomialDivisionResultRemainder(division),
    /resource is closed/,
  );
  closeTwice(divisionDivisor, flint.ffiFmpqPolynomialClose);
  closeTwice(divisionDividend, flint.ffiFmpqPolynomialClose);
  closeTwice(power, flint.ffiFmpqPolynomialClose);
  closeTwice(zeroQuotient, flint.ffiFmpqPolynomialClose);
  closeTwice(zero, flint.ffiFmpqPolynomialClose);
  closeTwice(quotient, flint.ffiFmpqPolynomialClose);
  closeTwice(monicLeft, flint.ffiFmpqPolynomialClose);
  closeTwice(common, flint.ffiFmpqPolynomialClose);
  closeTwice(product, flint.ffiFmpqPolynomialClose);
  closeTwice(derivative, flint.ffiFmpqPolynomialClose);
  closeTwice(negated, flint.ffiFmpqPolynomialClose);
  closeTwice(scalarDivided, flint.ffiFmpqPolynomialClose);
  closeTwice(truncated, flint.ffiFmpqPolynomialClose);
  closeTwice(difference, flint.ffiFmpqPolynomialClose);
  closeTwice(sum, flint.ffiFmpqPolynomialClose);
  closeTwice(right, flint.ffiFmpqPolynomialClose);
  closeTwice(left, flint.ffiFmpqPolynomialClose);
}

{
  const left = fmpzPolynomial([2n, 1n]);
  const right = fmpzPolynomial([4n, 1n]);
  const result = flint.ffiFmpzPolynomialXgcdResource(left, right);
  assert.ok(accounted(result) > 0n);
  const gcd = flint.ffiFmpzPolynomialXgcdResultGcd(result);
  const leftCoefficient =
    flint.ffiFmpzPolynomialXgcdResultLeftCoefficient(result);
  const rightCoefficient =
    flint.ffiFmpzPolynomialXgcdResultRightCoefficient(result);
  assert.deepEqual(resourceCoefficients(gcd, false), [2n]);
  assert.deepEqual(resourceCoefficients(leftCoefficient, false), [-1n]);
  assert.deepEqual(resourceCoefficients(rightCoefficient, false), [1n]);
  closeTwice(result, flint.ffiFmpzPolynomialXgcdResultClose);
  assert.throws(
    () => flint.ffiFmpzPolynomialXgcdResultGcd(result),
    /resource is closed/,
  );
  // The three selected polynomials are independent retained resources.
  assert.equal(flint.ffiFmpzPolynomialCoefficient(gcd, 0n), 2n);
  const repeated = flint.ffiFmpzPolynomialXgcdResource(left, left);
  const repeatedGcd = flint.ffiFmpzPolynomialXgcdResultGcd(repeated);
  assert.equal(flint.ffiFmpzPolynomialEqual(repeatedGcd, left), 1n);
  const unsealed = flint.ffiFmpzPolynomialCreate(1n);
  assert.throws(
    () => flint.ffiFmpzPolynomialXgcdResource(unsealed, right),
    /integer polynomial is unsealed/,
  );
  for (const value of [
    unsealed, repeatedGcd, rightCoefficient, leftCoefficient, gcd, right, left,
  ]) closeTwice(value, flint.ffiFmpzPolynomialClose);
  closeTwice(repeated, flint.ffiFmpzPolynomialXgcdResultClose);
}

{
  const left = fmpqPolynomial([[2n, 1n], [1n, 1n]]);
  const right = fmpqPolynomial([[4n, 1n], [1n, 1n]]);
  const result = flint.ffiFmpqPolynomialXgcdResource(left, right);
  assert.ok(accounted(result) > 0n);
  const gcd = flint.ffiFmpqPolynomialXgcdResultGcd(result);
  const leftCoefficient =
    flint.ffiFmpqPolynomialXgcdResultLeftCoefficient(result);
  const rightCoefficient =
    flint.ffiFmpqPolynomialXgcdResultRightCoefficient(result);
  assert.deepEqual(resourceCoefficients(gcd, true), [[1n, 1n]]);
  assert.deepEqual(resourceCoefficients(leftCoefficient, true), [[-1n, 2n]]);
  assert.deepEqual(resourceCoefficients(rightCoefficient, true), [[1n, 2n]]);
  closeTwice(result, flint.ffiFmpqPolynomialXgcdResultClose);
  assert.throws(
    () => flint.ffiFmpqPolynomialXgcdResultRightCoefficient(result),
    /resource is closed/,
  );
  assert.equal(flint.ffiFmpqPolynomialCoefficientNumerator(gcd, 0n), 1n);
  for (const value of [
    rightCoefficient, leftCoefficient, gcd, right, left,
  ]) closeTwice(value, flint.ffiFmpqPolynomialClose);
}

{
  const integerZero = fmpzPolynomial([0n, 0n, 0n]);
  assert.equal(flint.ffiFmpzPolynomialLength(integerZero), 0n);
  const integerZeroPower = flint.ffiFmpzPolynomialPow(integerZero, 0n);
  assert.equal(flint.ffiFmpzPolynomialLength(integerZeroPower), 1n);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(integerZeroPower, 0n), 1n);

  const rational = fmpqPolynomial([[2n, -4n], [0n, -7n], [0n, 5n]]);
  assert.equal(flint.ffiFmpqPolynomialLength(rational), 1n);
  assert.equal(flint.ffiFmpqPolynomialCoefficientNumerator(rational, 0n), -1n);
  assert.equal(flint.ffiFmpqPolynomialCoefficientDenominator(rational, 0n), 2n);
  const rationalValue = flint.ffiFmpqPolynomialEvaluate(rational, 3n, -5n);
  assert.equal(flint.ffiFmpqValueNumerator(rationalValue), -1n);
  assert.equal(flint.ffiFmpqValueDenominator(rationalValue), 2n);

  const integerZeroBytes = flint.ffiFmpzPolynomialSerialize(integerZero);
  const restoredIntegerZero = deserializeInteger(bytes(integerZeroBytes));
  assert.equal(flint.ffiFmpzPolynomialLength(restoredIntegerZero), 0n);
  const rationalBytes = flint.ffiFmpqPolynomialSerialize(rational);
  const restoredRational = deserializeRational(bytes(rationalBytes));
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientNumerator(restoredRational, 0n), -1n,
  );
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientDenominator(restoredRational, 0n), 2n,
  );

  closeTwice(restoredRational, flint.ffiFmpqPolynomialClose);
  closeTwice(rationalBytes, flint.ffiFlintByteRegionClose);
  closeTwice(restoredIntegerZero, flint.ffiFmpzPolynomialClose);
  closeTwice(integerZeroBytes, flint.ffiFlintByteRegionClose);
  closeTwice(rationalValue, flint.ffiFmpqValueClose);
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  closeTwice(integerZeroPower, flint.ffiFmpzPolynomialClose);
  closeTwice(integerZero, flint.ffiFmpzPolynomialClose);
}

{
  const integerZero = fmpzPolynomial([]);
  const integerNegative = fmpzPolynomial([4n, -2n]);
  const integerLeft = fmpzPolynomial([6n, 6n]);
  const integerRight = fmpzPolynomial([9n, 9n]);
  const integerConstant = fmpzPolynomial([4n]);
  const integerLinear = fmpzPolynomial([0n, 2n]);
  const zeroZero = flint.ffiFmpzPolynomialGcd(integerZero, integerZero);
  const zeroNegative = flint.ffiFmpzPolynomialGcd(
    integerZero, integerNegative,
  );
  const content = flint.ffiFmpzPolynomialGcd(integerLeft, integerRight);
  const constant = flint.ffiFmpzPolynomialGcd(integerLinear, integerConstant);
  assert.equal(flint.ffiFmpzPolynomialLength(zeroZero), 0n);
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(zeroNegative, index)),
    [-4n, 2n],
  );
  assert.deepEqual(
    [0n, 1n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(content, index)),
    [3n, 3n],
  );
  assert.equal(flint.ffiFmpzPolynomialCoefficient(constant, 0n), 2n);
  for (const value of [
    constant, content, zeroNegative, zeroZero, integerLinear,
    integerConstant, integerRight, integerLeft, integerNegative, integerZero,
  ]) closeTwice(value, flint.ffiFmpzPolynomialClose);

  const rationalZero = fmpqPolynomial([]);
  const rationalNegative = fmpqPolynomial([[4n, 1n], [-2n, 1n]]);
  const rationalLeft = fmpqPolynomial([[6n, 1n], [6n, 1n]]);
  const rationalRight = fmpqPolynomial([[9n, 1n], [9n, 1n]]);
  const rationalConstant = fmpqPolynomial([[4n, 1n]]);
  const rationalZeroZero = flint.ffiFmpqPolynomialGcd(
    rationalZero, rationalZero,
  );
  const rationalMonic = flint.ffiFmpqPolynomialGcd(
    rationalZero, rationalNegative,
  );
  const rationalContent = flint.ffiFmpqPolynomialGcd(
    rationalLeft, rationalRight,
  );
  const rationalUnit = flint.ffiFmpqPolynomialGcd(
    rationalLeft, rationalConstant,
  );
  assert.equal(flint.ffiFmpqPolynomialLength(rationalZeroZero), 0n);
  assert.deepEqual(
    [0n, 1n].flatMap((index) => [
      flint.ffiFmpqPolynomialCoefficientNumerator(rationalMonic, index),
      flint.ffiFmpqPolynomialCoefficientDenominator(rationalMonic, index),
    ]),
    [-2n, 1n, 1n, 1n],
  );
  assert.deepEqual(
    [0n, 1n].flatMap((index) => [
      flint.ffiFmpqPolynomialCoefficientNumerator(rationalContent, index),
      flint.ffiFmpqPolynomialCoefficientDenominator(rationalContent, index),
    ]),
    [1n, 1n, 1n, 1n],
  );
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientNumerator(rationalUnit, 0n), 1n,
  );
  for (const value of [
    rationalUnit, rationalContent, rationalMonic, rationalZeroZero,
    rationalConstant, rationalRight, rationalLeft, rationalNegative,
    rationalZero,
  ]) closeTwice(value, flint.ffiFmpqPolynomialClose);
}

{
  const huge = (1n << 137n) + 17n;
  const integer = fmpzPolynomial([0n, -huge, 9n]);
  const integerBytes = flint.ffiFmpzPolynomialSerialize(integer);
  assert.deepEqual(
    decodePolynomial(bytes(integerBytes), false),
    [0n, -huge, 9n],
  );
  const restoredInteger = deserializeInteger(bytes(integerBytes));
  assert.equal(
    flint.ffiFmpzPolynomialCoefficient(restoredInteger, 1n), -huge,
  );
  const rational = fmpqPolynomial([
    [huge, 3n],
    [-5n, (1n << 83n) + 9n],
  ]);
  const rationalBytes = flint.ffiFmpqPolynomialSerialize(rational);
  assert.deepEqual(
    decodePolynomial(bytes(rationalBytes), true),
    [[huge, 3n], [-5n, (1n << 83n) + 9n]],
  );
  const restoredRational = deserializeRational(bytes(rationalBytes));
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientNumerator(restoredRational, 0n), huge,
  );
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientDenominator(restoredRational, 1n),
    (1n << 83n) + 9n,
  );
  closeTwice(restoredRational, flint.ffiFmpqPolynomialClose);
  closeTwice(restoredInteger, flint.ffiFmpzPolynomialClose);
  closeTwice(rationalBytes, flint.ffiFlintByteRegionClose);
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  closeTwice(integerBytes, flint.ffiFlintByteRegionClose);
  closeTwice(integer, flint.ffiFmpzPolynomialClose);
}

{
  const invalidInteger = [];
  const validInteger = polynomialBytes("SJPZ", [1n]);
  const wrongMagic = Uint8Array.from(validInteger);
  wrongMagic[0] = 0;
  invalidInteger.push(wrongMagic);
  const wrongVersion = Uint8Array.from(validInteger);
  wrongVersion[4] = 2;
  invalidInteger.push(wrongVersion);
  const nonzeroReserved = Uint8Array.from(validInteger);
  nonzeroReserved[5] = 1;
  invalidInteger.push(nonzeroReserved);
  invalidInteger.push(validInteger.subarray(0, validInteger.length - 1));
  invalidInteger.push(Uint8Array.from([...validInteger, 0]));
  invalidInteger.push(Uint8Array.from([
    ...polynomialBytes("SJPZ", []), 2, 0, 0, 0, 1, 0,
  ]));
  const negativeZero = polynomialBytes("SJPZ", [0n]);
  negativeZero[19] = 0x80;
  invalidInteger.push(negativeZero);
  invalidInteger.push(polynomialBytes("SJPZ", [1n, 0n]));

  for (const source of invalidInteger) {
    assert.throws(
      () => deserializeInteger(source),
      /invalid SJPZ v1 integer polynomial serialization/,
    );
  }
  assert.throws(
    () => flint.ffiFmpzPolynomialDeserialize(-1n, 16n),
    /invalid SJPZ v1 integer polynomial serialization/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialDeserialize(
      1n << BigInt(8 * validInteger.length), BigInt(validInteger.length),
    ),
    /invalid SJPZ v1 integer polynomial serialization/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialDeserialize(payload(validInteger), 2n ** 64n - 1n),
    /invalid SJPZ v1 integer polynomial serialization/,
  );

  const invalidRational = [
    polynomialBytes("SJPQ", [[1n, 0n]]),
    polynomialBytes("SJPQ", [[1n, -2n]]),
    polynomialBytes("SJPQ", [[2n, 4n]]),
    polynomialBytes("SJPQ", [[0n, 2n]]),
    polynomialBytes("SJPQ", [[1n, 2n], [0n, 1n]]),
  ];
  for (const source of invalidRational) {
    assert.throws(
      () => deserializeRational(source),
      /invalid SJPQ v1 rational polynomial serialization/,
    );
  }

  // Fuzz the full validation path while preserving an independently-invalid
  // magic byte, so no mutated input can accidentally become canonical.
  let state = 0x5a17_9d3b;
  for (let iteration = 0; iteration < 256; iteration += 1) {
    const source = Uint8Array.from(
      iteration % 2 === 0 ? validInteger : polynomialBytes("SJPQ", [[1n, 2n]]),
    );
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    source[state % source.length] ^= (state >>> 8) & 255;
    source[0] = 0;
    assert.throws(
      () => iteration % 2 === 0
        ? deserializeInteger(source)
        : deserializeRational(source),
      /invalid SJP[ZQ] v1/,
    );
  }
}

{
  const unsealed = flint.ffiFmpzPolynomialCreate(1n);
  const sealedInteger = fmpzPolynomial([1n]);
  assert.throws(
    () => flint.ffiFmpzPolynomialDivExact(sealedInteger, unsealed),
    /exact division requires sealed resources/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialGcd(sealedInteger, unsealed),
    /integer polynomial is unsealed/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialScalarFloorDiv(unsealed, 2n),
    /scalar division requires a sealed resource/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialTruncate(unsealed, 1n),
    /truncation requires a sealed resource/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialLength(unsealed),
    /unsealed/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialCoefficient(unsealed, 0n),
    /out of bounds/,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialSerialize(unsealed),
    /serialization/,
  );
  assert.equal(flint.ffiFmpzPolynomialSeal(unsealed), true);
  assert.throws(
    () => flint.ffiFmpzPolynomialSetCoefficient(unsealed, 0n, 1n),
    /sealed/,
  );
  assert.throws(() => flint.ffiFmpzPolynomialSeal(unsealed), /already sealed/);
  closeTwice(unsealed, flint.ffiFmpzPolynomialClose);
  assert.throws(
    () => flint.ffiFmpzPolynomialLength(unsealed),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialDivExact(sealedInteger, unsealed),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialGcd(sealedInteger, unsealed),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialTruncate(unsealed, 1n),
    /closed|invalid resource/i,
  );
  closeTwice(sealedInteger, flint.ffiFmpzPolynomialClose);

  const rational = flint.ffiFmpqPolynomialCreate(1n);
  const sealedRational = fmpqPolynomial([[1n, 1n]]);
  const wrongInteger = fmpzPolynomial([1n]);
  assert.throws(
    () => flint.ffiFmpqPolynomialTruncate(wrongInteger, 1n),
    /declared .* resource/i,
  );
  assert.throws(
    () => flint.ffiFmpzPolynomialTruncate(sealedRational, 1n),
    /declared .* resource/i,
  );
  closeTwice(wrongInteger, flint.ffiFmpzPolynomialClose);
  assert.throws(
    () => flint.ffiFmpqPolynomialDivExact(sealedRational, rational),
    /exact division requires sealed resources/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialGcd(sealedRational, rational),
    /rational polynomial is unsealed/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialScalarDiv(rational, 2n, 3n),
    /scalar division requires a sealed resource/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialTruncate(rational, 1n),
    /truncation requires a sealed resource/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialLength(rational),
    /unsealed/,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialSetCoefficient(rational, 0n, 1n, 0n),
    /invalid rational/,
  );
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  assert.throws(
    () => flint.ffiFmpqPolynomialLength(rational),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialDivExact(sealedRational, rational),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialTruncate(rational, 1n),
    /closed|invalid resource/i,
  );
  assert.throws(
    () => flint.ffiFmpqPolynomialGcd(sealedRational, rational),
    /closed|invalid resource/i,
  );
  closeTwice(sealedRational, flint.ffiFmpqPolynomialClose);
}

{
  const length = 20_000;
  const huge = 1n << 8192n;
  const integer = flint.ffiFmpzPolynomialCreate(BigInt(length));
  const integerBefore = accounted(integer);
  assert.equal(flint.ffiFmpzPolynomialSetCoefficient(
    integer, BigInt(length - 1), huge,
  ), true);
  assert.ok(accounted(integer) > integerBefore + 900n);
  assert.equal(flint.ffiFmpzPolynomialSeal(integer), true);
  assert.ok(
    accounted(integer) < 1024n * 1024n,
    `skew integer polynomial retained ${accounted(integer)} bytes`,
  );
  const integerFactor = fmpzPolynomial([
    -(1n << 4096n) + 37n,
    0n,
    3n,
  ]);
  const integerProduct = flint.ffiFmpzPolynomialMul(integer, integerFactor);
  const integerGcd = flint.ffiFmpzPolynomialGcd(integer, integer);
  const integerQuotient = flint.ffiFmpzPolynomialDivExact(
    integerProduct, integerFactor,
  );
  assert.equal(flint.ffiFmpzPolynomialEqual(integerQuotient, integer), 1n);
  assert.equal(flint.ffiFmpzPolynomialEqual(integerGcd, integer), 1n);
  const integerBytes = flint.ffiFmpzPolynomialSerialize(integer);
  const restoredInteger = deserializeInteger(bytes(integerBytes));
  assert.equal(
    flint.ffiFmpzPolynomialCoefficient(
      restoredInteger, BigInt(length - 1),
    ),
    huge,
  );
  assert.ok(accounted(restoredInteger) < 1024n * 1024n);

  const rational = flint.ffiFmpqPolynomialCreate(BigInt(length));
  const rationalBefore = accounted(rational);
  assert.equal(flint.ffiFmpqPolynomialSetCoefficient(
    rational, BigInt(length - 1), huge, (1n << 4096n) + 1n,
  ), true);
  assert.ok(accounted(rational) > rationalBefore + 1400n);
  assert.equal(flint.ffiFmpqPolynomialSeal(rational), true);
  assert.ok(
    accounted(rational) < 1024n * 1024n,
    `skew rational polynomial retained ${accounted(rational)} bytes`,
  );
  const rationalFactor = fmpqPolynomial([
    [(1n << 2048n) + 5n, (1n << 1024n) + 9n],
    [0n, 1n],
    [-7n, 11n],
  ]);
  const rationalProduct = flint.ffiFmpqPolynomialMul(rational, rationalFactor);
  const rationalGcd = flint.ffiFmpqPolynomialGcd(rational, rational);
  const rationalQuotient = flint.ffiFmpqPolynomialDivExact(
    rationalProduct, rationalFactor,
  );
  assert.equal(flint.ffiFmpqPolynomialEqual(rationalQuotient, rational), 1n);
  assert.equal(flint.ffiFmpqPolynomialLength(rationalGcd), BigInt(length));
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientNumerator(
      rationalGcd, BigInt(length - 1),
    ),
    1n,
  );
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientDenominator(
      rationalGcd, BigInt(length - 1),
    ),
    1n,
  );
  const rationalBytes = flint.ffiFmpqPolynomialSerialize(rational);
  const restoredRational = deserializeRational(bytes(rationalBytes));
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientNumerator(
      restoredRational, BigInt(length - 1),
    ),
    huge,
  );
  assert.equal(
    flint.ffiFmpqPolynomialCoefficientDenominator(
      restoredRational, BigInt(length - 1),
    ),
    (1n << 4096n) + 1n,
  );
  assert.ok(accounted(restoredRational) < 1024n * 1024n);
  closeTwice(restoredRational, flint.ffiFmpqPolynomialClose);
  closeTwice(rationalBytes, flint.ffiFlintByteRegionClose);
  closeTwice(rationalQuotient, flint.ffiFmpqPolynomialClose);
  closeTwice(rationalGcd, flint.ffiFmpqPolynomialClose);
  closeTwice(rationalProduct, flint.ffiFmpqPolynomialClose);
  closeTwice(rationalFactor, flint.ffiFmpqPolynomialClose);
  closeTwice(restoredInteger, flint.ffiFmpzPolynomialClose);
  closeTwice(integerBytes, flint.ffiFlintByteRegionClose);
  closeTwice(integerQuotient, flint.ffiFmpzPolynomialClose);
  closeTwice(integerGcd, flint.ffiFmpzPolynomialClose);
  closeTwice(integerProduct, flint.ffiFmpzPolynomialClose);
  closeTwice(integerFactor, flint.ffiFmpzPolynomialClose);
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  closeTwice(integer, flint.ffiFmpzPolynomialClose);
}

function median(values) {
  return [...values].sort((left, right) => left - right)[1];
}

function timeFill(length, rational) {
  const started = process.hrtime.bigint();
  const polynomial = rational
    ? flint.ffiFmpqPolynomialCreate(BigInt(length))
    : flint.ffiFmpzPolynomialCreate(BigInt(length));
  try {
    for (let index = 0; index < length; index += 1) {
      if (rational) {
        flint.ffiFmpqPolynomialSetCoefficient(
          polynomial, BigInt(index), BigInt(index % 97), BigInt(index % 7 + 1),
        );
      } else {
        flint.ffiFmpzPolynomialSetCoefficient(
          polynomial, BigInt(index), BigInt(index % 97),
        );
      }
    }
    if (rational) flint.ffiFmpqPolynomialSeal(polynomial);
    else flint.ffiFmpzPolynomialSeal(polynomial);
    return Number(process.hrtime.bigint() - started);
  } finally {
    if (rational) flint.ffiFmpqPolynomialClose(polynomial);
    else flint.ffiFmpzPolynomialClose(polynomial);
  }
}

for (const rational of [false, true]) {
  timeFill(2_000, rational);
  const small = median([
    timeFill(20_000, rational),
    timeFill(20_000, rational),
    timeFill(20_000, rational),
  ]);
  const large = median([
    timeFill(40_000, rational),
    timeFill(40_000, rational),
    timeFill(40_000, rational),
  ]);
  assert.ok(
    large / small < 3.2,
    `${rational ? "QQ" : "ZZ"} construction regressed: ` +
      `2x input took ${large / small}x`,
  );
}

const publicBulkSource = [
  "import sagejs.ffi.flint as flint",
  "def forbidden_scalar(*values):",
  "    raise RuntimeError('coefficient-at-a-time FFI is forbidden')",
  "flint.fmpz_polynomial = forbidden_scalar",
  "flint.fmpz_polynomial_set_coefficient = forbidden_scalar",
  "flint.fmpz_polynomial_seal = forbidden_scalar",
  "flint.fmpz_polynomial_coefficient = forbidden_scalar",
  "flint.fmpq_polynomial = forbidden_scalar",
  "flint.fmpq_polynomial_set_coefficient = forbidden_scalar",
  "flint.fmpq_polynomial_seal = forbidden_scalar",
  "flint.fmpq_polynomial_coefficient_numerator = forbidden_scalar",
  "flint.fmpq_polynomial_coefficient_denominator = forbidden_scalar",
  "huge_numerator = 2**65537 + 17",
  "huge_denominator = 2**32771 + 9",
  "R = PolynomialRing(ZZ, 'x')",
  "z = R([1, -2, 0, huge_numerator, 0, 0])",
  "zero_z = R([0, 0, 0])",
  "S = PolynomialRing(QQ, 'y')",
  "q = S([QQ(2) / QQ(4), QQ(-6) / QQ(-8), QQ(-huge_numerator) / QQ(huge_denominator), 0, 0])",
  "zero_q = S([0, 0])",
  "assert z.coefficients() == [1, -2, 0, huge_numerator]",
  "assert zero_z.coefficients() == []",
  "assert q.coefficients() == [QQ(1) / QQ(2), QQ(3) / QQ(4), QQ(-huge_numerator) / QQ(huge_denominator)]",
  "assert zero_q.coefficients() == []",
  "assert z._has_fmpz_polynomial_resource()",
  "assert q._has_fmpq_polynomial_resource()",
  "print(len(z.coefficients()), len(q.coefficients()), z._has_fmpz_polynomial_resource(), q._has_fmpq_polynomial_resource())",
  "",
].join("\n");

for (const nativeDisabled of [false, true]) {
  const publicDirectory = mkdtempSync(join(tmpdir(), "sagejs-poly-bulk-"));
  const publicPath = join(publicDirectory, "bulk.py");
  let publicBulk;
  try {
    writeFileSync(publicPath, publicBulkSource);
    publicBulk = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), publicPath],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
          ...(nativeDisabled ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
        },
        timeout: 60_000,
      },
    );
  } finally {
    rmSync(publicDirectory, { recursive: true, force: true });
  }
  assert.equal(
    publicBulk.status,
    0,
    `${publicBulk.stdout}\n${publicBulk.stderr}`,
  );
  assert.equal(publicBulk.stderr, "");
  assert.equal(publicBulk.stdout.trim(), "4 3 True True");
}

if (process.platform !== "win32") {
  const source = String.raw`
#include <stdint.h>
#include <sagejs/exact_polynomial_ffi.h>

static int region_payload(
    fmpz_t result, const sagejs_flint_byte_region_t region)
{
    const size_t word_count =
        region->length / sizeof(ulong) +
        (region->length % sizeof(ulong) != 0);
    if (word_count > (size_t) WORD_MAX ||
        word_count > SIZE_MAX / sizeof(ulong))
        return 0;
    ulong *words = (ulong *) calloc(word_count, sizeof(ulong));
    if (words == NULL)
        return 0;
    for (size_t byte = 0; byte < region->length; byte++)
        words[byte / sizeof(ulong)] |=
            (ulong) region->data[byte] <<
            (8 * (byte % sizeof(ulong)));
    fmpz_set_ui_array(result, words, (slong) word_count);
    free(words);
    return 1;
}

int main(void)
{
    fmpz_t coefficient, denominator, argument, result, zpayload, qpayload;
    fmpz_init(coefficient);
    fmpz_init(denominator);
    fmpz_init(argument);
    fmpz_init(result);
    fmpz_init(zpayload);
    fmpz_init(qpayload);
    for (slong round = 0; round < 300; round++)
    {
        sagejs_fmpz_polynomial_t z, zsum, zproduct, zquotient, zgcd, zpower;
        sagejs_fmpz_polynomial_t zscalar, ztruncated;
        sagejs_fmpq_polynomial_t q, qsum, qproduct, qquotient, qgcd, qpower;
        sagejs_fmpq_polynomial_t qscalar, qtruncated;
        sagejs_fmpz_polynomial_xgcd_result_t zxgcd;
        sagejs_fmpq_polynomial_xgcd_result_t qxgcd;
        sagejs_fmpz_polynomial_t zrejected, zzero;
        sagejs_fmpq_polynomial_t qrejected, qzero;
        sagejs_fmpz_polynomial_t zunsealed;
        sagejs_fmpq_polynomial_t qunsealed;
        sagejs_fmpz_polynomial_t zdecoded, zregiondecoded;
        sagejs_fmpq_polynomial_t qdecoded, qregiondecoded;
        sagejs_fmpq_value_t qvalue, zqvalue;
        sagejs_flint_byte_region_t zbytes, qbytes;
        if (!sagejs_fmpz_polynomial_init(z, 32) ||
            !sagejs_fmpq_polynomial_init(q, 32) ||
            !sagejs_fmpz_polynomial_init(zunsealed, 1) ||
            !sagejs_fmpq_polynomial_init(qunsealed, 1))
            return 2;
        sagejs_fmpz_polynomial_xgcd_result_t rejected_zxgcd = {0};
        sagejs_fmpq_polynomial_xgcd_result_t rejected_qxgcd = {0};
        if (sagejs_fmpz_polynomial_xgcd_resource(
                rejected_zxgcd, zunsealed, zunsealed) ||
            sagejs_fmpq_polynomial_xgcd_resource(
                rejected_qxgcd, qunsealed, qunsealed))
            return 18;
        for (slong index = 0; index < 32; index++)
        {
            fmpz_set_si(coefficient, round + 3 * index - 17);
            if (!sagejs_fmpz_polynomial_set_coefficient(
                    z, (uint64_t) index, coefficient))
                return 3;
            fmpz_set_ui(denominator, (ulong) (index % 7 + 1));
            if (!sagejs_fmpq_polynomial_set_coefficient(
                    q, (uint64_t) index, coefficient, denominator))
                return 4;
        }
        if (!sagejs_fmpz_polynomial_seal(z) ||
            !sagejs_fmpq_polynomial_seal(q) ||
            !sagejs_fmpz_polynomial_scalar_floor_div(
                zscalar, z, denominator) ||
            !sagejs_fmpz_polynomial_truncate(ztruncated, z, 17) ||
            !sagejs_fmpq_polynomial_scalar_div(
                qscalar, q, coefficient, denominator) ||
            !sagejs_fmpq_polynomial_truncate(qtruncated, q, 17) ||
            !sagejs_fmpz_polynomial_add(zsum, z, z) ||
            !sagejs_fmpz_polynomial_mul(zproduct, z, zsum) ||
            !sagejs_fmpz_polynomial_gcd(zgcd, zproduct, z) ||
            !sagejs_fmpz_polynomial_xgcd_resource(zxgcd, zproduct, z) ||
            !sagejs_fmpz_polynomial_pow(zpower, z, 3) ||
            !sagejs_fmpq_polynomial_add(qsum, q, q) ||
            !sagejs_fmpq_polynomial_mul(qproduct, q, qsum) ||
            !sagejs_fmpq_polynomial_gcd(qgcd, qproduct, q) ||
            !sagejs_fmpq_polynomial_xgcd_resource(qxgcd, qproduct, q) ||
            !sagejs_fmpq_polynomial_pow(qpower, q, 3))
            return 5;
        fmpz_poly_t zidentity, zterm;
        fmpq_poly_t qidentity, qterm;
        fmpz_poly_init(zidentity);
        fmpz_poly_init(zterm);
        fmpq_poly_init(qidentity);
        fmpq_poly_init(qterm);
        fmpz_poly_mul(
            zidentity, zxgcd->left_coefficient.value, zproduct->value);
        fmpz_poly_mul(
            zterm, zxgcd->right_coefficient.value, z->value);
        fmpz_poly_add(zidentity, zidentity, zterm);
        fmpq_poly_mul(
            qidentity, qxgcd->left_coefficient.value, qproduct->value);
        fmpq_poly_mul(
            qterm, qxgcd->right_coefficient.value, q->value);
        fmpq_poly_add(qidentity, qidentity, qterm);
        if (!fmpz_poly_equal(zidentity, zxgcd->gcd.value) ||
            !fmpq_poly_equal(qidentity, qxgcd->gcd.value))
            return 17;
        fmpz_poly_t z_before, zproduct_before;
        fmpq_poly_t q_before, qproduct_before;
        fmpz_poly_init(z_before);
        fmpz_poly_set(z_before, z->value);
        fmpz_poly_init(zproduct_before);
        fmpz_poly_set(zproduct_before, zproduct->value);
        fmpq_poly_init(q_before);
        fmpq_poly_set(q_before, q->value);
        fmpq_poly_init(qproduct_before);
        fmpq_poly_set(qproduct_before, qproduct->value);
        if (!sagejs_fmpz_polynomial_divexact(zquotient, zproduct, z) ||
            !sagejs_fmpq_polynomial_divexact(qquotient, qproduct, q) ||
            !fmpz_poly_equal(zquotient->value, zsum->value) ||
            !fmpq_poly_equal(qquotient->value, qsum->value))
            return 13;
        if (sagejs_fmpz_polynomial_divexact(zrejected, z, zsum) ||
            sagejs_fmpq_polynomial_divexact(qrejected, qsum, qpower))
            return 14;
        if (!sagejs_fmpz_polynomial_init(zzero, 0) ||
            !sagejs_fmpz_polynomial_seal(zzero) ||
            !sagejs_fmpq_polynomial_init(qzero, 0) ||
            !sagejs_fmpq_polynomial_seal(qzero) ||
            sagejs_fmpz_polynomial_divexact(zrejected, z, zzero) ||
            sagejs_fmpq_polynomial_divexact(qrejected, q, qzero))
            return 15;
        if (!fmpz_poly_equal(z->value, z_before) ||
            !fmpz_poly_equal(zproduct->value, zproduct_before) ||
            !fmpq_poly_equal(q->value, q_before) ||
            !fmpq_poly_equal(qproduct->value, qproduct_before))
            return 16;
        fmpz_set_si(argument, -3);
        fmpz_set_ui(denominator, 5);
        if (!sagejs_fmpz_polynomial_evaluate(result, z, argument) ||
            !sagejs_fmpz_polynomial_evaluate_rational(
                zqvalue, z, argument, denominator) ||
            !sagejs_fmpq_polynomial_evaluate(
                qvalue, q, argument, denominator) ||
            !sagejs_fmpz_polynomial_serialize(zbytes, zpower) ||
            !sagejs_fmpq_polynomial_serialize(qbytes, qpower))
            return 6;
        if (!sagejs_fmpz_polynomial_from_byte_region(
                zregiondecoded, zbytes, 0, (uint64_t) zbytes->length) ||
            !sagejs_fmpq_polynomial_from_byte_region(
                qregiondecoded, qbytes, 0, (uint64_t) qbytes->length) ||
            !fmpz_poly_equal(zregiondecoded->value, zpower->value) ||
            !fmpq_poly_equal(qregiondecoded->value, qpower->value))
            return 19;
        {
            unsigned char noncanonical[] = {
                'S', 'J', 'P', 'Q', 1, 0, 0, 0,
                1, 0, 0, 0, 0, 0, 0, 0,
                1, 0, 0, 0, 2,
                1, 0, 0, 0, 4
            };
            sagejs_flint_byte_region_struct region = {
                noncanonical, sizeof(noncanonical)
            };
            sagejs_fmpq_polynomial_t rejected_region = {0};
            if (sagejs_fmpq_polynomial_from_byte_region(
                    rejected_region, &region, 0, sizeof(noncanonical)) ||
                rejected_region->retained_bytes != 0 ||
                sagejs_fmpq_polynomial_from_byte_region(
                    rejected_region, &region, 1, sizeof(noncanonical)))
                return 20;
        }
        if (!region_payload(zpayload, zbytes) ||
            !region_payload(qpayload, qbytes) ||
            !sagejs_fmpz_polynomial_deserialize_packed(
                zdecoded, zpayload, (uint64_t) zbytes->length) ||
            !sagejs_fmpq_polynomial_deserialize_packed(
                qdecoded, qpayload, (uint64_t) qbytes->length) ||
            !fmpz_poly_equal(zdecoded->value, zpower->value) ||
            !fmpq_poly_equal(qdecoded->value, qpower->value))
            return 10;
        if (sagejs_fmpz_polynomial_allocated_bytes(z) == 0 ||
            sagejs_fmpq_polynomial_allocated_bytes(q) == 0 ||
            sagejs_flint_byte_region_length(zbytes) < 16 ||
            sagejs_flint_byte_region_length(qbytes) < 16)
            return 7;
        sagejs_fmpq_polynomial_clear(qdecoded);
        sagejs_fmpz_polynomial_clear(zdecoded);
        zbytes->data[0] = 0;
        if (!fmpz_poly_equal(zregiondecoded->value, zpower->value) ||
            !fmpq_poly_equal(qregiondecoded->value, qpower->value))
            return 21;
        if (!region_payload(zpayload, zbytes))
            return 11;
        sagejs_fmpz_polynomial_t rejected;
        if (sagejs_fmpz_polynomial_deserialize_packed(
                rejected, zpayload, (uint64_t) zbytes->length))
            return 12;
        sagejs_flint_byte_region_clear(qbytes);
        sagejs_flint_byte_region_clear(zbytes);
        sagejs_fmpq_polynomial_clear(qregiondecoded);
        sagejs_fmpz_polynomial_clear(zregiondecoded);
        sagejs_fmpq_value_clear(zqvalue);
        sagejs_fmpq_value_clear(qvalue);
        sagejs_fmpq_polynomial_clear(qzero);
        sagejs_fmpq_polynomial_clear(qunsealed);
        sagejs_fmpq_polynomial_xgcd_result_clear(qxgcd);
        sagejs_fmpq_polynomial_clear(qpower);
        sagejs_fmpq_polynomial_clear(qgcd);
        sagejs_fmpq_polynomial_clear(qquotient);
        sagejs_fmpq_polynomial_clear(qproduct);
        sagejs_fmpq_polynomial_clear(qsum);
        sagejs_fmpq_polynomial_clear(qtruncated);
        sagejs_fmpq_polynomial_clear(qscalar);
        sagejs_fmpq_polynomial_clear(q);
        fmpq_poly_clear(qproduct_before);
        fmpq_poly_clear(q_before);
        fmpq_poly_clear(qterm);
        fmpq_poly_clear(qidentity);
        sagejs_fmpz_polynomial_xgcd_result_clear(zxgcd);
        sagejs_fmpz_polynomial_clear(zpower);
        sagejs_fmpz_polynomial_clear(zunsealed);
        sagejs_fmpz_polynomial_clear(zgcd);
        sagejs_fmpz_polynomial_clear(zzero);
        sagejs_fmpz_polynomial_clear(zquotient);
        sagejs_fmpz_polynomial_clear(zproduct);
        sagejs_fmpz_polynomial_clear(zsum);
        sagejs_fmpz_polynomial_clear(ztruncated);
        sagejs_fmpz_polynomial_clear(zscalar);
        sagejs_fmpz_polynomial_clear(z);
        fmpz_poly_clear(zproduct_before);
        fmpz_poly_clear(z_before);
        fmpz_poly_clear(zterm);
        fmpz_poly_clear(zidentity);
    }
    fmpz_one(coefficient);
    fmpz_mul_2exp(coefficient, coefficient, 8192);
    sagejs_fmpz_polynomial_t skew_z;
    sagejs_fmpq_polynomial_t skew_q;
    if (!sagejs_fmpz_polynomial_init(skew_z, 20000) ||
        !sagejs_fmpz_polynomial_set_coefficient(skew_z, 19999, coefficient) ||
        !sagejs_fmpz_polynomial_seal(skew_z) ||
        sagejs_fmpz_polynomial_allocated_bytes(skew_z) >= 1024 * 1024)
        return 8;
    fmpz_set_ui(denominator, 3);
    if (!sagejs_fmpq_polynomial_init(skew_q, 20000) ||
        !sagejs_fmpq_polynomial_set_coefficient(
            skew_q, 19999, coefficient, denominator) ||
        !sagejs_fmpq_polynomial_seal(skew_q) ||
        sagejs_fmpq_polynomial_allocated_bytes(skew_q) >= 1024 * 1024)
        return 9;
    sagejs_fmpq_polynomial_clear(skew_q);
    sagejs_fmpz_polynomial_clear(skew_z);
    fmpz_clear(qpayload);
    fmpz_clear(zpayload);
    fmpz_clear(result);
    fmpz_clear(argument);
    fmpz_clear(denominator);
    fmpz_clear(coefficient);
    return 0;
}
`;

  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-poly-ffi-"));
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, source);
    const compiler = process.env.CC || "cc";
    const compile = spawnSync(compiler, [
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
  schema: "sagejs.ffi/exact-polynomial-resource-v1",
  status: "ok",
}) + "\n");
