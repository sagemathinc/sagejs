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
            "[E.anlist(30), G, G.conductor(), " +
              "EllipticCurve('389a').rank(), EllipticCurve('5077a').rank()]",
          ].join("\n"),
        )
      ).repr,
      "[[0, 1, -2, -3, 2, -2, 6, -1, 0, 6, 4, -5, -6, -2, 2, 6, " +
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
