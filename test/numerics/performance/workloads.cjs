// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { CASES, LEVELS, pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");

test("every warm workload has a reproducible independently checked CPython witness", () => {
  const root = path.resolve(__dirname, "../../..");
  const source = readFileSync(path.join(root, "bench/numerics/performance/workloads.py"), "utf8");
  const check = `
for name in ${JSON.stringify(CASES)}:
    for level in ${JSON.stringify(LEVELS)}:
        record = measure(name, level, 0, 1)
        assert record["observation"]["success"]
        assert len(record["durations_ms"]) == 1
        assert record["median_ms"] >= 0
print("witnesses passed")
`;
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", pythonPrefix(root) + source + check], {
    cwd: root, encoding: "utf8", timeout: 180000,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "witnesses passed");
});
