// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`deleted module bindings retain builtin fallback in nested readers (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const source = readFileSync(join(__dirname, "fixtures/python-module-delete-fallback.py"), "utf8");
    const result = await session.evaluate(source + '\nprint("module-delete-ok")\n');
    assert.equal(result.stdout.trim(), "module-delete-ok");
  });
}
