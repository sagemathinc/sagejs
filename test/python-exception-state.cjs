// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
for (const mode of ["CPython", "python", "sage"]) {
  test(`${mode}: active exception restores across nested handlers and exits`, () => {
    const fixture = join(__dirname, "fixtures/python-exception-state.py");
    const result = mode === "CPython"
      ? spawnSync(pythonExecutable(), [fixture], { encoding: "utf8", timeout: 30000 })
      : spawnSync(process.execPath, [join(__dirname, "../bin/sagejs"), `--${mode}`, fixture],
        { encoding: "utf8", timeout: 30000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    if (mode === "CPython" && result.stderr) {
      // CPython 3.14 warns about these legal cleanup exits. Check the exact
      // expected diagnostics rather than hiding unrelated oracle stderr.
      const lines = result.stderr.trim().split(/\r?\n/);
      assert.equal(lines.length, 6);
      for (const [index, keyword] of ["return", "continue", "break"].entries()) {
        assert.ok(lines[index * 2].startsWith(fixture + ":"));
        assert.ok(lines[index * 2].endsWith(`SyntaxWarning: '${keyword}' in a 'finally' block`));
        assert.equal(lines[index * 2 + 1].trim(), keyword === "return" ? "return 42" : keyword);
      }
    } else assert.equal(result.stderr, "");
    assert.equal(result.stdout.replace(/\r\n/g, "\n"), "exception-state-ok\n");
  });
}
