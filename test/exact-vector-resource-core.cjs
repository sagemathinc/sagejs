#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const generatedDirectory = join(
  root,
  "packages",
  "flint",
  "build",
  "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

function integerBytes(value, denominator = false) {
  value = BigInt(value);
  assert.ok(!denominator || value > 0n);
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  const bytes = [];
  while (magnitude !== 0n) {
    bytes.push(Number(magnitude & 255n));
    magnitude >>= 8n;
  }
  assert.ok(bytes.length <= 0x7fffffff);
  let header = bytes.length;
  if (negative) header += 0x80000000;
  return [
    header & 255,
    (header >>> 8) & 255,
    (header >>> 16) & 255,
    (header >>> 24) & 255,
    ...bytes,
  ];
}

function integerStream(values) {
  return Uint8Array.from(values.flatMap((value) => integerBytes(value)));
}

function rationalStream(values) {
  return Uint8Array.from(values.flatMap(([numerator, denominator]) => [
    ...integerBytes(numerator),
    ...integerBytes(denominator, true),
  ]));
}

function canonicalFraction(numerator, denominator) {
  numerator = BigInt(numerator);
  denominator = BigInt(denominator);
  assert.notEqual(denominator, 0n);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let left = numerator < 0n ? -numerator : numerator;
  let right = denominator;
  while (right !== 0n) [left, right] = [right, left % right];
  return [numerator / left, denominator / left];
}

function addFraction(left, right) {
  return canonicalFraction(
    left[0] * right[1] + right[0] * left[1],
    left[1] * right[1],
  );
}

function multiplyFraction(left, right) {
  return canonicalFraction(left[0] * right[0], left[1] * right[1]);
}

function scaleFraction(value, numerator, denominator) {
  return canonicalFraction(
    value[0] * BigInt(numerator),
    value[1] * BigInt(denominator),
  );
}

function region(bytes) {
  return flint.ffiFlintByteRegionFromBytes(bytes);
}

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function integerEntries(vector) {
  const length = Number(flint.ffiFmpzVectorLength(vector));
  return Array.from({ length }, (_, index) =>
    flint.ffiFmpzVectorEntry(vector, BigInt(index)));
}

function rationalEntries(vector) {
  const length = Number(flint.ffiFmpqVectorLength(vector));
  return Array.from({ length }, (_, index) => [
    flint.ffiFmpqVectorEntryNumerator(vector, BigInt(index)),
    flint.ffiFmpqVectorEntryDenominator(vector, BigInt(index)),
  ]);
}

{
  const huge = (1n << 521n) + 17n;
  const otherHuge = (1n << 337n) + 9n;
  const leftValues = [huge, -13n, 0n, 17n];
  const rightValues = [3n, 5n, -7n, otherHuge];
  const leftBytes = integerStream(leftValues);
  const rightBytes = integerStream(rightValues);
  const leftRegion = region(leftBytes);
  const rightRegion = region(rightBytes);
  const left = flint.ffiFmpzVectorFromByteRegion(leftRegion, 4n);
  const right = flint.ffiFmpzVectorFromByteRegion(rightRegion, 4n);
  const resources = [];
  try {
    assert.deepEqual(integerEntries(left), leftValues);
    assert.deepEqual(integerEntries(right), rightValues);
    assert.ok(accounted(left) > 0n);
    assert.equal(flint.ffiFmpzVectorEqual(left, right), false);

    const copy = flint.ffiFmpzVectorCopy(left);
    const sum = flint.ffiFmpzVectorAdd(left, right);
    const difference = flint.ffiFmpzVectorSub(sum, right);
    const scaled = flint.ffiFmpzVectorScalarMul(left, -11n);
    const serialized = flint.ffiFmpzVectorSerialize(left);
    resources.push(copy, sum, difference, scaled, serialized);
    assert.deepEqual(integerEntries(copy), leftValues);
    assert.deepEqual(integerEntries(sum), leftValues.map(
      (value, index) => value + rightValues[index],
    ));
    assert.deepEqual(integerEntries(difference), leftValues);
    assert.deepEqual(integerEntries(scaled), leftValues.map(
      (value) => -11n * value,
    ));
    assert.equal(
      flint.ffiFmpzVectorDot(left, right),
      leftValues.reduce(
        (total, value, index) => total + value * rightValues[index],
        0n,
      ),
    );
    assert.deepEqual(
      Array.from(flint.ffiFlintByteRegionCopyBytes(serialized)),
      Array.from(leftBytes),
    );

    assert.equal(flint.ffiFmpzVectorSetEntry(copy, 1n, huge), true);
    assert.equal(flint.ffiFmpzVectorEntry(copy, 1n), huge);
    assert.equal(flint.ffiFmpzVectorEntry(left, 1n), -13n);
    assert.throws(
      () => flint.ffiFmpzVectorEntry(left, 4n),
      /integer vector index is out of range/,
    );
    assert.throws(
      () => flint.ffiFmpzVectorSetEntry(left, 4n, 1n),
      /integer vector index is out of range/,
    );
  } finally {
    closeTwice(resources[4], flint.ffiFlintByteRegionClose);
    for (const resource of resources.slice(0, 4).reverse()) {
      closeTwice(resource, flint.ffiFmpzVectorClose);
    }
    closeTwice(right, flint.ffiFmpzVectorClose);
    closeTwice(left, flint.ffiFmpzVectorClose);
    closeTwice(rightRegion, flint.ffiFlintByteRegionClose);
    closeTwice(leftRegion, flint.ffiFlintByteRegionClose);
  }
}

{
  const leftValues = [[1n, 2n], [-3n, 5n], [7n, 11n]];
  const rightValues = [[-2n, 3n], [5n, 7n], [13n, 17n]];
  const leftBytes = rationalStream(leftValues);
  const leftRegion = region(leftBytes);
  const rightRegion = region(rationalStream(rightValues));
  const left = flint.ffiFmpqVectorFromByteRegion(leftRegion, 3n);
  const right = flint.ffiFmpqVectorFromByteRegion(rightRegion, 3n);
  const resources = [];
  try {
    assert.deepEqual(rationalEntries(left), leftValues);
    const copy = flint.ffiFmpqVectorCopy(left);
    const sum = flint.ffiFmpqVectorAdd(left, right);
    const difference = flint.ffiFmpqVectorSub(sum, right);
    const scaled = flint.ffiFmpqVectorScalarMul(left, -5n, 7n);
    const serialized = flint.ffiFmpqVectorSerialize(left);
    const dot = flint.ffiFmpqVectorDot(left, right);
    resources.push(copy, sum, difference, scaled, serialized, dot);
    assert.deepEqual(rationalEntries(copy), leftValues);
    assert.deepEqual(rationalEntries(sum), leftValues.map(
      (value, index) => addFraction(value, rightValues[index]),
    ));
    assert.deepEqual(rationalEntries(difference), leftValues);
    assert.deepEqual(rationalEntries(scaled), leftValues.map(
      (value) => scaleFraction(value, -5n, 7n),
    ));
    const expectedDot = leftValues.reduce(
      (total, value, index) =>
        addFraction(total, multiplyFraction(value, rightValues[index])),
      [0n, 1n],
    );
    assert.deepEqual([
      flint.ffiFmpqValueNumerator(dot),
      flint.ffiFmpqValueDenominator(dot),
    ], expectedDot);
    assert.deepEqual(
      Array.from(flint.ffiFlintByteRegionCopyBytes(serialized)),
      Array.from(leftBytes),
    );
    assert.equal(flint.ffiFmpqVectorSetEntry(copy, 1n, 6n, -8n), true);
    assert.deepEqual(rationalEntries(copy)[1], [-3n, 4n]);
    const entriesBeforeFailures = rationalEntries(copy);
    assert.throws(
      () => flint.ffiFmpqVectorSetEntry(copy, 0n, 1n, 0n),
      /invalid rational vector entry/,
    );
    assert.deepEqual(rationalEntries(copy), entriesBeforeFailures);
    assert.throws(
      () => flint.ffiFmpqVectorSetEntry(copy, 3n, 1n, 2n),
      /invalid rational vector entry/,
    );
    assert.deepEqual(rationalEntries(copy), entriesBeforeFailures);
    assert.throws(
      () => flint.ffiFmpqVectorEntryNumerator(copy, 3n),
      /rational vector index is out of range/,
    );
  } finally {
    closeTwice(resources[5], flint.ffiFmpqValueClose);
    closeTwice(resources[4], flint.ffiFlintByteRegionClose);
    for (const resource of resources.slice(0, 4).reverse()) {
      closeTwice(resource, flint.ffiFmpqVectorClose);
    }
    closeTwice(right, flint.ffiFmpqVectorClose);
    closeTwice(left, flint.ffiFmpqVectorClose);
    closeTwice(rightRegion, flint.ffiFlintByteRegionClose);
    closeTwice(leftRegion, flint.ffiFlintByteRegionClose);
  }
}

{
  const emptyRegion = region(new Uint8Array());
  const malformed = region(new Uint8Array([1, 0, 0, 0]));
  const oneRegion = region(integerStream([1n]));
  const one = flint.ffiFmpzVectorFromByteRegion(oneRegion, 1n);
  const empty = flint.ffiFmpzVectorFromByteRegion(emptyRegion, 0n);
  try {
    assert.equal(flint.ffiFmpzVectorDot(empty, empty), 0n);
    assert.throws(
      () => flint.ffiFmpzVectorFromByteRegion(malformed, 1n),
      /invalid canonical integer vector entry stream/,
    );
    assert.throws(
      () => flint.ffiFmpzVectorAdd(one, empty),
      /integer vector lengths are incompatible/,
    );
    assert.throws(
      () => flint.ffiFmpzVectorDot(one, empty),
      /integer vector lengths are incompatible/,
    );
    assert.throws(
      () => flint.ffiFmpqVectorLength(one),
      /expected declared FmpqVector resource/,
    );
    const before = accounted(malformed);
    for (let round = 0; round < 200; round += 1) {
      assert.throws(
        () => flint.ffiFmpzVectorFromByteRegion(malformed, 1n),
        /invalid canonical integer vector entry stream/,
      );
    }
    assert.equal(accounted(malformed), before);
  } finally {
    closeTwice(empty, flint.ffiFmpzVectorClose);
    closeTwice(one, flint.ffiFmpzVectorClose);
    closeTwice(oneRegion, flint.ffiFlintByteRegionClose);
    closeTwice(malformed, flint.ffiFlintByteRegionClose);
    closeTwice(emptyRegion, flint.ffiFlintByteRegionClose);
  }
  assert.throws(() => flint.ffiFmpzVectorLength(one), /closed/);
}

if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/exact-vector-resource-core-v1",
    dynamic: true,
    sanitizers: false,
    reason: "ASan/UBSan C lifecycle witnesses are a Unix capability",
  }) + "\n");
  process.exit(0);
}

const sanitizerSource = String.raw`
#include <stdint.h>
#include <sagejs/exact_vector_ffi.h>

int main(void)
{
    const unsigned char integer_data[15] = {
        1, 0, 0, 0, 1,
        1, 0, 0, 128, 2,
        1, 0, 0, 0, 3
    };
    const unsigned char rational_data[30] = {
        1, 0, 0, 0, 1, 1, 0, 0, 0, 2,
        1, 0, 0, 128, 3, 1, 0, 0, 0, 5,
        1, 0, 0, 0, 7, 1, 0, 0, 0, 11
    };
    sagejs_flint_byte_region_t integer_region, rational_region, empty_region;
    fmpz_t integer_scalar, integer_dot, numerator, denominator;
    if (!sagejs_flint_byte_region_init_copy(
            integer_region, integer_data, sizeof(integer_data)) ||
        !sagejs_flint_byte_region_init_copy(
            rational_region, rational_data, sizeof(rational_data)) ||
        !sagejs_flint_byte_region_init_copy(empty_region, NULL, 0))
        return 1;
    fmpz_init(integer_scalar);
    fmpz_init(integer_dot);
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpz_set_si(integer_scalar, -7);
    fmpz_set_si(numerator, -5);
    fmpz_set_ui(denominator, 7);

    for (uint64_t round = 0; round < 500; round++)
    {
        sagejs_fmpz_vector_t z, zcopy, zsum, zdifference, zscaled;
        sagejs_fmpz_vector_t zempty, zfailed;
        sagejs_fmpq_vector_t q, qcopy, qsum, qdifference, qscaled;
        sagejs_fmpq_vector_t qempty, qfailed;
        sagejs_flint_byte_region_t zbytes, qbytes;
        sagejs_fmpq_value_t qdot;
        if (!sagejs_fmpz_vector_from_byte_region(z, integer_region, 3) ||
            !sagejs_fmpq_vector_from_byte_region(q, rational_region, 3) ||
            !sagejs_fmpz_vector_from_byte_region(zempty, empty_region, 0) ||
            !sagejs_fmpq_vector_from_byte_region(qempty, empty_region, 0) ||
            !sagejs_fmpz_vector_init_set(zcopy, z) ||
            !sagejs_fmpq_vector_init_set(qcopy, q) ||
            !sagejs_fmpz_vector_add(zsum, z, zcopy) ||
            !sagejs_fmpq_vector_add(qsum, q, qcopy) ||
            !sagejs_fmpz_vector_sub(zdifference, zsum, zcopy) ||
            !sagejs_fmpq_vector_sub(qdifference, qsum, qcopy) ||
            !sagejs_fmpz_vector_scalar_mul(zscaled, z, integer_scalar) ||
            !sagejs_fmpq_vector_scalar_mul(
                qscaled, q, numerator, denominator) ||
            !sagejs_fmpz_vector_dot(integer_dot, z, zcopy) ||
            !sagejs_fmpq_vector_dot(qdot, q, qcopy) ||
            !sagejs_fmpz_vector_serialize(zbytes, z) ||
            !sagejs_fmpq_vector_serialize(qbytes, q))
            return 2;
        if (sagejs_fmpz_vector_length(z) != 3 ||
            sagejs_fmpq_vector_length(q) != 3 ||
            sagejs_fmpz_vector_allocated_bytes(z) !=
                sizeof(sagejs_fmpz_vector_struct) + 3 * sizeof(fmpz) ||
            !sagejs_fmpz_vector_equal(z, zdifference) ||
            !sagejs_fmpq_vector_equal(q, qdifference) ||
            !fmpz_equal_ui(integer_dot, 14) ||
            zbytes->length != sizeof(integer_data) ||
            qbytes->length != sizeof(rational_data))
            return 3;

        /* Failed outputs remain uninitialized and therefore require no clear. */
        if (sagejs_fmpz_vector_from_byte_region(
                zfailed, integer_region, 4) ||
            sagejs_fmpq_vector_from_byte_region(
                qfailed, rational_region, 4) ||
            sagejs_fmpz_vector_add(zfailed, z, zempty) ||
            sagejs_fmpq_vector_add(qfailed, q, qempty))
            return 5;
        fmpz_zero(denominator);
        if (sagejs_fmpq_vector_scalar_mul(qfailed, q, numerator, denominator))
            return 6;
        fmpz_set_ui(denominator, 7);

        sagejs_fmpq_vector_clear(qempty);
        sagejs_fmpz_vector_clear(zempty);
        sagejs_flint_byte_region_clear(qbytes);
        sagejs_flint_byte_region_clear(zbytes);
        sagejs_fmpq_value_clear(qdot);
        sagejs_fmpq_vector_clear(qscaled);
        sagejs_fmpz_vector_clear(zscaled);
        sagejs_fmpq_vector_clear(qdifference);
        sagejs_fmpz_vector_clear(zdifference);
        sagejs_fmpq_vector_clear(qsum);
        sagejs_fmpz_vector_clear(zsum);
        sagejs_fmpq_vector_clear(qcopy);
        sagejs_fmpz_vector_clear(zcopy);
        sagejs_fmpq_vector_clear(q);
        sagejs_fmpz_vector_clear(z);
    }

    fmpz_clear(denominator);
    fmpz_clear(numerator);
    fmpz_clear(integer_dot);
    fmpz_clear(integer_scalar);
    sagejs_flint_byte_region_clear(empty_region);
    sagejs_flint_byte_region_clear(rational_region);
    sagejs_flint_byte_region_clear(integer_region);
    return 0;
}
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: options.env || process.env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-vector-resource-"));
try {
  const sourcePath = join(temporary, "lifecycle.c");
  const executable = join(temporary, "lifecycle");
  writeFileSync(sourcePath, sanitizerSource);
  run(process.env.CC || "cc", [
    "-std=c11",
    "-O1",
    "-g",
    "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(flintPrefix, "include")}`,
    sourcePath,
    `-L${join(flintPrefix, "lib")}`,
    "-lflint",
    "-lopenblas",
    "-lmpfr",
    "-lgmp",
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ]);
  run(executable, [], {
    env: sanitizerEnvironment({ strictStringChecks: true }),
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(JSON.stringify({
  schema: "sagejs.ffi/exact-vector-resource-core-v1",
  dynamic: true,
  sanitizers: true,
  sanitizerRounds: 500,
}) + "\n");
