// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("kernel errors transport versioned diagnostics with genuine source provenance", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const filename = "/tmp/διαγνωστικά-試.py";
  await assert.rejects(session.evaluate("x = )", { filename }), error => {
    const diagnostic = error.pythonDiagnostic;
    assert.equal(diagnostic.schemaVersion, 1);
    assert.equal(diagnostic.category, "python.syntax");
    assert.equal(diagnostic.exceptionType, "SyntaxError");
    assert.equal(diagnostic.phase, "parse");
    assert.equal(diagnostic.filename, filename);
    assert.deepEqual(diagnostic.span, {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 6, offset: 5 },
    });
    assert.deepEqual(diagnostic.frames, []);
    assert.equal("hostStack" in diagnostic, false);
    assert.deepEqual(JSON.parse(JSON.stringify(diagnostic)), diagnostic);
    return true;
  });
  // Preserve logical Windows paths on every host; parser offsets/columns are
  // UTF-16 code units, not UTF-8 bytes or CPython's character offsets.
  const windowsFilename = "C:\\teaching\\試.py";
  await assert.rejects(session.evaluate('α = "😀"\nβ = )', { filename: windowsFilename }), error => {
    assert.equal(error.pythonDiagnostic.filename, windowsFilename);
    assert.deepEqual(error.pythonDiagnostic.span, {
      start: { line: 2, column: 1, offset: 9 },
      end: { line: 2, column: 6, offset: 14 },
    });
    return true;
  });
  await assert.rejects(session.evaluate("from sagejs.runtime import native_get", { filename }), error => {
    const diagnostic = error.pythonDiagnostic;
    assert.equal(diagnostic.category, "python.import");
    assert.equal(diagnostic.exceptionType, "ImportError");
    assert.equal(diagnostic.phase, "import");
    assert.equal(diagnostic.filename, filename);
    assert.deepEqual(diagnostic.span, {
      start: { line: 1, column: 1, offset: 0 }, end: null,
    });
    return true;
  });
  await assert.rejects(session.evaluate("undefined_diagnostic_name", { filename }), error => {
    const diagnostic = error.pythonDiagnostic;
    assert.equal(diagnostic.exceptionType, "NameError");
    assert.equal(diagnostic.phase, "execute");
    assert.equal(diagnostic.filename, null);
    assert.equal(diagnostic.span, null);
    assert.deepEqual(diagnostic.frames, []);
    return true;
  });
  assert.equal((await session.evaluate("2 + 3")).repr, "5");
  for (const prefix of ["%time ", "%timeit -n1 -r1 ", "time "]) {
    await assert.rejects(session.evaluate(prefix + "x = )", { filename, language: "sage" }), error => {
      assert.deepEqual(error.pythonDiagnostic.span, {
        start: { line: 1, column: prefix.length + 1, offset: prefix.length },
        end: { line: 1, column: prefix.length + 6, offset: prefix.length + 5 },
      });
      assert.ok(error.pythonDiagnostic.message.startsWith(`${filename}:1:${prefix.length + 1}:`));
      return true;
    });
  }
  await assert.rejects(session.evaluate('%time α = "😀"\nβ = )', { filename }), error => {
    assert.deepEqual(error.pythonDiagnostic.span, {
      start: { line: 2, column: 1, offset: 15 },
      end: { line: 2, column: 6, offset: 20 },
    });
    return true;
  });
});

// The frontend currently drops `raise ... from ...` and does not populate implicit
// context. These tests cover transport of explicitly populated fields only.
test("kernel transports explicitly populated Python exception chain fields", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  await assert.rejects(session.evaluate([
    "inner = ValueError('inner')",
    "outer = TypeError('outer')",
    "outer.__cause__ = inner",
    "outer.__context__ = inner",
    "outer.__suppress_context__ = True",
    "raise outer",
  ].join("\n")), error => {
    const diagnostic = error.pythonDiagnostic;
    assert.equal(diagnostic.exceptionType, "TypeError");
    assert.equal(diagnostic.message, "outer");
    assert.equal(diagnostic.cause.exceptionType, "ValueError");
    assert.equal(diagnostic.cause.message, "inner");
    assert.equal(diagnostic.suppressContext, true);
    return true;
  });
  await assert.rejects(session.evaluate([
    "outer = TypeError('visible')",
    "outer.__cause__ = None",
    "outer.__context__ = ValueError('hidden')",
    "outer.__suppress_context__ = True",
    "raise outer",
  ].join("\n")), error => {
    const diagnostic = error.pythonDiagnostic;
    assert.equal(diagnostic.cause, null);
    assert.equal(diagnostic.context.exceptionType, "ValueError");
    assert.equal(diagnostic.suppressContext, true);
    return true;
  });
});

test("noncloneable exception metadata does not terminate the kernel worker", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  await assert.rejects(session.evaluate([
    "error = ValueError('original')",
    "error.name = lambda: None",
    "error.stack = lambda: None",
    "error.pythonDiagnostic = {'forged': lambda: None}",
    "raise error",
  ].join("\n")), error => {
    assert.equal(error.pythonDiagnostic.exceptionType, "ValueError");
    assert.equal(error.pythonDiagnostic.message, "original");
    assert.deepEqual(structuredClone(error.pythonDiagnostic), error.pythonDiagnostic);
    return true;
  });
  assert.equal((await session.evaluate("6 * 7")).repr, "42");
});
