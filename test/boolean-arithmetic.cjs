// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Python's `bool` is a subclass of `int`, so it takes part in arithmetic and in
// sequence repetition.  Multiplication used to reject it outright while every
// other operator accepted it, which broke the common `n * (a == b)` idiom.
const CASES = [
  ["True * 2", "2"],
  ["2 * True", "2"],
  ["True * True", "1"],
  ["False * 5", "0"],
  ["(3 == 3) * 5", "5"],
  ["(3 == 4) * 5", "0"],
  ["True * 2.0", "2.0"],
  ["2.0 * False", "0.0"],
  ["True * [1, 2]", "[1, 2]"],
  ["False * 'ab'", "''"],
  ["True * 'ab'", "'ab'"],
  ["sum([(i == 2) * i for i in range(5)])", "2"],
  // The operators that already worked must keep working.
  ["True + 1", "2"],
  ["True - False", "1"],
  ["True / 2", "0.5"],
  ["2 ** True", "2"],
  ["-True", "-1"],
  // Ordinary repetition is unaffected.
  ["'ab' * 3", "'ababab'"],
  ["[1, 2] * 2", "[1, 2, 1, 2]"],
  ["(1, 2) * 2", "(1, 2, 1, 2)"],
];

test("booleans behave as integers in arithmetic", async () => {
  const session = await createSage({ mode: "python" });
  try {
    for (const [source, expected] of CASES) {
      assert.equal((await session.evaluate(source)).repr, expected, source);
    }
  } finally {
    await session.close();
  }
});

test("booleans behave as integers in Sage mode too", async () => {
  const session = await createSage();
  try {
    assert.equal((await session.evaluate("2 * True")).repr, "2");
    assert.equal((await session.evaluate("(3 == 3) * 5")).repr, "5");
  } finally {
    await session.close();
  }
});
