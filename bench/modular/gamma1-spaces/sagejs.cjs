#!/usr/bin/env node
"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");

async function main() {
  const level = Number(process.argv[2]);
  const weight = Number(process.argv[3] ?? 2);
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new Error("level must be a positive machine integer");
  }
  const session = await createSage();
  try {
    await session.evaluate([
      `level=${level}`,
      `weight=${weight}`,
      "M=ModularForms(Gamma1(level),weight)",
      "precision=M.sturm_bound()+1",
      "diamond_index=2",
      "while gcd(diamond_index,level)!=1: diamond_index+=1",
    ].join("\n"));
    let started = performance.now();
    await session.evaluate("B=M.q_expansion_basis(precision)");
    const basisMs = performance.now() - started;
    console.error(`Sage.js N=${level} k=${weight}: basis ${basisMs.toFixed(1)} ms`);
    await session.evaluate("S=M.cuspidal_subspace()");
    started = performance.now();
    await session.evaluate("T=S.hecke_matrix(2)");
    const heckeMs = performance.now() - started;
    console.error(`Sage.js N=${level} k=${weight}: T2 ${heckeMs.toFixed(1)} ms`);
    started = performance.now();
    await session.evaluate("D=S.diamond_bracket_matrix(diamond_index)");
    const diamondMs = performance.now() - started;
    console.error(`Sage.js N=${level} k=${weight}: diamond ${diamondMs.toFixed(1)} ms`);
    const result = await session.evaluate(
      "print(M.dimension(),S.dimension(),precision,T.trace())",
    );
    const values = result.stdout.trim().split(/\s+/);
    console.log(JSON.stringify({
      system: "Sage.js",
      level,
      weight,
      dimension: Number(values[0]),
      cusp_dimension: Number(values[1]),
      precision: Number(values[2]),
      hecke_trace: values[3],
      basis_ms: basisMs,
      hecke_ms: heckeMs,
      diamond_ms: diamondMs,
    }));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
