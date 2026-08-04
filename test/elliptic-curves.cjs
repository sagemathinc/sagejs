"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("exact elliptic-curve arithmetic and invariants", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([0,0,1,-1,0])",
            "P = E([0,0])",
            "[E, P+P, 10*P, 20*P, E.conductor(), E.j_invariant()]",
          ].join("\n"),
        )
      ).repr,
      "[Elliptic Curve defined by y^2 + y = x^3 - x over Rational Field, " +
        "(1 : 0 : 1), (161/16 : -2065/64 : 1), " +
        "(683916417/264517696 : -18784454671297/4302115807744 : 1), " +
        "37, 110592/37]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve(GF(5), [0,0,1,-1,0])",
            "[E, E([0,0]) + E([0,0])]",
          ].join("\n"),
        )
      ).repr,
      "[Elliptic Curve defined by y^2 + y = x^3 + 4*x over Finite Field " +
        "of size 5, (1 : 0 : 1)]",
    );
  } finally {
    await session.close();
  }
});

test("real lift_x uses Sage-compatible coercion and tolerant membership", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([-1,0])",
            "P = E.base_extend(RR).lift_x(RR(-0.5))",
            "Q = E.lift_x(-0.5)",
            "[parent(P).base_ring(), parent(Q).base_ring(), " +
              "abs(float(P[1]^2 - (P[0]^3-P[0]))) < 1e-14]",
          ].join("\n"),
        )
      ).repr,
      "[Real Field with 53 bits of precision, " +
        "Real Field with 53 bits of precision, True]",
    );
    await assert.rejects(
      session.evaluate(
        "EllipticCurve([-1,0]).lift_x(QQ(-1)/2)",
      ),
      /does not lift over the base ring/,
    );
  } finally {
    await session.close();
  }
});

test("long Weierstrass lift_x matches Sage root semantics", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([1,2,3,4,5])",
            "E5 = EllipticCurve(GF(5), [1,2,3,4,5])",
            "E7 = EllipticCurve(GF(7), [1,2,3,4,5])",
            "R = EllipticCurve([1,0,0,-1,0])",
            "[E.lift_x(1, all=True), E.lift_x(0, all=True), " +
              "E5.lift_x(1, all=True), E5.lift_x(0, all=True), " +
              "E7.lift_x(1, all=True), R.lift_x(0, all=True)]",
          ].join("\n"),
        )
      ).repr,
      "[[(1 : -6 : 1), (1 : 2 : 1)], [], " +
        "[(1 : 2 : 1), (1 : 4 : 1)], " +
        "[(0 : 0 : 1), (0 : 2 : 1)], " +
        "[(1 : 1 : 1), (1 : 2 : 1)], [(0 : 0 : 1)]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([1,2,3,4,5]).base_extend(RR)",
            "[round(float(P[1]), 12) for P in E.lift_x(RR(1), all=True)]",
          ].join("\n"),
        )
      ).repr,
      "[-6, 2]",
    );
    await assert.rejects(
      session.evaluate(
        "EllipticCurve(GF(2), [0,0,1,0,0]).lift_x(0)",
      ),
      /characteristic 2 is not implemented/,
    );
  } finally {
    await session.close();
  }
});

test("rational elliptic point orders use Mazur's certified bound", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "torsion_curves = [",
            "    [1, 0, 1, -171, -874],",
            "    [0, 1, 1, -9, -15],",
            "    [1, 1, 1, -80, 242],",
            "    [0, -1, 1, -10, -20],",
            "    [1, 0, 1, 4, -6],",
            "    [1, -1, 1, -3, 3],",
            "    [1, 1, 1, 35, -28],",
            "    [1, -1, 1, -14, 29],",
            "    [1, 0, 0, -45, 81],",
            "    [1, -1, 1, -122, 1721],",
            "]",
            "torsion_points = [[15,-8], [5,9], [5,-2], [5,5], [9,23], " +
              "[-1,2], [2,6], [-3,7], [0,9], [-9,49]]",
            "orders = [EllipticCurve(torsion_curves[k])(torsion_points[k]).order() " +
              "for k in range(10)]",
            "finite = [EllipticCurve(torsion_curves[k])(torsion_points[k]).has_finite_order() " +
              "for k in range(10)]",
            "expected = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]",
            "E = EllipticCurve([-2, 0])",
            "P = E((-1, 1))",
            "[orders == expected, all(finite), P.order(), P.order() == Infinity, " +
              "P.has_finite_order(), E(0).additive_order()]",
          ].join("\n"),
        )
      ).repr,
      "[True, True, +Infinity, True, False, 1]",
    );
  } finally {
    await session.close();
  }
});

test("elliptic-curve coefficients, labels, and bundled Cremona data", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve('37a')",
            "F = EllipticCurve_from_j(110592/37)",
            "G = F.quadratic_twist(2)",
            "[E.aplist(10), E.ap(37), E.anlist(30), G, G.conductor(), " +
              "EllipticCurve('389a').rank(), EllipticCurve('5077a').rank()]",
          ].join("\n"),
        )
      ).repr,
      "[[-2, -3, -2, -1], -1, " +
        "[0, 1, -2, -3, 2, -2, 6, -1, 0, 6, 4, -5, -6, -2, 2, 6, " +
        "-4, 0, -12, 0, -4, 3, 10, 2, 0, -1, 4, -9, -2, 6, -12], " +
        "Elliptic Curve defined by y^2 = x^3 - 4*x + 2 over Rational Field, " +
        "2368, 2, 3]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "db = sage.databases.cremona.CremonaDatabase()",
            "[db.curves(37), len(db.allcurves(37))]",
          ].join("\n"),
        )
      ).repr,
      "[{'a1': [[0, 0, 1, -1, 0], 1, 1], " +
        "'b1': [[0, 1, 1, -23, -50], 0, 3]}, 4]",
    );
  } finally {
    await session.close();
  }
});

test("native integral elliptic coefficient sweep", async () => {
  const session = await createSage();
  try {
    const started = performance.now();
    assert.equal(
      (
        await session.evaluate(
          "E = EllipticCurve([0,0,1,-1,0])\n" +
            "[len(E.anlist(100000)), E.anlist(30)[30]]",
          { timeout: 30_000 },
        )
      ).repr,
      "[100001, -12]",
    );
    assert.ok(
      performance.now() - started < 30_000,
      "the tutorial-sized native coefficient sweep must stay interactive",
    );
  } finally {
    await session.close();
  }
});

test("smalljac agrees across integral models and bad primes", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "curves = [[0,0,0,-1,0], [0,0,1,-1,0], " +
              "[1,-1,1,-10,-20], [0,1,1,-2,0], [1,2,3,4,5]]",
            "models = [EllipticCurve(c) for c in curves]",
            "[[E.aplist(20) for E in models], " +
              "[models[1].ap(37), models[2].ap(37), models[4].ap(11)]]",
          ].join("\n"),
        )
      ).repr,
      "[[[0, 0, -2, 0, 0, 6, 2, 0], " +
        "[-2, -3, -2, -1, -5, -2, 0, 0], " +
        "[-1, 0, 0, 2, 2, -4, 7, -1], " +
        "[-2, -2, -3, -5, -4, -3, -6, 5], " +
        "[1, 0, -3, -1, -1, 1, 5, 4]], [-1, -1, -1]]",
    );
  } finally {
    await session.close();
  }
});

test("Tate local data covers wild 2- and 3-adic reduction", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "cases = [",
            " (2,[0,-2,0,-10,-10]), (2,[0,-2,0,-10,-8]),",
            " (2,[0,-2,0,-9,-5]), (2,[0,-2,0,-4,0]),",
            " (2,[0,-2,0,-8,4]), (2,[0,-2,0,1,4]),",
            " (2,[0,-2,0,-3,8]), (2,[0,0,0,-8,0]),",
            " (2,[0,-2,0,-4,-8]), (3,[0,0,0,-9,-7]),",
            " (3,[0,0,0,-9,-10]), (3,[0,0,0,-3,7]),",
            " (3,[0,0,0,-9,0]), (3,[0,0,0,6,-7]),",
            " (3,[1,-1,0,9,0]), (3,[0,0,1,0,-7]),",
            " (3,[0,69,1,372,-314]), (3,[1,-10,1,-470,964]) ]",
            "answer = []",
            "for p, coefficients in cases:",
            "    d = EllipticCurve(coefficients).local_data(p)",
            "    answer.append([p, d.discriminant_valuation(), " +
              "d.conductor_valuation(), str(d.kodaira_symbol()), " +
              "d.tamagawa_number(), d.tamagawa_exponent(), " +
              "d.bad_reduction_type()])",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "[[2, 6, 6, 'II', 1, 1, 0], [2, 8, 7, 'III', 2, 2, 0], " +
        "[2, 4, 2, 'IV', 3, 3, 0], [2, 10, 6, 'I0*', 2, 2, 0], " +
        "[2, 8, 3, 'I1*', 4, 4, 0], [2, 10, 4, 'I2*', 4, 2, 0], " +
        "[2, 8, 2, 'IV*', 3, 3, 0], [2, 15, 8, 'III*', 2, 2, 0], " +
        "[2, 12, 4, 'II*', 1, 1, 0], [3, 3, 3, 'II', 1, 1, 0], " +
        "[3, 3, 2, 'III', 2, 2, 0], [3, 5, 3, 'IV', 3, 3, 0], " +
        "[3, 6, 2, 'I0*', 4, 2, 0], [3, 7, 2, 'I1*', 4, 4, 0], " +
        "[3, 8, 2, 'I2*', 2, 2, 0], [3, 9, 3, 'IV*', 3, 3, 0], " +
        "[3, 9, 2, 'III*', 2, 2, 0], [3, 13, 5, 'II*', 1, 1, 0]]",
    );
  } finally {
    await session.close();
  }
});

test("global minimal models drive general conductors and local-data lists", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "E = EllipticCurve([0,-2,0,9,8])",
            "D = E.local_data()",
            "[E.global_minimal_model().ainvs(), E.minimal_discriminant(), " +
              "E.conductor(), E.bad_primes(), E.tamagawa_numbers(), " +
              "E.tamagawa_product(), [str(d.kodaira_symbol()) for d in D], " +
              "E.has_nonsplit_multiplicative_reduction(2), " +
              "E.has_split_multiplicative_reduction(13)]",
          ].join("\n"),
        )
      ).repr,
      "[(1, 0, 1, 0, 0), -26, 26, [2, 13], [1, 1], 1, " +
        "['I1', 'I1'], True, True]",
    );
  } finally {
    await session.close();
  }
});

test("projective and native prime-field scalar multiplication are exact", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "small = all(n*P == P._affine_scalar_mul(n) ",
            "    for p in [5,7,11,13,17,19,23] ",
            "    for E in [EllipticCurve(GF(p),[0,0,0,1,1])] ",
            "    for P in E.points() for n in range(1,35))",
            "E = EllipticCurve(GF(2^256-2^32-977), [0,7])",
            "G = E([",
            " 55066263022277343669578718895168534326250603453777594175500187360389116729240,",
            " 32670510020758816978083085130507043184471273380659243275938904335757337482424])",
            "N = 115792089237316195423570985008687907852837564279074904382605163141518161494337",
            "[small, (2*G).xy(), (N*G).is_zero()]",
          ].join("\n"),
          { timeout: 30_000 },
        )
      ).repr,
      "[True, " +
        "(89565891926547004231252920425935692360644145829622209833684329913297188986597, " +
        "12158399299693830322967808612713398636155367887041628176798871954788371653930), " +
        "True]",
    );
  } finally {
    await session.close();
  }
});

test("explicit-kernel Velu isogenies match Sage models and maps", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "curves = [",
            " [1,0,1,-171,-874], [0,1,1,-9,-15],",
            " [1,1,1,-80,242], [0,-1,1,-10,-20],",
            " [1,0,1,4,-6], [1,-1,1,-3,3],",
            " [1,1,1,35,-28], [1,-1,1,-14,29],",
            " [1,0,0,-45,81], [1,-1,1,-122,1721]]",
            "points = [[15,-8],[5,9],[5,-2],[5,5],[9,23],",
            "          [-1,2],[2,6],[-3,7],[0,9],[-9,49]]",
            "data = []",
            "for i in range(10):",
            "    E = EllipticCurve(curves[i])",
            "    P = E(points[i])",
            "    phi = E.isogeny(P)",
            "    data.append([phi.degree(), list(phi.codomain().ainvs()), phi(P).is_zero()])",
            "F2 = EllipticCurve(GF(2), [0,0,1,0,1])",
            "phi2 = F2.isogeny(F2([1,1]))",
            "F31 = EllipticCurve(GF(31), [0,0,0,1,0])",
            "P31 = F31([2,17])",
            "phi31 = F31.isogeny(P31)",
            "finite = [phi2.degree(), list(phi2.codomain().ainvs()),",
            "          phi31.degree(), list(phi31.codomain().ainvs()),",
            "          all(phi31(Q+R) == phi31(Q)+phi31(R)",
            "              for Q in F31.points() for R in F31.points()),",
            "          F31.isogeny([P31,P31]).kernel_polynomial() == phi31.kernel_polynomial()]",
            "F7 = EllipticCurve(GF(7), [-1,0])",
            "full_two = F7.isogeny([F7([0,0]), F7([1,0])])",
            "finite += [full_two.degree(), list(full_two.codomain().ainvs()),",
            "           full_two.kernel_polynomial()]",
            "[data, finite]",
          ].join("\n"),
        )
      ).repr,
      "[[[2, [1, 0, 1, -2731, -55146], True], " +
        "[3, [0, 1, 1, -769, -8470], True], " +
        "[4, [1, 1, 1, -2565/16, -27417/64], True], " +
        "[5, [0, -1, 1, -7820, -263580], True], " +
        "[6, [1, 0, 1, -2731, -55146], True], " +
        "[7, [1, -1, 1, -213, -1257], True], " +
        "[8, [1, 1, 1, -552965/16, -159190297/64], True], " +
        "[9, [1, -1, 1, -2324, -43091], True], " +
        "[10, [1, 0, 0, -10055, -390309], True], " +
        "[12, [1, -1, 1, -210332, -37075319], True]], " +
        "[3, [0, 0, 1, 0, 0], 8, [0, 0, 0, 10, 28], True, True, " +
        "4, [0, 0, 0, 5, 0], x^3 + 6*x]]",
    );
  } finally {
    await session.close();
  }
});
