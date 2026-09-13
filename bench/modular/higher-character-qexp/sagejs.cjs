#!/usr/bin/env node
"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");

const cases = {
  level_101: [101, 5],
  level_157: [157, 13],
  level_241: [241, 15],
  level_401: [401, 25],
};

async function main() {
  const id = process.argv[2];
  if (!(id in cases)) throw new Error(`unknown benchmark case: ${id}`);
  const [level, exponent] = cases[id];
  const session = await createSage();
  try {
    await session.evaluate(
      `chi=DirichletGroup(${level}).gen(0)^${exponent}`,
    );
    const started = performance.now();
    const result = await session.evaluate(
      [
        "S=CuspForms(chi,3)",
        "d=S.dimension()",
        "B=S.q_expansion_basis(d+3)",
        "a=B[0][d+1]",
        "p=a.minpoly()",
        "print(d,chi.order(),S.base_ring().degree(),p(2)/p[p.degree()],p.degree())",
      ].join(";"),
    );
    const milliseconds = performance.now() - started;
    const [dimension, order, fieldDegree, fingerprint, fingerprintDegree] =
      result.stdout.trim().split(/\s+/);
    console.log(
      JSON.stringify({
        system: "Sage.js",
        id,
        milliseconds,
        dimension: Number(dimension),
        order: Number(order),
        field_degree: Number(fieldDegree),
        fingerprint,
        fingerprint_degree: Number(fingerprintDegree),
      }),
    );
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
