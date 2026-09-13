// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {spawnSync} = require("node:child_process");
const {join} = require("node:path");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const fixture = join(__dirname, "fixtures/callable-type-slots.py");

test("type-level callable fixture passes CPython", () => {
  const result = spawnSync(pythonExecutable(), ["-X", "utf8", fixture], {
    encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "callable-type-slots-ok\n");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: implicit calls ignore instance call shadows`, async (t) => {
    const session = await createSage({mode});
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", text => { stderr += text; });
    const result = await session.evaluate(readFileSync(fixture, "utf8"));
    assert.equal(result.stdout, "callable-type-slots-ok\n");
    assert.equal(stderr, "");
  });
}
