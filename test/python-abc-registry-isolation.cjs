// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`ABC virtual registries do not leak into derived classes (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/python-abc-registry-isolation.py"), "utf8"));
    assert.equal(result.stdout.trim(), "abc-registry-isolation-ok");
  });
}
