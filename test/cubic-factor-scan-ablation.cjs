// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("factor-group scans preserve exact mutations and helper-call order", () => {
  const result = cp.spawnSync("python3", ["bench/class-unit-groups/cubic-factor-scan-check.py"], {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 30000, maxBuffer: 2e6,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const record = JSON.parse(result.stdout);
  assert.equal(record.cases, 2500);
  assert.equal(record.invalid_range_cases, 250);
  assert(record.accepted > 0 && record.rejected > 0);
  assert(record.workspace_reads.candidate < record.workspace_reads.baseline);
});
