// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const program = join(__dirname, "fixtures/re-group-fast.py");
const oracle = spawnSync(pythonExecutable(), ["-B", program], {
  cwd: root, encoding: "utf8", timeout: 30_000,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});
assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
assert.ok(!oracle.stdout.includes("unexpected value"), oracle.stdout);

const subject = spawnSync(process.execPath,
  [join(root, "bin/sagejs-source.cjs"), "--python", program], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
assert.equal(subject.status, 0, subject.stderr || String(subject.error));
assert.equal(subject.stdout.replace(/\r\n/g, "\n"), oracle.stdout.replace(/\r\n/g, "\n"));
