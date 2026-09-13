#!/usr/bin/env node
"use strict";

const { createSage } = require("../../../dist/tools/kernel.js");

async function main() {
  const [level, weight, index] = process.argv.slice(2).map(Number);
  const session = await createSage();
  try {
    const started = performance.now();
    const result = await session.evaluate(
      `S=CuspForms(${level},${weight}); T=S.hecke_matrix(${index}); ` +
        "print(S.dimension(),T.trace())",
    );
    const milliseconds = performance.now() - started;
    const [dimension, trace] = result.stdout.trim().split(/\s+/).map(Number);
    console.log(
      JSON.stringify({
        system: "Sage.js",
        level,
        weight,
        index,
        milliseconds,
        dimension,
        trace,
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
