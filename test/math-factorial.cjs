// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

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
    // The mature FLINT backend keeps larger inputs practical without retaining
    // every intermediate factorial in the lifetime of the module.
    assert.equal((await session.evaluate("len(str(factorial(600)))")).repr, "1409");
    assert.equal((await session.evaluate("len(str(factorial(10000)))")).repr, "35660");
    assert.equal((await session.evaluate("factorial(5)")).repr, "120");
    assert.equal(
      (await session.evaluate("[factorial(k) for k in range(8)]")).repr,
      "[1, 1, 2, 6, 24, 120, 720, 5040]",
    );
    // CPython accepts the integer protocol, rejects floats by type, and
    // rejects negative integers by value.
    assert.equal(
      (
        await session.evaluate(
          [
            "class Indexed:",
            "    def __index__(self):",
            "        return 6",
            "def rejected(value):",
            "    try:",
            "        factorial(value)",
            "    except Exception as error:",
            "        return type(error).__name__",
            "    return 'accepted'",
            "[factorial(Indexed()), rejected(2.5), rejected(-1)]",
          ].join("\n"),
        )
      ).repr,
      "[720, 'TypeError', 'ValueError']",
    );
  } finally {
    await session.close();
  }
});
