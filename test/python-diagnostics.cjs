// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const esbuild = require("esbuild");

// Test the pure helper directly; neither dist nor a compiler runtime is needed.
const sourcePath = join(__dirname, "../tools/python/diagnostics.ts");
const compiled = esbuild.transformSync(readFileSync(sourcePath, "utf8"), {
  loader: "ts", format: "cjs", target: "es2022",
});
const helper = new Module(sourcePath, module);
helper._compile(compiled.code, sourcePath);
const { normalizePythonDiagnostic: normalize } = helper.exports;

test("parser spans are one-based and parser diagnostics remain untouched", () => {
  const diagnostic = { span: {
    start: { line: 2, column: 3, offset: 8 },
    end: { line: 2, column: 4, offset: 9 },
  } };
  const error = { name: "PythonSyntaxError", message: "bad syntax", diagnostic };
  const actual = normalize(error, { phase: "parse", filename: "cell.py" });
  assert.equal(actual.schemaVersion, 1);
  assert.equal(actual.category, "python.syntax");
  assert.equal(actual.exceptionType, "SyntaxError");
  assert.equal(actual.filename, "cell.py");
  assert.deepEqual(actual.span, diagnostic.span);
  assert.equal(error.diagnostic, diagnostic);
});

test("compiler import columns become one-based without inventing end positions", () => {
  const actual = normalize({ name: "ImportError", message: "missing", filename: "a.py", line: 3, col: 0, pos: 12 }, { phase: "import" });
  assert.equal(actual.category, "python.import");
  assert.deepEqual(actual.span, { start: { line: 3, column: 1, offset: 12 }, end: null });
});

test("compiler subclasses retain their Python type despite inherited Error.name", () => {
  class ImportError extends Error {}
  const actual = normalize(new ImportError("missing"), { phase: "compile" });
  assert.equal(actual.exceptionType, "ImportError");
  assert.equal(actual.category, "python.import");
  assert.equal(normalize("oops", { phase: "host" }).exceptionType, "Error");
});

test("timing prefixes rebase only root-file locations, not imported files", () => {
  const error = { name: "ImportError", message: "missing", filename: "dependency.py", line: 2, col: 3, pos: 8 };
  const actual = normalize(error, { phase: "import", filename: "cell.py", sourceOffset: 6 });
  assert.deepEqual(actual.span, { start: { line: 2, column: 4, offset: 8 }, end: null });
});

test("runtime source frames are not guessed from generated JavaScript stacks", () => {
  const error = new ReferenceError("unknown");
  error.stack = "ReferenceError: unknown\n at generated.js:20:7";
  const host = normalize(error, { phase: "host" });
  assert.equal(host.exceptionType, "ReferenceError");
  assert.equal(host.category, "host.error");
  assert.equal(host.filename, null);
  assert.equal(host.span, null);
  assert.deepEqual(host.frames, []);
  assert.equal("hostStack" in host, false);
  const python = normalize(error, { phase: "execute", pythonExecution: true, includeHostStack: true });
  assert.equal(python.exceptionType, "NameError");
  assert.equal(python.hostStack, error.stack);
});

test("cause/context and suppression survive JSON while cycles are bounded", () => {
  const outer = { name: "ValueError", message: "outer", __suppress_context__: true };
  const inner = { name: "TypeError", message: "inner", __context__: outer };
  outer.__cause__ = inner;
  outer.__context__ = inner;
  const actual = normalize(outer, { phase: "execute", pythonExecution: true, filename: "cell.py" });
  assert.equal(actual.suppressContext, true);
  assert.equal(actual.cause.exceptionType, "TypeError");
  assert.equal(actual.cause.filename, null);
  assert.equal(actual.cause.chainTruncated, true);
  assert.equal(actual.context.exceptionType, "TypeError");
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), actual);
});

test("branching chains have a global budget and hostile thrown values are safe", () => {
  let error = new Error("leaf");
  for (let i = 0; i < 20; i++) error = { message: "node", __cause__: error, __context__: error };
  const actual = normalize(error, { phase: "execute", pythonExecution: true });
  const count = value => value ? 1 + count(value.cause) + count(value.context) : 0;
  assert.ok(count(actual) <= 32);
  const hostile = new Proxy({}, { get() { throw new Error("getter"); } });
  assert.equal(normalize(hostile, { phase: "host" }).message, "Unprintable thrown value");
  assert.equal(normalize(null, { phase: "host" }).message, "null");
});

test("attaching an envelope preserves the parser diagnostic and frozen throws remain transportable", () => {
  const { attachPythonDiagnostic } = helper.exports;
  const diagnostic = { kind: "error" };
  const original = Object.assign(new SyntaxError("bad"), { diagnostic });
  assert.equal(attachPythonDiagnostic(original, { phase: "parse" }), original);
  assert.equal(original.diagnostic, diagnostic);
  assert.equal(original.pythonDiagnostic.category, "python.syntax");
  const frozen = Object.freeze(new TypeError("frozen"));
  const wrapped = attachPythonDiagnostic(frozen, { phase: "execute", pythonExecution: true });
  assert.equal(wrapped.pythonDiagnostic.exceptionType, "TypeError");
  assert.equal(wrapped.pythonDiagnostic.message, "frozen");
});

test("worker serialization ignores forged envelopes and noncloneable Error fields", () => {
  const { serializeDiagnosticError: serialize, attachPythonDiagnostic: attach } = helper.exports;
  const error = Object.assign(new Error("original"), {
    name: () => {}, stack: () => {}, pythonDiagnostic: { impossible: () => {} },
  });
  const diagnostic = serialize(error);
  assert.equal(diagnostic.name, "Error");
  assert.equal(diagnostic.message, "original");
  assert.deepEqual(structuredClone(diagnostic), diagnostic);
  attach(error, { phase: "execute", pythonExecution: true });
  assert.throws(() => { error.pythonDiagnostic.message = () => {}; }, TypeError);
  error.pythonDiagnostic = { forged: () => {} };
  assert.equal(serialize(error).pythonDiagnostic.phase, "execute");
  assert.doesNotThrow(() => structuredClone(serialize(error)));
  const hostile = new Proxy({}, { get() { throw new Error("getter"); } });
  assert.equal(serialize(hostile).message, "Unprintable thrown value");
});
