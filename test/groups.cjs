"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("categories and finitely generated abelian groups", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          "[isinstance(QQ, Field), isinstance(QQ, Ring), " +
            "isinstance(ZZ, Field), isinstance(ZZ, Ring)]",
        )
      ).repr,
      "[True, True, False, True]",
    );
    assert.equal(
      (
        await session.evaluate(
          "[ZZ.category().is_subcategory(Rings()), " +
            "ZZ in Rings(), ZZ in Fields(), QQ in Fields()]",
        )
      ).repr,
      "[True, True, False, True]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "F = AbelianGroup(5, [5,5,7,8,9], names='abcde')",
            "(a,b,c,d,e) = F.gens()",
            "d*b^2*c^3",
          ].join("\n"),
        )
      ).repr,
      "b^2*c^3*d",
    );
    assert.equal(
      (await session.evaluate("AbelianGroup([2,3], names='xy')")).repr,
      "Multiplicative Abelian group isomorphic to C2 x C3",
    );
    assert.equal(
      (await session.evaluate("AbelianGroup(5).order()")).repr,
      "+Infinity",
    );
  } finally {
    await session.close();
  }
});

test("finite permutation and matrix groups", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "G = PermutationGroup(['(1,2,3)(4,5)', '(3,4)'])",
            "[G.order(), G.is_abelian(), len(G.center().gens()), " +
              "[H.order() for H in G.derived_series()]]",
          ].join("\n"),
        )
      ).repr,
      "[120, False, 1, [120, 60]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "A4 = PermutationGroup([[(1,2),(3,4)], [(1,2,3)]])",
            "latex(A4.character_table())",
          ].join("\n"),
        )
      ).repr,
      String.raw`\left(\begin{array}{rrrr}
1 & 1 & 1 & 1 \\
1 & -\zeta_{3} - 1 & \zeta_{3} & 1 \\
1 & \zeta_{3} & -\zeta_{3} - 1 & 1 \\
3 & 0 & 0 & -1
\end{array}\right)`,
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "MS = MatrixSpace(GF(7), 2)",
            "gens = [MS([[1,0],[-1,1]]), MS([[1,1],[0,1]])]",
            "MG = MatrixGroup(gens)",
            "[MG.order(), len(MG.conjugacy_classes_representatives())]",
          ].join("\n"),
        )
      ).repr,
      "[336, 11]",
    );
    assert.equal(
      (
        await session.evaluate(
          "[Sp(4, GF(7)).order(), Sp(4, GF(7)).random_element()]",
        )
      ).repr,
      "[276595200, [1 0 0 0]\n[0 1 0 0]\n[0 0 1 0]\n[0 0 0 1]]",
    );
  } finally {
    await session.close();
  }
});
