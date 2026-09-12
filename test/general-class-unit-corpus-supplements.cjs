// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const corpus = join(root, "bench", "class-unit-groups", "general-frontier", "corpus");

for (const filename of ["test_rank_two_supplement.py", "test_stress_supplement.py"]) {
  test(`offline corpus supplement: ${filename}`, () => {
    const result = spawnSync(pythonExecutable(), [join(corpus, filename)], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
