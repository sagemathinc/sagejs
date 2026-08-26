// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("certified genus-2 conductors and root numbers agree with PARI", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "even = HyperellipticCurve(x, x^3-x+1).global_reduction()",
            "odd = HyperellipticCurve(x, x^3-3*x+1).global_reduction()",
            "[(d.conductor, d.root_number, d.bad_primes,",
            "  tuple((r.prime, r.conductor_exponent, r.local_root_number)",
            "        for r in d.local_data)) for d in (even, odd)]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[(713, 1, (23, 31), ((23, 1, 1), (31, 1, 1))), " +
        "(13223, -1, (7, 1889), ((7, 1, -1), (1889, 1, 1)))]",
    );
  } finally {
    await session.close();
  }
});

test("global assembly refuses an unsupported wild candidate", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R = PolynomialRing(QQ, 'x')",
        "x = R.gen()",
        "C = HyperellipticCurve(x, x^3+2*x-1)",
        "answer = None",
        "try:",
        "    C.global_reduction()",
        "except Exception as error:",
        "    answer = (str(error), error.diagnostics['prime'])",
        "answer",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "('global conductor/root-number assembly is unsupported at p=2', 2)",
    );
  } finally {
    await session.close();
  }
});

test("exact coefficients and refined analytic values agree with PARI", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x, x^3-x+1)",
            "L = C.lseries()",
            "a = L.coefficients(20)",
            "v1, v2 = L.values([1,2], prec=32)",
            "D = L.last_diagnostics()",
            "(a, abs(v1-0.2858010009469617) < 1e-7,",
            " abs(v2-0.6561031021391469) < 1e-7,",
            " D['refinement_stable'], D['rigorous'], C.analytic_rank(prec=32))",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([0, 1, -1, -1, 0, 1, 1, -1, -1, -3, -1, 2, 0, -3, 1, -1, " +
        "-1, 8, 3, -5, 0], True, True, True, False, 0)",
    );
  } finally {
    await session.close();
  }
});

test("completed values satisfy the certified functional equation", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x, x^3-x+1)",
            "L = C.lseries()",
            "(L is C.lseries(), L.curve() is C,",
            " abs(L.check_functional_equation(prec=32)) < 1e-7)",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(True, True, True)",
    );
  } finally {
    await session.close();
  }
});

test("negative sign forces odd probable rank and the raw leading derivative", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x, x^3-3*x+1)",
            "rank, leading = C.analytic_rank(prec=16, max_order=3,",
            "                                  leading_coefficient=True)",
            "(rank, abs(leading-0.9022595826270356) < 0.001)",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(1, True)",
    );
  } finally {
    await session.close();
  }
});

test("the odd-degree genus-3 engine uses certified global data", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "f = x^7+4*x^6+6*x^5+7*x^4+5*x^3+3*x^2+x",
            "C = HyperellipticCurve(f, 1)",
            "L = C.lseries()",
            "value = L.value(1, prec=16)",
            "(C.conductor(), C.root_number(), C.bad_primes(),",
            " abs(value-0.2263) < 0.0001,",
            " L.last_diagnostics()['genus'],",
            " L.last_diagnostics()['refinement_stable'],",
            " L.last_diagnostics()['coefficient_backend_counts']",
            "     .get('rforest', 0) > 0)",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(24055, 1, (5, 17, 283), True, 3, True, True)",
    );
  } finally {
    await session.close();
  }
});
