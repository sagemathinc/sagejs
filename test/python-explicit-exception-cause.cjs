// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`explicit exception causes preserve identity and evaluation order (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/python-explicit-exception-cause.py"), "utf8",
    ));
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "explicit-exception-cause-ok");
  });
}
