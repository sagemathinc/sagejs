"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Python mode: `/` on two integers is true division and must produce the same
// double CPython produces.  Sage mode is deliberately different -- there `/`
// on integers is exact and yields a rational -- so these cases are Python mode
// only.
const CASES = [
  ["9 * (10**16 - 1) / 9", "1e+16"],
  ["89999999999999991 / 9", "1e+16"],
  ["(2**53 + 1) / 1", "9007199254740992.0"],
  ["(2**54 + 3) / 3", "6004799503160662.0"],
  ["(2**60 + 1) / 3", "3.843071682022823e+17"],
  ["10**20 / 7", "1.4285714285714287e+19"],
  ["123456789012345678901234567890 / 987654321", "1.249999988734375e+20"],
  ["2**53 / (2**53 - 1)", "1.0000000000000002"],
  ["-9 * (10**16 - 1) / 9", "-1e+16"],
  ["9 * (10**16 - 1) / -9", "-1e+16"],
  ["0 / 5", "0.0"],
  ["1 / 3", "0.3333333333333333"],
  ["(10**30) / (10**10)", "1e+20"],
];

test("exact integer division is correctly rounded", async () => {
  const session = await createSage({ mode: "python" });
  try {
    for (const [source, expected] of CASES) {
      const observed = (await session.evaluate(source)).repr;
      assert.equal(
        Number(observed),
        Number(expected),
        `${source} gave ${observed}, expected ${expected}`,
      );
    }
    // The quotient is exactly representable only when the true value is; the
    // point of the round trip is that converting the operands first would land
    // an ulp low here.
    assert.equal(
      (await session.evaluate("9 * (10**16 - 1) / 9 == 1e16")).repr,
      "True",
    );
    assert.equal(
      (await session.evaluate("(9 * (10**16 - 1) / 9) - 1e16")).repr,
      "0.0",
    );
  } finally {
    await session.close();
  }
});

test("sage mode keeps exact rational division", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (await session.evaluate("9 * (10**16 - 1) / 9")).repr,
      "9999999999999999",
    );
    assert.equal((await session.evaluate("parent(1 / 3)")).repr, "Rational Field");
  } finally {
    await session.close();
  }
});
