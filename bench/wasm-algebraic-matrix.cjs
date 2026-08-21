#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const size = 8;
const warmups = 3;
const samples = 9;
const iterations = 3;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(workload) {
  for (let index = 0; index < warmups; index += 1) workload();
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) workload();
    timings.push((performance.now() - started) / iterations);
  }
  return { median_ms: median(timings), samples_ms: timings };
}

function matrixEntries(values) {
  const entries = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (row === column) {
        entries.push(values.root);
      } else {
        entries.push(values.rationals[(row * 7 + column * 11) % 5]);
      }
    }
  }
  return entries;
}

async function wasmBackend() {
  const packageRoot = path.join(root, "packages", "flint-wasm");
  const { createAlgebraicBackend } = await import(pathToFileURL(
    path.join(packageRoot, "algebraic.mjs"),
  ));
  const { createWasiHost } = await import(pathToFileURL(
    path.join(packageRoot, "dist", "wasi-runtime.mjs"),
  ));
  const module = await WebAssembly.compile(fs.readFileSync(
    path.join(packageRoot, "dist", "flint-algebraic.wasm"),
  ));
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  return createAlgebraicBackend(instance);
}

function setup(backend) {
  const values = [];
  const own = (value) => (values.push(value), value);
  const two = own(backend.qqbarFromRational(2n, 1n));
  const rootValue = own(backend.qqbarSqrt(two));
  const rationals = [-2n, -1n, 0n, 1n, 2n].map((value) =>
    own(backend.qqbarFromRational(value, 1n))
  );
  const matrix = backend.qqbarMatrix(
    size,
    size,
    matrixEntries({ root: rootValue, rationals }),
    true,
  );
  return { matrix, values };
}

function wasmWorkload(backend, matrix) {
  const product = backend.matrixMul(matrix, matrix);
  const determinant = backend.matrixDet(product);
  const characteristic = backend.matrixCharpoly(matrix);
  const witness = backend.qqbarDegree(determinant) + characteristic.length;
  backend.__sagejs_algebraic_matrix_close__(product);
  backend.qqbarClose(determinant);
  for (const value of characteristic) backend.qqbarClose(value);
  return witness;
}

function nativeWorkload(backend, matrix) {
  const product = backend.matrixMul(matrix, matrix);
  const determinant = backend.matrixDet(product);
  const characteristic = backend.matrixCharpoly(matrix);
  return backend.qqbarDegree(determinant) + characteristic.length;
}

function exactChecksum(backend, matrix, close) {
  const product = backend.matrixMul(matrix, matrix);
  const determinant = backend.matrixDet(product);
  const characteristic = backend.matrixCharpoly(matrix);
  const digest = createHash("sha256");
  for (const value of [determinant, ...characteristic]) {
    digest.update(JSON.stringify({
      minpoly: backend.qqbarMinpolyCoefficients(value).map(String),
      isolating_value: backend.qqbarToString(value, 40),
    }));
  }
  if (close) {
    backend.__sagejs_algebraic_matrix_close__(product);
    backend.qqbarClose(determinant);
    for (const value of characteristic) backend.qqbarClose(value);
  }
  return digest.digest("hex");
}

async function main() {
  const wasm = await wasmBackend();
  const native = require(path.join(root, "packages", "flint", "index.cjs"));
  const wasmState = setup(wasm);
  const nativeState = setup(native);

  const wasmChecksum = exactChecksum(wasm, wasmState.matrix, true);
  const nativeChecksum = exactChecksum(native, nativeState.matrix, false);
  assert.equal(wasmChecksum, nativeChecksum);

  const wasmTiming = measure(() => wasmWorkload(wasm, wasmState.matrix));
  const nativeTiming = measure(() => nativeWorkload(native, nativeState.matrix));

  wasm.__sagejs_algebraic_matrix_close__(wasmState.matrix);
  for (const value of wasmState.values) wasm.qqbarClose(value);
  assert.equal(wasm.__sagejs_algebraic_matrix_live_count__(), 0);
  assert.equal(wasm.__sagejs_algebraic_live_count__(), 0);

  const ratio = wasmTiming.median_ms / nativeTiming.median_ms;
  const result = {
    schema: "sagejs.benchmark/wasm-algebraic-matrix-v1",
    workload: "8x8 qqbar matrix square, determinant, and characteristic polynomial",
    implementation: "FLINT gr_mat over qqbar on both targets",
    warmups,
    samples,
    iterations_per_sample: iterations,
    wasm: wasmTiming,
    native: nativeTiming,
    wasm_over_native: ratio,
    exact_minpoly_and_isolating_value_checksum: wasmChecksum,
  };

  if (process.argv.includes("--check")) {
    assert.ok(
      wasmTiming.median_ms <= nativeTiming.median_ms * 20 + 2,
      `warm algebraic Wasm median ${wasmTiming.median_ms}ms is unexpectedly ` +
        `slower than native ${nativeTiming.median_ms}ms`,
    );
    assert.ok(
      wasmTiming.median_ms < 500,
      `warm algebraic Wasm median ${wasmTiming.median_ms}ms exceeds 500ms`,
    );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
