// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("isinstance uses Python lookup, first-class call and argument semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const source = readFileSync(
    join(__dirname, "fixtures", "isinstance-call-identity.py"), "utf8",
  );
  const result = await session.evaluate(
    source + '\nprint("__ISINSTANCE_CALL_IDENTITY_VERIFIED__")\n',
  );
  assert.equal(result.stdout.trim(), "__ISINSTANCE_CALL_IDENTITY_VERIFIED__");
});
