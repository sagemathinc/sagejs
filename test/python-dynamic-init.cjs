// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("class-body initializer fixture passes the CPython oracle", () => {
  const result = spawnSync(pythonExecutable(), [
    "-X", "utf8", join(__dirname, "fixtures", "dynamic-init-class-body.py"),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), "dynamic-init-class-body-ok");
});

// Required in both language modes: binding must not depend on Sage preparsing.
for (const mode of ["python", "sage"]) {
  for (const kind of ["positional", "keywords", "allocation", "class-body"]) {
    test(`assigned initializer ${kind} (${mode})`, async (t) => {
      const session = await createSage({ mode });
      t.after(() => session.close());
      const result = await session.evaluate(readFileSync(
        join(__dirname, "fixtures", `dynamic-init-${kind}.py`), "utf8",
      ));
      assert.equal(result.stdout.trim(), `dynamic-init-${kind}-ok`);
    });
  }
}
