// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {spawnSync} = require("node:child_process");
const {join} = require("node:path");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const fixture = join(__dirname, "fixtures/python-super-prepared-binding.py");
for (const mode of ["CPython", "python", "sage"]) {
  for (const capture of mode === "CPython" ? ["native"] : ["native", "guarded"]) {
    test(`${mode}/${capture}: super binds prepared namespace methods`, () => {
      const result = spawnSync(mode === "CPython" ? pythonExecutable() : process.execPath,
        mode === "CPython" ? [fixture] : [join(__dirname,"../bin/sagejs-source.cjs"), `--${mode}`, fixture],
        {encoding:"utf8", timeout:30000, env:{...process.env, SAGEJS_TRACEBACK_CAPTURE:capture}});
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout.replace(/\r\n/g,"\n"), "super-prepared-binding-ok\n");
    });
  }
}
