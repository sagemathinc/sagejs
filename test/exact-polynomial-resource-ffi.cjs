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
  const product = flint.ffiFmpzPolynomialMul(left, right);
  const power = flint.ffiFmpzPolynomialPow(left, 12n);
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
    [0n, 1n, 2n].map((index) =>
      flint.ffiFmpzPolynomialCoefficient(product, index)),
    [-1n, 1n, 2n],
  );
  assert.equal(flint.ffiFmpzPolynomialLength(power), 13n);
  assert.equal(flint.ffiFmpzPolynomialCoefficient(power, 6n), 924n);
  assert.equal(flint.ffiFmpzPolynomialEvaluate(power, 2n), 531441n);
  const rationalValue = flint.ffiFmpzPolynomialEvaluateRational(left, 1n, 2n);
  assert.equal(flint.ffiFmpqValueNumerator(rationalValue), 3n);
  assert.equal(flint.ffiFmpqValueDenominator(rationalValue), 2n);
  assert.throws(
    () => flint.ffiFmpzPolynomialEvaluateRational(left, 1n, 0n),
    /invalid rational argument/,
  );
  const serialized = flint.ffiFmpzPolynomialSerialize(product);
  assert.deepEqual(decodePolynomial(bytes(serialized), false), [-1n, 1n, 2n]);
  assert.ok(accounted(product) > 0n);
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(rationalValue, flint.ffiFmpqValueClose);
  closeTwice(power, flint.ffiFmpzPolynomialClose);
  closeTwice(product, flint.ffiFmpzPolynomialClose);
  closeTwice(negated, flint.ffiFmpzPolynomialClose);
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
  const product = flint.ffiFmpqPolynomialMul(left, right);
  const power = flint.ffiFmpqPolynomialPow(left, 3n);
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
  assert.equal(flint.ffiFmpqPolynomialLength(product), 3n);
  assert.equal(flint.ffiFmpqPolynomialLength(power), 4n);
  const value = flint.ffiFmpqPolynomialEvaluate(left, 3n, 2n);
  assert.equal(flint.ffiFmpqValueNumerator(value), 1n);
  assert.equal(flint.ffiFmpqValueDenominator(value), 1n);
  const serialized = flint.ffiFmpqPolynomialSerialize(product);
  assert.deepEqual(
    decodePolynomial(bytes(serialized), true),
    [[-1n, 5n], [17n, 210n], [1n, 7n]],
  );
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  closeTwice(value, flint.ffiFmpqValueClose);
  closeTwice(power, flint.ffiFmpqPolynomialClose);
  closeTwice(product, flint.ffiFmpqPolynomialClose);
  closeTwice(negated, flint.ffiFmpqPolynomialClose);
  closeTwice(difference, flint.ffiFmpqPolynomialClose);
  closeTwice(sum, flint.ffiFmpqPolynomialClose);
  closeTwice(right, flint.ffiFmpqPolynomialClose);
  closeTwice(left, flint.ffiFmpqPolynomialClose);
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

  closeTwice(rationalValue, flint.ffiFmpqValueClose);
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  closeTwice(integerZeroPower, flint.ffiFmpzPolynomialClose);
  closeTwice(integerZero, flint.ffiFmpzPolynomialClose);
}

{
  const huge = (1n << 137n) + 17n;
  const integer = fmpzPolynomial([0n, -huge, 9n]);
  const integerBytes = flint.ffiFmpzPolynomialSerialize(integer);
  assert.deepEqual(
    decodePolynomial(bytes(integerBytes), false),
    [0n, -huge, 9n],
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
  closeTwice(rationalBytes, flint.ffiFlintByteRegionClose);
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  closeTwice(integerBytes, flint.ffiFlintByteRegionClose);
  closeTwice(integer, flint.ffiFmpzPolynomialClose);
}

{
  const unsealed = flint.ffiFmpzPolynomialCreate(1n);
  assert.throws(
    () => flint.ffiFmpzPolynomialCoefficient(unsealed, 0n),
    /out of bounds/,
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

  const rational = flint.ffiFmpqPolynomialCreate(1n);
  assert.throws(
    () => flint.ffiFmpqPolynomialSetCoefficient(rational, 0n, 1n, 0n),
    /invalid rational/,
  );
  closeTwice(rational, flint.ffiFmpqPolynomialClose);
  assert.throws(
    () => flint.ffiFmpqPolynomialLength(rational),
    /closed|invalid resource/i,
  );
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

if (process.platform !== "win32") {
  const source = String.raw`
#include <stdint.h>
#include <sagejs/exact_polynomial_ffi.h>

int main(void)
{
    fmpz_t coefficient, denominator, argument, result;
    fmpz_init(coefficient);
    fmpz_init(denominator);
    fmpz_init(argument);
    fmpz_init(result);
    for (slong round = 0; round < 300; round++)
    {
        sagejs_fmpz_polynomial_t z, zsum, zproduct, zpower;
        sagejs_fmpq_polynomial_t q, qsum, qproduct, qpower;
        sagejs_fmpq_value_t qvalue, zqvalue;
        sagejs_flint_byte_region_t zbytes, qbytes;
        if (!sagejs_fmpz_polynomial_init(z, 32) ||
            !sagejs_fmpq_polynomial_init(q, 32))
            return 2;
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
            !sagejs_fmpz_polynomial_add(zsum, z, z) ||
            !sagejs_fmpz_polynomial_mul(zproduct, z, zsum) ||
            !sagejs_fmpz_polynomial_pow(zpower, z, 3) ||
            !sagejs_fmpq_polynomial_add(qsum, q, q) ||
            !sagejs_fmpq_polynomial_mul(qproduct, q, qsum) ||
            !sagejs_fmpq_polynomial_pow(qpower, q, 3))
            return 5;
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
        if (sagejs_fmpz_polynomial_allocated_bytes(z) == 0 ||
            sagejs_fmpq_polynomial_allocated_bytes(q) == 0 ||
            sagejs_flint_byte_region_length(zbytes) < 16 ||
            sagejs_flint_byte_region_length(qbytes) < 16)
            return 7;
        sagejs_flint_byte_region_clear(qbytes);
        sagejs_flint_byte_region_clear(zbytes);
        sagejs_fmpq_value_clear(zqvalue);
        sagejs_fmpq_value_clear(qvalue);
        sagejs_fmpq_polynomial_clear(qpower);
        sagejs_fmpq_polynomial_clear(qproduct);
        sagejs_fmpq_polynomial_clear(qsum);
        sagejs_fmpq_polynomial_clear(q);
        sagejs_fmpz_polynomial_clear(zpower);
        sagejs_fmpz_polynomial_clear(zproduct);
        sagejs_fmpz_polynomial_clear(zsum);
        sagejs_fmpz_polynomial_clear(z);
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
