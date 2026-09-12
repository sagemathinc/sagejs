// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("format shares Python type-slot semantics with string formatting", async (context) => {
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const source = readFileSync(join(__dirname, "python-format-builtin.py"), "utf8");
  const result = await session.evaluate(source);
  assert.equal(result.stdout.trim(), "python-format-builtin-ok");
});
