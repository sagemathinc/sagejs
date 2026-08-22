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

test("integral element valuations agree with exact prime-power ideals", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "R.<x> = QQ[]\n" +
            "K.<a> = NumberField(x^5 + x^3 - x^2 + 4*x + 1)\n" +
            "O = K.maximal_order()\n" +
            "D = O.factor_rational_prime(2)\n" +
            "P, Q = D[0][0], D[1][0]\n" +
            "alpha = a^4 + 2*a^2 + 5\n" +
            "[P.norm(), Q.norm(), P.valuation(alpha), Q.valuation(alpha), " +
            "O.ideal(alpha) == P^4, P.valuation(2), Q.valuation(2)]",
        )
      ).repr,
      "[2, 4, 4, 0, True, 3, 1]",
    );
  } finally {
    await session.close();
  }
});

test("ideal closure replay shares one exact membership coordinate map", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "import sagejs.runtime as runtime\n" +
            "nf = __import__('sagejs._baselib.number_fields', " +
            "fromlist=['number_fields'])\n" +
            "R.<x> = QQ[]\n" +
            "K.<a> = NumberField(x^3 - x^2 - 6*x - 12)\n" +
            "O = K.maximal_order()\n" +
            "I = O.ideal(a + 1)\n" +
            "cached = I._membership_inverse_cache is not runtime.undefined\n" +
            "rejected = False\n" +
            "try:\n" +
            "    nf.NumberFieldIdeal(O, [[1,0,0],[0,1,0],[0,0,2]])\n" +
            "except ValueError as error:\n" +
            "    rejected = 'not closed under the order' in str(error)\n" +
            "[cached, rejected, a + 1 in I]",
        )
      ).repr,
      "[True, True, True]",
    );
  } finally {
    await session.close();
  }
});
