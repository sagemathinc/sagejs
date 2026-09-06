// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const esbuild = require("esbuild");
const { runInNewContext } = require("node:vm");

// Pure source helper: no dist/compiler/runtime required.
const filename = join(__dirname, "../tools/python/diagnostics.ts");
const helper = new Module(filename, module);
helper._compile(esbuild.transformSync(readFileSync(filename, "utf8"), {
  loader: "ts", format: "cjs", target: "es2022",
}).code, filename);
const { attachPythonDiagnostic: attach, renderCliDiagnostic: render,
  serializeDiagnosticError: serialize } = helper.exports;
const python = error => attach(error, {
  phase: "execute", pythonExecution: true, filename: "actual-entry.py",
});

test("CLI renderer preserves empty, multiline and complex messages without host internals", () => {
  for (const message of ["", "line one\nline two π", "('first', 3)"]) {
    const error = python(Object.assign(new Error(message), { name: "ValueError" }));
    assert.equal(render(error), `ValueError${message ? ": " + message : ""}\n`);
    const diagnostic = serialize(error).pythonDiagnostic;
    assert.equal(diagnostic.phase, "execute");
    assert.equal(diagnostic.filename, "actual-entry.py");
    assert.deepEqual(diagnostic.frames, []);
    assert.equal(diagnostic.span, null);
  }
});

test("CLI renderer prefers explicit cause and honors suppressed context", () => {
  const cause = Object.assign(new Error("cause"), { name: "ValueError" });
  const context = Object.assign(new Error("context"), { name: "KeyError" });
  const error = Object.assign(new Error("outer"), {
    name: "TypeError", __cause__: cause, __context__: context,
    __suppress_context__: true,
  });
  assert.equal(render(python(error)), "ValueError: cause\n\n" +
    "The above exception was the direct cause of the following exception:\n\n" +
    "TypeError: outer\n");
  error.__cause__ = null;
  assert.equal(render(python(error)), "TypeError: outer\n");
  error.__suppress_context__ = false;
  assert.equal(render(python(error)), "KeyError: context\n\n" +
    "During handling of the above exception, another exception occurred:\n\n" +
    "TypeError: outer\n");
});

test("CLI renderer ignores public forged envelopes before and after attachment", () => {
  const error = Object.assign(new Error("original"), {
    pythonDiagnostic: { exceptionType: "Forged", message: "forged", phase: "execute" },
  });
  assert.equal(render(error), "Sage.js host error: Error: original\n");
  python(error);
  error.pythonDiagnostic = { exceptionType: "Forged", message: "forged" };
  assert.equal(render(error), "Error: original\n");
  assert.equal(render({ name: "PythonSyntaxError", message: "not a parser boundary" }),
    "Sage.js host error: SyntaxError: not a parser boundary\n");
});

test("host names remain host-classified until an actual execution attachment", () => {
  const error = new ReferenceError("missing");
  assert.equal(render(error), "Sage.js host error: ReferenceError: missing\n");
  assert.equal(render(python(error)), "NameError: missing\n");
});

test("parser attachment retains genuine parser message/span without synthesizing frames", () => {
  const error = Object.assign(new SyntaxError("source.py:2:3: unexpected token"), {
    name: "PythonSyntaxError", filename: "source.py", diagnostic: { span: {
      start: { line: 2, column: 3, offset: 5 }, end: null,
    } },
  });
  assert.equal(render(attach(error, { phase: "parse" })),
    "SyntaxError: source.py:2:3: unexpected token\n");
  assert.deepEqual(serialize(error).pythonDiagnostic.frames, []);
});

test("hostile, frozen and cyclic errors remain printable", () => {
  const hostile = new Proxy({}, { get() { throw new Error("hostile getter"); } });
  assert.equal(render(hostile), "Sage.js host error: Error: Unprintable thrown value\n");
  assert.equal(render(python(hostile)), "Error: Unprintable thrown value\n");
  assert.equal(render(python(Object.freeze(new TypeError("frozen")))), "TypeError: frozen\n");
  const cyclic = new Error("cycle");
  cyclic.__cause__ = cyclic;
  assert.equal(render(python(cyclic)), "Error: cycle\n");
});

test("host stacks are read only when developer diagnostics are explicitly requested", () => {
  let reads = 0;
  const error = new Error("short");
  Object.defineProperty(error, "stack", { get() { reads++; return "private host stack"; } });
  python(error);
  assert.equal(render(error), "Error: short\n");
  assert.equal(reads, 0);
  assert.equal(render(error, { includeHostStack: true }),
    "Error: short\n\nHost stack (developer diagnostics):\nprivate host stack\n");
  assert.equal(reads, 1);
});

for (const entry of ["bin/sagejs-source.cjs", "tools/sea-entry.ts"]) {
  test(`${entry} catches compile promise rejection through the shared renderer`, async () => {
    const error = python(Object.assign(new Error("boundary failure"), { name: "ValueError" }));
    const filename = join(__dirname, "..", entry);
    let stderr = "";
    let calls = 0;
    const fakeProcess = {
      argv: ["node", "sagepython", "--python", "file.py"], env: {},
      stdout: { write() {} }, stderr: { write(text) { stderr += text; } },
      cwd: () => "/source-fixture", exitCode: undefined,
    };
    const compile = { __esModule: true, default: async () => { calls++; throw error; } };
    const fakeRequire = name => {
      if (name === "path" || name.startsWith("node:") && name !== "node:sea") return require(name);
      if (name.endsWith("/cli")) return { argv: { mode: "compile", files: ["file.py"], python: true } };
      if (name.endsWith("/compile")) return compile;
      if (name.endsWith("/python/diagnostics")) return helper.exports;
      if (name === "./process-output") return { installCliOutputHandler() {} };
      if (name === "./utils") return { importPath: "/lib", libraryPath: "/compiler" };
      if (name === "node:sea") return { isSea: () => false };
      return {};
    };
    const source = readFileSync(filename, "utf8");
    const code = entry.endsWith(".ts")
      ? esbuild.transformSync(source, { loader: "ts", format: "cjs", target: "es2022" }).code
      : source;
    runInNewContext(code, {
      require: fakeRequire, process: fakeProcess, module: { filename, exports: {} },
      exports: {}, __filename: filename, __dirname: dirname(filename),
      console: { error: text => { stderr += String(text) + "\n"; }, log() {} },
    }, { filename });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(fakeProcess.exitCode, 1);
    assert.equal(stderr, "ValueError: boundary failure\n");
  });
}

test("compile attaches Python provenance only after generated-script construction succeeds", async () => {
  // Exercise orchestration with inert compiler/frontend/VM doubles. This runs
  // neither a Sage compiler nor generated Python, and needs no dist artifacts.
  const filename = join(__dirname, "../tools/compile.ts");
  const code = esbuild.transformSync(readFileSync(filename, "utf8"), {
    loader: "ts", format: "cjs", target: "es2022",
  }).code;
  for (const phase of ["parse", "generate", "script", "execute"]) {
    const error = new Error(`${phase} failure`);
    const compiler = {
      SyntaxError: class LegacySyntaxError extends Error {}, DefaultsError: class DefaultsError extends Error {},
      OutputStream: class { get() { return "inert generated source"; } },
    };
    const fakeRequire = name => {
      if (name === "path" || name === "fs") return require(name);
      if (name === "fs/promises") return { readFile: async () => "inert Python source" };
      if (name === "vm") return { Script: class {
        constructor() { if (phase === "script") throw error; }
        runInThisContext() { throw error; }
      } };
      if (name === "./utils") return { getImportDirs: () => [] };
      if (name === "./compiler") return { __esModule: true, default: () => compiler };
      if (name === "./resources") return { standardLibraryCacheDirectory: value => value };
      if (name === "./foreign") return { selectedForeignLanguage: () => undefined };
      if (name === "./host") return { installNodeHost: () => () => {} };
      if (name === "./graphics-export") return { installNodeGraphicsSaveHook() {} };
      if (name === "./python/diagnostics") return helper.exports;
      if (name === "./python/compiler-frontend") return { createPythonCompilerFrontend: async () => ({
        parse() {
          if (phase === "parse") throw error;
          return { print() { if (phase === "generate") throw error; } };
        }, close() {},
      }) };
      return {};
    };
    const loaded = { exports: {} };
    runInNewContext(code, { require: fakeRequire, module: loaded, exports: loaded.exports,
      global: {}, __dirname: dirname(filename), process: { exitCode: undefined }, console }, { filename });
    await assert.rejects(loaded.exports.default({
      argv: { execute: true, omit_baselib: true, files: ["actual-entry.py"], import_path: "" },
      src_path: "/source", lib_path: "/compiler",
    }), caught => {
      const diagnostic = serialize(caught).pythonDiagnostic;
      assert.equal(diagnostic.category, phase === "execute" ? "python.runtime" : "host.error");
      assert.equal(diagnostic.phase, phase === "execute" ? "execute" : phase === "parse" ? "parse" : "host");
      assert.deepEqual(diagnostic.frames, []);
      if (phase === "execute") assert.equal(diagnostic.filename, "actual-entry.py");
      return true;
    });
  }
});

test("compile preserves manual SystemExit and legacy parser exit handling", async () => {
  const filename = join(__dirname, "../tools/compile.ts");
  const code = esbuild.transformSync(readFileSync(filename, "utf8"), {
    loader: "ts", format: "cjs", target: "es2022",
  }).code;
  for (const scenario of [
    { kind: "execute", code: undefined, status: 0, stderr: "" },
    { kind: "execute", code: null, status: 0, stderr: "" },
    { kind: "execute", code: 3, status: 3, stderr: "" },
    { kind: "execute", code: 3n, status: 3, stderr: "" },
    { kind: "execute", code: "goodbye", status: 1, stderr: "goodbye\n" },
    { kind: "parse", status: 1, stderr: "SyntaxError: legacy parse\n" },
  ]) {
    const exitSentinel = {};
    let status;
    let stderr = "";
    class LegacySyntaxError extends Error {
      constructor() { super("legacy parse"); this.name = "SyntaxError"; }
    }
    const error = scenario.kind === "parse" ? new LegacySyntaxError() :
      Object.assign(new Error("manual exit"), { name: "SystemExit", code: scenario.code });
    const compiler = {
      SyntaxError: LegacySyntaxError, DefaultsError: class extends Error {},
      OutputStream: class { get() { return "inert generated source"; } },
    };
    const fakeRequire = name => {
      if (name === "path" || name === "fs") return require(name);
      if (name === "fs/promises") return { readFile: async () => "inert Python source" };
      if (name === "vm") return { Script: class { runInThisContext() { throw error; } } };
      if (name === "./utils") return { getImportDirs: () => [] };
      if (name === "./compiler") return { __esModule: true, default: () => compiler };
      if (name === "./resources") return { standardLibraryCacheDirectory: value => value };
      if (name === "./foreign") return { selectedForeignLanguage: () => undefined };
      if (name === "./host") return { installNodeHost: () => () => {} };
      if (name === "./graphics-export") return { installNodeGraphicsSaveHook() {} };
      if (name === "./python/diagnostics") return helper.exports;
      if (name === "./python/compiler-frontend") return { createPythonCompilerFrontend: async () => ({
        parse() {
          if (scenario.kind === "parse") throw error;
          return { print() {} };
        }, close() {},
      }) };
      return {};
    };
    const loaded = { exports: {} };
    runInNewContext(code, {
      require: fakeRequire, module: loaded, exports: loaded.exports,
      global: {}, __dirname: dirname(filename),
      process: { exitCode: undefined, exit(value) { status = value; throw exitSentinel; } },
      console: { error(value) { stderr += String(value) + "\n"; } },
    }, { filename });
    await assert.rejects(loaded.exports.default({
      argv: { execute: true, omit_baselib: true, files: ["actual-entry.py"], import_path: "" },
      src_path: "/source", lib_path: "/compiler",
    }), caught => caught === exitSentinel);
    assert.equal(status, scenario.status);
    assert.equal(stderr, scenario.stderr);
    // These existing manual-exit paths do not attach execution envelopes.
    assert.equal(serialize(error).pythonDiagnostic.phase, "host");
  }
});
