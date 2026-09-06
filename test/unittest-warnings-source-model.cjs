// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixture = join(__dirname, "fixtures/unittest-warnings-runtime.py");
const expected = "unittest-warnings-ok\n";

function python(args) {
  const result = spawnSync(pythonExecutable(), ["-B", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, expected);
}

test("warning assertion fixture agrees with CPython unittest", () => {
  python([fixture]);
});

for (const mode of ["native-warnings", "source-warnings"]) {
  test(`ordinary unittest source preserves warning assertions (${mode})`, () => {
    python([
      join(__dirname, "fixtures/unittest-warnings-source-model.py"),
      join(root, "src/lib/unittest/__init__.py"),
      join(root, "src/lib/warnings.py"),
      fixture,
      mode,
    ]);
  });
}
