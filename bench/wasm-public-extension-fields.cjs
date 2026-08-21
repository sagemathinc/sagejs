#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const wasmKernel = pathToFileURL(
  path.join(root, "packages/flint-wasm/node-kernel.mjs"),
).href;

const setup = String.raw`
P.<t> = PolynomialRing(GF(65537))
K.<a> = GF(65537^3, modulus=t^3 + 3*t + 6)
R.<x> = PolynomialRing(K)
f = x^1024 + (a^2 + 7*a + 11)*x^511 + a + 19
g = (x + a + 1)^384
`;

const workload = String.raw`
answer = f
for _index in range(12):
    answer = answer * g
[answer.degree(), answer[0], answer[answer.degree()]]
`;

async function main() {
  const { createSage } = await import(wasmKernel);
  const session = await createSage();
  try {
    const fullWorkload = `${setup}\n${workload}`;
    await session.evaluate(fullWorkload);
    const samples = [];
    let last;
    for (let index = 0; index < 5; index += 1) {
      const started = performance.now();
      last = await session.evaluate(fullWorkload);
      samples.push(performance.now() - started);
    }
    assert.equal(last.repr, "[5632, 2489*a^2 + 10289*a + 35777, 1]");
    const fqRoutes = last.instrumentation.routes.filter((route) =>
      route.capability_id.startsWith("ffi:flint:fq_polynomial"),
    );
    assert.ok(
      fqRoutes.some(
        (route) =>
          route.capability_id === "ffi:flint:fq_polynomial_mul" &&
          route.call_count >= 12 &&
          route.execution_target === "wasm-artifact",
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(last.instrumentation),
      /python-fallback|dynamic-python|portable-fallback|shared-runtime-js/,
    );
    samples.sort((left, right) => left - right);
    console.log(
      JSON.stringify(
        {
          schema: "sagejs.wasm-public-extension-fields-benchmark/v1",
          field: "GF(65537^3)",
          operand_degrees: [1024, 384],
          chained_multiplications: 12,
          result_degree: 5632,
          samples_ms: samples.map((value) => Number(value.toFixed(3))),
          median_ms: Number(samples[2].toFixed(3)),
          route: "ffi:flint:fq_polynomial_mul",
          execution_target: "wasm-artifact",
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
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
