// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

for (const fixture of ["generic-sparse-mpoly-independent.py", "fq-mpoly-transfer-independent.py"]) {
  test(`independent extension substrate: ${fixture}`, { timeout: 30000 }, () => {
    const result = spawnSync(pythonExecutable(), [join(__dirname, "fixtures", fixture)],
      { encoding: "utf8", timeout: 25000 });
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
    assert.match(result.stdout, /passed/);
  });
}
