// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate([
      "import math",
      "for value, sign in [(0.0, 1.0), (-0.0, -1.0), (2.0, 1.0), (-2.0, -1.0), (math.inf, 1.0), (-math.inf, -1.0), (math.nan, 1.0), (-math.nan, -1.0)]:",
      "    assert math.copysign(3.0, value) == 3.0 * sign",
      "    assert math.copysign(-3.0, value) == 3.0 * sign",
      "    assert math.copysign(1.0, math.copysign(0.0, value)) == sign",
      "large = 10**10000",
      "print(large.bit_length())",
      "print(abs(math.log(large, 10) - 10000) < 1e-10)",
      "print(math.isinf(math.inf), math.inf > 0)",
      "print(math.isnan(math.nan))",
      "print(math.tau == 2 * math.pi)",
      "try:",
      "    math.log(0)",
      "except ValueError as error:",
      "    print(error)",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "33220",
      "True",
      "True True",
      "True",
      "True",
      "math domain error",
    ].join("\n"));
  } finally {
    await session.close();
  }
  console.log("Sage.js math large-integer compatibility passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
