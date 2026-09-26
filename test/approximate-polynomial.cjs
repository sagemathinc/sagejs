// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("approximate polynomial rings support tutorial arithmetic", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "R.<z> = PolynomialRing(RR)\n" +
            "[factor(z^2 - 2), RR['x','y'] is RR['x','y']]",
        )
      ).repr,
      "[(z - 1.41421356237310) * (z + 1.41421356237310), True]",
    );

    const euler = await session.evaluate(
      [
        "t,x,y = PolynomialRing(RealField(10), 3, 'txy').gens()",
        "f = y; g = -x - y*t",
        "eulers_method_2x2(f, g, 0, 1, 0, 1/4, 1)",
      ].join("\n"),
    );
    assert.equal(
      euler.stdout,
      [
        "      t                x            h*f(t,x,y)                y       h*g(t,x,y)",
        "      0                1                  0.00                0           -0.25",
        "    1/4              1.0                -0.062            -0.25           -0.23",
        "    1/2             0.94                 -0.12            -0.48           -0.17",
        "    3/4             0.82                 -0.16            -0.66          -0.081",
        "      1             0.65                 -0.18            -0.74           0.022",
        "",
      ].join("\n"),
    );

    const plotted = await session.evaluate(
      [
        "f = lambda z: z[2]",
        "g = lambda z: -sin(z[1])",
        "P = eulers_method_2x2_plot(f,g,0.0,0.75,0.0,0.1,1.0)",
        "P[0] + P[1]",
      ].join("\n"),
    );
    assert.equal(
      plotted.repr,
      "Graphics object consisting of 2 graphics primitives",
    );
  } finally {
    await session.close();
  }
});

test("AA polynomial coefficients and matrix characteristic polynomials are subscriptable", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "P.<x> = PolynomialRing(AA)",
      "p = AA(2)*x^2 + AA(3)",
      "assert [p[k] for k in [-10, -1, 0, 1, 2, 3, 2^100]] == [AA(0), AA(0), AA(3), AA(0), AA(2), AA(0), AA(0)]",
      "assert p[:2] == P(3) and p[:-1] == P(0)",
      "try:",
      "    p[QQ(1, 2)]",
      "    raise AssertionError('nonintegral coefficient index accepted')",
      "except TypeError:",
      "    pass",
      "R.<y> = QQ[]",
      "r = (y^2-2).roots(AA, multiplicities=False)[1]",
      "M = matrix(AA, 8, 8, lambda i,j: r if i==j else AA((i+2*j)%5-2))",
      "q = (M*M).charpoly()",
      "assert q[0] == q(AA(0))",
      "True",
    ].join("\n"));
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
