import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createCurveBackend } from "../curve-backend.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";

const require = createRequire(import.meta.url);
const nativeFlint = require("../../flint");
const wasmBytes = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const module = await WebAssembly.compile(wasmBytes);
const wasi = createWasiHost();
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.imports,
});
wasi.initialize(instance);
const traces = [];
const wasmFlint = createCurveBackend(instance, {
  recordCapability(...args) { traces.push(args); },
});

const curve = [1n, 2n, 3n, 4n, 999n];
const discriminant = 430250329n;

test("portable smalljac matches native coefficients across point-count and BSGS primes", () => {
  for (const bound of [1031n, 9371n, 10_000n]) {
    const actual = wasmFlint.ecAnlistIntegral(...curve, discriminant, bound);
    const expected = nativeFlint.ecAnlistIntegral(...curve, discriminant, bound);
    assert.deepEqual(actual, expected);
  }
  assert.equal(wasmFlint.ecApIntegral(...curve, 101n), -6);
});

test("coefficient batches are fast, copied, repeatable, and receipt traced", () => {
  traces.length = 0;
  const started = performance.now();
  const first = wasmFlint.ecAnlistIntegral(...curve, discriminant, 10_000n);
  const elapsed = performance.now() - started;
  const snapshot = Int32Array.from(first);
  const second = wasmFlint.ecAnlistIntegral(...curve, discriminant, 10_000n);
  assert.deepEqual(first, snapshot);
  assert.deepEqual(second, snapshot);
  assert.equal(first[101], -6);
  assert.deepEqual(Array.from(first.slice(9996)), [0, -56, 95, -72, 19]);
  assert.ok(elapsed < 5_000, `10,000 coefficients took ${elapsed.toFixed(1)}ms`);
  assert.ok(traces.length >= 2);
  for (const [id, route, evidence] of traces) {
    assert.equal(id, "elliptic-coefficients-smalljac-wasm");
    assert.equal(route, "receipt-backed-wasm-artifact");
    assert.equal(evidence.executionTarget, "wasm-artifact");
  }
});

test("the high-conductor L-series coefficient prefix stays within its Wasm budget", () => {
  const started = performance.now();
  const values = wasmFlint.ecAnlistIntegral(...curve, discriminant, 305_204n);
  const elapsed = performance.now() - started;
  assert.equal(values.length, 305_205);
  assert.equal(values[101], -6);
  assert.equal(values[9349], 1);
  assert.equal(values.slice(-32).reduce((sum, value) => sum + value, 0), -423);
  assert.ok(elapsed < 10_000, `305,204 coefficients took ${elapsed.toFixed(1)}ms`);
});

test("the adapter fails closed on malformed and oversized requests", () => {
  assert.throws(
    () => wasmFlint.ecAnlistIntegral(...curve, discriminant, 5_000_001n),
    /exceeds the Wasm smalljac limit/,
  );
  assert.throws(
    () => wasmFlint.ecApIntegral(0n, 0n, 0n, 0n, 0n, 101n),
    /rejected|failed/,
  );
});
