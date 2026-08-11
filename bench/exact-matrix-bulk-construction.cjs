#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function positive(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`invalid positive benchmark setting: ${value}`);
  }
  return number;
}

async function main() {
  const samples = Math.max(3, Math.floor(positive(
    process.env.SAGEJS_EXACT_MATRIX_INGRESS_SAMPLES,
    5,
  )));
  const scale = positive(
    process.env.SAGEJS_EXACT_MATRIX_INGRESS_BUDGET_SCALE,
    1,
  );
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as _ingress_runtime",
      "from sagejs_serialization import dumps as _ingress_dumps, loads as _ingress_loads",
      "_ingress_zvalues = [index % 201 - 100 for index in range(500*500)]",
      "_ingress_qvalues = [QQ(index % 101 - 50, index % 13 + 1) for index in range(300*300)]",
      "_ingress_z = matrix(ZZ, 500, 500, _ingress_zvalues)",
      "_ingress_q = matrix(QQ, 300, 300, _ingress_qvalues)",
      "_ingress_zpack = _ingress_dumps(_ingress_z)",
      "_ingress_qpack = _ingress_dumps(_ingress_q)",
      "def _ingress_time(callable):",
      "    started = _ingress_runtime.wall_time()",
      "    result = callable()",
      "    if result is None:",
      "        raise RuntimeError('bulk ingress returned None')",
      "    return (_ingress_runtime.wall_time() - started) * 1000",
      "def _ingress_z_construct(): return matrix(ZZ, 500, 500, _ingress_zvalues)",
      "def _ingress_q_construct(): return matrix(QQ, 300, 300, _ingress_qvalues)",
      "def _ingress_z_load(): return _ingress_loads(_ingress_zpack)",
      "def _ingress_q_load(): return _ingress_loads(_ingress_qpack)",
    ].join("\n"));

    const cases = [
      ["ZZ 500x500 entries", "_ingress_z_construct", 50],
      ["QQ 300x300 entries", "_ingress_q_construct", 140],
      ["ZZ 500x500 SagePack", "_ingress_z_load", 30],
      ["QQ 300x300 SagePack", "_ingress_q_load", 30],
    ];
    const failures = [];
    console.log(`Exact matrix bulk ingress (${samples} warm samples)`);
    for (const [name, functionName, budget] of cases) {
      await session.evaluate(`${functionName}()`);
      const timings = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const result = await session.evaluate(
          `_ingress_time(${functionName})`,
        );
        timings.push(Number(result.repr));
      }
      const elapsed = median(timings);
      const limit = budget * scale;
      console.log(
        `  ${name.padEnd(24)} ${elapsed.toFixed(2)} ms / ${limit.toFixed(2)} ms`,
      );
      if (!(elapsed > 0 && elapsed <= limit)) failures.push(name);
    }
    if (failures.length !== 0) {
      throw new Error(`exact matrix ingress budget exceeded: ${failures.join(", ")}`);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
