import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createAlgebraicBackend } from "../algebraic.mjs";
import { createPortableMatrixBackend } from "../portable-matrix.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = path.join(packageRoot, "dist", "flint-algebraic.wasm");

async function backend(traces) {
  const module = await WebAssembly.compile(fs.readFileSync(artifact));
  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  return createAlgebraicBackend(instance, {
    matrixFallback: createPortableMatrixBackend(),
    recordCapability(id, route, details) {
      traces.push({ id, route, details });
    },
  });
}

test("real FLINT Wasm owns exact AA matrices and agrees with native qqbar", {
  skip: fs.existsSync(artifact) ? false : "the algebraic artifact has not been built",
}, async () => {
  const traces = [];
  const algebraic = await backend(traces);
  const require = createRequire(import.meta.url);
  const native = require("../../flint/index.cjs");
  const values = [];
  const matrices = [];
  const own = (value) => (values.push(value), value);
  const ownMatrix = (value) => (matrices.push(value), value);

  const two = own(algebraic.qqbarFromRational(2n, 1n));
  const root = own(algebraic.qqbarSqrt(two));
  const zero = own(algebraic.qqbarFromRational(0n, 1n));
  const one = own(algebraic.qqbarFromRational(1n, 1n));
  const entries = [
    root, one, zero, zero,
    zero, root, one, zero,
    zero, zero, root, one,
    one, zero, zero, root,
  ];
  const matrix = ownMatrix(algebraic.qqbarMatrix(4, 4, entries, true));
  const squared = ownMatrix(algebraic.matrixMul(matrix, matrix));
  const reduced = ownMatrix(algebraic.matrixRref(matrix));
  const inverse = ownMatrix(algebraic.matrixInverse(matrix));
  const identity = ownMatrix(algebraic.matrixMul(matrix, inverse));
  const determinant = own(algebraic.matrixDet(matrix));
  const characteristic = algebraic.matrixCharpoly(matrix).map(own);
  assert.equal(algebraic.matrixRank(matrix), 4);
  assert.equal(algebraic.matrixEqual(reduced, identity), true);

  const nativeTwo = native.qqbarFromRational(2n, 1n);
  const nativeRoot = native.qqbarSqrt(nativeTwo);
  const nativeZero = native.qqbarFromRational(0n, 1n);
  const nativeOne = native.qqbarFromRational(1n, 1n);
  const nativeMatrix = native.qqbarMatrix(4, 4, [
    nativeRoot, nativeOne, nativeZero, nativeZero,
    nativeZero, nativeRoot, nativeOne, nativeZero,
    nativeZero, nativeZero, nativeRoot, nativeOne,
    nativeOne, nativeZero, nativeZero, nativeRoot,
  ], true);
  const nativeDeterminant = native.matrixDet(nativeMatrix);
  assert.deepEqual(
    algebraic.qqbarMinpolyCoefficients(determinant),
    native.qqbarMinpolyCoefficients(nativeDeterminant),
  );
  assert.equal(
    algebraic.qqbarToString(determinant, 40),
    native.qqbarToString(nativeDeterminant, 40),
  );
  assert.deepEqual(
    characteristic.map((value) => algebraic.qqbarToString(value, 40)),
    native.matrixCharpoly(nativeMatrix).map((value) => native.qqbarToString(value, 40)),
  );
  const nativeSquared = native.matrixMul(nativeMatrix, nativeMatrix);
  for (let index = 0; index < 16; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const wasmValue = own(algebraic.matrixEntry(squared, row, column));
    assert.equal(
      algebraic.qqbarToString(wasmValue, 40),
      native.qqbarToString(native.matrixEntry(nativeSquared, row, column), 40),
    );
  }

  const interval = algebraic.qqbarEnclosure(determinant, 128);
  const nativeApproximation = native.qqbarApprox(nativeDeterminant, 128);
  const nativeReal = native.complexRealDouble(nativeApproximation);
  const lower = Number(interval.real.lower) * 2 ** Number(interval.real.exponent);
  const upper = Number(interval.real.upper) * 2 ** Number(interval.real.exponent);
  assert.equal(interval.rigorous, true);
  assert.ok(lower <= nativeReal && nativeReal <= upper);
  assert.equal(interval.imag.lower, 0n);
  assert.equal(interval.imag.upper, 0n);

  const operations = new Set(traces.map(({ details }) => details.operation));
  for (const operation of [
    "qqbar-matrix-construct",
    "qqbar-matrix-mul",
    "qqbar-matrix-rref",
    "qqbar-matrix-inverse",
    "qqbar-matrix-determinant",
    "qqbar-matrix-charpoly",
    "qqbar-matrix-rank",
  ]) assert.ok(operations.has(operation), operation);
  assert.ok(traces.every(({ id, route, details }) =>
    id === "algebraic:qqbar-resource-core" &&
    route === "receipt-backed-wasm-artifact" &&
    details.executionTarget === "wasm-artifact"));

  for (const value of values) algebraic.qqbarClose(value);
  for (const value of matrices) algebraic.__sagejs_algebraic_matrix_close__(value);
  assert.equal(algebraic.__sagejs_algebraic_live_count__(), 0);
  assert.equal(algebraic.__sagejs_algebraic_matrix_live_count__(), 0);
});

test("algebraic composition preserves the forced portable matrix fallback", {
  skip: fs.existsSync(artifact) ? false : "the algebraic artifact has not been built",
}, async () => {
  const algebraic = await backend([]);
  const portable = createPortableMatrixBackend();
  const left = portable.zzMatrix(2, 2, [1n, 2n, 3n, 5n]);
  const right = portable.zzMatrix(2, 2, [7n, 11n, 13n, 17n]);
  assert.deepEqual(
    algebraic.matrixMul(left, right).entries,
    portable.matrixMul(left, right).entries,
  );
  assert.equal(algebraic.matrixDet(left), portable.matrixDet(left));
  assert.deepEqual(
    algebraic.matrixRref(left).entries,
    portable.matrixRref(left).entries,
  );
  assert.equal(algebraic.__sagejs_algebraic_matrix_live_count__(), 0);
});

test("retained algebraic matrices spill exactly instead of exhausting handles", {
  skip: fs.existsSync(artifact) ? false : "the algebraic artifact has not been built",
}, async () => {
  const algebraic = await backend([]);
  const zero = algebraic.qqbarFromRational(0n, 1n);
  const one = algebraic.qqbarFromRational(1n, 1n);
  const matrices = [];
  for (let index = 0; index < 100; index += 1) {
    matrices.push(algebraic.qqbarMatrix(2, 2, [
      one, zero, algebraic.qqbarFromRational(BigInt(index), 1n), one,
    ], true));
  }
  assert.equal(algebraic.algebraicHandleCacheLimits.matrices, 32);
  assert.ok(
    algebraic.__sagejs_algebraic_matrix_live_count__() <=
      algebraic.algebraicHandleCacheLimits.matrices,
  );
  assert.equal(algebraic.matrixRank(matrices[0]), 2);
  assert.equal(algebraic.matrixRank(matrices[99]), 2);
  for (const matrix of matrices) {
    algebraic.__sagejs_algebraic_matrix_close__(matrix);
  }
  assert.equal(algebraic.__sagejs_algebraic_matrix_live_count__(), 0);
});
