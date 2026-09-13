// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Kohnen plus kernel agrees with the PARI level-16 oracle", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "chi = list(DirichletGroup(16))[0]",
            "H = HalfIntegralWeightModularForms(chi,9,prec=20)",
            "P = H.kohnen_plus_subspace()",
            "C = P.basis_certificate()",
            "[H.dimension(), P.dimension(), C.epsilon(), C.sturm_bound(),",
            " C.verify(), P.q_expansion_basis(16)]",
          ].join("\n"),
        )
      ).repr,
      "[4, 2, 1, 36, True, [q - 15*q^9 + O(q^16), " +
        "q^4 - 6*q^8 + 12*q^12 + O(q^16)]]",
    );
  } finally {
    await session.close();
  }
});

test("Shimura images and target coordinates agree with PARI", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "chi = list(DirichletGroup(16))[0]",
            "P = HalfIntegralWeightModularForms(chi,9,prec=20).kohnen_plus_subspace()",
            "S = P.shimura_lift_certificate(1)",
            "[P.shimura_lift_basis(1,10), S.matrix(), S.verify(), S.verify_hecke(3)]",
          ].join("\n"),
        )
      ).repr,
      "[[q + 12*q^3 - 210*q^5 + 1016*q^7 - 2043*q^9 + O(q^10), " +
        "q^2 - 8*q^4 + 12*q^6 + 64*q^8 + O(q^10)], " +
        "[1 0]\n[0 1], True, True]",
    );
  } finally {
    await session.close();
  }
});

test("bounded Shimura and plus APIs fail closed", async () => {
  const session = await createSage();
  try {
    await assert.rejects(
      session.evaluate(
        "HalfIntegralWeightModularForms(list(DirichletGroup(16))[4],7).kohnen_plus_subspace().dimension()",
      ),
      /conductor dividing level\/4/,
    );
    await assert.rejects(
      session.evaluate(
        "q=PowerSeriesRing(QQ,'q',default_prec=20).gen(); shimura_lift_qexp(q+O(q^20),3,t=4,level=4)",
      ),
      /positive and squarefree/,
    );
  } finally {
    await session.close();
  }
});
