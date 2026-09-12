// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("frontend call shapes preserve Python lookup and module binding", async (context) => {
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  // The class-body global rebind must invalidate this real intrinsic import.
  const result = await session.evaluate(
    "import sagejs.runtime as runtime\n" +
      readFileSync(join(__dirname, "python-frontend-call-contracts.py"), "utf8"),
  );
  assert.equal(result.stdout.trim(), "python-frontend-call-contracts-ok");
});
