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
