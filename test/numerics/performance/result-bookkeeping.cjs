// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { closeSession, pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const root = path.resolve(__dirname, "../../..");
const source = readFileSync(path.join(__dirname, "result-bookkeeping.py"), "utf8");

test("result binding avoids redundant snapshots while preserving CPython guards", () => {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", pythonPrefix(root) + source], {
    cwd: root, encoding: "utf8", timeout: 180000,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "result bookkeeping passed");
});

test("the same result binding witnesses hold in dynamic Sage.js", async () => {
  const { createSage } = require(path.join(root, "dist/tools/kernel.js"));
  const previous = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  let sage;
  try {
    sage = await createSage({ mode: "python" });
    const result = await sage.evaluate(source, { language: "python", timeout: 180000 });
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    assert.equal(result.stdout.trim(), "result bookkeeping passed");
  } finally {
    if (sage) await closeSession(sage);
    if (previous === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previous;
  }
});
