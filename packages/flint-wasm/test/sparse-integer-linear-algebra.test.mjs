import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateFlintFactor } from "../index.mjs";
import { createSage } from "../node-kernel.mjs";
import {
  assertPublicSparseIntegerReceipt,
  expectedStdout,
  publicSource,
  routeId,
} from "./sparse-integer-linear-algebra-support.mjs";

const wasm = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);

function close(flint, value) {
  flint.ffiFmpzMatrixClose(value);
  flint.ffiFmpzMatrixClose(value);
}

function matrix(flint, rows, columns, entries) {
  const result = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  for (let index = 0; index < entries.length; index += 1) {
    const value = BigInt(entries[index]);
    if (value !== 0n) {
      flint.ffiFmpzMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        value,
      );
    }
  }
  return result;
}

function entries(flint, value) {
  const rows = Number(flint.ffiFmpzMatrixNrows(value));
  const columns = Number(flint.ffiFmpzMatrixNcols(value));
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      value,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    )
  );
}

test("direct FLINT Wasm computes the canonical sparse integer right kernel", async () => {
  const traces = [];
  const flint = await instantiateFlintFactor(wasm, {
    recordCapability: (...record) => traces.push(record),
  });
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
  assert.ok(flint.__sagejs_ffi_manifest__.functions.includes(
    "fmpz_matrix_right_kernel",
  ));

  const source = matrix(flint, 3, 5, [
    1, 2, 0, 0, 1,
    0, 1, 1, 0, 1,
    0, 0, 1, 1, 1,
  ]);
  const kernel = flint.ffiFmpzMatrixRightKernel(source);
  assert.deepEqual(
    [flint.ffiFmpzMatrixNrows(kernel), flint.ffiFmpzMatrixNcols(kernel)],
    [2n, 5n],
  );
  assert.deepEqual(entries(flint, kernel), [
    1n, 0n, 1n, 0n, -1n,
    0n, 1n, 1n, 1n, -2n,
  ]);

  const transpose = flint.ffiFmpzMatrixTranspose(kernel);
  const product = flint.ffiFmpzMatrixMul(source, transpose);
  assert.deepEqual(entries(flint, product), Array(6).fill(0n));
  const kernelTraces = traces.filter(([id]) => id === routeId);
  assert.deepEqual(kernelTraces, [[
    routeId,
    "receipt-backed-wasm-artifact",
    { executionTarget: "wasm-artifact", ingressBytes: 0, egressBytes: 0 },
  ]]);

  close(flint, product);
  close(flint, transpose);
  close(flint, kernel);
  close(flint, source);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
});

test("integer kernel rejects malformed handles and over-capacity dimensions", async () => {
  const flint = await instantiateFlintFactor(wasm);
  assert.throws(
    () => flint.ffiFmpzMatrixRightKernel(0n),
    /invalid generated Wasm FFI resource/,
  );
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
  assert.throws(
    () => flint.ffiFmpzMatrixCreate(1n << 32n, 1n),
    /dimensions are too large/,
  );
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);

  const closed = flint.ffiFmpzMatrixCreate(1n, 1n);
  close(flint, closed);
  assert.throws(
    () => flint.ffiFmpzMatrixRightKernel(closed),
    /resource is closed/,
  );
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);

  const emptyRows = flint.ffiFmpzMatrixCreate(0n, 7n);
  const fullKernel = flint.ffiFmpzMatrixRightKernel(emptyRows);
  assert.deepEqual(
    [flint.ffiFmpzMatrixNrows(fullKernel), flint.ffiFmpzMatrixNcols(fullKernel)],
    [7n, 7n],
  );
  const emptyColumns = flint.ffiFmpzMatrixCreate(3n, 0n);
  const emptyKernel = flint.ffiFmpzMatrixRightKernel(emptyColumns);
  assert.deepEqual(
    [flint.ffiFmpzMatrixNrows(emptyKernel), flint.ffiFmpzMatrixNcols(emptyKernel)],
    [0n, 0n],
  );
  close(flint, emptyKernel);
  close(flint, emptyColumns);
  close(flint, fullKernel);
  close(flint, emptyRows);
  assert.equal(flint.__sagejs_wasm_resource_live_count__(), 0n);
});

test("public sparse integer kernel selects the fixed FLINT Wasm route", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(publicSource);
    assert.equal(result.stdout, expectedStdout);
    assertPublicSparseIntegerReceipt(result.instrumentation);
  } finally {
    await sage.close();
  }
});
