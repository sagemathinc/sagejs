// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");

test("bound methods expose the canonical class function with live defaults", async t => {
  const session = await createSage({mode: "python"});
  t.after(() => session.close());
  const source = readFileSync(join(__dirname, "fixtures/bound-function-identity.py"), "utf8");
  assert.equal((await session.evaluate(source)).stdout, "bound function identity passed\n");
});
