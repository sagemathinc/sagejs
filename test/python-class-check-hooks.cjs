// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const { copyFileSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { test } = require("node:test");
const { executeAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { executionBytes } = require("../tools/python-compat/evidence.cjs");
const { isolatedEnvironment } = require("../scripts/run-python-compat.cjs");

test("class check hooks follow the CPython special-method protocol", async () => {
  const root = join(__dirname, "..");
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-class-check-hooks-"));
  try {
    const input = join(scratch, "class_check_hooks.py");
    copyFileSync(join(__dirname, "fixtures/python-class-check-hooks.py"), input);
    const result = await executeAssertion(process.execPath,
      ["--max-old-space-size=512", join(root, "bin/sagejs-source.cjs"), "--python", input], {
        cwd: scratch, env: { ...isolatedEnvironment(scratch), NODE_PATH: join(root, "node_modules") },
        timeoutMs: 30000, maxOutputBytes: 1048576,
      });
    assert.equal(result.error, null, JSON.stringify(result.error));
    assert.equal(result.timedOut, false);
    assert.equal(result.outputLimited, false);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(executionBytes(result, "stdout").length, 0, result.stdout);
    assert.equal(executionBytes(result, "stderr").length, 0, result.stderr);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
