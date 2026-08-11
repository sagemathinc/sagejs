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
      "zc = x**250 + (2**4097 + 17)*x + 1",
      "zf = 6*zc*x**3750",
      "zg = -9*zc*(x**3600 + 1)",
      "qc = y**125 + QQ(2**2049 + 9)/17*y + QQ(3)/11",
      "qf = QQ(6)/5*qc*y**1875",
      "qg = QQ(-9)/7*qc*(y**1800 + 1)",
      "assert zf.gcd(zg) == 3*zc",
      "assert qf.gcd(qg) == qc",
      "def _time_gcd(left, right):",
      "    started = runtime.wall_time()",
      "    value = left.gcd(right)",
      "    return (runtime.wall_time() - started) * 1000",
    ].join("\n"));
    if (setup.stderr !== undefined) throw new Error(setup.stderr);

    const cases = [
      ["ZZ", "zf", "zg"],
      ["QQ", "qf", "qg"],
    ];
    const results = [];
    for (const [ring, left, right] of cases) {
      await session.evaluate(`_time_gcd(${left}, ${right})`);
      const samples = [];
      for (let index = 0; index < 5; index += 1) {
        const result = await session.evaluate(`_time_gcd(${left}, ${right})`);
        if (result.stderr !== undefined) throw new Error(result.stderr);
        samples.push(Number(result.repr));
      }
      results.push({ ring, median_ms: median(samples), samples_ms: samples });
    }
    console.log(JSON.stringify({
      schema: "sagejs.benchmark/exact-polynomial-resource-gcd-v1",
      implementation: "generated-flint-resource",
      napi: "forbidden",
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
