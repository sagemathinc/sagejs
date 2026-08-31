// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "formula subspaces certify exact Hecke matrices and escaping images",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const stable = await session.evaluate(
        [
          "F = CuspForms(2,12).formula_subspace(prec=8)",
          "C = F.hecke_action_certificate(2)",
          "M = ModularSymbols(2,12,sign=1).cuspidal_submodule()",
          "[C.verify(), C.is_stable(), C.required_source_precision(),",
          " F.hecke_matrix(2).charpoly(), M.hecke_matrix(2).charpoly(),",
          " F.hecke_matrix(3).charpoly(), M.hecke_matrix(3).charpoly()]",
        ].join("\n"),
      );
      assert.equal(
        stable.repr,
        "[True, True, 15, x^2 + 24*x + 2048, x^2 + 24*x + 2048, x^2 - 504*x + 63504, x^2 - 504*x + 63504]",
      );

      const escaping = await session.evaluate(
        [
          "D = certified_modular_form(CuspForms(1,24).gen(0),8).lift_level(2)",
          "P = CuspForms(2,24).formula_subspace([D],prec=8)",
          "O = P.hecke_obstruction(2)",
          "[P.is_hecke_stable(2), O.source_basis_index(), O.verify(),",
          " O.q_expansion(8)]",
        ].join("\n"),
      );
      assert.match(
        escaping.repr,
        /^\[False, 0, True, .*\+ O\(q\^8\)\]$/u,
      );
      const failure = await session.evaluate(
        "try:\n P.hecke_matrix(2)\nexcept ValueError as e:\n str(e)",
      );
      assert.match(failure.repr, /outside the certified span/u);
    } finally {
      await session.close();
    }
  },
);

test(
  "bad-prime operators split repeated anemic formula packets exactly",
  { timeout: 180_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "F = CuspForms(22,2).formula_subspace(prec=8)",
          "A = F.decomposition(anemic=True)",
          "B = F.decomposition(anemic=False)",
          "E = F.eigenforms(names='a')",
          "[F.dimension(), F.is_full_ambient(),",
          " F.hecke_matrix(3).charpoly(), F.hecke_matrix(2).charpoly(),",
          " [(V.dimension(),V.is_simple()) for V in A],",
          " [(V.dimension(),V.is_simple()) for V in B],",
          " [(f.coefficient_field().degree(),str(f.defining_polynomial()),",
          "   f.certificate().verify(), f.lseries_input(6).verify(),",
          "   f.lseries_input(6).coefficient_bound()) for f in E]]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[2, True, x^2 + 2*x + 1, x^2 + 2*x + 2, [(2, False)], [(2, True)], [(2, 'x^2 + 2*x + 2', True, True, 6)]]",
      );
    } finally {
      await session.close();
    }
  },
);

test("the zero formula span has the unique exact Hecke action", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "Z = CuspForms(37,2).formula_subspace(prec=8)",
        "C = Z.hecke_action_certificate(2)",
        "[Z.dimension(), Z.is_hecke_stable(2), Z.hecke_matrix(2).nrows(),",
        " Z.hecke_matrix(2).ncols(), C.verify(), Z.decomposition()]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[0, True, 0, 0, True, []]");
  } finally {
    await session.close();
  }
});
