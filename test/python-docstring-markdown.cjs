// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");
const helper = join(root, "scripts", "python-docstring-markdown.py");

function run(mode, filename) {
  return spawnSync(pythonExecutable(), [helper, mode], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify([filename]),
  });
}

test("Python docstring normalization changes reST literals only", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-docstring-markdown-"));
  const filename = join(directory, "fixture.py");
  const source = [
    '"""Use ``value``.',
    "",
    "```python",
    "print(`value`)",
    "```",
    '"""',
    "",
    '# A comment may discuss the literal token `` without being a docstring.',
    'ordinary = "``not a docstring``"',
    "",
    "def example():",
    '    """Return ``value``."""',
    "    return ordinary",
    "",
  ].join("\n");
  writeFileSync(filename, source);

  try {
    const initial = run("--check", filename);
    assert.equal(initial.status, 1);
    assert.match(initial.stderr, /reStructuredText doubled backticks/);

    const fixed = run("--fix", filename);
    assert.equal(fixed.status, 0, fixed.stderr);
    const normalized = readFileSync(filename, "utf8");
    assert.match(normalized, /"""Use `value`\./);
    assert.match(normalized, /```python/);
    assert.match(normalized, /Return `value`\./);
    assert.match(normalized, /ordinary = "``not a docstring``"/);
    assert.match(normalized, /literal token `` without/);

    const final = run("--check", filename);
    assert.equal(final.status, 0, final.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
