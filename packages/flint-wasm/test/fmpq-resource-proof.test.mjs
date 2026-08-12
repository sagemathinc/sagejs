import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const generatedBackend = await fs.readFile(
  new URL("../dist/ffi-resource-backend.mjs", import.meta.url),
  "utf8",
);
const generatedHostImplementation = generatedBackend.split(
  "\nexport const generatedWasmManifest",
)[0];
const flint = await instantiateFlintFactor(wasm);

function appendExactInteger(output, value, signed) {
  value = BigInt(value);
  if (!signed && value <= 0n) {
    throw new RangeError("a rational denominator must be positive");
  }
  const negative = value < 0n;
  let magnitude = negative ? -value : value;
  const bytes = [];
  while (magnitude !== 0n) {
    bytes.push(Number(magnitude & 255n));
    magnitude >>= 8n;
  }
  let header = bytes.length;
  if (negative) header += 0x80000000;
  output.push(
    header & 255,
    (header >>> 8) & 255,
    (header >>> 16) & 255,
    (header >>> 24) & 255,
    ...bytes,
  );
}

function packedRationals(entries) {
  const output = [];
  for (const [numerator, denominator] of entries) {
    appendExactInteger(output, numerator, true);
    appendExactInteger(output, denominator, false);
  }
  return Uint8Array.from(output);
}

function liveResources() {
  return flint.__sagejs_wasm_resource_live_count__();
}

function closeTwice(resource, operation) {
  operation(resource);
  operation(resource);
}

function entry(matrix, row, column) {
  return [
    flint.ffiFmpqMatrixEntryNumerator(matrix, BigInt(row), BigInt(column)),
    flint.ffiFmpqMatrixEntryDenominator(matrix, BigInt(row), BigInt(column)),
  ];
}

test("the production FmpqMatrix surface is generated and bounded", () => {
  const manifest = flint.__sagejs_ffi_manifest__;
  assert.match(manifest.declaration, /^flint@[a-f0-9]{64}$/);
  assert.ok(manifest.resources.includes("fmpq_matrix"));
  assert.ok(manifest.resources.includes("fmpq_value"));
  assert.ok(manifest.resources.includes("byte_region"));
  for (const operation of [
    "fmpq_matrix",
    "fmpq_matrix_nrows",
    "fmpq_matrix_ncols",
    "fmpq_matrix_set_entry",
    "fmpq_matrix_entry_numerator",
    "fmpq_matrix_entry_denominator",
    "fmpq_matrix_copy",
    "fmpq_matrix_mul",
    "fmpq_matrix_rref",
    "fmpq_matrix_rank",
    "fmpq_matrix_det",
    "fmpq_matrix_format",
    "fmpq_matrix_serialize",
    "fmpq_matrix_deserialize",
  ]) {
    assert.ok(manifest.functions.includes(operation), operation);
  }
  assert.match(generatedHostImplementation, /new FinalizationRegistry/);
  assert.match(generatedHostImplementation, /function copiedLastBytes/);
  assert.doesNotMatch(
    generatedHostImplementation,
    /fn\.id|fmpq_matrix_mul|ffiFmpqMatrixMul.*===/,
    "the generated host must not select handwritten operation branches",
  );
  assert.ok(
    wasm.byteLength <= 5_050_000,
    `FLINT Wasm payload grew to ${wasm.byteLength} bytes`,
  );
});

test("dense rational matrices remain FLINT resources across the full slice", () => {
  assert.equal(liveResources(), 0n);
  const encoded = packedRationals([
    [1n, 2n],
    [1n, 3n],
    [2n, 1n],
    [-1n, 1n],
  ]);
  const ingress = flint.ffiFlintByteRegionFromBytes(encoded);
  const matrix = flint.ffiFmpqMatrixDeserialize(ingress, 2n, 2n);
  closeTwice(ingress, flint.ffiFlintByteRegionClose);
  assert.equal(flint.ffiFmpqMatrixNrows(matrix), 2n);
  assert.equal(flint.ffiFmpqMatrixNcols(matrix), 2n);
  assert.equal(liveResources(), 1n);

  const copy = flint.ffiFmpqMatrixCopy(matrix);
  const huge = (1n << 137n) + 29n;
  assert.equal(flint.ffiFmpqMatrixSetEntry(matrix, 0n, 0n, huge, 21n), true);
  assert.deepEqual(entry(matrix, 0, 0), [huge, 21n]);
  assert.deepEqual(entry(copy, 0, 0), [1n, 2n]);
  assert.equal(flint.ffiFmpqMatrixSetEntry(matrix, 0n, 0n, 1n, 2n), true);

  const beforeRejectedWrites = entry(matrix, 0, 0);
  assert.throws(
    () => flint.ffiFmpqMatrixSetEntry(matrix, 0n, 0n, 7n, 0n),
    /invalid rational matrix entry/,
  );
  assert.throws(
    () => flint.ffiFmpqMatrixSetEntry(matrix, 9n, 0n, 7n, 3n),
    /invalid rational matrix entry/,
  );
  assert.deepEqual(entry(matrix, 0, 0), beforeRejectedWrites);

  const product = flint.ffiFmpqMatrixMul(matrix, copy);
  assert.deepEqual(entry(product, 0, 0), [11n, 12n]);
  assert.deepEqual(entry(product, 0, 1), [-1n, 6n]);
  assert.deepEqual(entry(product, 1, 0), [-1n, 1n]);
  assert.deepEqual(entry(product, 1, 1), [5n, 3n]);

  const reduced = flint.ffiFmpqMatrixRref(matrix);
  assert.equal(flint.ffiFmpqMatrixRank(reduced), 2n);
  assert.deepEqual(entry(reduced, 0, 0), [1n, 1n]);
  assert.equal(flint.ffiFmpqMatrixEntryIsZero(reduced, 0n, 1n), true);
  assert.equal(flint.ffiFmpqMatrixEntryIsZero(reduced, 1n, 0n), true);
  assert.deepEqual(entry(reduced, 1, 1), [1n, 1n]);

  const determinant = flint.ffiFmpqMatrixDet(matrix);
  assert.equal(flint.ffiFmpqValueNumerator(determinant), -7n);
  assert.equal(flint.ffiFmpqValueDenominator(determinant), 6n);

  const formatted = flint.ffiFmpqMatrixFormat(product);
  const formattedBytes = flint.ffiFlintByteRegionCopyBytes(formatted);
  closeTwice(formatted, flint.ffiFlintByteRegionClose);
  assert.equal(
    new TextDecoder().decode(formattedBytes),
    "[11/12  -1/6]\n[   -1   5/3]",
  );

  const serialized = flint.ffiFmpqMatrixSerialize(product);
  const serializedBytes = flint.ffiFlintByteRegionCopyBytes(serialized);
  closeTwice(serialized, flint.ffiFlintByteRegionClose);
  assert.deepEqual(serializedBytes, packedRationals([
    [11n, 12n],
    [-1n, 6n],
    [-1n, 1n],
    [5n, 3n],
  ]));
  const restoredIngress = flint.ffiFlintByteRegionFromBytes(serializedBytes);
  const restored = flint.ffiFmpqMatrixDeserialize(restoredIngress, 2n, 2n);
  closeTwice(restoredIngress, flint.ffiFlintByteRegionClose);
  assert.deepEqual(entry(restored, 1, 1), [5n, 3n]);

  // Host-owned copies survive source closure and later Wasm allocations.
  const retainedBytes = serializedBytes.slice();
  const later = flint.ffiFmpqMatrixCopy(restored);
  closeTwice(later, flint.ffiFmpqMatrixClose);
  assert.deepEqual(serializedBytes, retainedBytes);

  for (const value of [restored, reduced, product, copy, matrix]) {
    closeTwice(value, flint.ffiFmpqMatrixClose);
  }
  closeTwice(determinant, flint.ffiFmpqValueClose);
  assert.equal(liveResources(), 0n);
  assert.throws(
    () => flint.ffiFmpqMatrixNrows(matrix),
    /closed|invalid|stale/i,
  );
});

test("failed owned results are atomic and do not leak Wasm slots", () => {
  assert.equal(liveResources(), 0n);
  const left = flint.ffiFmpqMatrixCreate(2n, 2n);
  const incompatible = flint.ffiFmpqMatrixCreate(1n, 1n);
  const nonsquare = flint.ffiFmpqMatrixCreate(1n, 2n);
  const liveBeforeFailures = liveResources();
  assert.throws(
    () => flint.ffiFmpqMatrixMul(left, incompatible),
    /dimensions are incompatible/,
  );
  assert.equal(liveResources(), liveBeforeFailures);
  assert.throws(
    () => flint.ffiFmpqMatrixDet(nonsquare),
    /determinant requires a square rational matrix/,
  );
  assert.equal(liveResources(), liveBeforeFailures);

  const malformed = flint.ffiFlintByteRegionFromBytes(
    packedRationals([[1n, 2n]]).subarray(0, 4),
  );
  const liveWithMalformedInput = liveResources();
  assert.throws(
    () => flint.ffiFmpqMatrixDeserialize(malformed, 1n, 1n),
    /invalid packed rational matrix entries/,
  );
  assert.equal(liveResources(), liveWithMalformedInput);

  closeTwice(malformed, flint.ffiFlintByteRegionClose);
  closeTwice(nonsquare, flint.ffiFmpqMatrixClose);
  closeTwice(incompatible, flint.ffiFmpqMatrixClose);
  closeTwice(left, flint.ffiFmpqMatrixClose);
  assert.equal(liveResources(), 0n);
});

test("generated finalizers release an FmpqMatrix ownership graph", {
  skip: typeof globalThis.gc === "function"
    ? false
    : "the JavaScript host does not expose forced garbage collection",
}, async () => {
  (() => {
    const ingress = flint.ffiFlintByteRegionFromBytes(
      packedRationals([[3n, 5n]]),
    );
    const matrix = flint.ffiFmpqMatrixDeserialize(ingress, 1n, 1n);
    flint.ffiFmpqMatrixCopy(matrix);
    flint.ffiFmpqMatrixDet(matrix);
    flint.ffiFlintByteRegionClose(ingress);
  })();
  assert.equal(liveResources(), 3n);

  for (let attempt = 0; attempt < 50 && liveResources() !== 0n; attempt += 1) {
    globalThis.gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(liveResources(), 0n);
});
