"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("exact polynomial construction follows each backend lifecycle", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "import sagejs.runtime as rt",
      "import sagejs._baselib.polynomial as polynomial",
      "backend = rt.flint_backend()",
      "names = ['ffiFmpzPolynomialFromByteRegion', 'ffiFmpzPolynomialClose', 'ffiFmpqPolynomialFromByteRegion', 'ffiFmpqPolynomialClose']",
      "saved = [rt.reflect.get(backend, name) for name in names]",
      "for name in names:",
      "    rt.reflect.deleteProperty(backend, name)",
      "polynomial._generated_fmpz_polynomial_resources_available_cache = rt.undefined",
      "polynomial._generated_fmpq_polynomial_resources_available_cache = rt.undefined",
      "try:",
      "    R = PolynomialRing(ZZ, 'x')",
      "    x = R.gen()",
      "    f = x^2 - 5",
      "    S = PolynomialRing(QQ, 'y')",
      "    y = S.gen()",
      "    g = (3/2)*y + 1/3",
      "    K = NumberField(f, 'a')",
      "    answer = [f, f.coefficients(), g, g.coefficients(), K.signature()]",
      "finally:",
      "    for index in range(len(names)):",
      "        rt.reflect.set(backend, names[index], saved[index])",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[x^2 - 5, [-5, 0, 1], 3/2*y + 1/3, [1/3, 3/2], (2, 0)]",
    );
    assert.doesNotMatch(
      JSON.stringify(result.instrumentation ?? {}),
      /Fmp(?:q|z)Polynomial(?:FromByteRegion|Close)|fmp(?:q|z)_polynomial_from_byte_region/,
    );
  } finally {
    await session.close();
  }
});
