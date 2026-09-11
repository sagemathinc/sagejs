// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("prepared mappings see source-order class namespace operations", async (context) => {
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(
    readFileSync(join(__dirname, "python-prepared-namespace.py"), "utf8"),
  );
  assert.equal(result.stdout.trim(), "python-prepared-namespace-ok");
});
