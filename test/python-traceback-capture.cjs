// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {mkdtempSync, writeFileSync, rmSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");
const {createSage, SageSession} = require("../dist/tools/kernel.js");
const {resolveTracebackCapture} = require("../dist/tools/python/traceback-capture.js");

test("capture selection rejects invalid values and honors explicit native selection", () => {
  assert.equal(resolveTracebackCapture("native"), "native");
  assert.equal(resolveTracebackCapture("guarded"), "guarded");
  for (const value of ["", "auto", true, null, {}]) {
    assert.throws(() => resolveTracebackCapture(value), /tracebackCapture/);
    assert.throws(() => new SageSession({tracebackCapture:value}), /tracebackCapture/);
  }
});

test("CLI capture opt-in preserves source frames and rejects invalid policy", t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-capture-policy-"));
  t.after(() => rmSync(directory, {recursive:true, force:true}));
  const filename = join(directory, "capture.py");
  writeFileSync(filename, "def leaf():\n    raise ValueError('cli capture')\nleaf()\n");
  const run = policy => spawnSync(process.execPath,
    [join(__dirname, "../bin/sagejs-source.cjs"), "--python", filename],
    {encoding:"utf8", timeout:30000, env:{...process.env, SAGEJS_TRACEBACK_CAPTURE:policy}});
  const guarded = run("guarded");
  assert.ifError(guarded.error);
  assert.equal(guarded.status, 1);
  assert.match(guarded.stderr, /leaf/);
  assert.match(guarded.stderr, /capture\.py/);
  assert.match(guarded.stderr, /ValueError: cli capture/);
  assert.doesNotMatch(guarded.stderr, /Native capture|ρσ_guarded_body/);
  const invalid = run("invalid");
  assert.ifError(invalid.error);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /tracebackCapture/);
  assert.doesNotMatch(invalid.stderr, /ValueError: cli capture/);
});

for (const mode of ["python", "sage"]) {
  for (const tracebackCapture of ["native", "guarded"]) {
    test(`${mode} kernel ${tracebackCapture}: caught diagnostics and recovery`, async () => {
      const session = await createSage({mode, tracebackCapture});
      try {
        const result = await session.evaluate(`import sys
import traceback
def leaf():
    raise ValueError('capture probe')
def caught():
    try:
        leaf()
    except ValueError as error:
        print(getattr(error, '__sagejs_logical_exception__', False))
        print([frame.name for frame in traceback.extract_tb(sys.exc_info()[2])])
        if not getattr(error, '__sagejs_logical_exception__', False):
            assert 'leaf' in error.stack
caught()
`);
        assert.match(result.stdout, tracebackCapture === "guarded" ? /^True\n/ : /^False\n/);
        if (tracebackCapture === "guarded") assert.match(result.stdout, /leaf/);
        else assert.equal(result.stdout, "False\n[]\n",
          "the original native policy exposes native capture, not compiler records");
        await assert.rejects(session.evaluate("leaf()\n"), error => {
          assert.equal(error.pythonDiagnostic.exceptionType, "ValueError");
          assert.equal(error.pythonDiagnostic.message, "capture probe");
          if (tracebackCapture === "guarded") {
            assert.ok(error.pythonDiagnostic.frames.length >= 2);
          }
          return true;
        });
        assert.equal((await session.evaluate("print(6 * 7)\n")).stdout, "42\n");
      } finally { await session.close(); }
    });
  }
}
