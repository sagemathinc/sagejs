import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const flint = await instantiateFlintFactor(wasm);

function close(value, operation) {
  operation(value);
  operation(value);
}

function liveResources() {
  return flint.__sagejs_wasm_resource_live_count__();
}

test("runs a generated dense integer matrix resource slice", () => {
  assert.equal(liveResources(), 0n);
  assert.ok(flint.__sagejs_ffi_manifest__.resources.includes("fmpz_matrix"));

  const matrix = flint.ffiFmpzMatrixCreate(2n, 2n);
  flint.ffiFmpzMatrixSetEntry(matrix, 0n, 0n, 2n ** 100n + 17n);
  flint.ffiFmpzMatrixSetEntry(matrix, 0n, 1n, -3n);
  flint.ffiFmpzMatrixSetEntry(matrix, 1n, 0n, 5n);
  flint.ffiFmpzMatrixSetEntry(matrix, 1n, 1n, 7n);
  assert.equal(flint.ffiFmpzMatrixNrows(matrix), 2n);
  assert.equal(flint.ffiFmpzMatrixNcols(matrix), 2n);
  assert.equal(
    flint.ffiFmpzMatrixEntry(matrix, 0n, 0n),
    2n ** 100n + 17n,
  );

  const copy = flint.ffiFmpzMatrixCopy(matrix);
  const squared = flint.ffiFmpzMatrixMul(matrix, copy);
  assert.equal(
    flint.ffiFmpzMatrixEntry(squared, 0n, 0n),
    (2n ** 100n + 17n) ** 2n - 15n,
  );
  assert.equal(
    flint.ffiFmpzMatrixDet(matrix),
    7n * (2n ** 100n + 17n) + 15n,
  );

  const formatted = flint.ffiFmpzMatrixFormat(matrix);
  const formattedBytes = flint.ffiFlintByteRegionCopyBytes(formatted);
  close(formatted, flint.ffiFlintByteRegionClose);
  assert.match(new TextDecoder().decode(formattedBytes), /1267650600228229401496703205393/);

  const serialized = flint.ffiFmpzMatrixSerialize(squared);
  const stableBytes = flint.ffiFlintByteRegionCopyBytes(serialized);
  close(serialized, flint.ffiFlintByteRegionClose);
  const ingress = flint.ffiFlintByteRegionFromBytes(stableBytes);
  const restored = flint.ffiFmpzMatrixDeserialize(ingress);
  close(ingress, flint.ffiFlintByteRegionClose);
  assert.equal(
    flint.ffiFmpzMatrixEntry(restored, 0n, 0n),
    flint.ffiFmpzMatrixEntry(squared, 0n, 0n),
  );

  const malformed = stableBytes.slice();
  malformed[0] = 0;
  const malformedIngress = flint.ffiFlintByteRegionFromBytes(malformed);
  const beforeFailure = liveResources();
  assert.throws(
    () => flint.ffiFmpzMatrixDeserialize(malformedIngress),
    /invalid SJZM v1/,
  );
  assert.equal(liveResources(), beforeFailure);
  close(malformedIngress, flint.ffiFlintByteRegionClose);

  const incompatible = flint.ffiFmpzMatrixCreate(3n, 1n);
  const beforeMultiplyFailure = liveResources();
  assert.throws(
    () => flint.ffiFmpzMatrixMul(matrix, incompatible),
    /dimensions are incompatible/,
  );
  assert.equal(liveResources(), beforeMultiplyFailure);

  close(incompatible, flint.ffiFmpzMatrixClose);
  close(restored, flint.ffiFmpzMatrixClose);
  close(squared, flint.ffiFmpzMatrixClose);
  close(copy, flint.ffiFmpzMatrixClose);
  close(matrix, flint.ffiFmpzMatrixClose);
  assert.equal(liveResources(), 0n);
});

test("generated finalizers release dense integer matrix resources", {
  skip: typeof globalThis.gc === "function"
    ? false
    : "the JavaScript host does not expose forced garbage collection",
}, async () => {
  (() => {
    const temporary = flint.ffiFmpzMatrixCreate(8n, 8n);
    flint.ffiFmpzMatrixSetEntry(temporary, 0n, 0n, 2n ** 200n);
  })();
  assert.equal(liveResources(), 1n);

  for (let attempt = 0; attempt < 50 && liveResources() !== 0n; attempt++) {
    globalThis.gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(liveResources(), 0n);
});
