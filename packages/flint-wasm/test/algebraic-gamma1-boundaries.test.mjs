import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createAlgebraicBackend } from "../algebraic.mjs";

async function context(t) {
  const { createWasiHost } = await import("../dist/wasi-runtime.mjs");
  const wasi = createWasiHost();
  const module = await WebAssembly.compile(fs.readFileSync(
    new URL("../dist/flint-algebraic.wasm", import.meta.url),
  ));
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.imports });
  wasi.initialize(instance);
  const api = createAlgebraicBackend(instance);
  const values = [];
  const matrices = [];
  const own = (value) => (values.push(value), value);
  const matrix = (value) => (matrices.push(value), value);
  t.after(() => {
    for (const value of values) api.qqbarClose(value);
    for (const value of matrices) api.__sagejs_algebraic_matrix_close__(value);
    assert.equal(api.__sagejs_algebraic_live_count__(), 0);
    assert.equal(api.__sagejs_algebraic_matrix_live_count__(), 0);
  });
  return { api, own, matrix, rational: (n, d = 1n) => own(api.qqbarFromRational(n, d)) };
}

test("FLINT Wasm right kernels have canonical row bases, including empty shapes", async (t) => {
  const { api, own, matrix, rational } = await context(t);
  const entries = [1n, 2n, 3n, 2n, 4n, 6n].map(n => rational(n));
  const source = matrix(api.qqbarMatrix(2, 3, entries, true));
  const kernel = matrix(api.matrixRightKernel(source));
  const expected = matrix(api.qqbarMatrix(2, 3, [
    rational(1n), rational(0n), rational(-1n, 3n),
    rational(0n), rational(1n), rational(-2n, 3n),
  ], true));
  assert.equal(api.matrixEqual(kernel, expected), true);
  assert.deepEqual(api.matrixPivots(kernel), [0, 1]);
  const transpose = matrix(api.matrixTranspose(kernel));
  const annihilator = matrix(api.matrixMul(source, transpose));
  assert.equal(api.matrixRank(annihilator), 0);
  const empty = matrix(api.qqbarMatrix(0, 3, [], true));
  assert.deepEqual(api.matrixPivots(empty), []);
  const full = matrix(api.matrixRightKernel(empty));
  assert.equal(full.rows, 3);
  assert.equal(api.matrixRank(full), 3);
  const noKernel = matrix(api.matrixRightKernel(full));
  assert.equal(noKernel.rows, 0);
  assert.equal(noKernel.columns, 3);
  const selected = matrix(api.matrixSelectColumns(source, [2, 0, 2]));
  const rows = matrix(api.matrixSelectRows(selected, [1, 0]));
  assert.equal(api.qqbarEqual(own(api.matrixEntry(rows, 0, 0)), rational(6n)), true);
  const stacked = matrix(api.matrixStack(source, source));
  assert.equal(stacked.rows, 4);
  assert.throws(() => api.matrixSelectRows(source, [-1]), /index|indices|range/i);
  assert.throws(() => api.matrixSelectColumns(source, [1.5]), RangeError);
});

test("matrix-produced cyclotomic values use exact FLINT recognition without Wasm ABI traps", async (t) => {
  const { api, own, matrix, rational } = await context(t);
  for (const order of [3n, 5n, 6n, 12n]) {
    const root = own(api.qqbarRootOfUnity(1n, order));
    const square = own(api.qqbarMul(root, root));
    const value = own(api.qqbarAdd(root, own(api.qqbarMul(rational(3n, 7n), square))));
    const source = matrix(api.qqbarMatrix(1, 1, [value], false));
    const detached = own(api.matrixEntry(source, 0, 0));
    const coefficients = api.cyclotomicElementCoefficients(detached, order);
    let reconstructed = rational(0n);
    for (let index = coefficients.length - 1; index >= 0; index--) {
      const [n, d] = coefficients[index];
      reconstructed = own(api.qqbarAdd(own(api.qqbarMul(reconstructed, root)), rational(n, d)));
    }
    assert.equal(api.qqbarEqual(reconstructed, value), true);
    const negative = api.cyclotomicRootCoefficients(-1n, order);
    assert.deepEqual(negative, api.cyclotomicRootCoefficients(order - 1n, order));
  }
  const irrational = own(api.qqbarSqrt(rational(2n)));
  assert.throws(() => api.cyclotomicElementCoefficients(irrational, 3n), /cyclotomic|argument/i);
  assert.throws(() => api.cyclotomicElementCoefficients(irrational, 4096n), /resource|limit/i);
  assert.throws(() => api.cyclotomicRootCoefficients(1n, 4097n), /4096|order/i);
});
