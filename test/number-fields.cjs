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
