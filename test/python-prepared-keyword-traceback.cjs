// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const fixture = join(__dirname, "fixtures/prepared-keyword-traceback.py");

for (const mode of ["CPython", "python", "sage"]) {
  test(`${mode}: CLI keyword stack capture ${mode === "sage" ? "retains raw callers without trampolines" : "retains original callers"}`, () => {
    const options = { encoding: "utf8", timeout: 30000,
      env: { ...process.env, SAGEJS_RAW_STACK_ORACLE: mode === "sage" ? "1" : "0" } };
    const result = mode === "CPython"
      ? spawnSync(pythonExecutable(), [fixture], options)
      : spawnSync(process.execPath, [join(__dirname, "../bin/sagejs"), `--${mode}`, fixture], options);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.replace(/\r\n/g, "\n"), "prepared-keyword-traceback-ok\n");
  });
}
