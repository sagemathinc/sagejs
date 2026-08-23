#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const wasm = join(root, "packages/flint-wasm/dist/flint-factor.wasm");

function route(result, capabilityId) {
  return result.instrumentation.routes.find(
    (record) => record.capability_id === capabilityId,
  );
}

async function withSession(callback) {
  const { createSage } = await import(
    join(root, "packages/flint-wasm/node-kernel.mjs")
  );
  const session = await createSage();
  try {
    return await callback(session);
  } finally {
    await session.close();
  }
}

const orderCapability = "ffi:flint:number_field_order_maximal_at_primes";

test(
  "the public cubic maximal order selects one generated Wasm Round-2 batch",
  { skip: !existsSync(wasm) && "build packages/flint-wasm first" },
  async () => {
    await withSession(async (session) => {
      const result = await session.evaluate(`
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 - 6)
O = K.maximal_order(trace=True)
certificate = O.maximality_certificate()
native = [event for event in O.maximal_order_trace()['events']
          if event['stage'] == 'native-local-orders'][0]
print(O.discriminant())
print(certificate['index'])
print(certificate['certified'])
print(native['state'])
print(native['details']['execution_route'])
print(native['details']['compact_resource_unavailable'])
`);
      assert.equal(
        result.stdout,
        "-972\n1\nTrue\ncomplete\ngenerated-round2-primitives\nTrue\n",
      );
      const selected = route(result, orderCapability);
      assert.ok(selected, JSON.stringify(result.instrumentation, null, 2));
      // Construction and independent certificate replay each use one batch.
      assert.equal(selected.execution_target, "wasm-artifact");
      assert.equal(selected.selected_route, "receipt-backed-wasm-artifact");
      assert.equal(selected.call_count, 2);
      assert.equal(selected.ingress_bytes, 32);
    });
  },
);

test(
  "direct Wasm Round-2 and the disabled primitive fallback agree exactly",
  { skip: !existsSync(wasm) && "build packages/flint-wasm first" },
  async () => {
    await withSession(async (session) => {
      const direct = await session.evaluate(`
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 + x^2 - 2*x + 8)
from sagejs.number_fields.maximal_order import maximal_overorder_native
O = maximal_overorder_native(K.equation_order(), [2])
print(O.basis())
print(O.discriminant())
`);
      assert.equal(direct.stdout, "[1, 1/2*a^2 + 1/2*a, a^2]\n-503\n");
      assert.equal(route(direct, orderCapability)?.call_count, 1);

      const fallback = await session.evaluate(`
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^3 + x^2 - 2*x + 8)
import sagejs.number_fields.maximal_order_engine as engine
import sagejs.number_fields.maximal_order as maximal_order
def unavailable(*args, **kwds):
    raise RuntimeError('forced disabled native route')
engine.native_order_from_polynomial = unavailable
maximal_order.maximal_overorder_native = unavailable
O = K.maximal_order(trace=True)
certificate = O.maximality_certificate()
native = [event for event in O.maximal_order_trace()['events']
          if event['stage'] == 'native-local-orders'][0]
local = [event for event in O.maximal_order_trace()['events']
         if event['stage'] == 'round2-local-order'][0]
print(O.basis())
print(O.discriminant())
print(certificate['index'])
print(certificate['certified'])
print(native['state'])
print(local['details']['used_algorithm'])
`);
      assert.equal(
        fallback.stdout,
        "[1, 1/2*a^2 + 1/2*a, a^2]\n-503\n2\nTrue\nunavailable\nround2\n",
      );
      assert.equal(route(fallback, orderCapability), undefined);
      assert.ok(
        direct.instrumentation.boundary_crossings <
          fallback.instrumentation.boundary_crossings,
        JSON.stringify(
          {
            direct: direct.instrumentation,
            fallback: fallback.instrumentation,
          },
          null,
          2,
        ),
      );
    });
  },
);
