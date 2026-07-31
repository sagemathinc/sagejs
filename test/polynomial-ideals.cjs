"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("two-variable monomial primary decomposition", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x,y> = QQ[]",
            "I = R.ideal(x^6, x^2*y^2)",
            "[[list(Q.gens()) for Q in I.primary_decomposition()], " +
              "[list(P.gens()) for P in I.associated_primes()]]",
          ].join("\n"),
        )
      ).repr,
      "[[[x^2], [y^2, x^6]], [[x], [y, x]]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "J = R.ideal(y^5, x^3*y)",
            "[[list(Q.gens()) for Q in J.primary_decomposition()], " +
              "[list(P.gens()) for P in J.associated_primes()]]",
          ].join("\n"),
        )
      ).repr,
      "[[[y], [x^3, y^5]], [[y], [x, y]]]",
    );
  } finally {
    await session.close();
  }
});
