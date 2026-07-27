"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  assert.equal(
    result.status,
    0,
    `command failed: sagejs ${args.join(" ")}\n${result.stderr}`
  );
  return result.stdout;
}

assert.match(run(["--version"]), /^sagejs 0\.1\.0\s*$/);
assert.match(run([], "print(2^3)\nprint(sum([1..10]))\n"), /8\s+55\s*$/);
assert.match(run(["--python"], "print(2^3)\nprint(2**3)\n"), /1\s+8\s*$/);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-test-"));
try {
  const sageFile = join(temporary, "example.sage");
  const pythonFile = join(temporary, "example.py");
  writeFileSync(sageFile, "print(2^5)\n", "utf8");
  writeFileSync(pythonFile, "print(2^5)\n", "utf8");
  assert.match(run([sageFile]), /^32\s*$/);
  assert.match(run(["--python", pythonFile]), /^7\s*$/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Sage and Python CLI modes passed.");
