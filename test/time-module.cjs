// sagejs-test-tier: integration
// sagejs-test-smoke: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");

const source = [
  "import time",
  "now = time.time()",
  "print(type(now))",
  "start = time.time()",
  "time.sleep(0.025)",
  "elapsed = time.time() - start",
  "print(type(elapsed))",
  "print(elapsed >= float('0.015'))",
  "try:",
  "    time.sleep(-0.001)",
  "except ValueError as error:",
  "    print(error)",
  "",
].join("\n");

const expected = [
  "<class 'float'>",
  "<class 'float'>",
  "True",
  "sleep length must be non-negative",
].join("\n");

const temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-time-"));
const filename = join(temporaryDirectory, "time_test.py");
writeFileSync(filename, source);
try {
  for (const args of [["--python"], []]) {
    const result = spawnSync(process.execPath, [cli, ...args, filename], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Sage.js time module compatibility passed.");
