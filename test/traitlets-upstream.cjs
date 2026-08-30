// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function runFixture(name) {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "bin", "sagejs-source.cjs"),
      join(root, "test", "fixtures", name),
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "");
}

test("Python metaclass machinery supports the traitlets requirements", () => {
  runFixture("metaclass-runtime.py");
});

test("pinned upstream traitlets imports through the production loader", () => {
  runFixture("traitlets-upstream-smoke.py");
});
