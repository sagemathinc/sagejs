"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("wide-prime polynomial resources follow backend capability without Node", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "import sagejs._baselib.polynomial as polynomial",
      "backend = rt.flint_backend()",
      "PolynomialRing(GF(18446744073709551653), 'warmup').gen()",
      "polynomial._generated_flint_resources_available_cache = rt.undefined",
      "global_object = rt.global_object",
      "saved_process = rt.reflect.get(global_object, 'process')",
      "formatter = rt.reflect.get(backend, 'ffiFmpzModPolynomialFormat')",
      "rt.reflect.deleteProperty(global_object, 'process')",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzModPolynomialFormat')",
      "try:",
      "    R = PolynomialRing(GF(18446744073709551629), 'x')",
      "    x = R.gen()",
      "    f = x^4 + 3*x + 7",
      "    answer = [f.gcd(f.derivative()), f(5)]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzModPolynomialFormat', formatter)",
      "    rt.reflect.set(global_object, 'process', saved_process)",
      "answer",
    ].join("\n"));
    assert.equal(result.repr, "[1, 647]");
  } finally {
    await session.close();
  }
});

test("integer row selection falls back when the generated selector is absent", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "backend = rt.flint_backend()",
      "selector = rt.reflect.get(backend, 'ffiFmpzMatrixSelectRows')",
      "A = matrix(ZZ, [[2^70, 2, 3], [4, 5, 6], [7, 8, 9]])",
      "rt.reflect.deleteProperty(backend, 'ffiFmpzMatrixSelectRows')",
      "try:",
      "    selected = A.matrix_from_rows([2, 0, 2])",
      "    empty = A.matrix_from_rows([])",
      "    answer = [selected.list(), selected.dimensions(), empty.dimensions()]",
      "finally:",
      "    rt.reflect.set(backend, 'ffiFmpzMatrixSelectRows', selector)",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[[7, 8, 9, 1180591620717411303424, 2, 3, 7, 8, 9], (3, 3), (0, 3)]",
    );
  } finally {
    await session.close();
  }
});
