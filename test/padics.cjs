// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("capped-relative p-adics expand exact rationals", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (await session.evaluate("K = Qp(11)\nK")).repr,
      "11-adic Field with capped relative precision 20",
    );
    assert.equal(
      (await session.evaluate("K(211/17)")).repr,
      [
        "4 + 4*11 + 11^2 + 7*11^3 + 9*11^5 + 5*11^6 + 4*11^7 + 8*11^8 + 7*11^9",
        "  + 9*11^10 + 3*11^11 + 10*11^12 + 11^13 + 5*11^14 + 6*11^15 + 2*11^16",
        "  + 3*11^17 + 11^18 + 7*11^19 + O(11^20)",
      ].join("\n"),
    );
    assert.equal(
      (await session.evaluate("K(3211/11^2)")).repr,
      "10*11^-2 + 5*11^-1 + 4 + 2*11 + O(11^18)",
    );
    assert.equal(
      (
        await session.evaluate(
          "[Zp(5), Qp(5)(1/3) + Qp(5)(2/3) == Qp(5)(1), " +
            "Qp(5)(25/3).valuation()]",
        )
      ).repr,
      "[5-adic Ring with capped relative precision 20, True, 2]",
    );
    await assert.rejects(
      session.evaluate("Zp(5)(1/5)"),
      /negative valuation/,
    );
  } finally {
    await session.close();
  }
});
