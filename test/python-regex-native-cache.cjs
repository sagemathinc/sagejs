// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

test("reused native regex resets lastIndex and honors live pattern changes", () => {
  const root = join(__dirname, "..");
  const result = spawnSync(process.execPath,
    [join(root, "bin/sagejs-source.cjs"), "--python", join(__dirname, "fixtures/re-native-cache.py")],
    { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout.trim(), "native regex reuse passed");
});
