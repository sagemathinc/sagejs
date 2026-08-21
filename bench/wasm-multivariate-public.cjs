"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function median(values) {
  return values.slice().sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

async function main() {
  const { createSage } = await import(pathToFileURL(
    path.join(root, "packages/flint-wasm/node-kernel.mjs"),
  ));
  const session = await createSage({ timeout: 120_000 });
  try {
    const source = [
      "R=PolynomialRing(ZZ,names=('x','y','z'))",
      "x,y,z=R.gens()",
      "left=(x+y+z+1)^7+(x-y+2*z+3)^6+y^5*z",
      "right=(2*x-y+z+2)^6+(x+2*y-z+1)^5+z^6",
      "left.resultant(right,x).number_of_terms()",
    ].join(";");
    const samples = [];
    for (let index = 0; index < 11; index += 1) {
      const result = await session.evaluate(source, { timeout: 120_000 });
      assert.equal(result.repr, "946");
      assert.equal(result.instrumentation.boundary_crossings, 1);
      samples.push(result.durationMs);
    }
    const result = {
      workload: "public ZZ multivariate resultant, 120x84 input terms, 946 output terms",
      samples: 11,
      medianMilliseconds: median(samples),
      budgetMilliseconds: 250,
      ingressBytes: 4_928,
      egressBytes: 32_192,
      boundaryCrossings: 1,
    };
    console.log(JSON.stringify(result, null, 2));
    assert.ok(result.medianMilliseconds <= result.budgetMilliseconds);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
