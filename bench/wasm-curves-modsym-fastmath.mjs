#!/usr/bin/env node

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { createSage } from "../packages/flint-wasm/node-kernel.mjs";

const session = await createSage();
try {
  const source = [
    "E = EllipticCurve([1, 2, 3, 4, 999])",
    "L = E.lseries()",
    "points = [CC(12 + k/64, k/8) for k in range(32)]",
    "values = L.values(points)",
    "(len(values), str(values[0]))",
  ].join("\n");
  const started = performance.now();
  const result = await session.evaluate(source, { timeout: 30_000 });
  const elapsedMilliseconds = performance.now() - started;
  assert.match(result.repr, /^\(32,/);
  const direct = result.instrumentation.routes.find(
    (entry) => entry.capability_id === "elliptic-lseries-direct-values",
  );
  assert.equal(direct?.selected_route, "receipt-backed-wasm-artifact");
  assert.equal(direct?.execution_target, "wasm-artifact");
  assert.ok(
    elapsedMilliseconds < 15_000,
    `public direct batch took ${elapsedMilliseconds.toFixed(1)}ms`,
  );
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.wasm-curves-modsym-fastmath/v1",
    publicSource: source,
    elapsedMilliseconds,
    result: result.repr,
    directRoute: direct,
  }, null, 2)}\n`);
} finally {
  await session.close();
}
