// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("offline cap-rescue reconciliation rejects mismatched attempts", () => {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python,
    ["-m", "unittest", "discover", "-s", __dirname, "-p", "test_*.py"],
    { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});
