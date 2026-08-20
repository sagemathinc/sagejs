"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("good and semistable bad local data have distinct certified contracts", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "good = HyperellipticCurve(x^7 + 2*x + 1).local_reduction(19)",
            "bad2 = HyperellipticCurve(x^5 + x^2 + 19).local_reduction(19)",
            "f3 = (x^2-1)^2*(x^3+x+1) + 19*x",
            "bad3 = HyperellipticCurve(f3).local_reduction(19)",
            "pari1 = HyperellipticCurve((x-1)^2*(x^3+x+1)+5*x).local_reduction(5)",
            "pari2 = HyperellipticCurve((x^2+1)^2*(x+1)+7*x).local_reduction(7)",
            "[(d.genus, d.reduction_type, d.coefficients,",
            "  d.conductor_exponent, d.toric_rank, d.certified)",
            " for d in (good, bad2, bad3, pari1, pari2)]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(3, 'good', (1, -2, 20, -46, 380, -722, 6859), 0, 0, True), " +
        "(2, 'semistable_nodal', (1, -9, 27, -19), 1, 1, True), " +
        "(3, 'semistable_nodal', (1, 3, 22, 39, 19), 2, 2, True), " +
        "(2, 'semistable_nodal', (1, 4, 8, 5), 1, 1, True), " +
        "(2, 'semistable_nodal', (1, 0, -1), 2, 2, True)]",
    );
  } finally {
    await session.close();
  }
});

test("all four genus-2 almost-good types return degree-four certified factors", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "def from_roots(values):",
            "    answer = R(1)",
            "    for value in values:",
            "        answer *= x-value",
            "    return answer",
            "p = 7",
            "type2a = HyperellipticCurve(from_roots([0,p,2*p,1,1+p,1+2*p]))",
            "type4 = HyperellipticCurve(from_roots([0,p,2*p,p^2,2*p^2,1]))",
            "hard1 = HyperellipticCurve(R([3320785780,-7763596804,7758075841,",
            "    2345392066,-6413138499,5155080768,967540608]))",
            "hard2b = HyperellipticCurve(R([-5327468,-103762928,717632896,",
            "    472007332,-487451448,-457528968,-102181707]))",
            "nested2b_f = R(1)",
            "for i in range(3):",
            "    nested2b_f *= (x-p^2*i)^2+1",
            "nested2b = HyperellipticCurve(nested2b_f)",
            "rows = [hard1.local_reduction(8131969), type2a.local_reduction(p),",
            "        hard2b.local_reduction(1979), nested2b.local_reduction(p),",
            "        type4.local_reduction(p)]",
            "[(d.reduction_type, d.coefficients, d.conductor_exponent,",
            "  d.jacobian_good_reduction) for d in rows]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('almost_good_type_1', (1, -7024, 28598082, -57118950256, " +
        "66128919816961), 0, True), ('almost_good_type_2a', " +
        "(1, 0, 14, 0, 49), 0, True), ('almost_good_type_2b', " +
        "(1, 0, -1223, 0, 3916441), 0, True), " +
        "('almost_good_type_2b', (1, 0, 14, 0, 49), 0, True), " +
        "('almost_good_type_4', (1, 0, 14, 0, 49), 0, True)]",
    );
  } finally {
    await session.close();
  }
});

test("unsupported wild and non-nodal cases fail instead of guessing", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "curves = [(HyperellipticCurve(x^5+x^2+2), 2),",
        "          (HyperellipticCurve((x^2+1)^3+19*x), 19)]",
        "messages = []",
        "for C, p in curves:",
        "    try:",
        "        C.local_reduction(p)",
        "    except Exception as error:",
        "        messages.append(str(error))",
        "messages",
      ].join("\n"),
    );
    assert.match(result.repr, /bad reduction at 2 is not implemented/);
    assert.match(result.repr, /no certified odd-prime local-reduction theorem applies/);
  } finally {
    await session.close();
  }
});

test("semistable two-component fibres use signed Frobenius on the dual graph", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "q = x^3+x+1",
            "split = HyperellipticCurve(q^2+19*x).local_reduction(19)",
            "nonsplit = HyperellipticCurve(2*q^2+19*x).local_reduction(19)",
            "[(d.coefficients, d.conductor_exponent,",
            "  d.certificate['component_frobenius_sign'])",
            " for d in (split, nonsplit)]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[((1, 1, 1), 2, 1), ((1, -1, 1), 2, -1)]",
    );
  } finally {
    await session.close();
  }
});

test("nested split cluster pictures certify components and Frobenius signs", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "p = 5",
            "f = (x-1)*(x-(1+p^2))*(x-(1-p^2))*x*(x-p)",
            "split = HyperellipticCurve(f).local_reduction(p)",
            "twist = HyperellipticCurve(2*f).local_reduction(p)",
            "generalized = HyperellipticCurve((f-x^2)/4, x).local_reduction(p)",
            "p = 3",
            "f3 = (x-1)*(x-(1+p^2))*(x-(1-p^2))*(x-p)*x*(x-p^3)*(x+p^3)",
            "g3 = HyperellipticCurve(f3).local_reduction(p)",
            "[(d.reduction_type, d.coefficients, d.conductor_exponent,",
            "  [c['genus'] for c in d.certificate['component_curves']],",
            "  [b['frobenius_sign'] for b in d.certificate['toric_basis']])",
            " for d in (split, twist, generalized, g3)]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
        "[('semistable_split_cluster', (1, 1, 3, -5), 1, [0, 1], [1]), " +
        "('semistable_split_cluster', (1, -1, 3, 5), 1, [0, 1], [-1]), " +
        "('semistable_split_cluster', (1, 1, 3, -5), 1, [0, 1], [1]), " +
        "('semistable_split_cluster', (1, 1, 6, 6, 9, 9), 1, " +
        "[0, 0, 1, 1], [-1])]",
    );
  } finally {
    await session.close();
  }
});
