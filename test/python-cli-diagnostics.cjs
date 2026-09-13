// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { isolatedEnvironment } = require("../scripts/run-python-compat.cjs");

const root = join(__dirname, "..");
function execute(t, source, extraEnvironment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cli-diagnostic-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "case.py");
  writeFileSync(filename, source + "\n");
  const result = spawnSync(process.execPath, [
    join(root, "bin/sagejs-source.cjs"), "--python", filename,
  ], { cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...isolatedEnvironment(directory), ...extraEnvironment } });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("source CLI reports ordinary, empty and multiline exceptions concisely", (t) => {
  for (const [source, stderr] of [
    ["print('before')\nraise ValueError('plain')", "ValueError: plain\n"],
    ["print('before')\nraise ValueError()", "ValueError\n"],
    ["print('before')\nraise ValueError('first', 3)", "ValueError: ('first', 3)\n"],
    ["print('before')\nraise ValueError('first\\nsecond π')", "ValueError: first\nsecond π\n"],
  ]) {
    const result = execute(t, source);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "before\n");
    assert.equal(result.stderr, stderr);
  }
});

test("source CLI renders populated cause/context fields and suppression", (t) => {
  // This slice transports existing chain fields; it does not change raise-from
  // lowering or introduce implicit exception-context tracking.
  const setup = "error = TypeError('outer')\nerror.__context__ = ValueError('inner')\n";
  let result = execute(t, setup + "raise error");
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "ValueError: inner\n\n" +
    "During handling of the above exception, another exception occurred:\n\n" +
    "TypeError: outer\n");
  result = execute(t, setup + "error.__suppress_context__ = True\nraise error");
  assert.equal(result.stderr, "TypeError: outer\n");
  result = execute(t, setup + "error.__cause__ = KeyError('cause')\nraise error");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /direct cause of the following exception/);
  assert.doesNotMatch(result.stderr, /ValueError: inner/);
  assert.ok(result.stderr.endsWith("TypeError: outer\n"));
});

test("source CLI preserves SystemExit status and output", (t) => {
  for (const [argument, status, stderr] of [
    ["", 0, ""], ["None", 0, ""], ["3", 3, ""], ["'goodbye'", 1, "goodbye\n"],
  ]) {
    const result = execute(t, `print('before')\nraise SystemExit(${argument})`);
    assert.equal(result.status, status);
    assert.equal(result.stdout, "before\n");
    assert.equal(result.stderr, stderr);
  }
});

test("source CLI retains parser diagnostics and reports failing imports without host dumps", (t) => {
  const syntax = execute(t, "value = )");
  assert.equal(syntax.status, 1);
  assert.equal(syntax.stdout, "");
  assert.match(syntax.stderr, /SyntaxError/);
  assert.match(syntax.stderr, /case\.py:1:/);
  assert.doesNotMatch(syntax.stderr, /Host stack|UnhandledPromiseRejection|<ref \*/);
  const imported = execute(t, "import __sagejs_missing_cli_diagnostic_module__");
  assert.equal(imported.status, 1);
  assert.match(imported.stderr, /(?:ImportError|ModuleNotFoundError):/);
  assert.doesNotMatch(imported.stderr, /Sage\.js host error|Host stack|<ref \*/);
});

test("source CLI ignores forged and nonprintable public error metadata", (t) => {
  const result = execute(t, [
    "error = ValueError('original')",
    "error.pythonDiagnostic = {'exceptionType': 'Forged', 'message': 'forged'}",
    "error.name = lambda: None",
    "error.stack = lambda: None",
    "raise error",
  ].join("\n"));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "ValueError: original\n");
});

test("source CLI exposes raw host stack only through the developer opt-in", (t) => {
  const result = execute(t, "raise ValueError('debug')", { SAGEJS_DIAGNOSTIC_HOST_STACK: "1" });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.startsWith("ValueError: debug\n"));
  assert.match(result.stderr, /Host stack \(developer diagnostics\):/);
});
