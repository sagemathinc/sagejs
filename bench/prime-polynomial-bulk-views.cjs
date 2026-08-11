#!/usr/bin/env node

"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    const setup = await session.evaluate(`
import sagejs.runtime as runtime
R = PolynomialRing(GF(65521), "x")
f = R([(37 * index + 11) % 65521 for index in range(20000)])
def bulk_coefficients_time():
    started = runtime.wall_time()
    values = f.coefficients()
    assert len(values) == 20000
    return 1000 * (runtime.wall_time() - started)
def bulk_repr_time():
    started = runtime.wall_time()
    value = repr(f)
    assert len(value) > 100000
    return 1000 * (runtime.wall_time() - started)
`);
    if (setup.stderr !== undefined) throw new Error(setup.stderr);
    const results = {};
    for (const name of ["bulk_coefficients_time", "bulk_repr_time"]) {
      const samples = [];
      for (let index = 0; index < 8; index += 1) {
        const sample = await session.evaluate(`${name}()`);
        if (sample.stderr !== undefined) throw new Error(sample.stderr);
        samples.push(Number(sample.repr));
      }
      results[name] = { median_ms: median(samples.slice(1)), samples_ms: samples };
    }
    console.log(JSON.stringify({
      schema: "sagejs.benchmark/prime-polynomial-bulk-views-v1",
      degree: 19999,
      modulus: 65521,
      results,
    }, null, 2));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
