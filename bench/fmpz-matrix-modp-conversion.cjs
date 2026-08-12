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
    process.env.SAGEJS_FMPZ_MODP_SAMPLES,
    5,
  )));
  const scale = positive(process.env.SAGEJS_FMPZ_MODP_BUDGET_SCALE, 1);
  const session = await createSage();
  try {
    await session.evaluate([
      "import sagejs.runtime as _modp_runtime",
      "_modp_n = 1000",
      "_modp_values = [(index - 500000) * (index + 17) for index in range(_modp_n**2)]",
      "_modp_source = matrix(ZZ, _modp_n, _modp_n, _modp_values)",
      "def _modp_time(callable):",
      "    started = _modp_runtime.wall_time()",
      "    result = callable()",
      "    if result.dimensions() != (_modp_n, _modp_n):",
      "        raise RuntimeError('modular conversion dimensions changed')",
      "    return (_modp_runtime.wall_time() - started) * 1000",
      "def _modp_direct_2(): return _modp_source.change_ring(GF(2))",
      "def _modp_direct_97(): return _modp_source.change_ring(GF(97))",
      "def _modp_host_97(): return matrix(GF(97), _modp_n, _modp_n, _modp_source.list())",
    ].join("\n"));

    const cases = [
      ["generated ZZ -> GF(2)", "_modp_direct_2", 80],
      ["generated ZZ -> GF(97)", "_modp_direct_97", 60],
      ["host Integer oracle GF(97)", "_modp_host_97", 1000],
    ];
    const measurements = new Map();
    const failures = [];
    console.log(`FmpzMatrix modular conversion (${samples} warm samples)`);
    for (const [label, functionName, budget] of cases) {
      await session.evaluate(`${functionName}()`);
      const timings = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const result = await session.evaluate(`_modp_time(${functionName})`);
        timings.push(Number(result.repr));
      }
      const elapsed = median(timings);
      measurements.set(functionName, elapsed);
      const limit = budget * scale;
      console.log(
        `  ${label.padEnd(28)} ${elapsed.toFixed(2)} ms / ${limit.toFixed(2)} ms`,
      );
      if (!(elapsed > 0 && elapsed <= limit)) failures.push(label);
    }
    const direct = measurements.get("_modp_direct_97");
    const host = measurements.get("_modp_host_97");
    console.log(`  host-materialization speedup  ${(host / direct).toFixed(1)}x`);
    if (!(direct * 3 <= host)) {
      failures.push("generated conversion speedup");
    }
    if (failures.length !== 0) {
      throw new Error(`modular conversion budget exceeded: ${failures.join(", ")}`);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
