// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// `math.factorial` answers from a cached prefix of the sequence, so these check
// both the cached range and arguments beyond it, where the product is carried
// forward without being stored.
test("math.factorial matches CPython", async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate("from math import factorial");
    assert.equal(
      (await session.evaluate("[factorial(k) for k in range(8)]")).repr,
      "[1, 1, 2, 6, 24, 120, 720, 5040]",
    );
    // Past 2**53 the product has to stay exact.
    assert.equal(
      (await session.evaluate("factorial(20)")).repr,
      "2432902008176640000",
    );
    assert.equal(
      (await session.evaluate("factorial(25)")).repr,
      "15511210043330985984000000",
    );
    assert.equal((await session.evaluate("len(str(factorial(100)))")).repr, "158");
    // Beyond the cached prefix the product is carried forward, so a large
    // argument and a repeat of a small one must both stay correct.
    assert.equal((await session.evaluate("len(str(factorial(600)))")).repr, "1409");
    assert.equal((await session.evaluate("factorial(5)")).repr, "120");
    assert.equal(
      (await session.evaluate("[factorial(k) for k in range(8)]")).repr,
      "[1, 1, 2, 6, 24, 120, 720, 5040]",
    );
    // A non-integral argument is still rejected.
    assert.equal(
      (
        await session.evaluate(
          [
            "def rejected():",
            "    try:",
            "        factorial(2.5)",
            "    except ValueError:",
            "        return 'ValueError'",
            "    return 'accepted'",
            "rejected()",
          ].join("\n"),
        )
      ).repr,
      "'ValueError'",
    );
  } finally {
    await session.close();
  }
});
