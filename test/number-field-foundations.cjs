"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("certified prime ideals and fractional ideal arithmetic are public", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "R = PolynomialRing(QQ, 'x')\n" +
            "x = R.gen()\n" +
            "K = NumberField(x^2 - 5, 'a')\n" +
            "O = K.maximal_order()\n" +
            "D = K.factor_rational_prime(11)\n" +
            "data = [(P.rational_prime(), e, " +
            "P.residue_class_degree(), P.norm()) for P,e in D]\n" +
            "P = D[0][0]\n" +
            "I = O.ideal(11)\n" +
            "[data, D.verify()['certified'], D.value() == I, " +
            "P * P.inverse() == O.ideal(1), " +
            "I.valuation(P), (I.factor()).value() == I, " +
            "K.gen().norm() == -5]",
        )
      ).repr,
      "[[(11, 1, 1, 11), (11, 1, 1, 11)], True, True, " +
        "True, 1, True, True]",
    );
  } finally {
    await session.close();
  }
});
