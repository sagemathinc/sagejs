import assert from "node:assert/strict";
import test from "node:test";

import { chromium, firefox, webkit } from "playwright-core";

import { createSage } from "../node-kernel.mjs";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "./browser-wasm-support.mjs";

const workload = [
  "import sagejs.runtime as rt",
  "backend = rt.flint_backend()",
  "numeric_limit = backend.numericHandleCacheLimit",
  "algebraic_limits = backend.algebraicHandleCacheLimits",
  "before = backend.numericLiveCount()",
  "def f(n):",
  "    return Li(n) - Li(n-1)",
  "total = 0",
  "for i in range(2000):",
  "    total += f(3)",
  "after_li = backend.numericLiveCount()",
  "real_value = RR(0)",
  "for i in range(5000):",
  "    real_value = real_value + 1",
  "complex_value = CC(0)",
  "for i in range(5000):",
  "    complex_value = complex_value + 1",
  "after_numeric = backend.numericLiveCount()",
  "for i in range(1100):",
  "    special_value = bessel_I(1+I, 2+I).n(80)",
  "after_special = backend.numericLiveCount()",
  "algebraic_value = AA(0)",
  "for i in range(5000):",
  "    algebraic_value = algebraic_value + 1",
  "after_algebraic = backend.__sagejs_algebraic_live_count__()",
  "algebraic_matrix = matrix(AA, 2, [1, 0, 0, 1])",
  "for i in range(100):",
  "    algebraic_matrix = algebraic_matrix + algebraic_matrix",
  "after_matrices = backend.__sagejs_algebraic_matrix_live_count__()",
  "identity = matrix(QQ, 2, [1, 0, 0, 1])",
  "rational_matrix = matrix(QQ, 2, [1, 2, 3, 4])",
  "saved_matrix = rational_matrix",
  "for i in range(600):",
  "    rational_matrix = rational_matrix + identity",
  "increment = vector(QQ, [1, 1])",
  "rational_vector = vector(QQ, [1, 2])",
  "saved_vector = rational_vector",
  "for i in range(600):",
  "    rational_vector = rational_vector + increment",
  "prime_ring = PolynomialRing(GF(3), 't')",
  "t = prime_ring.gen()",
  "extension = GF(3^4, 'a', modulus=t^4+t+2)",
  "a = extension.gen()",
  "extension_value = extension(1)",
  "saved_extension_value = extension_value",
  "for i in range(1000):",
  "    extension_value = extension_value + a",
  "extension_ring = PolynomialRing(extension, 'u')",
  "u = extension_ring.gen()",
  "extension_polynomial = u",
  "saved_extension_polynomial = extension_polynomial",
  "for i in range(200):",
  "    extension_polynomial = extension_polynomial + extension_ring(a)",
  "large_prime = GF(2^127-1)",
  "large_ring = PolynomialRing(large_prime, 'v')",
  "v = large_ring.gen()",
  "large_polynomial = v",
  "saved_large_polynomial = large_polynomial",
  "for i in range(200):",
  "    large_polynomial = large_polynomial + large_ring(i)",
  "saved_field = extension",
  "saved_field_value = a^7 + a + 2",
  "field_values = []",
  "for i in range(50):",
  "    field_i = GF(3^4, 'a' + str(i), modulus=t^4+t+2)",
  "    field_values.append(field_i.gen()^7 + field_i.gen() + 2)",
  "p1_values = [P1List(level) for level in range(2, 80)]",
  "after_generated = backend.__sagejs_wasm_resource_live_count__()",
  "after_p1 = backend.p1ActiveHandleCount()",
  "print(before, after_li, after_numeric <= numeric_limit,",
  "      after_special <= numeric_limit,",
  "      after_algebraic <= algebraic_limits['values'],",
  "      after_matrices <= algebraic_limits['matrices'])",
  "print(Li(2), abs(Li(3)-1.11842481454970) < 1e-13,",
  "      abs(li(3)-2.16358859466719) < 1e-13,",
  "      abs(total-2000*Li(3)) < 1e-9)",
  "print(li(0) == 0, li(1) == float('-inf'),",
  "      abs(Li(0)+1.0451637801174927) < 1e-13,",
  "      Li(1) == float('-inf'),",
  "      sum(Li(n) for n in [1, 2, 3]) == float('-inf'))",
  "print(real_value == 5000, complex_value == 5000,",
  "      algebraic_value == 5000,",
  "      algebraic_matrix[0,0] == 2^100)",
  "print(after_generated <= 360, after_p1 <= backend.p1HandleCacheLimit,",
  "      rational_matrix[0,0] == 601, saved_matrix[0,0] == 1,",
  "      rational_vector[0] == 601, saved_vector[0] == 1)",
  "print(saved_extension_value == 1,",
  "      extension_value == extension(1) + 1000*a,",
  "      saved_extension_polynomial == u,",
  "      extension_polynomial == u + extension_ring(200*a),",
  "      saved_large_polynomial == v,",
  "      large_polynomial == v + large_ring(sum(range(200))),",
  "      saved_field_value == saved_field.gen()^7 + saved_field.gen() + 2,",
  "      field_values[0] == GF(3^4, 'a0', modulus=t^4+t+2).gen()^7 + GF(3^4, 'a0', modulus=t^4+t+2).gen() + 2,",
  "      p1_values[0].N() == 2, len(p1_values[0]) == 3)",
].join("\n");

const expected = [
  "0 0 True True True True",
  "0 True True True",
  "True True True True True",
  "True True True True",
  "True True True True True True",
  "True True True True True True True True True True",
  "",
].join("\n");

function assertWorkload(result) {
  assert.equal(result.stdout, expected);
  const routes = new Map(
    result.instrumentation.routes.map((route) => [
      route.capability_id,
      route.selected_route,
    ]),
  );
  for (const id of [
    "napi:@sagemath/sagejs-flint:complexEi",
    "napi:@sagemath/sagejs-flint:complexBesselI",
    "algebraic:qqbar-resource-core",
  ]) {
    assert.equal(routes.get(id), "receipt-backed-wasm-artifact", id);
  }
}

test("public Node-Wasm numeric and algebraic lifetimes stay bounded", async () => {
  const sage = await createSage();
  try {
    assertWorkload(await sage.evaluate(workload, { timeout: 120_000 }));
  } finally {
    await sage.close();
  }
});

const browserTypes = { chromium, firefox, webkit };
for (const [engine, browserType] of Object.entries(browserTypes)) {
  const executablePath = executablePathFor(engine, browserType);
  test(`public ${engine} numeric and algebraic lifetimes stay bounded`, {
    skip: executablePath ? false : `${engine} is unavailable`,
    timeout: 180_000,
  }, async () => {
    const server = await createBrowserWasmServer();
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium"
        ? ["--no-sandbox", "--disable-dev-shm-usage"]
        : [],
    });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/browser-wasm-harness.html`, {
        waitUntil: "load",
      });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      const result = await page.evaluate(
        ({ source }) => window.__sagejsTest.evaluate(source, 120_000),
        { source: workload },
      );
      assertWorkload(result);
    } finally {
      await browser.close();
      await server.close();
    }
  });
}
