#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as runtime",
      "R = PolynomialRing(ZZ, 'x')",
      "S = PolynomialRing(QQ, 'y')",
      "z = R([index % 17 - 8 for index in range(100001)])",
      "q = S([QQ(index % 17 - 8)/(index % 7 + 1) for index in range(100001)])",
      "def median_time(operation):",
      "    operation()",
      "    samples = []",
      "    for _sample in range(9):",
      "        started = runtime.wall_time()",
      "        result = operation()",
      "        samples.append((runtime.wall_time() - started) * 1000)",
      "    return [sorted(samples)[4], result._coefficient_length()]",
      "[",
      "    median_time(lambda: z // -7),",
      "    median_time(lambda: z[:50000]),",
      "    median_time(lambda: q // (QQ(-7)/11)),",
      "    median_time(lambda: q[:50000]),",
      "]",
    ].join("\n"));
    if (result.stderr !== undefined) throw new Error(result.stderr);
    const parsed = Function(`return (${result.repr})`)();
    const names = ["ZZ_scalar_floor_div", "ZZ_prefix_slice", "QQ_scalar_div", "QQ_prefix_slice"];
    console.log(JSON.stringify({
      schema: "sagejs.benchmark/exact-polynomial-scalar-slice-v1",
      degree: 100000,
      samples: 9,
      implementation: "generated-flint-resource",
      results: names.map((name, index) => ({
        name,
        median_ms: parsed[index][0],
        result_length: parsed[index][1],
      })),
    }, null, 2));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
