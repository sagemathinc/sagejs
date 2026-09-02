// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const newformOracles = require("./fixtures/modular-newform-lmfdb.json");

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

test("Eisenstein basis elements retain their parent and expand on demand", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "E=EisensteinForms(389,2)\n" +
            "B=E.basis(prec=20)\n" +
            "b=B[0]\n" +
            "[b.parent() is E, b.prec(), b[4], " +
            "b.q_expansion(5), " +
            "b.q_expansion(100).precision_absolute()]",
        )
      ).repr,
      "[True, 20, 42/97, " +
        "1 + 6/97*q + 18/97*q^2 + 24/97*q^3 + " +
        "42/97*q^4 + O(q^5), 100]",
    );

    const help = await session.evaluate("help(b.q_expansion)");
    assert.match(
      help.stdout,
      /Help on method q_expansion in module sage\.modular\.modform\.element:/,
    );
    assert.match(help.stdout, /Return the `q`-expansion/);
    assert.match(help.stdout, /FLINT/);

    const inspection = await session.inspect("b.q_expansion", 13);
    assert.equal(inspection.found, true);
    assert.match(inspection.text, /q_expansion/);
    assert.match(inspection.text, /absolute precision/);

    const search = await session.evaluate("search_doc('q-expansion')");
    assert.match(
      search.stdout,
      /EisensteinSeriesElement\.q_expansion/,
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

test("E4, E6, and Delta retain exact modular-form formulas", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "E4=EisensteinForms(1,4,prec=7).gen()\n" +
            "E6=EisensteinForms(1,6,prec=7).gen()\n" +
            "D=(E4^3-E6^2)/1728\n" +
            "[D.weight(),D.level(),D.base_ring(),D.is_cuspidal(),D.valuation()," +
            "D[0],D[1],D.prec(),E4^2==EisensteinForms(1,8).gen()," +
            "E4*E6==EisensteinForms(1,10).gen(),D.q_expansion(7)," +
            "delta_qexp(7),D==ModularForms(1,12,prec=7).delta()]",
        )
      ).repr,
      "[12, 1, Rational Field, True, 1, 0, 1, 7, True, True, " +
        "q - 24*q^2 + 252*q^3 - 1472*q^4 + 4830*q^5 - " +
        "6048*q^6 + O(q^7), q - 24*q^2 + 252*q^3 - 1472*q^4 + " +
        "4830*q^5 - 6048*q^6 + O(q^7), True]",
    );

    assert.equal(
      (
        await session.evaluate(
          "[delta_qexp(6,var='t'),delta_qexp(6,K=GF(5),var='z')]",
        )
      ).repr,
      "[t - 24*t^2 + 252*t^3 - 1472*t^4 + 4830*t^5 + O(t^6), " +
        "z + z^2 + 2*z^3 + 3*z^4 + O(z^6)]",
    );
  } finally {
    await session.close();
  }
});

test("Victor Miller bases match Sage's integral leading-term normalization", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[victor_miller_basis(12,6),victor_miller_basis(24,6)]",
        )
      ).repr,
      "[[1 + 196560*q^2 + 16773120*q^3 + 398034000*q^4 + " +
        "4629381120*q^5 + O(q^6), q - 24*q^2 + 252*q^3 - " +
        "1472*q^4 + 4830*q^5 + O(q^6)], " +
        "[1 + 52416000*q^3 + 39007332000*q^4 + " +
        "6609020221440*q^5 + O(q^6), q + 195660*q^3 + " +
        "12080128*q^4 + 44656110*q^5 + O(q^6), q^2 - 48*q^3 + " +
        "1080*q^4 - 15040*q^5 + O(q^6)]]",
    );

    assert.equal(
      (
        await session.evaluate(
          "[victor_miller_basis(0,4),victor_miller_basis(2,4)," +
            "victor_miller_basis(7,4)," +
            "victor_miller_basis(24,6,cusp_only=True,var='t')]",
        )
      ).repr,
      "[[1 + O(q^4)], [], [], [t + 195660*t^3 + 12080128*t^4 + " +
        "44656110*t^5 + O(t^6), t^2 - 48*t^3 + 1080*t^4 - " +
        "15040*t^5 + O(t^6)]]",
    );
  } finally {
    await session.close();
  }
});

test("large Victor Miller bases retain their exact native-series normalization", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "B=victor_miller_basis(200,50)\n" +
            "d=len(B)\n" +
            "leading=all(B[i][j]==(1 if i==j else 0) " +
            "for i in range(d) for j in range(d))\n" +
            "digest=sum((i+1)*(j+1)*B[i][j] for i in range(d) " +
            "for j in range(50)) % 1000000007\n" +
            "[d,leading,digest]",
        )
      ).repr,
      "[17, True, 694217421]",
    );
  } finally {
    await session.close();
  }
});

test("Victor Miller bases use their known identity truncation", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "B=victor_miller_basis(2000,50)\n" +
            "S=victor_miller_basis(2000,50,cusp_only=True)\n" +
            "edge=victor_miller_basis(24,3)\n" +
            "[len(B),str(B[0]),str(B[1]),str(B[49]),str(B[50])," +
            "str(B[-1]),len(S),str(S[0]),str(S[48]),str(S[49]),edge]",
        )
      ).repr,
      "[167, '1 + O(q^50)', 'q + O(q^50)', 'q^49 + O(q^50)', " +
        "'O(q^50)', 'O(q^50)', 166, 'q + O(q^50)', " +
        "'q^49 + O(q^50)', 'O(q^50)', " +
        "[1 + O(q^3), q + O(q^3), q^2 + O(q^3)]]",
    );
  } finally {
    await session.close();
  }
});

test("level-one ambient and cusp bases carry replayable certificates", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "M=ModularForms(1,24,prec=6)\n" +
            "C=M.basis_certificate()\n" +
            "S=M.cuspidal_subspace()\n" +
            "CS=S.basis_certificate()\n" +
            "B=C.basis()\n" +
            "[C.is_verified(),C.verify(),C.dimension(),C.sturm_bound()," +
            "C.algorithm(),len(B),[f.weight() for f in B]," +
            "[f.parent() is M for f in B],M.gens()==B," +
            "CS.is_verified(),CS.dimension(),S.dimension()," +
            "S.q_expansion_basis(4)]",
        )
      ).repr,
      "[True, True, 3, 2, 'victor-miller-e4-e6-delta', 3, " +
        "[24, 24, 24], [True, True, True], True, True, 2, 2, " +
        "[q + 195660*q^3 + O(q^4), q^2 - 48*q^3 + O(q^4)]]",
    );
  } finally {
    await session.close();
  }
});

test("normalized newforms reconstruct exact coefficient fields and LMFDB rows", async () => {
  const session = await createSage();
  try {
    const rational = newformOracles.oracles[0];
    const quadratic = newformOracles.oracles[1];
    assert.equal(
      (
        await session.evaluate(
          [
            `f=CuspForms(${rational.level},${rational.weight}).newforms('a')[0]`,
            `g=CuspForms(${quadratic.level},${quadratic.weight}).newforms('a')[0]`,
            "L=g.lseries_input(8)",
            "[[f[i] for i in [0..7]],f.certificate(8).verify()," +
              "str(g.defining_polynomial()),[g[i].list() for i in [0..7]]," +
              "g.certificate(8).verify(),g.q_expansion(8)," +
              "[L.level(),L.conductor(),L.weight(),L.functional_equation_center()," +
              "L.coefficient_bound(),L.verify()]]",
          ].join("\n"),
        )
      ).repr,
      "[[0, 1, -2, -1, 2, 1, 2, -2], True, " +
        "'x^2 + x - 1', [[0, 0], [1, 0], [0, 1], [-1, -2], " +
        "[-1, -1], [0, 2], [-2, 1], [2, 2]], True, " +
        "q + a0*q^2 + (-2*a0 - 1)*q^3 + (-a0 - 1)*q^4 + " +
        "2*a0*q^5 + (a0 - 2)*q^6 + (2*a0 + 2)*q^7 + O(q^8), " +
        "[23, 23, 2, 1, 8, True]]",
    );
  } finally {
    await session.close();
  }
});

test("composite-level cusp spaces have certified old/new decompositions", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "S=CuspForms(22,2,prec=10)\n" +
            "O=S.old_subspace()\nN=S.new_subspace()\n" +
            "C=O.q_expansion_basis_certificate(10)\n" +
            "[S.dimension(),O.dimension(),N.dimension()," +
            "C.old_dimension(),C.new_dimension(),C.dimension(),C.verify()," +
            "len(O.q_expansion_basis(10))]",
        )
      ).repr,
      "[2, 2, 0, 2, 0, 2, True, 2]",
    );
    assert.equal(
      (
        await session.evaluate(
          "F=Newforms(26,2,names='b')\n" +
            "[[f.q_expansion(8) for f in F]," +
            "[f.certificate().verify() for f in F]," +
            "ModularForms(26,2).new_subspace().dimension()]",
        )
      ).repr,
      "[[q + q^2 - 3*q^3 + q^4 - q^5 - 3*q^6 + q^7 + O(q^8), " +
        "q - q^2 + q^3 + q^4 - 3*q^5 - q^6 - q^7 + O(q^8)], " +
        "[True, True], 2]",
    );
  } finally {
    await session.close();
  }
});

test("primitive character pairs give exact generalized Eisenstein series", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "G=DirichletGroup(5)\nchi=G.gen(0)\n" +
            "one=DirichletGroup(1)(1)\n" +
            "f=eisenstein_series_qexp(3,10,chi=chi,psi=one)\n" +
            "[f,f[1],f[2]==chi(2)+4,f[3]==chi(3)+9,f.prec()]",
        )
      ).repr,
      "[q + (zeta4 + 4)*q^2 + (-zeta4 + 9)*q^3 + " +
        "(4*zeta4 + 15)*q^4 + 25*q^5 + (5*zeta4 + 37)*q^6 + " +
        "(zeta4 + 49)*q^7 + (15*zeta4 + 60)*q^8 + " +
        "(-9*zeta4 + 80)*q^9 + O(q^10), 1, True, True, 10]",
    );
  } finally {
    await session.close();
  }
});

test("imprimitive Eisenstein inputs use their primitive inducing characters", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "chi=list(DirichletGroup(12))[1]\n" +
            "primitive=list(DirichletGroup(4))[1]\n" +
            "one=DirichletGroup(1)(1)\n" +
            "a=eisenstein_series_qexp(3,10,chi=one,psi=chi)\n" +
            "b=eisenstein_series_qexp(3,10,chi=one,psi=primitive)\n" +
            "[chi.conductor(),a,a==b]",
        )
      ).repr,
      "[4, -1/4 + q + q^2 - 8*q^3 + q^4 + 26*q^5 - 8*q^6 " +
        "- 48*q^7 + q^8 + 73*q^9 + O(q^10), True]",
    );
    await assert.rejects(
      session.evaluate(
        "one=DirichletGroup(1)(1)\n" +
          "eisenstein_series_qexp(2,8,chi=one,psi=one)",
      ),
      /quasimodular/,
    );
    await assert.rejects(
      session.evaluate(
        "one=DirichletGroup(1)(1)\n" +
          "odd=list(DirichletGroup(4))[1]\n" +
          "eisenstein_series_qexp(4,8,chi=one,psi=odd)",
      ),
      /chi\(-1\)\*psi\(-1\)/,
    );
  } finally {
    await session.close();
  }
});
