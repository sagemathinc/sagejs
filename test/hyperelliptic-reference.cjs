"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("hyperelliptic models validate equations and enumerate weighted points", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(GF(5), 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "[C.genus(), C.base_ring(), C.hyperelliptic_polynomials(),",
            " C.is_smooth(), len(C.points()), C.points()[:3]]",
          ].join("\n"),
        )
      ).repr,
      "[2, Finite Field of size 5, (x^5 + x + 1, 0), True, 6, " +
        "[(1 : 0 : 0), (0 : 1 : 1), (0 : 4 : 1)]]",
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve((x^2+1)^3)",
      ),
      /hyperelliptic curve is singular/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^3+x+1)",
      ),
      /branch degree at least 5/,
    );
  } finally {
    await session.close();
  }
});

test("genus-2 Frobenius, zeta, and long extension recurrence match Sage", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(GF(5), 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "D = HyperellipticCurve(x^6+x+1)",
            "S = PolynomialRing(GF(7), 'u')",
            "u = S.gen()",
            "E = HyperellipticCurve(u^5+u+1, u^2+2)",
            "[C.count_points(8), C.frobenius_polynomial(),",
            " C.cardinality(extension_degree=2), C.zeta_function(),",
            " D.count_points(2), D.frobenius_polynomial(), D.points()[:2],",
            " E.count_points(2), E.frobenius_polynomial()]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[[6, 46, 126, 526, 3126, 16126, 78126, 388126], " +
        "x^4 + 10*x^2 + 25, 46, " +
        "(25*x^4 + 10*x^2 + 1)/(5*x^2 - 6*x + 1), " +
        "[6, 36], x^4 + 5*x^2 + 25, [(1 : 1 : 0), (1 : 4 : 0)], " +
        "[10, 42], x^4 + 2*x^3 - 2*x^2 + 14*x + 49]",
    );
  } finally {
    await session.close();
  }
});

test("genus-3 odd and even models reconstruct every independent coefficient", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(GF(5), 'x')",
            "x = R.gen()",
            "C7 = HyperellipticCurve(x^7+x+1)",
            "C8 = HyperellipticCurve(x^8+x+1)",
            "[C7.count_points(3), C7.frobenius_polynomial(),",
            " C8.count_points(3), C8.frobenius_polynomial()]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[[9, 35, 123], " +
        "x^6 + 3*x^5 + 9*x^4 + 17*x^3 + 45*x^2 + 75*x + 125, " +
        "[9, 37, 123], " +
        "x^6 + 3*x^5 + 10*x^4 + 20*x^3 + 50*x^2 + 75*x + 125]",
    );
  } finally {
    await session.close();
  }
});

test("characteristic two and extension base fields use the exact field tower", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R2 = PolynomialRing(GF(2), 'x')",
            "x = R2.gen()",
            "C2 = HyperellipticCurve(x^5+x+1, x^3+x+1)",
            "K = GF(4, 'a')",
            "R4 = PolynomialRing(K, 'u')",
            "u = R4.gen()",
            "C4 = HyperellipticCurve(u^5+u+1, u^3+u+1)",
            "[C2.count_points(2), C2.frobenius_polynomial(),",
            " C4.count_points(2), C4.frobenius_polynomial()]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[[2, 10], x^4 - x^3 + 3*x^2 - 2*x + 4, " +
        "[10, 18], x^4 + 5*x^3 + 13*x^2 + 20*x + 16]",
    );
  } finally {
    await session.close();
  }
});

test("QQ local fallback diagnoses bad primes and exposes checked integral data", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "D = HyperellipticCurve(x^5+x/2+QQ(1)/3, x^2/5)",
            "data = D._smalljac_integral_model_data()",
            "[C.local_lpolynomial(5), data['f_coefficients'],",
            " data['h_coefficients'], data['excluded_denominator'],",
            " data['transform_scale'], data['y_weight']]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[25*T^4 + 10*T^2 + 1, " +
        "[218700000000, 10935000000, 0, 0, 0, 27000], " +
        "[0, 0, 180], 30, 30, 4]",
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1).local_lpolynomial(3)",
      ),
      /bad reduction at 3/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x\/2+1).local_lpolynomial(2)",
      ),
      /not integral at this prime/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1).local_lpolynomial()",
      ),
      /defined for curves over QQ/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1).frobenius_polynomial('smalljac')",
      ),
      /smalljac hyperelliptic L-polynomial backend is unavailable/,
    );
  } finally {
    await session.close();
  }
});
