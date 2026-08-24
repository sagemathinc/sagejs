// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("integral Python floats coerce like non-integral floats in Sage mode", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  const result = await session.evaluate([
    "import math",
    "values = [",
    "    10.0 * math.cos(0.0),",
    "    10.0 * float(1),",
    "    float(1) * 10.0,",
    "    1.0 - math.cos(0.0),",
    "    10.0 * math.sqrt(4.0),",
    "    10.0 / float(2),",
    "    float(2) / 10.0,",
    "    float(-0.0) + 1.0,",
    "]",
    "print(*(repr(value) for value in values), sep='\\n')",
    "print([parent(value) is RR for value in values])",
    "print(parent(float(1)) is RDF, float(1) in QQ, float(-0.0) in QQ)",
  ].join("\n"));

  assert.equal(
    result.stdout.trim(),
    [
      "10.0000000000000",
      "10.0000000000000",
      "10.0000000000000",
      "0.000000000000000",
      "20.0000000000000",
      "5.00000000000000",
      "0.200000000000000",
      "1.00000000000000",
      "[True, True, True, True, True, True, True, True]",
      "True True True",
    ].join("\n"),
  );
});
