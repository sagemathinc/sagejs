"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("elliptic L-series evaluates the motivating complex value", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([1,2,3,4,999])",
        "L = E.lseries()",
        "z = L(1+I)",
        "[E.lseries() is L, L.elliptic_curve() is E, z.parent().precision() == 53,",
        " abs(float(z.real()) + 0.0053103195260299207) < 2e-13,",
        " abs(float(z.imag()) - 0.0990520277396781685) < 2e-13]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("elliptic L-series batch, completed values, and functional equation agree", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([0,-1,1,-10,-20])",
        "L = E.lseries()",
        "s = CC(0.5, 1)",
        "v = L.values([s, CC(1.5,-1)], prec=64)",
        "lam0 = L.completed_value(s, prec=64)",
        "lam1 = L.completed_value(2-s, prec=64)",
        "single = L.value(s, prec=64)",
        "[abs(float((v[0]-single).real())) < 1e-15,",
        " abs(float((v[0]-single).imag())) < 1e-15,",
        " abs(float((lam0-E.root_number()*lam1).real())) < 1e-12,",
        " abs(float((lam0-E.root_number()*lam1).imag())) < 1e-12]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True]");
  } finally {
    await session.close();
  }
});

test("elliptic L-series handles trivial zeros and explicit algorithms", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "E = EllipticCurve([0,-1,1,-10,-20])",
        "L = E.lseries()",
        "zeros = [L.value(s, prec=64, algorithm='native') for s in [0,-1,-2]]",
        "reference = L.value(CC(1,1), prec=64, algorithm='reference')",
        "native = L.value(CC(1,1), prec=64, algorithm='native')",
        "odd = EllipticCurve([0,0,1,-1,0]).lseries().value(1, prec=64, algorithm='native')",
        "near = L.value(CC(-1 + 2^(-20),0), prec=64, algorithm='native')",
        "[all(abs(float(z.real())) < 1e-15 and abs(float(z.imag())) < 1e-15 for z in zeros),",
        " abs(float((reference-native).real())) < 1e-12,",
        " abs(float((reference-native).imag())) < 1e-12,",
        " abs(float(odd.real())) < 1e-15 and abs(float(odd.imag())) < 1e-15,",
        " abs(float(near.real())) > 1e-10]",
      ].join("\n"),
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, True, True, True]");
    await assert.rejects(
      session.evaluate(
        "EllipticCurve([0,-1,1,-10,-20]).lseries().value(1, algorithm='pari')",
      ),
      /algorithm must be.*auto.*native.*reference/,
    );
  } finally {
    await session.close();
  }
});
