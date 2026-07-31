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
