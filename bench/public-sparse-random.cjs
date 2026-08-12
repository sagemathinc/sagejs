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
    await session.evaluate(String.raw`
import sagejs.runtime as _sparse_runtime

def _timed_sparse_random(base, rows, columns, density, **kwds):
    started = _sparse_runtime.wall_time()
    random_matrix(base, rows, columns, density=density, **kwds)
    return (_sparse_runtime.wall_time() - started) * 1000
`);

    const cases = [
      ["ZZ-1000-density-.1", "ZZ", 1000, 1000, 0.1, ""],
      ["QQ-1000-density-.1", "QQ", 1000, 1000, 0.1, ""],
      ["GF2-1000-density-.1", "GF(2)", 1000, 1000, 0.1, ""],
      ["GF7-1000-density-.1", "GF(7)", 1000, 1000, 0.1, ""],
      ["GF2-200-density-.1", "GF(2)", 200, 200, 0.1, ""],
      [
        "QQ-huge-bounds-200-density-.1",
        "QQ",
        200,
        200,
        0.1,
        ", num_bound=2**40, den_bound=2**40",
      ],
      ["QQ-1n-200-density-.1", "QQ", 200, 200, 0.1, ", distribution='1/n'"],
    ];
    const report = [];
    for (const [id, base, rows, columns, density, keywords] of cases) {
      const expression = `_timed_sparse_random(${base}, ${rows}, ${columns}, ${density}${keywords})`;
      const cold = Number((await session.evaluate(expression)).repr);
      const warm = [];
      for (let repeat = 0; repeat < 5; repeat += 1) {
        warm.push(Number((await session.evaluate(expression)).repr));
      }
      report.push({ id, cold_ms: cold, warm_median_ms: median(warm) });
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
