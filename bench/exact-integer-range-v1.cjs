#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as benchmark_runtime",
      "def benchmark_ellipsis():",
      "    started = benchmark_runtime.wall_time()",
      "    values = [1..1000000]",
      "    elapsed = (benchmark_runtime.wall_time() - started) * 1000",
      "    assert len(values) == 1000000 and values[0] == 1",
      "    assert values[-1] == 1000000",
      "    return elapsed",
      "def benchmark_range_list():",
      "    started = benchmark_runtime.wall_time()",
      "    values = list(range(1, 1000001))",
      "    elapsed = (benchmark_runtime.wall_time() - started) * 1000",
      "    assert len(values) == 1000000 and values[0] == 1",
      "    assert values[-1] == 1000000",
      "    return elapsed",
    ].join("\n"));

    const results = [];
    for (const [name, callable] of [
      ["Sage ellipsis [1..10^6]", "benchmark_ellipsis"],
      ["Python list(range(1, 10^6 + 1))", "benchmark_range_list"],
    ]) {
      await session.evaluate(`${callable}()`);
      const samples = [];
      for (let index = 0; index < 7; index += 1) {
        const result = await session.evaluate(`${callable}()`);
        samples.push(Number(result.repr));
      }
      const elapsed = median(samples);
      if (!(elapsed > 0 && elapsed < 80)) {
        throw new Error(`${name} took ${elapsed.toFixed(2)} ms; budget 80 ms`);
      }
      results.push({ name, medianMs: elapsed, samplesMs: samples });
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.benchmark/exact-integer-range-v1",
      workload: "one million consecutive positive exact integers",
      warmup: 1,
      samples: 7,
      budgetMs: 80,
      results,
    }, null, 2)}\n`);
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
