// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("certified products retain exact modular-form metadata and precision", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "D = certified_modular_form(ModularForms(1,12).delta(),8)",
            "E4 = certified_modular_form(EisensteinForms(1,4).gen(),8)",
            "F = D*E4",
            "A = certified_modular_form(EisensteinForms(2,4).gen(),8)",
            "B = certified_modular_form(EisensteinForms(3,4).gen(),8)",
            "G = A*B",
            "X = certified_modular_form(EisensteinForms(1,4,prec=8).gen(),8)",
            "Y = certified_modular_form(CuspForms(1,12,prec=10).gen(),10)",
            "[F.weight(),F.level(),F.precision(),F.valuation(),",
            " F.relative_precision(),F.is_cuspidal(),",
            " F.character().is_trivial(),F.certificate().verify(),",
            " [F[n] for n in [1..3]],G.weight(),G.level(),",
            " G.character().is_trivial(),G.certificate().verify(),",
            " (X*Y).precision(),(Y*X).precision(),",
            " (X*Y).q_expansion()==(Y*X).q_expansion()]",
          ].join("\n"),
        )
      ).repr,
      "[16, 1, 8, 1, 7, True, True, True, [1, 216, -3348], 8, 6, True, True, 9, 9, True]",
    );

    assert.equal(
      (
        await session.evaluate(
          [
            "G = DirichletGroup(5)",
            "chi, one = G.gen()^2, G()",
            "A = character_eisenstein_series(chi,one,4,8)",
            "B = character_eisenstein_series(one,chi,4,8)",
            "P = A*B",
            "[P.weight(),P.level(),P.character().is_trivial(),",
            " [P[n] for n in [1..4]],P.certificate().verify()]",
          ].join("\n"),
        )
      ).repr,
      "[8, 25, True, [1, 8, 26, 8], True]",
    );
  } finally {
    await session.close();
  }
});

test("V_d records oldform provenance and scales certified precision", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "D = certified_modular_form(ModularForms(1,12).delta(),8)",
            "V = D.V(2)",
            "M = V.oldform_metadata()",
            "[V.weight(),V.level(),V.precision(),V.is_oldform(),",
            " M.source_level(),M.target_level(),M.factor(),",
            " [V[n] for n in [1..5]],V.certificate().verify()]",
          ].join("\n"),
        )
      ).repr,
      "[12, 2, 16, True, 1, 2, 2, [0, 1, 0, -24, 0], True]",
    );
  } finally {
    await session.close();
  }
});

test("bounded primitive quadratic twists retain exact coefficients", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "D = certified_modular_form(ModularForms(1,12).delta(),8)",
            "chi = DirichletGroup(5).gen()^2",
            "T = D.twist(chi)",
            "[T.weight(),T.level(),T.character().is_trivial(),",
            " [T[n] for n in [1..5]],T.certificate().verify()]",
          ].join("\n"),
        )
      ).repr,
      "[12, 25, True, [1, 24, -252, -1472, 0], True]",
    );

    await assert.rejects(
      session.evaluate(
        "D=certified_modular_form(ModularForms(1,12).delta(),8)\n" +
          "D.twist(DirichletGroup(7).gen())",
      ),
      /requires a real character/,
    );
  } finally {
    await session.close();
  }
});

test("formula spans report full and proper subspaces honestly", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "A = CuspForms(2,12)",
            "AF = A.formula_subspace(prec=8)",
            "B = CuspForms(2,24)",
            "BF = B.formula_subspace(prec=8)",
            "[A.dimension(),AF.dimension(),AF.is_full_ambient(),AF.verify(),",
            " len(A.q_expansion_basis(8,algorithm='formulas')),",
            " B.dimension(),BF.dimension(),BF.ambient_dimension(),",
            " BF.is_proper_subspace(),BF.verify()]",
          ].join("\n"),
        )
      ).repr,
      "[2, 2, True, True, 2, 5, 4, 5, True, True]",
    );

    assert.equal(
      (await session.evaluate("BF")).repr,
      "Certified formula-generated proper subspace of dimension 4 of " +
        "Cuspidal subspace of dimension 5 of Modular Forms space of " +
        "dimension 7 for Congruence Subgroup Gamma0(2) of weight 24 " +
        "over Rational Field",
    );

    await assert.rejects(
      session.evaluate("CuspForms(2,24).q_expansion_basis(8,algorithm='formulas')"),
      /certify only a proper subspace of dimension 4 in ambient dimension 5/,
    );
  } finally {
    await session.close();
  }
});

test("automatic q-expansion selection exposes exact-domain receipts", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "F = CuspForms(1,24).q_expansion_algorithm_receipt('auto')",
            "A = CuspForms(2,12).q_expansion_algorithm_receipt('auto',8)",
            "B = CuspForms(2,24).q_expansion_algorithm_receipt('auto',8)",
            "H = CuspForms(37,2).q_expansion_algorithm_receipt('auto')",
            "[F.selected_algorithm(),F.receipt_id(),F.verify(),",
            " A.selected_algorithm(),A.receipt_id(),",
            " A.formula_subspace().is_full_ambient(),A.verify(),",
            " B.selected_algorithm(),B.receipt_id(),",
            " B.formula_subspace().is_proper_subspace(),B.verify(),",
            " H.selected_algorithm(),H.receipt_id(),H.verify(),",
            " CuspForms(1,24).q_expansion_basis(4,algorithm='auto') ==",
            " CuspForms(1,24).q_expansion_basis(4,algorithm='formulas'),",
            " CuspForms(2,12).q_expansion_basis(8,algorithm='auto') ==",
            " CuspForms(2,12).q_expansion_basis(8,algorithm='formulas'),",
            " CuspForms(2,24).q_expansion_basis(8,algorithm='auto') ==",
            " CuspForms(2,24).q_expansion_basis(8,algorithm='modular_symbols')]",
          ].join("\n"),
        )
      ).repr,
      "['formulas', 'qexp-auto-level-one-victor-miller-v1', True, " +
        "'formulas', 'qexp-auto-certified-formula-span-v1', True, True, " +
        "'modular_symbols', 'qexp-auto-proper-formula-span-fallback-v1', " +
        "True, True, 'modular_symbols', " +
        "'qexp-auto-proper-formula-span-fallback-v1', True, True, True, True]",
    );
  } finally {
    await session.close();
  }
});
