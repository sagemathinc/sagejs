import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createCurveBackend } from "../curve-backend.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";

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
const backend = createCurveBackend(instance, {
  recordCapability(...args) { traces.push(args); },
});
const curve = [1n, 2n, 3n, 4n, 999n];
const discriminant = 430250329n;

test("direct elliptic prefixes execute as one receipt-backed Wasm batch", () => {
  const coefficients = backend.ecAnlistIntegral(
    ...curve,
    discriminant,
    10_000n,
  );
  traces.length = 0;
  const points = Array.from({ length: 32 }, (_, index) => [
    String(8 + index / 64),
    String(index / 8),
  ]);
  const cutoffs = Array.from({ length: points.length }, (_, index) =>
    2_000 + index * 3,
  );
  const started = performance.now();
  const result = backend.ecLseriesDirectValues(
    discriminant,
    coefficients,
    points,
    cutoffs,
    53,
  );
  const elapsed = performance.now() - started;

  assert.equal(result.algorithm, "direct");
  assert.equal(result.pointCount, points.length);
  assert.equal(result.values.length, points.length);
  assert.equal(result.cutoff, Math.max(...cutoffs));
  assert.equal(
    result.coefficientTerms,
    cutoffs.reduce((sum, value) => sum + value, 0),
  );
  assert.ok(result.values.every((value) => value.raw.accuracyBits >= 52));

  // Independent binary64 oracle for the real raw prefix at the first point.
  const sigma = Number(points[0][0]);
  let reference = 0;
  for (let n = 1; n <= cutoffs[0]; n += 1) {
    reference += coefficients[n] * n ** -sigma;
  }
  assert.ok(
    Math.abs(Number(result.values[0].raw.realMidpoint) - reference) < 1e-12,
  );
  assert.ok(elapsed < 5_000, `32 direct prefixes took ${elapsed.toFixed(1)}ms`);

  assert.equal(traces.length, 1);
  const [id, route, evidence] = traces[0];
  assert.equal(id, "elliptic-lseries-direct-values");
  assert.equal(route, "receipt-backed-wasm-artifact");
  assert.equal(evidence.executionTarget, "wasm-artifact");
  assert.ok(evidence.ingressBytes > coefficients.byteLength);
  assert.ok(evidence.egressBytes > 0);
});

test("direct batches reject uncovered or oversized cutoffs before Wasm", () => {
  assert.throws(
    () => backend.ecLseriesDirectValues(
      11n,
      [0, 1, -1],
      [["8", "0"]],
      [3],
      53,
    ),
    /covered by coefficients/,
  );
  assert.throws(
    () => backend.ecLseriesDirectValues(
      11n,
      [0, 1, -1],
      [["8", "0"]],
      [5_000_001],
      53,
    ),
    /Wasm limit/,
  );
});

test("Mellin batches use the shared domain-derived work precision", () => {
  const result = backend.ecLseriesValues(
    37n,
    1,
    [0, 1],
    [["0", "-4"], ["2", "4"]],
    16,
    8,
    1,
  );
  assert.equal(result.status, "insufficient_coefficients");
  assert.equal(result.finePrecisionBits, 24);
  assert.ok(result.workPrecisionBits >= 72);
  assert.ok(
    result.workPrecisionBits < 160,
    `domain planner selected ${result.workPrecisionBits} bits`,
  );
});
