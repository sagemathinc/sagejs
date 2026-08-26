#!/usr/bin/env node

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { createSage } from "../packages/flint-wasm/node-kernel.mjs";

const check = process.argv.includes("--check");
const samples = check ? 3 : 7;
const source = [
  "import sagejs.runtime as rt",
  "before = rt.flint_backend().numericLiveCount()",
  "def f(n):",
  "    return Li(n) - Li(n-1)",
  "s = 0",
  "for i in range(2000):",
  "    s += f(3)",
  "after = rt.flint_backend().numericLiveCount()",
  "valid = abs(s-2000*Li(3)) < 1e-9",
  "print(valid, before, after)",
].join("\n");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const sage = await createSage();
const timings = [];
try {
  await sage.evaluate("print(Li(3))");
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    const result = await sage.evaluate(source, { timeout: 30_000 });
    timings.push(performance.now() - start);
    const match = /^True (\d+) (\d+)\n$/.exec(result.stdout);
    assert.notEqual(match, null, result.stdout);
    assert.equal(match[2], match[1], "Li must not grow the live handle count");
    const ei = result.instrumentation.routes.find(
      (route) => route.capability_id === "napi:@sagemath/sagejs-flint:complexEi",
    );
    assert.equal(ei?.selected_route, "receipt-backed-wasm-artifact");
    assert.equal(ei?.call_count, 2001);
  }
} finally {
  await sage.close();
}

const warmMedianMs = median(timings);
const report = {
  schema: "sagejs.benchmark/wasm-resource-lifetimes-v1",
  workload: "the original 2000-iteration Li(n)-Li(n-1) reproducer",
  samples,
  warm_median_ms: Number(warmMedianMs.toFixed(3)),
  minimum_ms: Number(Math.min(...timings).toFixed(3)),
  maximum_ms: Number(Math.max(...timings).toFixed(3)),
  complex_ei_calls: 2001,
  numeric_live_count_growth: 0,
};
console.log(JSON.stringify(report, null, 2));
if (check && warmMedianMs > 5_000) {
  throw new Error(`Li lifetime benchmark ${warmMedianMs.toFixed(1)}ms exceeds 5000ms`);
}
