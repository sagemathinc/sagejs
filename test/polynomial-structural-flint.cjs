#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || "packages/flint/.native/prefix",
);
const generatedDirectory = resolve(root, "packages/flint/build/generated-ffi");
const manifest = require(resolve(generatedDirectory, "manifest.json"));
const flint = require(resolve(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function fmpzPolynomial(coefficients) {
  const resource = flint.ffiFmpzPolynomialCreate(BigInt(coefficients.length));
  try {
    coefficients.forEach((coefficient, index) => {
      assert.equal(
        flint.ffiFmpzPolynomialSetCoefficient(
          resource,
          BigInt(index),
          BigInt(coefficient),
        ),
        true,
      );
    });
    assert.equal(flint.ffiFmpzPolynomialSeal(resource), true);
    return resource;
  } catch (error) {
    flint.ffiFmpzPolynomialClose(resource);
    throw error;
  }
}

function fmpqPolynomial(coefficients) {
  const resource = flint.ffiFmpqPolynomialCreate(BigInt(coefficients.length));
  try {
    coefficients.forEach(([numerator, denominator], index) => {
      assert.equal(
        flint.ffiFmpqPolynomialSetCoefficient(
          resource,
          BigInt(index),
          BigInt(numerator),
          BigInt(denominator),
        ),
        true,
      );
    });
    assert.equal(flint.ffiFmpqPolynomialSeal(resource), true);
    return resource;
  } catch (error) {
    flint.ffiFmpqPolynomialClose(resource);
    throw error;
  }
}

function fmpzCoefficients(resource) {
  const length = Number(flint.ffiFmpzPolynomialLength(resource));
  return Array.from({ length }, (_, index) =>
    flint.ffiFmpzPolynomialCoefficient(resource, BigInt(index))
  );
}

function fmpqCoefficients(resource) {
  const length = Number(flint.ffiFmpqPolynomialLength(resource));
  return Array.from({ length }, (_, index) => [
    flint.ffiFmpqPolynomialCoefficientNumerator(resource, BigInt(index)),
    flint.ffiFmpqPolynomialCoefficientDenominator(resource, BigInt(index)),
  ]);
}

function fmpqValue(resource) {
  return [
    flint.ffiFmpqValueNumerator(resource),
    flint.ffiFmpqValueDenominator(resource),
  ];
}

{
  const outer = fmpzPolynomial([5n, -2n, 0n, 1n]);
  const inner = fmpzPolynomial([1n, 1n, 1n]);
  const quadratic = fmpzPolynomial([3n, 2n, 1n]);
  const linear = fmpzPolynomial([2n, 1n]);
  const zero = fmpzPolynomial([]);
  const constant = fmpzPolynomial([7n]);
  const results = [
    flint.ffiFmpzPolynomialCompose(outer, inner),
    flint.ffiFmpzPolynomialReverse(quadratic, 6n),
    flint.ffiFmpzPolynomialShiftLeft(quadratic, 2n),
    flint.ffiFmpzPolynomialShiftRight(quadratic, 1n),
    flint.ffiFmpzPolynomialTruncate(quadratic, 2n),
  ];
  const integral = flint.ffiFmpzPolynomialIntegral(quadratic);
  assert.deepEqual(
    results.map(fmpzCoefficients),
    [
      [4n, 1n, 4n, 7n, 6n, 3n, 1n],
      [0n, 0n, 0n, 1n, 2n, 3n],
      [0n, 0n, 3n, 2n, 1n],
      [2n, 1n],
      [3n, 2n],
    ],
  );
  assert.deepEqual(fmpqCoefficients(integral), [
    [0n, 1n],
    [3n, 1n],
    [1n, 1n],
    [1n, 3n],
  ]);
  assert.equal(flint.ffiFmpzPolynomialResultant(quadratic, linear), 3n);
  assert.equal(flint.ffiFmpzPolynomialDiscriminant(quadratic), -8n);
  assert.equal(flint.ffiFmpzPolynomialResultant(zero, linear), 0n);
  assert.equal(flint.ffiFmpzPolynomialResultant(constant, linear), 7n);
  assert.equal(flint.ffiFmpzPolynomialResultant(constant, constant), 1n);
  assert.equal(flint.ffiFmpzPolynomialDiscriminant(zero), 0n);
  assert.equal(flint.ffiFmpzPolynomialDiscriminant(constant), 0n);
  closeTwice(integral, flint.ffiFmpqPolynomialClose);
  for (const result of results) closeTwice(result, flint.ffiFmpzPolynomialClose);
  for (const resource of [constant, zero, linear, quadratic, inner, outer]) {
    closeTwice(resource, flint.ffiFmpzPolynomialClose);
  }
}

{
  const outer = fmpqPolynomial([[1n, 2n], [1n, 1n]]);
  const inner = fmpqPolynomial([[1n, 3n], [1n, 1n]]);
  const quadratic = fmpqPolynomial([[3n, 1n], [2n, 1n], [1n, 1n]]);
  const linear = fmpqPolynomial([[2n, 1n], [1n, 1n]]);
  const zero = fmpqPolynomial([]);
  const constant = fmpqPolynomial([[7n, 3n]]);
  const results = [
    flint.ffiFmpqPolynomialCompose(outer, inner),
    flint.ffiFmpqPolynomialReverse(quadratic, 6n),
    flint.ffiFmpqPolynomialShiftLeft(quadratic, 2n),
    flint.ffiFmpqPolynomialShiftRight(quadratic, 1n),
    flint.ffiFmpqPolynomialTruncate(quadratic, 2n),
    flint.ffiFmpqPolynomialIntegral(quadratic),
  ];
  const resultant = flint.ffiFmpqPolynomialResultant(quadratic, linear);
  const discriminant = flint.ffiFmpqPolynomialDiscriminant(quadratic);
  const zeroResultant = flint.ffiFmpqPolynomialResultant(zero, linear);
  const constantResultant = flint.ffiFmpqPolynomialResultant(constant, linear);
  const constantConstantResultant = flint.ffiFmpqPolynomialResultant(
    constant,
    constant,
  );
  const zeroDiscriminant = flint.ffiFmpqPolynomialDiscriminant(zero);
  const constantDiscriminant = flint.ffiFmpqPolynomialDiscriminant(constant);
  assert.deepEqual(fmpqCoefficients(results[0]), [[5n, 6n], [1n, 1n]]);
  assert.deepEqual(fmpqCoefficients(results[1]), [
    [0n, 1n], [0n, 1n], [0n, 1n], [1n, 1n], [2n, 1n], [3n, 1n],
  ]);
  assert.deepEqual(fmpqCoefficients(results[2]), [
    [0n, 1n], [0n, 1n], [3n, 1n], [2n, 1n], [1n, 1n],
  ]);
  assert.deepEqual(fmpqCoefficients(results[3]), [[2n, 1n], [1n, 1n]]);
  assert.deepEqual(fmpqCoefficients(results[4]), [[3n, 1n], [2n, 1n]]);
  assert.deepEqual(fmpqCoefficients(results[5]), [
    [0n, 1n], [3n, 1n], [1n, 1n], [1n, 3n],
  ]);
  assert.deepEqual(fmpqValue(resultant), [3n, 1n]);
  assert.deepEqual(fmpqValue(discriminant), [-8n, 1n]);
  assert.deepEqual(fmpqValue(zeroResultant), [0n, 1n]);
  assert.deepEqual(fmpqValue(constantResultant), [7n, 3n]);
  assert.deepEqual(fmpqValue(constantConstantResultant), [1n, 1n]);
  assert.deepEqual(fmpqValue(zeroDiscriminant), [0n, 1n]);
  assert.deepEqual(fmpqValue(constantDiscriminant), [0n, 1n]);
  for (const scalar of [
    constantDiscriminant,
    zeroDiscriminant,
    constantConstantResultant,
    constantResultant,
    zeroResultant,
    discriminant,
    resultant,
  ]) {
    closeTwice(scalar, flint.ffiFmpqValueClose);
  }
  for (const result of results) closeTwice(result, flint.ffiFmpqPolynomialClose);
  for (const resource of [constant, zero, linear, quadratic, inner, outer]) {
    closeTwice(resource, flint.ffiFmpqPolynomialClose);
  }
}

{
  const p = 97n;
  const outer = BigUint64Array.from([5n, 95n, 0n, 1n]);
  const inner = BigUint64Array.from([1n, 1n, 1n]);
  const quadratic = BigUint64Array.from([3n, 2n, 1n]);
  const linear = BigUint64Array.from([2n, 1n]);
  const composition = new BigUint64Array(7);
  const reverse = new BigUint64Array(6);
  const leftShift = new BigUint64Array(5);
  const rightShift = new BigUint64Array(2);
  const truncated = new BigUint64Array(2);
  const integral = new BigUint64Array(4);
  const resultant = new BigUint64Array(1);
  const discriminant = new BigUint64Array(1);
  assert.equal(flint.ffiNmodPolyCompose(composition, outer, inner, 7n, 4n, 3n, p), true);
  assert.equal(flint.ffiNmodPolyReverse(reverse, quadratic, 6n, 3n, 6n, p), true);
  assert.equal(flint.ffiNmodPolyShiftLeft(leftShift, quadratic, 5n, 3n, 2n, p), true);
  assert.equal(flint.ffiNmodPolyShiftRight(rightShift, quadratic, 2n, 3n, 1n, p), true);
  assert.equal(flint.ffiNmodPolyTruncate(truncated, quadratic, 2n, 3n, 2n, p), true);
  assert.equal(flint.ffiNmodPolyIntegral(integral, quadratic, 4n, 3n, p), true);
  assert.equal(flint.ffiNmodPolyResultant(resultant, quadratic, linear, 1n, 3n, 2n, p), true);
  assert.equal(flint.ffiNmodPolyDiscriminant(discriminant, quadratic, 1n, 3n, p), true);
  assert.deepEqual(Array.from(composition), [4n, 1n, 4n, 7n, 6n, 3n, 1n]);
  assert.deepEqual(Array.from(reverse), [0n, 0n, 0n, 1n, 2n, 3n]);
  assert.deepEqual(Array.from(leftShift), [0n, 0n, 3n, 2n, 1n]);
  assert.deepEqual(Array.from(rightShift), [2n, 1n]);
  assert.deepEqual(Array.from(truncated), [3n, 2n]);
  assert.deepEqual(Array.from(integral), [0n, 3n, 1n, 65n]);
  assert.deepEqual(Array.from(resultant), [3n]);
  assert.deepEqual(Array.from(discriminant), [89n]);

  const zero = new BigUint64Array(0);
  const constant = BigUint64Array.from([7n]);
  const zeroResultant = new BigUint64Array(1);
  const constantResultant = new BigUint64Array(1);
  const constantConstantResultant = new BigUint64Array(1);
  const zeroDiscriminant = new BigUint64Array(1);
  const constantDiscriminant = new BigUint64Array(1);
  assert.equal(
    flint.ffiNmodPolyResultant(zeroResultant, zero, linear, 1n, 0n, 2n, p),
    true,
  );
  assert.equal(
    flint.ffiNmodPolyResultant(
      constantResultant,
      constant,
      linear,
      1n,
      1n,
      2n,
      p,
    ),
    true,
  );
  assert.equal(
    flint.ffiNmodPolyResultant(
      constantConstantResultant,
      constant,
      constant,
      1n,
      1n,
      1n,
      p,
    ),
    true,
  );
  assert.equal(
    flint.ffiNmodPolyDiscriminant(zeroDiscriminant, zero, 1n, 0n, p),
    true,
  );
  assert.equal(
    flint.ffiNmodPolyDiscriminant(
      constantDiscriminant,
      constant,
      1n,
      1n,
      p,
    ),
    true,
  );
  assert.deepEqual(Array.from(zeroResultant), [0n]);
  assert.deepEqual(Array.from(constantResultant), [7n]);
  assert.deepEqual(Array.from(constantConstantResultant), [1n]);
  assert.deepEqual(Array.from(zeroDiscriminant), [0n]);
  assert.deepEqual(Array.from(constantDiscriminant), [0n]);

  const degreeDrop = BigUint64Array.from([1n, 0n, 0n, 0n, 0n, 1n, 2n]);
  const degreeDropDiscriminant = new BigUint64Array(1);
  assert.equal(
    flint.ffiNmodPolyDiscriminant(
      degreeDropDiscriminant,
      degreeDrop,
      1n,
      7n,
      3n,
    ),
    true,
  );
  assert.deepEqual(Array.from(degreeDropDiscriminant), [2n]);
  const inseparableDiscriminant = new BigUint64Array(1);
  assert.equal(
    flint.ffiNmodPolyDiscriminant(
      inseparableDiscriminant,
      BigUint64Array.from([1n, 0n, 1n]),
      1n,
      3n,
      2n,
    ),
    true,
  );
  assert.deepEqual(Array.from(inseparableDiscriminant), [0n]);

  const rejected = BigUint64Array.from([71n, 72n, 73n]);
  assert.throws(
    () => flint.ffiNmodPolyIntegral(
      rejected,
      BigUint64Array.from([0n, 1n]),
      3n,
      2n,
      2n,
    ),
    /degree smaller than the characteristic/,
  );
  assert.deepEqual(Array.from(rejected), [71n, 72n, 73n]);
  assert.throws(
    () => flint.ffiNmodPolyCompose(
      rejected,
      outer,
      inner,
      3n,
      4n,
      3n,
      p,
    ),
    /invalid polynomial composition/,
  );
  assert.deepEqual(Array.from(rejected), [71n, 72n, 73n]);
}

function runKernel(source, environment) {
  const result = spawnSync(resolve(root, "bin", "sagejs"), ["--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, ...environment },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

const kernelWitness = String.raw`
from sagejs.ffi.flint import (
    fmpq_polynomial_coefficient_denominator,
    fmpq_polynomial_coefficient_numerator,
    fmpq_polynomial_length,
    fmpz_polynomial,
    fmpz_polynomial_coefficient,
    fmpz_polynomial_length,
    fmpz_polynomial_seal,
    fmpz_polynomial_set_coefficient,
    fmpq_value_denominator,
    fmpq_value_numerator,
)
from sagejs.kernels.polynomial import structural_flint as structural
from sagejs.native import is_compiled, uint64_buffer, uint64_zeros

def integer_polynomial(values):
    result = fmpz_polynomial(len(values))
    for index in range(len(values)):
        fmpz_polynomial_set_coefficient(result, index, values[index])
    fmpz_polynomial_seal(result)
    return result

outer = integer_polynomial([5, -2, 0, 1])
inner = integer_polynomial([1, 1, 1])
quadratic = integer_polynomial([3, 2, 1])
linear = integer_polynomial([2, 1])
composed = structural.flint_integer_polynomial_compose(outer, inner)
integral = structural.flint_integer_polynomial_integral(quadratic)
assert [fmpz_polynomial_coefficient(composed, i) for i in range(fmpz_polynomial_length(composed))] == [4, 1, 4, 7, 6, 3, 1]
assert [(fmpq_polynomial_coefficient_numerator(integral, i), fmpq_polynomial_coefficient_denominator(integral, i)) for i in range(fmpq_polynomial_length(integral))] == [(0, 1), (3, 1), (1, 1), (1, 3)]
assert structural.flint_integer_polynomial_resultant(quadratic, linear) == 3
assert structural.flint_integer_polynomial_discriminant(quadratic) == -8

p = 97
prime_outer = uint64_buffer([5, 95, 0, 1])
prime_inner = uint64_buffer([1, 1, 1])
prime_output = uint64_zeros(7)
assert structural.flint_prime_polynomial_compose(prime_output, prime_outer, prime_inner, 7, 4, 3, p)
assert list(prime_output) == [4, 1, 4, 7, 6, 3, 1]
prime_discriminant = uint64_zeros(1)
assert structural.flint_prime_polynomial_discriminant(prime_discriminant, uint64_buffer([3, 2, 1]), 1, 3, p)
assert list(prime_discriminant) == [89]

functions = [value for name, value in structural.__dict__.items() if name.startswith('flint_') and callable(value)]
print('compiled=' + str(all(is_compiled(function) for function in functions)))
print('STRUCTURAL_FLINT_OK')
`;

const native = runKernel(kernelWitness, { SAGEJS_NATIVE_REQUIRED: "1" });
assert.match(native, /compiled=True/);
assert.match(native, /STRUCTURAL_FLINT_OK/);
const dynamic = runKernel(kernelWitness, { SAGEJS_NATIVE_DISABLE: "1" });
assert.match(dynamic, /STRUCTURAL_FLINT_OK/);

if (process.platform !== "win32") {
  const source = String.raw`
#include <stdint.h>
#include <sagejs/exact_polynomial_ffi.h>
#include <sagejs/ffi_algorithms.h>

int main(void)
{
    fmpz_t coefficient, scalar;
    fmpz_init(coefficient);
    fmpz_init(scalar);
    for (int iteration = 0; iteration < 200; iteration++)
    {
        sagejs_fmpz_polynomial_t z, zinner, zcompose, zreverse;
        sagejs_fmpq_polynomial_t q, qintegral, zintegral;
        sagejs_fmpq_value_t qresultant, qdiscriminant;
        if (!sagejs_fmpz_polynomial_init(z, 3) ||
            !sagejs_fmpz_polynomial_init(zinner, 2) ||
            !sagejs_fmpq_polynomial_init(q, 3))
            return 1;
        for (uint64_t index = 0; index < 3; index++)
        {
            fmpz_set_ui(coefficient, index + 1);
            if (!sagejs_fmpz_polynomial_set_coefficient(z, index, coefficient) ||
                !sagejs_fmpq_polynomial_set_coefficient(
                    q, index, coefficient, coefficient))
                return 2;
        }
        fmpz_one(coefficient);
        if (!sagejs_fmpz_polynomial_set_coefficient(zinner, 0, coefficient) ||
            !sagejs_fmpz_polynomial_set_coefficient(zinner, 1, coefficient) ||
            !sagejs_fmpz_polynomial_seal(z) ||
            !sagejs_fmpz_polynomial_seal(zinner) ||
            !sagejs_fmpq_polynomial_seal(q))
            return 3;
        if (!sagejs_fmpz_polynomial_compose(zcompose, z, zinner) ||
            !sagejs_fmpz_polynomial_reverse(zreverse, z, 7) ||
            !sagejs_fmpq_polynomial_from_fmpz_integral(zintegral, z) ||
            !sagejs_fmpq_polynomial_integral(qintegral, q) ||
            !sagejs_fmpz_polynomial_resultant(scalar, z, zinner) ||
            !sagejs_fmpz_polynomial_discriminant(scalar, z) ||
            !sagejs_fmpq_polynomial_resultant(qresultant, q, q) ||
            !sagejs_fmpq_polynomial_discriminant(qdiscriminant, q))
            return 4;
        sagejs_fmpq_value_clear(qdiscriminant);
        sagejs_fmpq_value_clear(qresultant);
        sagejs_fmpq_polynomial_clear(qintegral);
        sagejs_fmpq_polynomial_clear(zintegral);
        sagejs_fmpz_polynomial_clear(zreverse);
        sagejs_fmpz_polynomial_clear(zcompose);
        sagejs_fmpq_polynomial_clear(q);
        sagejs_fmpz_polynomial_clear(zinner);
        sagejs_fmpz_polynomial_clear(z);

        uint64_t outer[3] = {3, 2, 1};
        uint64_t inner[2] = {1, 1};
        uint64_t composition[3], reversed[5], integral[4], output[1];
        if (!sagejs_flint_nmod_poly_compose_packed(
                composition, outer, inner, 3, 3, 2, 97) ||
            !sagejs_flint_nmod_poly_reverse_packed(
                reversed, outer, 5, 3, 5, 97) ||
            !sagejs_flint_nmod_poly_integral_packed(
                integral, outer, 4, 3, 97) ||
            !sagejs_flint_nmod_poly_resultant_packed(
                output, outer, inner, 1, 3, 2, 97) ||
            !sagejs_flint_nmod_poly_discriminant_packed(
                output, outer, 1, 3, 97))
            return 5;
    }
    fmpz_clear(scalar);
    fmpz_clear(coefficient);
    return 0;
}
`;
  const temporary = mkdtempSync(resolve(tmpdir(), "sagejs-structural-flint-"));
  try {
    const sourcePath = resolve(temporary, "lifecycle.c");
    const executable = resolve(temporary, "lifecycle");
    writeFileSync(sourcePath, source);
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined",
      `-I${resolve(root, "packages/flint/include")}`,
      `-I${resolve(flintPrefix, "include")}`,
      sourcePath,
      `-L${resolve(flintPrefix, "lib")}`,
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
      encoding: "utf8",
      env: {
        ...process.env,
        ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
        UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
      },
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

console.log(JSON.stringify({
  schema: "sagejs.polynomial/structural-flint-v1",
  status: "ok",
  operations: 24,
}));
