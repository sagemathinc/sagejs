// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Delta and the level 11 newform have exact eta-product certificates", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "D = eta_product(1,{1:24},prec=12)",
            "E = eta_product(11,{1:2,11:2},prec=12)",
            "T = eta_product(1,{1:24},prec=8,variable='t')",
            "[D.q_expansion()==ModularForms(1,12,prec=12).delta().q_expansion(12),",
            " D.weight(),D.level(),D.is_cuspidal(),D.character().is_trivial(),",
            " D.certificate().newman_sums(),D.certificate().newman_residues(),",
            " D.cusp_orders(),D.certificate().verify(),",
            " E.q_expansion(),E.weight(),E.level(),E.is_cuspidal(),",
            " E.character().is_trivial(),E.cusp_orders(),E.certificate().verify(),",
            " T.q_expansion(),T.certificate().verify()]",
          ].join("\n"),
        )
      ).repr,
      "[True, 12, 1, True, True, (24, 24), (0, 0), ((1, 1),), True, " +
        "q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 - 2*q^9 " +
        "- 2*q^10 + q^11 + O(q^12), 2, 11, True, True, " +
        "((1, 1), (11, 1)), True, " +
        "t - 24*t^2 + 252*t^3 - 1472*t^4 + 4830*t^5 - 6048*t^6 " +
        "- 16744*t^7 + O(t^8), True]",
    );

    assert.equal(
      (await session.evaluate("E")).repr,
      "Certified eta product eta(1*z)^2*eta(11*z)^2 of weight 2 and level 11",
    );
  } finally {
    await session.close();
  }
});

test("eta quotients support exact characters and negative exponents", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "A = eta_product(4,{1:4,2:2,4:4},prec=16)",
            "B = eta_product(4,{1:4,2:-2,4:12},prec=16)",
            "[A.q_expansion(),A.weight(),",
            " A.certificate().character_discriminant(),",
            " [A.character()(n) for n in [1..4]],A.cusp_orders(),",
            " A.certificate().verify(),B.q_expansion(),B.weight(),",
            " B.certificate().character_discriminant(),B.cusp_orders(),",
            " B.certificate().verify()]",
          ].join("\n"),
        )
      ).repr,
      "[q - 4*q^2 + 16*q^4 - 14*q^5 - 64*q^8 + 81*q^9 + 56*q^10 " +
        "- 238*q^13 + O(q^16), 5, -4, [1, 0, -1, 0], " +
        "((1, 1), (2, 1/2), (4, 1)), True, " +
        "q^2 - 4*q^3 + 4*q^4 - 8*q^6 + 40*q^7 - 48*q^8 + 10*q^10 " +
        "- 124*q^11 + 224*q^12 + 80*q^14 - 40*q^15 + O(q^16), 7, -4, " +
        "((1, 1), (2, 1/2), (4, 2)), True]",
    );
  } finally {
    await session.close();
  }
});

test("failed Newman and cusp conditions remain inspectable", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "A = eta_product_certificate(1,{1:12})",
            "B = eta_product_certificate(4,{1:-12,2:10,4:4})",
            "[[A.verify(),A.failure_reason(),A.newman_residues(),A.cusp_orders()],",
            " [B.verify(),B.failure_reason(),B.newman_residues(),B.cusp_orders()]]",
          ].join("\n"),
        )
      ).repr,
      "[[False, 'sum d*r_d is not divisible by 24', (12, 12), ((1, 1/2),)], " +
        "[False, 'the eta product has a pole at a cusp', (0, 0), " +
        "((1, -1), (2, 1/2), (4, 1))]]",
    );

    await assert.rejects(
      session.evaluate("eta_product(1,{1:12})"),
      /sum d\*r_d is not divisible by 24/,
    );
    await assert.rejects(
      session.evaluate("eta_product(4,{1:-12,2:10,4:4})"),
      /has a pole at a cusp/,
    );
    await assert.rejects(
      session.evaluate("eta_product_candidates(11,2,prec=8,vector_limit=1)"),
      /reached its candidate or vector limit/,
    );
  } finally {
    await session.close();
  }
});

test("the bounded registry proves spans and preserves honest misses", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "C = eta_product_candidates(11,2,prec=12)",
            "S = CuspForms(11,2)",
            "F = S.formula_subspace(prec=12)",
            "H = CuspForms(37,2).formula_subspace(prec=12)",
            "R = S.q_expansion_algorithm_receipt('auto',12)",
            "[[f.exponents() for f in C],F.dimension(),F.ambient_dimension(),",
            " F.is_full_ambient(),F.basis(),F.verify(),",
            " H.dimension(),H.ambient_dimension(),H.is_proper_subspace(),",
            " H.missing_dimension(),H.verify(),R.selected_algorithm(),",
            " R.receipt_id(),R.verify()]",
          ].join("\n"),
        )
      ).repr,
      "[[((1, 2), (11, 2))], 1, 1, True, " +
        "[q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 - 2*q^9 " +
        "- 2*q^10 + q^11 + O(q^12)], True, 0, 2, True, 2, True, " +
        "'formulas', 'qexp-auto-certified-formula-span-v1', True]",
    );
  } finally {
    await session.close();
  }
});
