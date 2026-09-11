// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`method reads preserve mutation, namespace and saved-reference semantics (${mode})`, async (context) => {
    const session = await createSage({ mode });
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/method-binding-mutations.py"), "utf8",
    ));
    assert.equal(result.stdout.trim(), "method-binding-oracle-ok");
    assert.equal(result.stderr ?? "", "");
  });
}
