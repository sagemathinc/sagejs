// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const {createSage} = require("../dist/tools/kernel.js");

const fixture = readFileSync(
  join(__dirname, "fixtures/python-getattribute-protocol.py"), "utf8",
);
const report = "\nimport json\nprint(json.dumps(observations))\n";

test("public and default attribute lookup agree with CPython", async context => {
  const python = spawnSync(pythonExecutable(), ["-c", fixture + report], {
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(python.status, 0, python.stderr || String(python.error));
  const expected = JSON.parse(python.stdout);
  assert.equal(expected.length, 14);

  for (const mode of ["python", "sage"]) {
    const session = await createSage({mode});
    context.after(() => session.close());
    const result = await session.evaluate(fixture + report);
    assert.equal(result.stderr ?? "", "");
    assert.deepEqual(JSON.parse(result.stdout), expected, mode);
  }
});
