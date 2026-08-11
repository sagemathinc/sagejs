#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));

function integerPolynomial(length, coefficient) {
  const result = flint.ffiFmpzPolynomialCreate(BigInt(length));
  try {
    for (let index = 0; index < length; index += 1) {
      flint.ffiFmpzPolynomialSetCoefficient(
        result, BigInt(index), coefficient(index),
      );
    }
    flint.ffiFmpzPolynomialSeal(result);
    return result;
  } catch (error) {
    flint.ffiFmpzPolynomialClose(result);
    throw error;
  }
}

function rationalPolynomial(length, coefficient) {
  const result = flint.ffiFmpqPolynomialCreate(BigInt(length));
  try {
    for (let index = 0; index < length; index += 1) {
      const [numerator, denominator] = coefficient(index);
      flint.ffiFmpqPolynomialSetCoefficient(
        result, BigInt(index), numerator, denominator,
      );
    }
    flint.ffiFmpqPolynomialSeal(result);
    return result;
  } catch (error) {
    flint.ffiFmpqPolynomialClose(result);
    throw error;
  }
}

function median(samples) {
  return [...samples].sort((left, right) => left - right)[
    Math.floor(samples.length / 2)
  ];
}

function measure(divide, close, equal, dividend, divisor, expected) {
  const samples = [];
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const started = process.hrtime.bigint();
    const quotient = divide(dividend, divisor);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(equal(quotient, expected), 1n);
    close(quotient);
    if (iteration !== 0) samples.push(elapsed);
  }
  return median(samples);
}

const divisorLength = 1_001;
const quotientLength = 4_001;

const zDivisor = integerPolynomial(
  divisorLength,
  (index) => BigInt((index * 17 + 5) % 31 - 15),
);
const zExpected = integerPolynomial(
  quotientLength,
  (index) => BigInt((index * 29 + 11) % 43 - 21),
);
const zDividend = flint.ffiFmpzPolynomialMul(zExpected, zDivisor);

const qDivisor = rationalPolynomial(
  divisorLength,
  (index) => [
    BigInt((index * 19 + 7) % 37 - 18),
    BigInt(index % 11 + 1),
  ],
);
const qExpected = rationalPolynomial(
  quotientLength,
  (index) => [
    BigInt((index * 23 + 13) % 47 - 23),
    BigInt(index % 13 + 1),
  ],
);
const qDividend = flint.ffiFmpqPolynomialMul(qExpected, qDivisor);

try {
  const integerMs = measure(
    flint.ffiFmpzPolynomialDivExact,
    flint.ffiFmpzPolynomialClose,
    flint.ffiFmpzPolynomialEqual,
    zDividend,
    zDivisor,
    zExpected,
  );
  const rationalMs = measure(
    flint.ffiFmpqPolynomialDivExact,
    flint.ffiFmpqPolynomialClose,
    flint.ffiFmpqPolynomialEqual,
    qDividend,
    qDivisor,
    qExpected,
  );
  assert.ok(integerMs < 100, `ZZ direct division took ${integerMs} ms`);
  assert.ok(rationalMs < 100, `QQ direct division took ${rationalMs} ms`);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.benchmark/exact-polynomial-resource-division-v1",
    dividend_degree: divisorLength + quotientLength - 2,
    divisor_degree: divisorLength - 1,
    integer_ms: integerMs,
    rational_ms: rationalMs,
  }, null, 2)}\n`);
} finally {
  flint.ffiFmpqPolynomialClose(qDividend);
  flint.ffiFmpqPolynomialClose(qExpected);
  flint.ffiFmpqPolynomialClose(qDivisor);
  flint.ffiFmpzPolynomialClose(zDividend);
  flint.ffiFmpzPolynomialClose(zExpected);
  flint.ffiFmpzPolynomialClose(zDivisor);
}
