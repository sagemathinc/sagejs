// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("format replacement fields use Python item lookup", async (context) => {
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(
    readFileSync(join(__dirname, "python-format-field-index.py"), "utf8"),
  );
  assert.equal(result.stdout.trim(), "python-format-field-index-ok");
});
