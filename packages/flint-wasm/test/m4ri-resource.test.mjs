import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateM4ri } from "../m4ri.mjs";

const wasm = await fs.readFile(
  new URL("../dist/m4ri-resource.wasm", import.meta.url),
);
const m4ri = await instantiateM4ri(wasm);

function close(value, operation) {
  operation(value);
  operation(value);
}

function liveResources() {
  return m4ri.__sagejs_wasm_resource_live_count__();
}

test("runs the complete generated M4RI resource surface", () => {
  assert.match(m4ri.__sagejs_ffi_manifest__.declaration, /^m4ri@/);
  assert.equal(
    m4ri.__sagejs_ffi_manifest__.library,
    m4ri.__sagejs_ffi_manifest__.declaration,
  );
  assert.deepEqual(m4ri.__sagejs_ffi_manifest__.resources, [
    "matrix",
    "byte_region",
  ]);
  assert.equal(m4ri.ffiM4riAvailable(), true);
  assert.equal(liveResources(), 0n);

  const left = m4ri.ffiM4riMatrixCreate(2n, 2n);
  m4ri.ffiM4riMatrixSetEntry(left, 0n, 0n, 1n);
  m4ri.ffiM4riMatrixSetEntry(left, 0n, 1n, 1n);
  m4ri.ffiM4riMatrixSetEntry(left, 1n, 0n, 1n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(left, 1n, 1n), 0n);
  assert.equal(m4ri.ffiM4riMatrixNrows(left), 2n);
  assert.equal(m4ri.ffiM4riMatrixNcols(left), 2n);

  const copy = m4ri.ffiM4riMatrixCopy(left);
  const zero = m4ri.ffiM4riMatrixAdd(left, copy);
  const square = m4ri.ffiM4riMatrixMul(left, copy);
  const transpose = m4ri.ffiM4riMatrixTranspose(left);
  const reduced = m4ri.ffiM4riMatrixRref(left);
  const inverse = m4ri.ffiM4riMatrixInverse(left);
  const solved = m4ri.ffiM4riMatrixSolve(left, reduced);
  const kernel = m4ri.ffiM4riMatrixRightKernel(left);
  assert.equal(m4ri.ffiM4riMatrixEqual(left, copy), true);
  assert.equal(m4ri.ffiM4riMatrixEqual(left, transpose), true);
  assert.equal(m4ri.ffiM4riMatrixRank(left), 2n);
  assert.equal(m4ri.ffiM4riMatrixDeterminantCode(left), 1n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(zero, 0n, 0n), 0n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(square, 0n, 0n), 0n);
  assert.equal(m4ri.ffiM4riMatrixEqual(inverse, solved), true);
  assert.equal(m4ri.ffiM4riMatrixNrows(kernel), 0n);
  assert.equal(m4ri.ffiM4riMatrixNcols(kernel), 2n);

  const logical = m4ri.ffiM4riMatrixLogicalWords(left);
  const logicalBytes = m4ri.ffiM4riByteRegionCopyBytes(logical);
  assert.equal(logicalBytes.byteLength, 16);
  const fromLogical = m4ri.ffiM4riMatrixFromLogicalWords(logical, 2n, 2n);
  assert.equal(m4ri.ffiM4riMatrixEqual(left, fromLogical), true);

  const packed = m4ri.ffiM4riMatrixSagepackBytes(left);
  const packedBytes = m4ri.ffiM4riByteRegionCopyBytes(packed);
  assert.equal(packedBytes.byteLength, 4);
  const input = m4ri.ffiM4riByteRegionFromBytes(packedBytes);
  const fromPacked = m4ri.ffiM4riMatrixFromSagepackBytes(input, 2n, 2n);
  assert.equal(m4ri.ffiM4riMatrixEqual(left, fromPacked), true);

  const formatted = m4ri.ffiM4riMatrixFormat(left);
  assert.equal(
    new TextDecoder().decode(m4ri.ffiM4riByteRegionCopyBytes(formatted)),
    "[1 1]\n[1 0]",
  );

  for (const value of [formatted, input, packed, logical]) {
    close(value, m4ri.ffiM4riByteRegionClose);
  }
  for (const value of [
    fromPacked,
    fromLogical,
    kernel,
    solved,
    inverse,
    reduced,
    transpose,
    square,
    zero,
    copy,
    left,
  ]) {
    close(value, m4ri.ffiM4riMatrixClose);
  }
  assert.equal(liveResources(), 0n);
  assert.throws(
    () => m4ri.ffiM4riMatrixNrows(left),
    /closed|stale|invalid/i,
  );
});

test("generated finalizers release M4RI resources", {
  skip: typeof globalThis.gc === "function"
    ? false
    : "the JavaScript host does not expose forced garbage collection",
}, async () => {
  (() => {
    m4ri.ffiM4riMatrixCreate(513n, 513n);
  })();
  assert.equal(liveResources(), 1n);

  for (let attempt = 0; attempt < 40 && liveResources() !== 0n; attempt++) {
    globalThis.gc();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(liveResources(), 0n);
});

test("keeps resources branded to their particular Wasm instance", async () => {
  const other = await instantiateM4ri(wasm);
  const value = m4ri.ffiM4riMatrixCreate(1n, 1n);
  assert.throws(
    () => other.ffiM4riMatrixNrows(value),
    /invalid generated Wasm FFI resource/,
  );
  close(value, m4ri.ffiM4riMatrixClose);
  assert.equal(liveResources(), 0n);
  assert.equal(other.__sagejs_wasm_resource_live_count__(), 0n);
});
