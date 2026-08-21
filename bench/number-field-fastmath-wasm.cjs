#!/usr/bin/env node
"use strict";

const { join } = require("node:path");

const root = join(__dirname, "..");
const capabilityId = "ffi:flint:number_field_order_maximal_at_primes";

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function measure(session, source, samples = 5) {
  const timings = [];
  let latest;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    latest = await session.evaluate(source);
    timings.push(performance.now() - started);
  }
  const route = latest.instrumentation.routes.find(
    (record) => record.capability_id === capabilityId,
  );
  return {
    warm_median_ms: median(timings.slice(1)),
    samples_ms: timings,
    stdout: latest.stdout,
    boundary_crossings: latest.instrumentation.boundary_crossings,
    copied_bytes: latest.instrumentation.copied_bytes,
    route: route ?? null,
  };
}

async function main() {
  const { createSage } = await import(
    join(root, "packages/flint-wasm/node-kernel.mjs")
  );
  const session = await createSage();
  try {
    const publicBatch = await measure(
      session,
      `
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 + x^2 - 2*x + 8)
O = K.maximal_order(trace=True)
print(O.discriminant(), O.maximality_certificate()['index'])
`,
    );
    const directBatch = await measure(
      session,
      `
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - 6)
from sagejs.number_fields.maximal_order import maximal_overorder_native
O = maximal_overorder_native(K.equation_order(), [2, 3])
print(O.discriminant())
`,
    );
    const fallback = await measure(
      session,
      `
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 + x^2 - 2*x + 8)
import sagejs.number_fields.maximal_order_engine as engine
import sagejs.number_fields.maximal_order as maximal_order
def unavailable(*args, **kwds):
    raise RuntimeError('forced disabled native route')
engine.native_order_from_polynomial = unavailable
maximal_order.maximal_overorder_native = unavailable
O = K.maximal_order(trace=True)
print(O.discriminant(), O.maximality_certificate()['index'])
`,
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "sagejs.number-fields/fastmath-wasm-benchmark-v1",
          workload: {
            public_batch: "maximal order and certificate for cubic index two",
            direct_batch: "one FLINT Round-2 batch at p=2,3",
            disabled_fallback: "dynamic exact Round-2 for cubic index two",
          },
          public_batch: publicBatch,
          direct_batch: directBatch,
          disabled_fallback: fallback,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
