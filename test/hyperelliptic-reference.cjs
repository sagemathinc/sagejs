"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const localOracle = require("./data/hyperelliptic/local-data-v1.json");

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

test("genus-2 prime-field smalljac agrees with exhaustive reconstruction", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(GF(5), 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "a = C.frobenius_polynomial('smalljac')",
            "b = C.frobenius_polynomial('exhaustive')",
            "c = C.frobenius_polynomial()",
            "[a, a == b == c, C.count_points(8, 'smalljac'),",
            " sorted(C._frobenius_cache)]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[x^4 + 10*x^2 + 25, True, " +
        "[6, 46, 126, 526, 3126, 16126, 78126, 388126], " +
        "['exhaustive', 'smalljac']]",
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(5),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^7+x+1).frobenius_polynomial('smalljac')",
      ),
      /only supported in genus 2|supports genus-2 curves/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(GF(2),'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1,x^3+x+1)" +
          ".frobenius_polynomial('smalljac')",
      ),
      /odd prime fields/,
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
            "import sagejs.hyperelliptic_curves.frobenius as F",
            "native_data = F.rational_smalljac_model(D)",
            "[C.local_lpolynomial(5), C.local_lpolynomial(5, 'smalljac'),",
            " data['f_coefficients'],",
            " data['h_coefficients'], data['excluded_denominator'],",
            " data['transform_scale'], data['y_weight'],",
            " native_data['curve_text']]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[25*T^4 + 10*T^2 + 1, 25*T^4 + 10*T^2 + 1, " +
        "[218700000000, 10935000000, 0, 0, 0, 27000], " +
        "[0, 0, 180], 30, 30, 4, " +
        "'[27000*x^5+10935000000*x+218700000000,180*x^2]']",
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
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1).local_lpolynomial(2,'smalljac')",
      ),
      /require odd primes/,
    );
  } finally {
    await session.close();
  }
});

test("QQ smalljac interval APIs are closed, bounded, cached, and skip bad primes", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^5+x+1)",
            "chunks = list(C.local_lpolynomial_chunks(3,29,'smalljac',3))",
            "flat = [item for chunk in chunks for item in chunk]",
            "all_at_once = C.local_lpolynomials(3,29,'smalljac',3)",
            "D = HyperellipticCurve(x^5+x/2+QQ(1)/3,x^2/5)",
            "denominator_primes = [p for p,L in " +
              "D.local_lpolynomials(2,11,'auto',2)]",
            "[flat == all_at_once, [p for p,L in flat],",
            " all(len(chunk) <= 3 for chunk in chunks),",
            " sorted(C._local_lpolynomial_cache), denominator_primes]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[True, [5, 11, 13, 17, 19, 29], True, " +
        "[('smalljac', 5), ('smalljac', 11), ('smalljac', 13), " +
        "('smalljac', 17), ('smalljac', 19), ('smalljac', 29)], [7, 11]]",
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1).local_lpolynomial(7,'smalljac')",
      ),
      /bad reduction at 7/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^7+x+1).local_lpolynomial(5,'smalljac')",
      ),
      /only supported in genus 2/,
    );
    await assert.rejects(
      session.evaluate(
        "R=PolynomialRing(QQ,'x'); x=R.gen(); " +
          "HyperellipticCurve(x^5+x+1)" +
          ".local_lpolynomials(3,2^32,'smalljac')",
      ),
      /exceeds the smalljac range/,
    );
  } finally {
    await session.close();
  }
});

test("native genus-2 factors agree with the independent local-data corpus", async () => {
  const rows = localOracle.rows.filter(
    (row) =>
      row.genus === 2 &&
      Number(row.prime) !== 2 &&
      row.reduction.status === "good",
  );
  const checks = rows.map((row) => {
    const f = row.model.f_coefficients_ascending.join(",");
    const h = row.model.h_coefficients_ascending.join(",");
    const expected = row.lpolynomial_coefficients_ascending.join(",");
    return (
      `HyperellipticCurve(R([${f}]),R([${h}]))` +
      `.local_lpolynomial(${row.prime},'smalljac').list()==[${expected}]`
    );
  });
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            `[${checks.join(",")}]`,
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      `[${rows.map(() => "True").join(", ")}]`,
    );
  } finally {
    await session.close();
  }
});
