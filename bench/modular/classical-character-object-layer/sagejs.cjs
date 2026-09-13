#!/usr/bin/env node
"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");

const programs = {
  quadratic_bad_12: [
    "chi=[e for e in DirichletGroup(12) if e.conrey_number()==7][0]",
    "S=CuspForms(chi,3)",
    "T=S.hecke_matrix(2)",
    "print(S.dimension(),T.trace(),T.determinant())",
  ],
  quadratic_new_20: [
    "chi=[e for e in DirichletGroup(20) if e.conrey_number()==9][0]",
    "S=CuspForms(chi,4).new_subspace()",
    "T=S.hecke_matrix(3)",
    "print(S.dimension(),T.trace(),T.determinant())",
  ],
  cyclotomic_13: [
    "chi=[e for e in DirichletGroup(13) if e.conrey_number()==4][0]",
    "S=CuspForms(chi,2)",
    "T=S.hecke_matrix(2)",
    "print(S.dimension(),T.trace().minpoly()(2),T.trace().minpoly().degree())",
  ],
};

async function main() {
  const id = process.argv[2];
  if (!(id in programs)) throw new Error(`unknown benchmark case: ${id}`);
  const session = await createSage();
  try {
    const started = performance.now();
    const result = await session.evaluate(programs[id].join(";"));
    const milliseconds = performance.now() - started;
    const [dimension, fingerprint, degree] = result.stdout
      .trim()
      .split(/\s+/)
      .map(Number);
    console.log(
      JSON.stringify({
        system: "Sage.js",
        id,
        milliseconds,
        dimension,
        fingerprint,
        degree,
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
