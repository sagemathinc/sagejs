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
