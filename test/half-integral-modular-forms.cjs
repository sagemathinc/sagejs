// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("unary theta formulas have replayable exact certificates", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[theta_qexp(12), theta2_qexp(30), " +
            "theta_qexp_certificate(30).verify(), " +
            "theta2_qexp_certificate(30).verify()]",
        )
      ).repr,
      "[1 + 2*q + 2*q^4 + 2*q^9 + O(q^12), " +
        "q + q^9 + q^25 + O(q^30), True, True]",
    );
  } finally {
    await session.close();
  }
});

test("Cohen Eisenstein coefficients satisfy plus support and Hecke", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "C = cohen_eisenstein_series_certificate(2,20)",
            "f = cohen_eisenstein_series_qexp(2,82)",
            "T9 = half_integral_weight_hecke_qexp(f,5,3,prec=10)",
            "[C.q_expansion(), C.weight(), C.level(),",
            " C.has_kohnen_plus_support(), C.verify(),",
            " T9 == C.hecke_eigenvalue(3)*f.add_bigoh(10)]",
          ].join("\n"),
        )
      ).repr,
      "[1/120 - 1/12*q - 7/12*q^4 - 2/5*q^5 - q^8 " +
        "- 25/12*q^9 - 2*q^12 - 2*q^13 - 55/12*q^16 " +
        "- 4*q^17 + O(q^20), 5/2, 4, True, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("Basmaji weight 5/2 basis matches Sage and is Sturm certified", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "chi = list(DirichletGroup(16))[4]",
            "H = HalfIntegralWeightModularForms(chi,5,prec=20)",
            "C = H.q_expansion_basis_certificate()",
            "[H.dimension(), H.weight(), H.sturm_bound(),",
            " H.relation_sturm_bound(), H.q_expansion_basis(20),",
            " C.algorithm(), C.verify(), H.hecke_matrix(9)]",
          ].join("\n"),
        )
      ).repr,
      "[1, 5/2, 5, 7, [q - 2*q^3 - 2*q^5 + 4*q^7 - q^9 " +
        "+ 6*q^11 + 2*q^13 - 12*q^15 - 4*q^17 - 6*q^19 + O(q^20)], " +
        "'basmaji-theta-kernel', True, [-4]]",
    );
  } finally {
    await session.close();
  }
});

test("higher-dimensional Basmaji basis and rational character recurrence", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "chi = list(DirichletGroup(16))[4]",
            "H3 = HalfIntegralWeightModularForms(chi,3,prec=10)",
            "H7 = HalfIntegralWeightModularForms(chi,7,prec=10)",
            "[H3.q_expansion_basis(), H7.q_expansion_basis(), H7.hecke_matrix(9)]",
          ].join("\n"),
        )
      ).repr,
      "[[], [q - 2*q^2 + 4*q^3 + 4*q^4 - 10*q^5 - 16*q^7 " +
        "+ 19*q^9 + O(q^10), q^2 - 2*q^3 - 2*q^4 + 4*q^5 " +
        "+ 4*q^7 - 8*q^9 + O(q^10), q^3 - 2*q^5 - 2*q^7 " +
        "+ 4*q^9 + O(q^10)], [ 28  80  80]\n[ -8 -28 -16]\n[  4   8  -4]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "e = list(DirichletGroup(12))[1]",
            "S = ModularSymbols(e,3,sign=1).cuspidal_submodule()",
            "[S.hecke_matrix(9), S.q_expansion_basis(20)[0][18]]",
          ].join("\n"),
        )
      ).repr,
      "[[-3  0]\n[ 0 -3], 0]",
    );
    await assert.rejects(
      session.evaluate(
        "HalfIntegralWeightModularForms(list(DirichletGroup(8))[0],5)",
      ),
      /divisible by 16/,
    );
    await assert.rejects(
      session.evaluate(
        "HalfIntegralWeightModularForms(list(DirichletGroup(16))[0],4)",
      ),
      /odd and at least 3/,
    );
  } finally {
    await session.close();
  }
});
