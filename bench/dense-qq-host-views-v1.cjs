#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const scale = Number(process.env.SAGEJS_DENSE_QQ_HOST_BUDGET_SCALE || "1");
  if (!(Number.isFinite(scale) && scale > 0)) {
    throw new Error("SAGEJS_DENSE_QQ_HOST_BUDGET_SCALE must be positive");
  }
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as runtime",
      "_qq_host_rows = 500",
      "_qq_host_columns = 500",
      "_qq_host_values = [1.._qq_host_rows*_qq_host_columns]",
      "_qq_host_matrix = matrix(QQ, _qq_host_rows, _qq_host_columns, _qq_host_values)",
      "def _qq_host_measure(function, rounds=5):",
      "    samples = []",
      "    for _round in range(rounds):",
      "        started = runtime.wall_time()",
      "        result = function()",
      "        if result is None:",
      "            raise RuntimeError('unexpected empty dense QQ result')",
      "        samples.append(1000 * (runtime.wall_time() - started))",
      "    samples.sort()",
      "    return samples[len(samples) // 2]",
      "def _qq_host_construct(): return matrix(QQ, _qq_host_rows, _qq_host_columns, _qq_host_values)",
      "def _qq_host_list(): return _qq_host_matrix.list()",
    ].join("\n"));

    await session.evaluate("_qq_host_construct()");
    const construction = Number(
      (await session.evaluate("_qq_host_measure(_qq_host_construct, 5)")).repr,
    );
    const firstList = Number(
      (await session.evaluate("_qq_host_measure(_qq_host_list, 1)")).repr,
    );
    const repeatedList = Number(
      (await session.evaluate("_qq_host_measure(_qq_host_list, 7)")).repr,
    );
    console.log("Dense QQ host construction and views (500x500 warm)");
    console.log(`  integer-list construction         ${construction.toFixed(2)} ms`);
    console.log(`  first list                       ${firstList.toFixed(2)} ms`);
    console.log(`  repeated list median             ${repeatedList.toFixed(2)} ms`);
    const failures = [];
    if (construction > 75 * scale) failures.push("integer-list construction");
    if (firstList > 300 * scale) failures.push("first list");
    if (repeatedList > 5 * scale) failures.push("repeated list");
    if (repeatedList > firstList / 10 + 1) {
      failures.push("repeated-list cache ratio");
    }
    if (failures.length !== 0) {
      throw new Error(`dense QQ host budget exceeded: ${failures.join(", ")}`);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
