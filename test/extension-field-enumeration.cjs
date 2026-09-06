// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { join } = require("node:path");
const test = require("node:test");

test("finite extensions enumerate canonical coordinates with any defining generator", { timeout: 60_000 }, async () => {
  const root = join(__dirname, "..");
  try {
    await promisify(execFile)(process.execPath, [
      join(root, "bin", "sagejs"), join(__dirname, "extension-field-enumeration.py"),
    ], { cwd: root, timeout: 55_000, env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" } });
  } catch (error) {
    assert.fail(`${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error}`);
  }
});
