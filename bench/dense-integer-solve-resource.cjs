#!/usr/bin/env node
"use strict";

const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  process.chdir(root);
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as runtime",
      "_solve_left = matrix(ZZ, 40, 40, [100 if row == column else ((17*row + 29*column) % 3 - 1) for row in range(40) for column in range(40)])",
      "_solve_right = matrix(ZZ, 40, 8, [((31*row + 43*column) % 101 - 50) for row in range(40) for column in range(8)])",
      "def _time_integer_solve():",
      "    started = runtime.wall_time()",
      "    result = _solve_left.solve_right(_solve_right)",
      "    assert _solve_left*result == _solve_right",
      "    return (runtime.wall_time() - started)*1000",
    ].join("\n"));
    await session.evaluate("_time_integer_solve()");
    const samples = [];
    for (let index = 0; index < 7; index += 1) {
      const result = await session.evaluate("_time_integer_solve()");
      samples.push(Number(result.repr));
    }
    console.log(JSON.stringify({
      case: "dense ZZ solve_right 40x40 with 8 RHS",
      median_ms: median(samples),
      samples_ms: samples,
      previous_sagejs_ms: 88,
      reported_sage_ms: 4,
    }, null, 2));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
