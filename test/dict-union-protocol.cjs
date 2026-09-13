// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {createSage} = require("../dist/tools/kernel.js");
for (const mode of ["python", "sage"]) {
  test(`dictionary union and update protocols (${mode})`, async context => {
    const session = await createSage({mode});
    context.after(() => session.close());
    const result = await session.evaluate(readFileSync(join(__dirname, "fixtures/dict-union-protocol.py"), "utf8"));
    assert.equal(result.stdout.trim(), "dict-union-protocol-ok");
    assert.equal(result.stderr ?? "", "");
  });
}
