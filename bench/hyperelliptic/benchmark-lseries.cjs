"use strict";

const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");

async function measured(session, name, source, timeout = 180_000) {
  const started = performance.now();
  const result = await session.evaluate(source, { timeout });
  return {
    stage: name,
    milliseconds: Number((performance.now() - started).toFixed(3)),
    result: result.repr,
  };
}

async function main() {
  const session = await createSage();
  try {
  const rows = [];
  rows.push(
    await measured(
      session,
      "construct",
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3-x+1)",
        "L = C.lseries()",
        "C.genus()",
      ].join("\n"),
    ),
  );
  rows.push(await measured(session, "global_reduction", "C.global_reduction()"));
  rows.push(await measured(session, "coefficients_5000", "len(L.coefficients(5000))"));
  rows.push(
    await measured(session, "values_32bit", "L.values([1, 1.5, 2], prec=32)"),
  );
  rows.push(
    await measured(session, "analytic_rank_32bit", "C.analytic_rank(prec=32)"),
  );
    console.log(
      JSON.stringify(
        {
          schema: "sagejs.hyperelliptic-lseries/benchmark-v1",
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          curve: "y^2 + (x^3-x+1)y = x",
          rows,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
