// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createCminpackBackend } from
  "../../packages/flint-wasm/numerical/index.mjs";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("raw ABI rejects corrupt regions, double frees, and invalid limits", async () => {
  const bytes = await readFile(artifact);
  let callbackCount = 0;
  const { instance } = await WebAssembly.instantiate(bytes, {
    sagejs_p3: { evaluate: () => { callbackCount += 1; return -1001; } },
  });
  instance.exports._initialize?.();
  const api = instance.exports;
  assert.equal(api.p3_alloc(0), 0);
  assert.equal(api.p3_alloc(64 * 1024 * 1024 + 1), 0);
  assert.equal(api.p3_set_allocation_failure_after(-2), 0);
  const pointer = api.p3_alloc(64);
  assert.notEqual(pointer, 0);
  assert.equal(api.p3_free(pointer), 1);
  assert.equal(api.p3_free(pointer), 0);
  assert.equal(api.p3_live_allocations(), 0);
  assert.equal(api.p3_live_bytes(), 0);

  for (let index = 0; index < 500; index += 1) {
    // Keep every generated pointer aligned yet provably above the reactor's
    // fixed 128 MiB memory ceiling.  This exercises region validation instead
    // of relying on probabilistic invalidity.
    const offset = (0xf0000000 + index * 8) >>> 0;
    const status = api.p3_lm_solve(
      1,
      index % 2 === 0 ? 1 : 2,
      1,
      1,
      offset,
      1e-12,
      1e-12,
      1e-8,
      10,
      0,
      0,
      offset,
    );
    assert.equal(status, -2003);
  }
  assert.equal(callbackCount, 0);
  assert.equal(api.p3_live_allocations(), 0);
  assert.equal(api.p3_live_bytes(), 0);
});

test("deterministic small linear fuzz preserves exact residual oracles", async () => {
  const bytes = await readFile(artifact);
  const solver = await createCminpackBackend(bytes);
  const random = randomGenerator(0xc01dcafe);
  for (let run = 0; run < 200; run += 1) {
    const n = 1 + Math.floor(random() * 5);
    const m = n + 2 + Math.floor(random() * 4);
    const expected = Array.from({ length: n }, () => random() * 4 - 2);
    const matrix = Array.from({ length: m }, (_, row) =>
      Array.from({ length: n }, (_, column) =>
        (row === column ? n + 3 : 0) + random() - 0.5),
    );
    const target = matrix.map((row) =>
      row.reduce((sum, value, column) => sum + value * expected[column], 0),
    );
    const residual = (point) => matrix.map((row, index) =>
      row.reduce((sum, value, column) => sum + value * point[column], 0) -
        target[index],
    );
    const method = run % 2 === 0 ? "cminpack-lmdif" : "cminpack-lmder";
    const result = solver.leastSquares({
      method,
      initial: Array.from({ length: n }, () => random() * 10 - 5),
      residualCount: m,
      residual,
      jacobian: method === "cminpack-lmder" ? () => matrix : undefined,
      maximumEvaluations: 500,
    });
    assert.equal(result.backendConverged, true);
    assert.ok(Math.hypot(...residual(result.value)) < 1e-9);
    assert.equal(solver.inspect().liveAllocations, 0);
    assert.equal(solver.inspect().liveBytes, 0);
  }
});
