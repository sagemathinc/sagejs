import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createCurveBackend } from "../curve-backend.mjs";
import { SageSession } from "../node-kernel.mjs";
import { createWasiHost } from "../dist/wasi-runtime.mjs";

const require = createRequire(import.meta.url);
const nativeFlint = require("../../flint");
const wasmBytes = await fs.readFile(
  new URL("../dist/flint-factor.wasm", import.meta.url),
);
const module = await WebAssembly.compile(wasmBytes);

async function backend(records = []) {
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  wasi.initialize(instance);
  return createCurveBackend(instance, {
    recordCapability(...arguments_) { records.push(arguments_); },
  });
}

function comparable(batch) {
  return {
    status: batch.status,
    statusName: batch.statusName,
    genus: batch.genus,
    rowCount: batch.rowCount,
    requiredRows: batch.requiredRows,
    truncated: batch.truncated,
    backendVersion: batch.backendVersion,
    normalization: batch.normalization,
    primes: Array.from(batch.primes),
    good: Array.from(batch.good),
    coefficientCounts: Array.from(batch.coefficientCounts),
    coefficients: Array.from(batch.coefficients),
    rowStatus: Array.from(batch.rowStatus),
  };
}

test("genus-2 Wasm batches exactly match the native smalljac adapter", async () => {
  const wasm = await backend();
  for (const curve of [
    "x^5+x+1",
    "x^6+x+1",
    "[x^5+x+1,x]",
    "2*x^5+x+1",
  ]) {
    const actual = wasm.smalljacLpolyBatch(curve, 3n, 4099n);
    const expected = nativeFlint.smalljacLpolyBatch(curve, 3n, 4099n);
    assert.deepEqual(comparable(actual), comparable(expected));
  }
});

test("genus-2 Jacobian orders stay exact beyond the wasm32 GMP word boundary", async () => {
  const wasm = await backend();
  for (const curve of [
    "x^5+x+1",
    "x^6+x+1",
    "[x^5+x+1,x]",
    "2*x^5+x+1",
  ]) {
    for (const prime of [65_537n, 94_439n, 98_453n, 99_971n]) {
      const actual = wasm.smalljacLpolyBatch(curve, prime, prime);
      const expected = nativeFlint.smalljacLpolyBatch(curve, prime, prime);
      assert.deepEqual(comparable(actual), comparable(expected));
    }
  }
});

test("the packed boundary preserves bad rows, truncation, copies, and receipts", async () => {
  const records = [];
  const wasm = await backend(records);
  const first = wasm.smalljacLpolyBatch("x^5+x+1", 3n, 101n, {
    maxRows: 7,
  });
  const snapshot = comparable(first);
  const second = wasm.smalljacLpolyBatch("x^6+x+1", 3n, 101n);
  assert.deepEqual(comparable(first), snapshot);
  assert.equal(first.statusName, "truncated");
  assert.equal(first.rowCount, 7);
  assert.ok(first.requiredRows > first.rowCount);
  assert.equal(second.statusName, "ok");
  assert.equal(second.rowCount, second.requiredRows);
  assert.ok(second.good.includes(0));
  for (let index = 0; index < second.rowCount; index += 1) {
    if (second.good[index]) {
      assert.equal(second.coefficientCounts[index], 2);
      assert.equal(second.rowStatus[index], 0);
    } else {
      assert.equal(second.coefficientCounts[index], 0);
      assert.equal(second.rowStatus[index], 1);
      assert.equal(second.coefficients[2 * index], 0n);
      assert.equal(second.coefficients[2 * index + 1], 0n);
    }
  }
  assert.deepEqual(
    records.map(([id, route]) => [id, route]),
    [
      ["smalljac-local-factors", "receipt-backed-wasm-artifact"],
      ["smalljac-local-factors", "receipt-backed-wasm-artifact"],
    ],
  );
});

test("one real smalljac traversal stays inside the reviewed Wasm budget", async () => {
  const wasm = await backend();
  const started = performance.now();
  const batch = wasm.smalljacLpolyBatch("x^5+x+1", 3n, 100_000n);
  const elapsed = performance.now() - started;
  assert.equal(batch.statusName, "ok");
  assert.equal(batch.rowCount, 9591);
  assert.equal(batch.requiredRows, 9591);
  assert.ok(elapsed < 15_000, `genus-2 smalljac batch took ${elapsed.toFixed(1)}ms`);
});

test("the public hyperelliptic workflow selects the Wasm smalljac route", async () => {
  const session = new SageSession();
  try {
    await session.ready();
    const result = await session.evaluate([
      "R = PolynomialRing(QQ, 'x')",
      "x = R.gen()",
      "C = HyperellipticCurve(x^5 + x + 1)",
      "values = C.local_lpolynomials(3, 101, algorithm='smalljac')",
      "print((len(values), values[0][0], values[-1][0], values[0][1].list()))",
    ].join("\n"), { timeout: 30_000 });
    assert.match(result.stdout, /\(22, 5, 101, \[1, 0, 10, 0, 25\]\)/);
    assert.ok(result.instrumentation.routes.some((route) =>
      route.capability_id === "smalljac-local-factors" &&
      route.selected_route === "receipt-backed-wasm-artifact" &&
      route.execution_target === "wasm-artifact"));
  } finally {
    await session.close();
  }
});

test("genus 3 and oversized intervals fail closed", async () => {
  const wasm = await backend();
  const genusThree = wasm.smalljacLpolyBatch("x^7+x+1", 3n, 101n);
  assert.equal(genusThree.statusName, "unsupported-curve");
  assert.throws(
    () => wasm.smalljacLpolyBatch("x^5+x+1", 3n, 131_074n),
    /bounded Wasm chunk/,
  );
});
