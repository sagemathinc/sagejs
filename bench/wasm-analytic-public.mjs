#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";

import { createSage } from "../packages/flint-wasm/node-kernel.mjs";

const check = process.argv.includes("--check");
const count = Number(process.env.SAGEJS_ANALYTIC_BENCH_COUNT ?? (check ? 128 : 512));
const samples = Number(process.env.SAGEJS_ANALYTIC_BENCH_SAMPLES ?? (check ? 2 : 5));
assert.ok(Number.isSafeInteger(count) && count >= 64);
assert.ok(Number.isSafeInteger(samples) && samples >= 1);

function source({ batched }) {
  const evaluate = batched
    ? `gamma_values = complex_gamma_values(points, prec=160)
xi_values = riemann_xi_values(points, prec=160)`
    : `gamma_values = [complex_gamma(point, prec=160) for point in points]
xi_values = [riemann_xi(point, prec=160) for point in points]`;
  return `
points = [["0.5", (index-${Math.floor(count / 2)})/32] for index in range(${count})]
${evaluate}
print(len(gamma_values), len(xi_values), gamma_values[0].precision(), xi_values[0].precision())
`;
}

function routeMap(instrumentation) {
  return new Map(instrumentation.routes.map((route) => [route.capability_id, route]));
}

async function measure(session, benchmarkSource) {
  const started = performance.now();
  const result = await session.evaluate(benchmarkSource, { timeout: 120_000 });
  return {
    milliseconds: performance.now() - started,
    stdout: result.stdout,
    instrumentation: result.instrumentation,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const batchSource = source({ batched: true });
const scalarSource = source({ batched: false });
const sage = await createSage();
const batchRuns = [];
const scalarRuns = [];
try {
  await measure(sage, batchSource);
  await measure(sage, scalarSource);
  for (let sample = 0; sample < samples; sample += 1) {
    batchRuns.push(await measure(sage, batchSource));
    scalarRuns.push(await measure(sage, scalarSource));
  }
} finally {
  await sage.close();
}

const expectedStdout = `${count} ${count} 160 160\n`;
for (const run of [...batchRuns, ...scalarRuns]) assert.equal(run.stdout, expectedStdout);
const batchRoutes = routeMap(batchRuns.at(-1).instrumentation);
const scalarRoutes = routeMap(scalarRuns.at(-1).instrumentation);
for (const id of ["analytic:complex-gamma", "analytic:riemann-xi"]) {
  assert.equal(batchRoutes.get(id)?.selected_route, "receipt-backed-wasm-artifact");
  assert.equal(batchRoutes.get(id)?.call_count, 1);
  assert.equal(scalarRoutes.get(id)?.selected_route, "receipt-backed-wasm-artifact");
  assert.equal(scalarRoutes.get(id)?.call_count, count);
}
assert.equal(batchRuns.at(-1).instrumentation.boundary_crossings, 2);
assert.equal(scalarRuns.at(-1).instrumentation.boundary_crossings, 2 * count);

const manifest = JSON.parse(await fs.readFile(
  new URL("../packages/flint-wasm/dist/production-manifest.json", import.meta.url),
  "utf8",
));
const batchMedian = median(batchRuns.map((run) => run.milliseconds));
const scalarMedian = median(scalarRuns.map((run) => run.milliseconds));
const receipt = {
  schema_version: 1,
  kind: "sagejs-public-analytic-wasm-benchmark",
  artifact_identity: manifest.artifact?.identity ?? manifest.identity ?? null,
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: os.cpus().length,
  },
  workload: {
    families: ["complex-gamma", "riemann-xi"],
    point_count_per_family: count,
    precision_bits: 160,
    warmups: 1,
    samples,
  },
  batch: {
    milliseconds: batchRuns.map((run) => run.milliseconds),
    median_milliseconds: batchMedian,
    boundary_crossings: 2,
    copied_bytes: batchRuns.at(-1).instrumentation.copied_bytes,
  },
  scalar: {
    milliseconds: scalarRuns.map((run) => run.milliseconds),
    median_milliseconds: scalarMedian,
    boundary_crossings: 2 * count,
    copied_bytes: scalarRuns.at(-1).instrumentation.copied_bytes,
  },
  crossing_reduction: count,
  speedup: scalarMedian / batchMedian,
};

if (check) {
  assert.ok(receipt.batch.copied_bytes > 0);
  assert.ok(receipt.scalar.copied_bytes > 0);
  assert.ok(receipt.speedup > 1, `expected coarse batches to win: ${JSON.stringify(receipt)}`);
}
console.log(JSON.stringify(receipt, null, 2));

