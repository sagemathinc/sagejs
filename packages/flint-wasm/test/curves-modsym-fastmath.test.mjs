import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createCurveBackend } from "../curve-backend.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";
import { instantiateFlintFactor } from "../index.mjs";

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

const modsymTraces = [];
const flint = await instantiateFlintFactor(wasmBytes, {
  recordCapability(...args) { modsymTraces.push(args); },
});

test("weight-two P1 workflow is receipt-backed Wasm, never portable math", () => {
  modsymTraces.length = 0;
  const started = performance.now();
  const p1 = flint.p1List(389);
  const presentation = flint.p1ListManinPresentationInfo(p1);
  const boundary = flint.p1ListBoundaryData(p1);
  const cuspidal = flint.p1ListCuspidalBasis(p1);
  const hecke = flint.p1ListHeckeMatrix(p1, 2n);
  const elapsed = performance.now() - started;

  assert.equal(flint.p1ListCount(p1), 390);
  assert.equal(presentation.level, 389);
  assert.equal(presentation.dimension, 65);
  assert.equal(hecke.rows, presentation.dimension);
  assert.equal(hecke.cols, presentation.dimension);
  assert.equal(boundary.matrix.rows, presentation.dimension);
  assert.equal(boundary.matrix.cols, boundary.cusps.length);
  assert.equal(cuspidal.cols, presentation.dimension);
  assert.ok(elapsed < 10_000, `level-389 workflow took ${elapsed.toFixed(1)}ms`);

  const expectedCapabilities = [
    "napi:@sagemath/sagejs-flint:p1List",
    "napi:@sagemath/sagejs-flint:p1ListManinPresentationInfo",
    "napi:@sagemath/sagejs-flint:p1ListBoundaryData",
    "napi:@sagemath/sagejs-flint:p1ListCuspidalBasis",
    "napi:@sagemath/sagejs-flint:p1ListHeckeMatrix",
  ];
  assert.deepEqual(
    modsymTraces.map(([id]) => id),
    expectedCapabilities,
  );
  for (const [id, route, evidence] of modsymTraces) {
    assert.ok(expectedCapabilities.includes(id));
    assert.equal(route, "receipt-backed-wasm-artifact");
    assert.equal(evidence.executionTarget, "wasm-artifact");
    assert.ok(evidence.ingressBytes > 0);
    assert.ok(evidence.egressBytes > 0);
  }
});

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
