// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
for (const mode of ["CPython", "python", "sage"]) {
  test(`${mode}: active exception restores across nested handlers and exits`, () => {
    const fixture = join(__dirname, "fixtures/python-exception-state.py");
    const result = mode === "CPython"
      ? spawnSync(pythonExecutable(), [fixture], { encoding: "utf8", timeout: 30000 })
      : spawnSync(process.execPath, [join(__dirname, "../bin/sagejs"), `--${mode}`, fixture],
        { encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.replace(/\r\n/g, "\n"), "exception-state-ok\n");
  });
}
