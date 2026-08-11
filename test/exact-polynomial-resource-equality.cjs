#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const generatedDirectory = join(root, "packages", "flint", "build", "generated-ffi");
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));

function integer(coefficients, seal = true) {
  const result = flint.ffiFmpzPolynomialCreate(BigInt(coefficients.length));
  for (let index = 0; index < coefficients.length; index += 1) {
    flint.ffiFmpzPolynomialSetCoefficient(result, BigInt(index), coefficients[index]);
  }
  if (seal) flint.ffiFmpzPolynomialSeal(result);
  return result;
}

function rational(coefficients, seal = true) {
  const result = flint.ffiFmpqPolynomialCreate(BigInt(coefficients.length));
  for (let index = 0; index < coefficients.length; index += 1) {
    flint.ffiFmpqPolynomialSetCoefficient(
      result,
      BigInt(index),
      coefficients[index][0],
      coefficients[index][1],
    );
  }
  if (seal) flint.ffiFmpqPolynomialSeal(result);
  return result;
}

{
  const left = integer([1n, -2n, 3n]);
  const same = integer([1n, -2n, 3n, 0n]);
  const other = integer([1n, -2n, 4n]);
  const builder = integer([1n], false);
  assert.equal(flint.ffiFmpzPolynomialEqual(left, same), 1n);
  assert.equal(flint.ffiFmpzPolynomialEqual(left, other), 0n);
  assert.throws(() => flint.ffiFmpzPolynomialEqual(left, builder), /sealed/);
  for (const value of [builder, other, same, left]) flint.ffiFmpzPolynomialClose(value);
}

{
  const left = rational([[1n, 2n], [-2n, 3n]]);
  const same = rational([[3n, 6n], [4n, -6n], [0n, 7n]]);
  const other = rational([[1n, 2n], [-2n, 5n]]);
  const builder = rational([[1n, 2n]], false);
  assert.equal(flint.ffiFmpqPolynomialEqual(left, same), 1n);
  assert.equal(flint.ffiFmpqPolynomialEqual(left, other), 0n);
  assert.throws(() => flint.ffiFmpqPolynomialEqual(builder, left), /sealed/);
  for (const value of [builder, other, same, left]) flint.ffiFmpqPolynomialClose(value);
}

console.log(JSON.stringify({
  schema: "sagejs.ffi/exact-polynomial-equality-v1",
  status: "ok",
}));
