// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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
from sagejs.modular_forms import SupersingularModule
S = SupersingularModule(37)
[
    K.modulus(),
    a^81 == a,
    a != 0,
    a * (a^-1),
    ((a + 1) / (a + 2)) * (a + 2) == a + 1,
    (a + 2) - (a + 1) == 1,
    -a + a == 0,
    product.degree(),
    power.degree(),
    product == R(product.list()),
    product - right + right == product,
    -power + power == 0,
    [product[0], product[80], product[160], product[256]],
    [power[0], power[1], power[5], power[85]],
    S.point_coordinates(),
    S.basis_digest(),
    S.operator_digest(2),
]
`;

const expected =
  "[x^4 + 2*x^3 + 2, True, True, 1, True, True, True, 256, 85, True, True, True, " +
  "[2*a^3 + 2*a + 2, 2, 2*a^2 + 2*a + 1, 1], " +
  "[2, 2*a, 2*a^3 + 2*a + 1, 1], " +
  "((8, 0), (20, 10), (23, 27)), " +
  "'ab0d3799fc12661e698c973647320a3b2b0c023bfcdec50c1857625f1caf083d', " +
  "'40aed650ea445b6ddee3393ad87e1c18791688b093df6cba1df9251e81ad86ec']";

test(
  "public GF(p^n) elements and dense polynomials agree in native and Wasm",
  { timeout: 120_000 },
  async (t) => {
    const wasiRuntime = path.join(
      root,
      "packages/flint-wasm/dist/wasi-runtime.mjs",
    );
    if (!fs.existsSync(wasiRuntime)) {
      t.skip("build the FLINT Wasm release artifact first");
      return;
    }

    let native;
    let wasm;
    try {
      const { createSage: createWasmSage } = await import(wasmKernel);
      native = await createNativeSage();
      wasm = await createWasmSage();
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
        "ffi:flint:fq_element_add",
        "ffi:flint:fq_element_coordinate_bytes",
        "ffi:flint:fq_element_inverse",
        "ffi:flint:fq_element_mul",
        "ffi:flint:fq_element_neg",
        "ffi:flint:fq_element_pow",
        "ffi:flint:fq_element_sub",
        "ffi:flint:fq_polynomial",
        "ffi:flint:fq_polynomial_add",
        "ffi:flint:fq_polynomial_mul",
        "ffi:flint:fq_polynomial_neg",
        "ffi:flint:fq_polynomial_pow",
        "ffi:flint:fq_polynomial_sub",
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
      await Promise.all([native?.close(), wasm?.close()]);
    }
  },
);
