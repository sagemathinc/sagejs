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

  const modsymSource = [
    "M = ModularSymbols(1000, 2)",
    "C = M.cuspidal_subspace()",
    "T = M.hecke_matrix(2)",
    "(M.dimension(), C.dimension(), T.trace())",
  ].join("\n");
  const modsymStarted = performance.now();
  const modsymResult = await session.evaluate(modsymSource, {
    timeout: 30_000,
  });
  const modsymElapsedMilliseconds = performance.now() - modsymStarted;
  assert.match(modsymResult.repr, /^\(301,/);
  const modsymCapabilities = [
    "napi:@sagemath/sagejs-flint:p1List",
    "napi:@sagemath/sagejs-flint:p1ListManinPresentationInfo",
    "napi:@sagemath/sagejs-flint:p1ListBoundaryData",
    "napi:@sagemath/sagejs-flint:p1ListCuspidalBasis",
    "napi:@sagemath/sagejs-flint:p1ListHeckeMatrix",
  ];
  const modsymRoutes = modsymCapabilities.map((capabilityId) => {
    const route = modsymResult.instrumentation.routes.find(
      (entry) => entry.capability_id === capabilityId,
    );
    assert.equal(route?.selected_route, "receipt-backed-wasm-artifact");
    assert.equal(route?.execution_target, "wasm-artifact");
    return route;
  });
  assert.ok(
    modsymElapsedMilliseconds < 15_000,
    `public level-1000 workflow took ${modsymElapsedMilliseconds.toFixed(1)}ms`,
  );
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.wasm-curves-modsym-fastmath/v1",
    publicSource: source,
    elapsedMilliseconds,
    result: result.repr,
    directRoute: direct,
    modsymSource,
    modsymElapsedMilliseconds,
    modsymResult: modsymResult.repr,
    modsymRoutes,
  }, null, 2)}\n`);
} finally {
  await session.close();
}
