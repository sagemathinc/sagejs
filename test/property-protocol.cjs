// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`property identity, accessors, and descriptor fallback (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/property-protocol.py"), "utf8",
    ));
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "property-protocol-ok");
  });
}
