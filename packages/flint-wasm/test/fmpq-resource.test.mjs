import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
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

function close(value, operation) {
  operation(value);
  operation(value);
}

function liveResources() {
  return flint.__sagejs_wasm_resource_live_count__();
}

test("runs a generated dense rational matrix resource slice", () => {
  assert.deepEqual(flint.__sagejs_ffi_manifest__.resources, [
    "fmpz_matrix",
    "fmpq_matrix",
    "fmpz_vector",
    "fmpq_vector",
    "nmod_matrix",
    "fmpq_value",
    "byte_region",
    "fmpz_mod_polynomial",
    "fmpz_mod_polynomial_division_result",
    "fmpz_mod_polynomial_xgcd_result",
    "fq_context",
    "fq_element",
    "fq_polynomial",
    "dirichlet_group",
  ]);
  assert.equal(liveResources(), 0n);

  const empty = flint.ffiFmpqMatrixCreate(1n, 1n);
  assert.equal(flint.ffiFmpqMatrixNrows(empty), 1n);
  assert.equal(flint.ffiFmpqMatrixNcols(empty), 1n);
  assert.equal(flint.ffiFmpqMatrixEntryIsZero(empty, 0n, 0n), true);
  assert.equal(
    flint.ffiFmpqMatrixSetEntry(empty, 0n, 0n, -22n, 7n),
    true,
  );
  assert.equal(flint.ffiFmpqMatrixEntryNumerator(empty, 0n, 0n), -22n);
  assert.equal(flint.ffiFmpqMatrixEntryDenominator(empty, 0n, 0n), 7n);
  close(empty, flint.ffiFmpqMatrixClose);

  const encoded = packedRationals([
    [1n, 2n],
    [1n, 3n],
    [2n, 1n],
    [-1n, 1n],
  ]);
  const input = flint.ffiFlintByteRegionFromBytes(encoded);
  const matrix = flint.ffiFmpqMatrixDeserialize(input, 2n, 2n);
  close(input, flint.ffiFlintByteRegionClose);
  assert.equal(liveResources(), 1n);

  const copy = flint.ffiFmpqMatrixCopy(matrix);
  const prefix = flint.ffiFmpqMatrixPrefixRows(matrix, 1n);
  assert.equal(flint.ffiFmpqMatrixNrows(prefix), 1n);
  assert.equal(flint.ffiFmpqMatrixNcols(prefix), 2n);
  assert.equal(flint.ffiFmpqMatrixEntryNumerator(prefix, 0n, 0n), 1n);
  assert.equal(flint.ffiFmpqMatrixEntryDenominator(prefix, 0n, 0n), 2n);
  assert.throws(
    () => flint.ffiFmpqMatrixPrefixRows(matrix, 3n),
    /row-prefix count is invalid/,
  );
  const squared = flint.ffiFmpqMatrixMul(matrix, copy);
  const reduced = flint.ffiFmpqMatrixRref(matrix);
  const determinant = flint.ffiFmpqMatrixDet(matrix);
  assert.equal(flint.ffiFmpqMatrixRank(reduced), 2n);
  assert.equal(flint.ffiFmpqValueNumerator(determinant), -7n);
  assert.equal(flint.ffiFmpqValueDenominator(determinant), 6n);

  const formatted = flint.ffiFmpqMatrixFormat(reduced);
  const formattedBytes = flint.ffiFlintByteRegionCopyBytes(formatted);
  close(formatted, flint.ffiFlintByteRegionClose);
  assert.equal(new TextDecoder().decode(formattedBytes), "[1 0]\n[0 1]");

  const serialized = flint.ffiFmpqMatrixSerialize(squared);
  const firstCopy = flint.ffiFlintByteRegionCopyBytes(serialized);
  close(serialized, flint.ffiFlintByteRegionClose);
  assert.deepEqual(
    firstCopy,
    packedRationals([
      [11n, 12n],
      [-1n, 6n],
      [-1n, 1n],
      [5n, 3n],
    ]),
  );

  // The copy is host-owned: closing its source and allocating more FLINT
  // resources cannot detach or mutate these bytes.
  const retainedCopy = firstCopy.slice();
  const later = flint.ffiFmpqMatrixCopy(reduced);
  close(later, flint.ffiFmpqMatrixClose);
  assert.deepEqual(firstCopy, retainedCopy);

  close(determinant, flint.ffiFmpqValueClose);
  close(reduced, flint.ffiFmpqMatrixClose);
  close(squared, flint.ffiFmpqMatrixClose);
  close(copy, flint.ffiFmpqMatrixClose);
  close(prefix, flint.ffiFmpqMatrixClose);
  close(matrix, flint.ffiFmpqMatrixClose);
  assert.equal(liveResources(), 0n);
});

test("generated finalizers release dense rational matrix resources", {
  skip: typeof globalThis.gc === "function"
    ? false
    : "the JavaScript host does not expose forced garbage collection",
}, async () => {
  (() => {
    const input = flint.ffiFlintByteRegionFromBytes(
      packedRationals([[3n, 5n]]),
    );
    flint.ffiFmpqMatrixDeserialize(input, 1n, 1n);
    flint.ffiFlintByteRegionClose(input);
  })();
  assert.equal(liveResources(), 1n);

  for (let attempt = 0; attempt < 50 && liveResources() !== 0n; attempt++) {
    globalThis.gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(liveResources(), 0n);
});
