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

test("twisted-cubic Gröbner fan", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<a,b,c,d> = PolynomialRing(QQ, 4)",
            "I = ideal(b^2-a*c, c^2-b*d, a*d-b*c)",
            "F = I.groebner_fan()",
            "[list(map(sorted, F.reduced_groebner_bases())), " +
              "F.polyhedralfan(), " +
              "F.polyhedralfan().ngenerating_cones()]",
          ].join("\n"),
        )
      ).repr,
      "[[[-b^2 + a*c, -b*c + a*d, -c^2 + b*d], " +
        "[-b*c + a*d, -c^2 + b*d, b^2 - a*c], " +
        "[-c^3 + a*d^2, -c^2 + b*d, b*c - a*d, b^2 - a*c], " +
        "[-c^2 + b*d, b*c - a*d, b^2 - a*c, c^3 - a*d^2], " +
        "[-b^2 + a*c, -b*c + a*d, c^2 - b*d], " +
        "[-b^3 + a^2*d, -b^2 + a*c, c^2 - b*d, b*c - a*d], " +
        "[-b^2 + a*c, c^2 - b*d, b*c - a*d, b^3 - a^2*d], " +
        "[c^2 - b*d, b*c - a*d, b^2 - a*c]], " +
        "Polyhedral fan in 4 dimensions of dimension 4, 8]",
    );
  } finally {
    await session.close();
  }
});
