// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const source = readFileSync(
  join(__dirname, "fixtures", "python-method-kind-overrides.py"), "utf8",
);

test("method-kind overrides match CPython", async (t) => {
  const oracle = spawnSync(pythonExecutable(), ["-X", "utf8", "-c", source], {
    encoding: "utf8",
  });
  assert.ifError(oracle.error);
  assert.equal(oracle.status, 0, oracle.stderr);
  for (const mode of ["python", "sage"]) {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(source);
    assert.equal(result.stdout, "");
  }
});
