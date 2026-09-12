// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("the actual bounded cubic driver resumes only on explicit insufficiency", () => {
  const root = resolve(__dirname, "..");
  const result = spawnSync(pythonExecutable(), [
    resolve(__dirname, "fixtures/cubic-staged-driver.py"),
    resolve(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"),
  ], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, String(result.error || "") + result.stdout + result.stderr);
  assert.match(result.stdout, /actual-root scheduler scenarios pass/);
});
