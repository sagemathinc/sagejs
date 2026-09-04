#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { createCminpackBackend } from
  "../../packages/flint-wasm/numerical/index.mjs";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);
const bytes = await readFile(artifact);
const solver = await createCminpackBackend(bytes);
const samples = Number(process.env.SAGEJS_P3_SAMPLES ?? 50);
if (!Number.isSafeInteger(samples) || samples < 3) throw new Error("invalid sample count");

const xs = Array.from({ length: 30 }, (_, index) => (index - 10) / 7);
const ys = xs.map((x) => 2.5 * x - 0.75);
const cases = [
  {
    id: "linear-30-lmdif",
    run: () =>
      solver.leastSquares({
        initial: [0, 0],
        residualCount: xs.length,
        residual: ([slope, intercept]) =>
          xs.map((x, index) => slope * x + intercept - ys[index]),
        maximumEvaluations: 300,
      }),
    validate: (result) =>
      Math.hypot(
        ...xs.map(
          (x, index) => result.value[0] * x + result.value[1] - ys[index],
        ),
      ),
  },
  {
    id: "rosenbrock-2-lmder",
    run: () =>
      solver.leastSquares({
        initial: [-1.2, 1],
        residualCount: 2,
        residual: ([x, y]) => [10 * (y - x * x), 1 - x],
        jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
        maximumEvaluations: 300,
      }),
    validate: (result) =>
      Math.hypot(
        10 * (result.value[1] - result.value[0] ** 2),
        1 - result.value[0],
      ),
  },
];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const benchmark of cases) {
  benchmark.run();
  const durations = [];
  let last;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    last = benchmark.run();
    durations.push(performance.now() - started);
  }
  const residual = benchmark.validate(last);
  if (!last.backendConverged || residual > 1e-10) {
    throw new Error(`${benchmark.id} failed its independent residual gate`);
  }
  results.push({
    id: benchmark.id,
    samples_ms: durations,
    median_ms: median(durations),
    residual_norm: residual,
    method: last.method,
    residual_evaluations: last.residualEvaluations,
    jacobian_evaluations: last.jacobianEvaluations,
  });
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.numerical-p3-prototype-benchmark/v1",
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  samples,
  artifact_sha256: createHash("sha256").update(bytes).digest("hex"),
  cases: results,
}, null, 2)}\n`);
