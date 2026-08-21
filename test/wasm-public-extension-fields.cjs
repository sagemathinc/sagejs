"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const { createSage: createNativeSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const wasmKernel = pathToFileURL(
  path.join(root, "packages/flint-wasm/node-kernel.mjs"),
).href;

const publicWorkload = String.raw`
P.<t> = PolynomialRing(GF(3))
K.<a> = GF(3^4, modulus=t^4 + 2*t^3 + 2)
R.<x> = PolynomialRing(K)
left = x^160 + (a^3 + 2*a + 1)*x^80 + a + 2
right = (x + a + 1)^96
product = left * right
power = (x^5 + a*x + 2)^17
[
    K.modulus(),
    a^81 == a,
    a != 0,
    a * (a^-1),
    product.degree(),
    power.degree(),
    product == R(product.list()),
    [product[0], product[80], product[160], product[256]],
    [power[0], power[1], power[5], power[85]],
]
`;

const expected =
  "[x^4 + 2*x^3 + 2, True, True, 1, 256, 85, True, " +
  "[2*a^3 + 2*a + 2, 2, 2*a^2 + 2*a + 1, 1], " +
  "[2, 2*a, 2*a^3 + 2*a + 1, 1]]";

test("public GF(p^n) elements and dense polynomials agree in native and Wasm", async () => {
  const { createSage: createWasmSage } = await import(wasmKernel);
  const native = await createNativeSage();
  const wasm = await createWasmSage();
  try {
    const [nativeResult, wasmResult] = await Promise.all([
      native.evaluate(publicWorkload),
      wasm.evaluate(publicWorkload),
    ]);
    assert.equal(nativeResult.repr, expected);
    assert.equal(wasmResult.repr, nativeResult.repr);

    const routes = wasmResult.instrumentation.routes;
    const required = new Set([
      "ffi:flint:fq_context",
      "ffi:flint:fq_element",
      "ffi:flint:fq_element_mul",
      "ffi:flint:fq_element_pow",
      "ffi:flint:fq_polynomial",
      "ffi:flint:fq_polynomial_mul",
      "ffi:flint:fq_polynomial_pow",
    ]);
    for (const route of routes) {
      if (route.capability_id.startsWith("ffi:flint:fq_")) {
        assert.equal(route.selected_route, "receipt-backed-wasm-artifact");
        assert.equal(route.execution_target, "wasm-artifact");
        required.delete(route.capability_id);
      }
    }
    assert.deepEqual([...required], []);
    assert.doesNotMatch(
      JSON.stringify(wasmResult.instrumentation),
      /python-fallback|dynamic-python|portable-fallback|shared-runtime-js/,
    );
  } finally {
    await Promise.all([native.close(), wasm.close()]);
  }
});
