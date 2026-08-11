#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function run() {
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as benchmark_runtime",
      "set_random_seed(20260811)",
      "benchmark_charpoly_source = random_matrix(QQ, 60)",
      "benchmark_minpoly_source = matrix(QQ, 25, 25, [QQ(((17*r + 31*c + 7*r*c + 11) % 101) - 50, (r + 2*c) % 13 + 1) for r in range(25) for c in range(25)])",
      "def benchmark_matrix_polynomial(source, operation):",
      "    operand = source.__copy__()",
      "    started = benchmark_runtime.wall_time()",
      "    result = getattr(operand, operation)()",
      "    elapsed = (benchmark_runtime.wall_time() - started) * 1000",
      "    storage = operand._rational_storage_cache",
      "    if benchmark_runtime.reflect.get(storage, 'numerators') is not benchmark_runtime.undefined:",
      "        raise RuntimeError('matrix polynomial materialized numerators')",
      "    if benchmark_runtime.reflect.get(storage, 'denominators') is not benchmark_runtime.undefined:",
      "        raise RuntimeError('matrix polynomial materialized denominators')",
      "    if not result._has_fmpq_polynomial_resource():",
      "        raise RuntimeError('matrix polynomial did not return a resource')",
      "    return elapsed",
    ].join("\n"));

    const cases = [
      {
        name: "charpoly_60",
        source: "benchmark_charpoly_source",
        operation: "charpoly",
        budget: 20,
        previousSagejs: 46,
        suppliedSage: 15,
      },
      {
        name: "minpoly_25",
        source: "benchmark_minpoly_source",
        operation: "minpoly",
        budget: 10,
        previousSagejs: 990,
        suppliedSage: 3.83,
      },
    ];
    const results = [];
    for (const item of cases) {
      await session.evaluate(
        `benchmark_matrix_polynomial(${item.source}, ${JSON.stringify(item.operation)})`,
      );
      const samples = [];
      for (let index = 0; index < 7; index += 1) {
        const sample = await session.evaluate(
          `benchmark_matrix_polynomial(${item.source}, ${JSON.stringify(item.operation)})`,
        );
        samples.push(Number(sample.repr));
      }
      const elapsed = median(samples);
      if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > item.budget) {
        throw new Error(
          `${item.name} took ${elapsed.toFixed(2)} ms; budget ${item.budget} ms`,
        );
      }
      results.push({ ...item, medianMs: elapsed, samplesMs: samples });
    }
    process.stdout.write(JSON.stringify({
      schema: "sagejs.benchmark/exact-rational-matrix-polynomials-v1",
      workload: {
        charpoly: "seeded dense random 60x60 matrix over QQ",
        minpoly: "deterministic formula-defined dense 25x25 matrix over QQ",
        warmup: 1,
        samples: 7,
        timing: "public operation after an untimed resource copy",
      },
      results,
    }, null, 2) + "\n");
  } finally {
    session.close();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
