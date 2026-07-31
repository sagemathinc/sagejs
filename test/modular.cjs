"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("level-one Eisenstein q-expansions match Sage normalizations", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[eisenstein_series_qexp(4,8), " +
            "eisenstein_series_qexp(12,5,normalization='integral'), " +
            "eisenstein_series_qexp(12,5,normalization='constant')]",
        )
      ).repr,
      "[1/240 + q + 9*q^2 + 28*q^3 + 73*q^4 + 126*q^5 + " +
        "252*q^6 + 344*q^7 + O(q^8), " +
        "691 + 65520*q + 134250480*q^2 + 11606736960*q^3 + " +
        "274945048560*q^4 + O(q^5), " +
        "1 + 65520/691*q + 134250480/691*q^2 + " +
        "11606736960/691*q^3 + 274945048560/691*q^4 + O(q^5)]",
    );

    assert.equal(
      (
        await session.evaluate(
          "f=eisenstein_series_qexp(2,5,GF(7),var='T')\n" +
            "[f, f[0], f[4], f.precision_absolute(), f.padded_list()]",
        )
      ).repr,
      "[2 + T + 3*T^2 + 4*T^3 + O(T^5), 2, 0, 5, [2, 1, 3, 4, 0]]",
    );
  } finally {
    await session.close();
  }
});

test("congruence subgroup dimensions cover guided-tour examples", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[Gamma0(1), Gamma0(11), " +
            "dimension_cusp_forms(Gamma0(11),2), " +
            "dimension_cusp_forms(Gamma0(1),12), " +
            "dimension_cusp_forms(Gamma1(389),2)]",
        )
      ).repr,
      "[Modular Group SL(2,Z), Congruence Subgroup Gamma0(11), " +
        "1, 1, 6112]",
    );
  } finally {
    await session.close();
  }
});

test("Eisenstein spaces reproduce level one and level 11 bases", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[EisensteinForms(1,4).basis(), " +
            "EisensteinForms(11,2).basis(), " +
            "EisensteinForms(11,4).basis()]",
        )
      ).repr,
      "[[1 + 240*q + 2160*q^2 + 6720*q^3 + 17520*q^4 + " +
        "30240*q^5 + O(q^6)], " +
        "[1 + 12/5*q + 36/5*q^2 + 48/5*q^3 + 84/5*q^4 + " +
        "72/5*q^5 + O(q^6)], " +
        "[1 + O(q^6), q + 9*q^2 + 28*q^3 + 73*q^4 + " +
        "126*q^5 + O(q^6)]]",
    );

    assert.equal(
      (
        await session.evaluate(
          "EisensteinForms(11,4).q_expansion_basis(15)",
        )
      ).repr,
      "[1 + 240*q^11 + O(q^15), " +
        "q + 9*q^2 + 28*q^3 + 73*q^4 + 126*q^5 + 252*q^6 + " +
        "344*q^7 + 585*q^8 + 757*q^9 + 1134*q^10 + 1331*q^11 + " +
        "2044*q^12 + 2198*q^13 + 3096*q^14 + O(q^15)]",
    );
  } finally {
    await session.close();
  }
});

test("ModularForms exposes Sage-style ambient and subspaces", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "T=ModularForms(Gamma0(11),2)\n" +
            "[T, T.degree(), T.level(), T.group(), T.dimension(), " +
            "T.cuspidal_subspace(), T.eisenstein_subspace()]",
        )
      ).repr,
      "[Modular Forms space of dimension 2 for Congruence Subgroup " +
        "Gamma0(11) of weight 2 over Rational Field, 2, 11, " +
        "Congruence Subgroup Gamma0(11), 2, " +
        "Cuspidal subspace of dimension 1 of Modular Forms space of " +
        "dimension 2 for Congruence Subgroup Gamma0(11) of weight 2 " +
        "over Rational Field, Eisenstein subspace of dimension 1 of " +
        "Modular Forms space of dimension 2 for Congruence Subgroup " +
        "Gamma0(11) of weight 2 over Rational Field]",
    );
  } finally {
    await session.close();
  }
});
