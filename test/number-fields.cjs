"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("exact simple number-field arithmetic", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^4 + 1)",
            "[K, a^4, a^8, (a+1)*(a-1), 1/(a+1), " +
              "a.multiplicative_order()]",
          ].join("\n"),
        )
      ).repr,
      "[Number Field in a with defining polynomial x^4 + 1, -1, 1, " +
        "a^2 - 1, -1/2*a^3 + 1/2*a^2 - 1/2*a + 1/2, 8]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "x,y = AffineSpace(2, QQ, 'xy').gens()",
            "K.<i> = NumberField(x^2 + 1)",
            "[K, i^2]",
          ].join("\n"),
        )
      ).repr,
      "[Number Field in i with defining polynomial x^2 + 1, -1]",
    );
  } finally {
    await session.close();
  }
});

test("number-field tutorial invariants and custom Dirichlet values", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K = NumberField(x^3 + x^2 - 2*x + 8, 'a')",
            "[K.integral_basis(), K.discriminant(), K.units(), " +
              "K.class_number()]",
          ].join("\n"),
        )
      ).repr,
      "[[1, 1/2*a^2 + 1/2*a, a^2], -503, " +
        "(-3*a^2 - 13*a - 13,), 1]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "K.<i> = NumberField(x^2 + 1)",
            "G = DirichletGroup(20, K)",
            "[G, G.zeta(), G.zeta_order(), G.gens()]",
          ].join("\n"),
        )
      ).repr,
      "[Group of Dirichlet characters modulo 20 with values in Number Field " +
        "in i with defining polynomial x^2 + 1, i, 4, " +
        "(Dirichlet character modulo 20 of conductor 4 mapping 11 |--> -1, " +
        "17 |--> 1, Dirichlet character modulo 20 of conductor 5 mapping " +
        "11 |--> 1, 17 |--> i)]",
    );
  } finally {
    await session.close();
  }
});

test("quadratic NumberField presentations use native class groups", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^2 + 17)",
            "C = K.class_group()",
            "[K.discriminant(), K.class_number(), C, C.invariants(), " +
              "C.number_field() is K, C.gens(), " +
              "K.maximal_order().class_number()]",
          ].join("\n"),
        )
      ).repr,
      "[-68, 4, Class group of order 4 with structure C4 of Number Field " +
        "in a with defining polynomial x^2 + 17, (4,), True, " +
        "(Fractional ideal class (3, a + 1),), 4]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "L.<b> = NumberField(x^2 - x + 6)",
            "D = L.class_group()",
            "[L.discriminant(), L.class_number(), D.invariants(), " +
              "D.gen()^3, D.gen().order()]",
          ].join("\n"),
        )
      ).repr,
      "[-23, 3, (3,), Trivial principal fractional ideal class, 3]",
    );
  } finally {
    await session.close();
  }
});

test("maximal orders use exact Round-2 multiplier-ring enlargements", async () => {
  // The final two defining polynomials are LMFDB 3.1.431.1 and
  // 5.1.17161.1; both have defining-order index 2.
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "polys = [x^3+x^2-2*x+8, x^3+5*x^2-x+3, " +
              "x^3+8*x^2+5*x-1, x^3+15*x^2-9*x+13, " +
              "x^4+x^3-11*x^2+3*x-12, 2*x^3+x+1, " +
              "x^3-x-8, x^5-x^4+2*x^3-x^2+x+2]",
            "answer = []",
            "for f in polys:",
            "    K = NumberField(f, 'a')",
            "    O = K.maximal_order()",
            "    answer.append((O.discriminant(), " +
              "[b.list() for b in O.basis()], O.is_maximal()))",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "[(-503, [[1, 0, 0], [0, 1/2, 1/2], [0, 0, 1]], True), " +
        "(-31, [[1/4, 0, 3/4], [0, 1/2, 1/2], [0, 0, 1]], True), " +
        "(49, [[1/7, 6/7, 2/7], [0, 1, 0], [0, 0, 1]], True), " +
        "(-5292, [[1/6, 1/3, 1/6], [0, 1, 0], [0, 0, 1]], True), " +
        "(-588204, [[1, 0, 0, 0], [0, 1, 0, 0], " +
        "[0, 0, 1/3, 2/3], [0, 0, 0, 1]], True), " +
        "(-116, [[1, 0, 0], [0, 2, 0], [0, 0, 2]], True), " +
        "(-431, [[1, 0, 0], [0, 1/2, 1/2], [0, 0, 1]], True), " +
        "(17161, [[1, 0, 0, 0, 0], [0, 1/2, 0, 0, 1/2], " +
        "[0, 0, 1, 0, 0], [0, 0, 0, 1, 0], " +
        "[0, 0, 0, 0, 1]], True)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "from sagejs.number_fields.maximal_order import " +
              "p_maximal_overorder_dynamic",
            "L = NumberField(x^5-x^4+2*x^3-x^2+x+2, 'b')",
            "D = p_maximal_overorder_dynamic(L.equation_order(), 2)",
            "[D.discriminant(), [v.list() for v in D.basis()]]",
          ].join("\n"),
        )
      ).repr,
      "[17161, [[1, 0, 0, 0, 0], [0, 1/2, 0, 0, 1/2], " +
        "[0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]]]",
    );
  } finally {
    await session.close();
  }
});

test("Dedekind's criterion quickly certifies a ramified equation order", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "from sagejs.number_fields.maximal_order import " +
              "prime_polynomial_radical",
            "S.<y> = GF(2)[]",
            "T.<z> = GF(3)[]",
            "[prime_polynomial_radical(y^3+y^2, 2), " +
              "prime_polynomial_radical((z+1)^3*(z^2+1)^2, 3)]",
          ].join("\n"),
        )
      ).repr,
      "[y^2 + y, z^3 + z^2 + z + 1]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^7 - 2*x + 3)",
            "O = K.maximal_order()",
            "[O.basis(), O.discriminant(), O.is_maximal()]",
          ].join("\n"),
        )
      ).repr,
      "[[1, a, a^2, a^3, a^4, a^5, a^6], -594390879, True]",
    );
  } finally {
    await session.close();
  }
});

test("historical PARI Round-4 regressions have exact integral bases", async () => {
  // PARI's src/test/in/round4 regressions #2510 and #1710. These frozen
  // oracles exercise indices 2^18*7^4 and 2^9*3^10*5^5*11^10.
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "polys = [x^8-56*x^6+840*x^4-3136*x^2+3136, " +
              "x^10-29080*x^5-25772600]",
            "answer = []",
            "for f in polys:",
            "    O = NumberField(f, 'a').maximal_order()",
            "    answer.append((O.discriminant(), " +
              "[b.list() for b in O.basis()]))",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "[(2084850211225600, [[1, 0, 0, 0, 0, 0, 0, 0], " +
        "[0, 1, 0, 0, 0, 0, 0, 0], [0, 0, 1/2, 0, 0, 0, 0, 0], " +
        "[0, 0, 0, 1/4, 0, 0, 0, 0], [0, 0, 0, 0, 1/56, 0, 0, 0], " +
        "[0, 0, 0, 0, 0, 1/56, 0, 0], [0, 0, 0, 0, 0, 0, 1/112, 0], " +
        "[0, 0, 0, 0, 0, 0, 0, 1/224]]), " +
        "(551496736222216254722000000000000000000, " +
        "[[1/1089, 0, 0, 0, 0, 907/10890, 0, 0, 0, 0], " +
        "[0, 1/1089, 0, 0, 0, 0, 907/10890, 0, 0, 0], " +
        "[0, 0, 1/1089, 0, 0, 0, 0, 145/4356, 0, 0], " +
        "[0, 0, 0, 1/1089, 0, 0, 0, 0, 145/4356, 0], " +
        "[0, 0, 0, 0, 1/2178, 0, 0, 0, 0, 907/21780], " +
        "[0, 0, 0, 0, 0, 1/10, 0, 0, 0, 0], " +
        "[0, 0, 0, 0, 0, 0, 1/10, 0, 0, 0], " +
        "[0, 0, 0, 0, 0, 0, 0, 1/20, 0, 0], " +
        "[0, 0, 0, 0, 0, 0, 0, 0, 1/20, 0], " +
        "[0, 0, 0, 0, 0, 0, 0, 0, 0, 1/20]])]",
    );
  } finally {
    await session.close();
  }
});

test("maximal orders certify discriminant primes beyond machine range", async () => {
  // Adapted from SageMath's maximal_order tests: the two large ramified
  // primes exercise the arbitrary-prime Dedekind fallback.
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "p = 10000000000000000000009",
            "q = 100000000000000000000117",
            "K.<a> = NumberField(x^3-p*q)",
            "O = K.maximal_order()",
            "[O.basis(), O.discriminant()]",
          ].join("\n"),
        )
      ).repr,
      "[[1/3*a^2 + 1/3*a + 1/3, a, a^2], " +
        "-3000000000000000000012420000000000000000019172700000000000000" +
        "013078260000000000000003326427]",
    );
  } finally {
    await session.close();
  }
});

test("number-field ideals are exact HNF lattices", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^3+x^2-2*x+8)",
            "O = K.maximal_order()",
            "I = O.ideal([2,a])",
            "J = O.ideal([3,a+1])",
            "L = O.ideal(3)",
            "[I.gens_reduced(), I.norm(), I.is_integral(), " +
              "J.gens_reduced(), J.norm(), (I+J).gens_reduced(), " +
              "(I*J).gens_reduced(), (I*J).norm(), " +
              "(2*I).gens_reduced(), (2*I).norm(), " +
              "I.intersection(L).gens_reduced(), " +
              "I.intersection(L).norm(), (I^2).gens_reduced(), " +
              "(I^2).norm(), a in I, 1 in I]",
          ].join("\n"),
        )
      ).repr,
      "[(2, a, a^2), 4, True, (1, 1/2*a^2 + 1/2*a, a^2), 1, " +
        "(1, 1/2*a^2 + 1/2*a, a^2), (2, a, a^2), 4, " +
        "(4, 2*a, 2*a^2), 32, (6, 3*a, 3*a^2), 108, " +
        "(4, 2*a, a^2), 16, True, False]",
    );
  } finally {
    await session.close();
  }
});

test("native Galois groups cover every transitive group through degree four", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "polynomials = [",
            "    x - 1,",
            "    x^2 - 2,",
            "    x^3 - 3*x + 1,",
            "    x^3 - 2,",
            "    x^4 + x^3 + x^2 + x + 1,",
            "    x^4 + 1,",
            "    x^4 - 2,",
            "    x^4 + 18*x^2 + 8*x + 1,",
            "    x^4 - x + 1,",
            "]",
            "groups = [NumberField(f, 'a').galois_group() " +
              "for f in polynomials]",
            "[(G.transitive_label(), G.order(), G.degree(), " +
              "G.is_galois(), G.is_abelian()) for G in groups]",
          ].join("\n"),
        )
      ).repr,
      "[('1T1', 1, 1, True, True), ('2T1', 2, 2, True, True), " +
        "('3T1', 3, 3, True, True), ('3T2', 6, 6, False, False), " +
        "('4T1', 4, 4, True, True), ('4T2', 4, 4, True, True), " +
        "('4T3', 8, 8, False, False), " +
        "('4T4', 12, 12, False, False), " +
        "('4T5', 24, 24, False, False)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "K = NumberField(x^4 + x^3 + x^2 + x + 1, 'z')",
            "G = K.galois_group()",
            "[G, G.transitive_number(), G.pari_label(), " +
              "G.number_field() is K, G.gens()]",
          ].join("\n"),
        )
      ).repr,
      "[Galois group 4T1 (4) with order 4 of " +
        "x^4 + x^3 + x^2 + x + 1, 1, 'C(4) = 4', True, " +
        "((1,2,3,4),)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "[NumberField(QQ(1,2)*(x^3 - 2), 'a').galois_group()" +
              ".transitive_label(),",
            " NumberField(x^4 + QQ(1,2)*x^3 + QQ(1,16), 'b')" +
              ".galois_group().transitive_label()]",
          ].join("\n"),
        )
      ).repr,
      "['3T2', '4T5']",
    );
  } finally {
    await session.close();
  }
});

test("number fields reject reducible quotients and bound native Galois degree", async () => {
  const session = await createSage();
  try {
    await assert.rejects(
      session.evaluate(
        "R.<x> = QQ[]\nNumberField(x^2 - 1, 'a')",
      ),
      /defining polynomial \(x\^2 - 1\) must be irreducible/,
    );
    await assert.rejects(
      session.evaluate(
        "R.<x> = QQ[]\nNumberField(x^5 - 2, 'a').galois_group()",
      ),
      /native Galois groups currently support degrees at most 4/,
    );
  } finally {
    await session.close();
  }
});

test("imaginary quadratic maximal orders and class groups match reference data", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "radicands = [-1,-2,-3,-5,-6,-10,-14,-15,-23,-39,-65,",
            "              -84,-105,-110]",
            "[(d, QuadraticField(d).discriminant(),",
            "  QuadraticField(d).class_number(),",
            "  QuadraticField(d).class_group().invariants())",
            " for d in radicands]",
          ].join("\n"),
        )
      ).repr,
      "[(-1, -4, 1, ()), (-2, -8, 1, ()), (-3, -3, 1, ()), " +
        "(-5, -20, 2, (2,)), (-6, -24, 2, (2,)), " +
        "(-10, -40, 2, (2,)), (-14, -56, 4, (4,)), " +
        "(-15, -15, 2, (2,)), (-23, -23, 3, (3,)), " +
        "(-39, -39, 4, (4,)), (-65, -260, 8, (4, 2)), " +
        "(-84, -84, 4, (2, 2)), (-105, -420, 8, (2, 2, 2)), " +
        "(-110, -440, 12, (6, 2))]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "K.<a> = QuadraticField(-84)",
            "O = K.ring_of_integers()",
            "C = O.class_group()",
            "[K, K.defining_polynomial(), K.discriminant(),",
            " K.integral_basis(), [u in O for u in K.integral_basis()],",
            " C, C.order(), C.invariants(), [g.order() for g in C.gens()]]",
          ].join("\n"),
        )
      ).repr,
      "[Number Field in a with defining polynomial x^2 + 84, x^2 + 84, " +
        "-84, [1, 1/2*a], [True, True], Class group of order 4 with " +
        "structure C2 x C2 of Number Field in a with defining polynomial " +
        "x^2 + 84, 4, (2, 2), [2, 2]]",
    );
    assert.equal(
      (
        await session.evaluate(
          "[(d, QuadraticField(d).integral_basis()) " +
            "for d in [-23, -12, -84]]",
        )
      ).repr,
      "[(-23, [1/2 + 1/2*a, 1*a]), " +
        "(-12, [1/2 + 1/4*a, 1/2*a]), (-84, [1, 1/2*a])]",
    );
  } finally {
    await session.close();
  }
});

test("quadratic ideal lattice composition satisfies the full group laws", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "checks = []",
            "for d in [-14, -23, -65, -84, -105, -110]:",
            "    C = QuadraticField(d).class_group()",
            "    elements = C.list()",
            "    associative = all((x*y)*z == x*(y*z)",
            "                      for x in elements",
            "                      for y in elements",
            "                      for z in elements)",
            "    inverses = all(x*(~x) == C.one() and (~x)*x == C.one()",
            "                   for x in elements)",
            "    orders = all(x^x.order() == C.one() for x in elements)",
            "    generated = prod(g.order() for g in C.gens()) == C.order()",
            "    checks.append((d, associative, inverses, orders, generated))",
            "checks",
          ].join("\n"),
        )
      ).repr,
      "[(-14, True, True, True, True), (-23, True, True, True, True), " +
        "(-65, True, True, True, True), (-84, True, True, True, True), " +
        "(-105, True, True, True, True), " +
        "(-110, True, True, True, True)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "K.<a> = QuadraticField(-23)",
            "O = K.maximal_order()",
            "u = (1+a)/2",
            "C = K.class_group()",
            "g = C.gen()",
            "[u, u in O, u.trace(), u.norm(), g.form().coefficients(),",
            " g.ideal().norm(), g.order(), g^2 == ~g, g^3 == C.one()]",
          ].join("\n"),
        )
      ).repr,
      "[1/2 + 1/2*a, True, 1, 6, (2, -1, 3), 2, 3, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("exact algebraic roots have a certified stable order", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "roots = (x*(x-QQ(1)/2^2000)).roots(QQbar, multiplicities=False)",
            "[len(roots), roots[0] == 0, roots[1] > 0]",
          ].join("\n"),
        )
      ).repr,
      "[2, True, True]",
    );
  } finally {
    await session.close();
  }
});
