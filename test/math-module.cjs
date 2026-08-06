"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate([
      "import math",
      "large = 10**10000",
      "print(large.bit_length())",
      "print(abs(math.log(large, 10) - 10000) < 1e-10)",
      "try:",
      "    math.log(0)",
      "except ValueError as error:",
      "    print(error)",
    ].join("\n"));
    assert.equal(result.stdout.trim(), [
      "33220",
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
