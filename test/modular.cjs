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

test("Riemann-Roch dimensions cover general Gamma0 and Gamma1", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[[Gamma1(n).index() for n in [1..8]], " +
            "[Gamma1(n).projective_index() for n in [1..8]], " +
            "[Gamma1(4).ncusps(), Gamma1(4).nregcusps(), " +
            "Gamma1(4).nirregcusps(), Gamma1(4).genus()], " +
            "[dimension_cusp_forms(Gamma0(389),k) " +
            "for k in [2,4,6]], " +
            "[dimension_cusp_forms(Gamma0(2005),k) " +
            "for k in [2,4]], " +
            "[dimension_cusp_forms(Gamma1(20),k) " +
            "for k in [2,3,4]], " +
            "dimension_cusp_forms(Gamma1(389),4), " +
            "dimension_cusp_forms(Gamma0(11),-3)]",
        )
      ).repr,
      "[[1, 3, 8, 12, 24, 24, 48, 48], " +
        "[1, 3, 4, 6, 12, 12, 24, 24], [3, 2, 1, 0], " +
        "[32, 97, 161], [199, 602], [3, 14, 26], 18721, 0]",
    );

    assert.equal(
      (
        await session.evaluate(
          "[Gamma1(13).dimension_eis(2), " +
            "Gamma1(13).dimension_modular_forms(2), " +
            "dimension_eis(Gamma1(2006),2), " +
            "dimension_modular_forms(Gamma0(20),4)]",
        )
      ).repr,
      "[11, 13, 3711, 12]",
    );

    await assert.rejects(
      session.evaluate(
        "dimension_cusp_forms(Gamma1(389),1)",
      ),
      /Schaeffer algorithm/,
    );
  } finally {
    await session.close();
  }
});

test("Cohen-Oesterle dimensions support Dirichlet characters", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "from sage.modular.dims import dimension_cusp_forms, " +
            "dimension_eis, dimension_modular_forms, CohenOesterle, " +
            "CO_delta, CO_nu\n" +
            "G=DirichletGroup(13); e=G.0\n" +
            "[e.order(), e.is_trivial(), " +
            "[dimension_cusp_forms(e^j,2) for j in [0..7]], " +
            "[dimension_cusp_forms(e^j,3) for j in [0..7]], " +
            "[CohenOesterle(e^j,2) for j in [0..7]], " +
            "dimension_eis(e,2), dimension_eis(e^2,2), " +
            "dimension_eis(e,13)]",
        )
      ).repr,
      "[12, False, [0, 0, 1, 0, 0, 0, 0, 0], " +
        "[0, 1, 0, 2, 0, 1, 0, 1], " +
        "[-13/6, -2/3, -1/6, -5/3, -7/6, -2/3, -7/6, -2/3], " +
        "0, 2, 2]",
    );

    assert.equal(
      (
        await session.evaluate(
          "G=DirichletGroup(20)\n" +
            "[dimension_eis(G.0,3), dimension_eis(G.1,3), " +
            "dimension_eis(G.1^2,2), " +
            "dimension_cusp_forms(G.1,3), " +
            "dimension_modular_forms(G.1,3)]",
        )
      ).repr,
      "[4, 6, 6, 3, 9]",
    );

    assert.equal(
      (
        await session.evaluate(
          "G=DirichletGroup(7); e=G.0\n" +
            "[CO_delta(1,5,7,e^3), CO_nu(1,7,7,e)]",
        )
      ).repr,
      "[2, -1]",
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

    assert.equal(
      (
        await session.evaluate(
          "T=ModularForms(Gamma0(20),4)\n" +
            "[T.dimension(), T.cuspidal_subspace().dimension(), " +
            "T.eisenstein_subspace().dimension()]",
        )
      ).repr,
      "[12, 6, 6]",
    );
  } finally {
    await session.close();
  }
});
