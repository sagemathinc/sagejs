#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const samples = Math.max(3, Number(process.env.SAGEJS_QQ_BULK_SAMPLES || 7));
  const scale = Number(process.env.SAGEJS_QQ_BULK_BUDGET_SCALE || 1);
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime
flat = [QQ(index % 101 - 50, index % 13 + 1) for index in range(300*300)]
nested = [flat[row*300:(row+1)*300] for row in range(300)]
def entry(row, column):
    return QQ((row*100 + column) % 101 - 50, (row + column) % 13 + 1)
def flat_case(): return matrix(QQ, 300, 300, flat)
def nested_case(): return matrix(QQ, nested)
def callable_case(): return matrix(QQ, 100, 100, entry)
def elapsed(callable):
    started = runtime.wall_time()
    result = callable()
    assert result.nrows() >= 0
    return (runtime.wall_time() - started) * 1000
`);
    const cold = Number((await session.evaluate("elapsed(flat_case)")).repr);
    const coldLimit = 120 * scale;
    console.log(
      `${"cold flat QQ 300x300".padEnd(24)} ${cold.toFixed(2)} ms / ${coldLimit.toFixed(2)} ms`,
    );
    if (!(cold > 0 && cold <= coldLimit)) {
      throw new Error("cold dense QQ construction budget exceeded");
    }
    await session.evaluate("flat_case(); nested_case(); callable_case()");
    const cases = [
      ["flat QQ 300x300", "flat_case", 45],
      ["nested QQ 300x300", "nested_case", 65],
      ["callable QQ 100x100", "callable_case", 75],
    ];
    const failures = [];
    for (const [name, functionName, budget] of cases) {
      const timings = [];
      for (let sample = 0; sample < samples; sample += 1) {
        timings.push(Number((await session.evaluate(`elapsed(${functionName})`)).repr));
      }
      const measured = median(timings);
      const limit = budget * scale;
      console.log(`${name.padEnd(24)} ${measured.toFixed(2)} ms / ${limit.toFixed(2)} ms`);
      if (!(measured > 0 && measured <= limit)) failures.push(name);
    }
    if (failures.length) throw new Error(`dense QQ construction budget exceeded: ${failures.join(", ")}`);
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
