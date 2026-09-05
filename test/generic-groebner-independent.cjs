// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("generic exact Gröbner certificates agree with independent field arithmetic", {
  timeout: 30000,
}, () => {
  const result = spawnSync(pythonExecutable(), [
    path.join(__dirname, "fixtures", "generic-groebner-independent.py"),
  ], { encoding: "utf8", timeout: 25000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, /QQ\/GF\(4\)\/GF\(9\) fixtures passed/);
});

test("generic exact Gröbner results match the pinned SageMath corpus", {
  timeout: 30000,
}, () => {
  const result = spawnSync(pythonExecutable(), [
    path.join(__dirname, "fixtures", "check-extension-fields-sage-oracles.py"),
  ], { encoding: "utf8", timeout: 25000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  assert.match(result.stdout, /108 independently generated SageMath 10.9/);
});
