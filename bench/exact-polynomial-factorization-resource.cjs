#!/usr/bin/env node

"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const saved = process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI;
  process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI = "1";
  const session = await createSage();
  try {
    const setup = await session.evaluate([
      "import sagejs.runtime as runtime",
      "Rz = PolynomialRing(ZZ, 'x'); x = Rz.gen()",
      "Rq = PolynomialRing(QQ, 'y'); y = Rq.gen()",
      "huge_numerator = 2**65537 + 17",
      "huge_denominator = 2**32771 + 9",
      "z = -huge_numerator*(x - 1)**30*(x + 2)**20*(x**2 + x + 1)**10",
      "q = QQ(-huge_numerator, huge_denominator)*(y - 1)**30*(y + 2)**20*(y**2 + y + 1)**10",
      "assert z.factor().value() == z",
      "assert q.factor().value() == q",
      "def _time_factor(value):",
      "    started = runtime.wall_time()",
      "    result = value.factor()",
      "    elapsed = (runtime.wall_time() - started) * 1000",
      "    assert result.value() == value",
      "    return elapsed",
    ].join("\n"));
    if (setup.stderr !== undefined) throw new Error(setup.stderr);

    const results = [];
    for (const [ring, variable] of [["ZZ", "z"], ["QQ", "q"]]) {
      await session.evaluate(`_time_factor(${variable})`);
      const samples = [];
      for (let index = 0; index < 5; index += 1) {
        const result = await session.evaluate(`_time_factor(${variable})`);
        if (result.stderr !== undefined) throw new Error(result.stderr);
        samples.push(Number(result.repr));
      }
      results.push({ ring, median_ms: median(samples), samples_ms: samples });
    }

    console.log(JSON.stringify({
      schema: "sagejs.benchmark/exact-polynomial-factorization-resource-v1",
      implementation: "generated-callee-owned-flint-resource",
      workload: {
        degree: 70,
        numerator_bits: 65_538,
        denominator_bits: 32_772,
        samples: 5,
      },
      properties: {
        factorization_computations_per_sample: 1,
        caller_limb_capacity: false,
        packed_retry: false,
        legacy_napi: false,
      },
      results,
    }, null, 2));
  } finally {
    session.close();
    if (saved === undefined) delete process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI;
    else process.env.SAGEJS_FORBID_POLYNOMIAL_NAPI = saved;
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
