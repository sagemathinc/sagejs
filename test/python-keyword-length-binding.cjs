// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = join(__dirname, "fixtures/keyword-length-binding.py");
const source = readFileSync(fixture, "utf8");

test("keyword packet sizing has a CPython oracle", () => {
  const result = spawnSync(pythonExecutable(), [fixture], { encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "keyword-length-binding-ok\n");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: keyword packet sizing preserves binding semantics`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", (text) => { stderr += text; });
    const result = await session.evaluate(source);
    assert.equal(result.stdout, "keyword-length-binding-ok\n");
    assert.equal(stderr, "");
  });
}
