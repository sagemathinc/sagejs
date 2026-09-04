#!/usr/bin/env node
"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");

async function measure(session, source) {
  const started = performance.now();
  await session.evaluate(source);
  return performance.now() - started;
}

async function main() {
  const level = Number(process.argv[2]);
  const weight = Number(process.argv[3] ?? 2);
  const session = await createSage();
  try {
    let result = await session.evaluate([
      `M=ModularForms(Gamma1(${level}),${weight})`,
      "precision=M.sturm_bound()+1",
      "A=M.character_components()",
      "print([(c.character().conrey_number(),c.character().order(),c.dimension(),c.field_degree(),c.rational_dimension()) for c in A])",
    ].join("\n"));
    console.log(result.stdout.trim());
    const count = Number((await session.evaluate("print(len(A))")).stdout.trim());
    for (let index = 0; index < count; index += 1) {
      const cuspElapsed = await measure(
        session,
        `F=A[${index}].fixed_character_space()\nCS${index}=F.cuspidal_subspace()\nBC${index}=CS${index}.q_expansion_basis(precision)`,
      );
      console.log(`cuspidal basis component ${index}: ${cuspElapsed.toFixed(1)} ms`);
      const eisensteinElapsed = await measure(
        session,
        `ES${index}=F.eisenstein_subspace()\nBE${index}=ES${index}.q_expansion_basis(precision)`,
      );
      console.log(`Eisenstein basis component ${index}: ${eisensteinElapsed.toFixed(1)} ms`);
    }
    await session.evaluate("S=M.cuspidal_subspace()\nC=S.character_components()");
    for (let index = 0; index < count; index += 1) {
      const elapsed = await measure(
        session,
        `F=C[${index}].fixed_character_space()\nT${index}=F.hecke_matrix(2)`,
      );
      console.log(`cuspidal T2 component ${index}: ${elapsed.toFixed(1)} ms`);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
