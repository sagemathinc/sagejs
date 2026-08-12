#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const generatedDirectory = resolve(root, "packages/flint/build/generated-ffi");
const manifest = require(resolve(generatedDirectory, "manifest.json"));
const flint = require(resolve(generatedDirectory, manifest.addon));

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(operation, rounds = 9) {
  for (let index = 0; index < 3; index += 1) operation();
  const samples = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  return median(samples);
}

function fmpzPolynomial(coefficients) {
  const resource = flint.ffiFmpzPolynomialCreate(BigInt(coefficients.length));
  coefficients.forEach((coefficient, index) => {
    flint.ffiFmpzPolynomialSetCoefficient(
      resource,
      BigInt(index),
      coefficient,
    );
  });
  flint.ffiFmpzPolynomialSeal(resource);
  return resource;
}

function fmpqPolynomial(coefficients) {
  const resource = flint.ffiFmpqPolynomialCreate(BigInt(coefficients.length));
  coefficients.forEach(([numerator, denominator], index) => {
    flint.ffiFmpqPolynomialSetCoefficient(
      resource,
      BigInt(index),
      numerator,
      denominator,
    );
  });
  flint.ffiFmpqPolynomialSeal(resource);
  return resource;
}

const integerOuter = fmpzPolynomial(Array.from(
  { length: 65 },
  (_, index) => BigInt((index * 17 + 3) % 101 - 50),
));
const integerInner = fmpzPolynomial(Array.from(
  { length: 9 },
  (_, index) => BigInt((index * 11 + 5) % 29 - 14),
));
const integerRight = fmpzPolynomial(Array.from(
  { length: 64 },
  (_, index) => BigInt((index * 31 + 7) % 103 - 51),
));
const rational = fmpqPolynomial(Array.from(
  { length: 1001 },
  (_, index) => [
    BigInt((index * 43 + 9) % 127 - 63),
    BigInt((index % 19) + 1),
  ],
));

const integerComposeMs = measure(() => {
  const result = flint.ffiFmpzPolynomialCompose(integerOuter, integerInner);
  flint.ffiFmpzPolynomialClose(result);
});
const integerResultantMs = measure(() => {
  flint.ffiFmpzPolynomialResultant(integerOuter, integerRight);
});
const rationalIntegralMs = measure(() => {
  const result = flint.ffiFmpqPolynomialIntegral(rational);
  flint.ffiFmpqPolynomialClose(result);
});

const modulus = 2305843009213693951n;
const primeOuter = BigUint64Array.from(
  { length: 257 },
  (_, index) => BigInt(index * 104729 + 17) % modulus,
);
const primeInner = BigUint64Array.from(
  { length: 9 },
  (_, index) => BigInt(index * 65537 + 3) % modulus,
);
const primeRight = BigUint64Array.from(
  { length: 256 },
  (_, index) => BigInt(index * 31337 + 11) % modulus,
);
const primeComposition = new BigUint64Array(2049);
const primeScalar = new BigUint64Array(1);
const primeComposeMs = measure(() => {
  flint.ffiNmodPolyCompose(
    primeComposition,
    primeOuter,
    primeInner,
    2049n,
    257n,
    9n,
    modulus,
  );
});
const primeResultantMs = measure(() => {
  flint.ffiNmodPolyResultant(
    primeScalar,
    primeOuter,
    primeRight,
    1n,
    257n,
    256n,
    modulus,
  );
});

flint.ffiFmpqPolynomialClose(rational);
flint.ffiFmpzPolynomialClose(integerRight);
flint.ffiFmpzPolynomialClose(integerInner);
flint.ffiFmpzPolynomialClose(integerOuter);

const measurements = {
  integerComposeDegree64By8Ms: integerComposeMs,
  integerResultantDegree64By63Ms: integerResultantMs,
  rationalIntegralDegree1000Ms: rationalIntegralMs,
  primeComposeDegree256By8Ms: primeComposeMs,
  primeResultantDegree256By255Ms: primeResultantMs,
};
for (const [name, milliseconds] of Object.entries(measurements)) {
  assert.ok(milliseconds < 1000, `${name} unexpectedly took ${milliseconds}ms`);
}

console.log(JSON.stringify({
  schema: "sagejs.benchmark/polynomial-structural-flint-v1",
  warmup: 3,
  samples: 9,
  modulus: modulus.toString(),
  measurements,
}));
