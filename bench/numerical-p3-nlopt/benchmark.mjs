#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { createNloptBackend } from
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt/index.mjs";

const artifact = await readFile(new URL(
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt/build/nlopt-methods.wasm",
  import.meta.url,
));
const solver = await createNloptBackend(artifact);
const samples = Number(process.env.SAGEJS_NLOPT_SAMPLES ?? 100);
if (!Number.isSafeInteger(samples) || samples < 3) throw new Error("invalid sample count");

const benchmarks = [
  {
    id: "nelder-mead-rosenbrock-2",
    options: {
      method: "nlopt-nelder-mead",
      initial: [-1.2, 1],
      initialStep: [0.5, 0.5],
      objective: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
      relativeParameterTolerance: 1e-9,
      maximumEvaluations: 2000,
    },
    validate: (result) => Math.hypot(result.value[0] - 1, result.value[1] - 1),
    ceiling: 2e-5,
  },
  {
    id: "cobyla-circle-active-2",
    options: {
      method: "nlopt-cobyla",
      initial: [0.25, 0.25],
      initialStep: [0.4, 0.4],
      objective: ([x, y]) => (x - 1) ** 2 + (y - 1) ** 2,
      inequalityCount: 1,
      inequality: ([x, y]) => [x * x + y * y - 1],
      inequalityTolerance: [2e-7],
      relativeParameterTolerance: 1e-9,
      maximumEvaluations: 2000,
    },
    validate: (result) => Math.max(0, result.value[0] ** 2 + result.value[1] ** 2 - 1),
    ceiling: 2e-7,
  },
];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const benchmark of benchmarks) {
  solver.solve(benchmark.options);
  const durations = [];
  let final;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    final = solver.solve(benchmark.options);
    durations.push(performance.now() - started);
  }
  const validation = benchmark.validate(final);
  if (validation > benchmark.ceiling || solver.inspect().liveAllocations !== 0) {
    throw new Error(`${benchmark.id} failed independent benchmark validation`);
  }
  results.push({
    id: benchmark.id,
    samples_ms: durations,
    median_ms: median(durations),
    validation,
    evaluations: final.evaluations,
    callbacks: final.callbackCount,
  });
}
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.numerical-nlopt-benchmark/v1",
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  artifact_sha256: createHash("sha256").update(artifact).digest("hex"),
  samples,
  results,
}, null, 2)}\n`);
