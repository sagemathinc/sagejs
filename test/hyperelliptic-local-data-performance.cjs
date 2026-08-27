// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("packed local coefficient chunks avoid polynomial resources and preserve exact rows", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "from sagejs.hyperelliptic_curves.frobenius import rational_local_coefficient_chunks",
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "chunks = list(rational_local_coefficient_chunks(C,3,29,'smalljac',3))",
            "rows = [row for chunk in chunks for row in chunk]",
            "cache_after_coefficients = len(C._local_lpolynomial_cache)",
            "polynomials = C.local_lpolynomials(3,29,'smalljac',3)",
            "expected = [(p,tuple(L.list())) for p,L in polynomials]",
            "observed = [(p,coefficients) for p,coefficients,backend in rows]",
            "resource_flags = [L._has_fmpz_polynomial_resource() for p,L in polynomials]",
            "(observed == expected, cache_after_coefficients,",
            " [backend for p,coefficients,backend in rows],",
            " [len(chunk) for chunk in chunks],",
            " resource_flags,",
            " sorted(C._local_lpolynomial_cache))",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(True, 0, ['smalljac', 'smalljac', 'smalljac', 'smalljac', 'smalljac', " +
        "'smalljac'], [1, 1, 2, 1, 1], [False, False, False, False, False, " +
        "False], [('smalljac', 5), ('smalljac', 11), ('smalljac', 13), " +
        "('smalljac', 17), ('smalljac', 19), ('smalljac', 29)])",
    );
  } finally {
    await session.close();
  }
});

test("local-data polynomial construction is lazy, cached, and mathematically transparent", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "record = list(C.local_data(5,5,algorithm='smalljac'))[0]",
            "before = not record._lpolynomial_materialized",
            "L = record.lpolynomial",
            "after = record._lpolynomial is L and record.lpolynomial is L",
            "(before, after, type(L).__name__, L.parent().base_ring(),",
            " L._has_fmpz_polynomial_resource(), tuple(L.list()),",
            " (L*L).list(), L(1) == record.jacobian_order)",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(True, True, 'PolynomialElement', Integer Ring, False, " +
        "(1, 0, 10, 0, 25), [1, 0, 20, 0, 150, 0, 500, 0, 625], True)",
    );
  } finally {
    await session.close();
  }
});

test("coefficient chunks report exhaustive and rforest fallback backends honestly", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "from sagejs.hyperelliptic_curves.frobenius import rational_local_coefficient_chunks",
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C2 = HyperellipticCurve(x^5+x+1,1)",
            "C3 = HyperellipticCurve(x^7+x+1)",
            "two = list(rational_local_coefficient_chunks(C2,2,2,'exhaustive',1))",
            "genus3 = list(rational_local_coefficient_chunks(C3,5,7,'rforest',2))",
            "([(p,backend,len(coefficients)) for chunk in two for p,coefficients,backend in chunk],",
            " [(p,backend,len(coefficients)) for chunk in genus3 for p,coefficients,backend in chunk])",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([(2, 'exhaustive', 5)], [(5, 'rforest', 7), (7, 'exhaustive', 7)])",
    );
  } finally {
    await session.close();
  }
});
