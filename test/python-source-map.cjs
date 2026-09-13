// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PythonSourceMapCollector, PythonSourceMapRegistry, relocatePythonSourceMap,
} = require("../dist/tools/python/source-map.js");

function node(kind, line, column, endColumn, name) {
  return { constructor: { name: `AST_${kind}` }, name,
    start: { line, col: column }, end: { line, col: endColumn } };
}
function position(text, offset) {
  const lines = text.slice(0, offset).split("\n");
  return { offset, line: lines.length, column: lines.at(-1).length };
}
function fixture(source = "def f():\n    outer(inner(3))\n", filename = "same.py") {
  const generated = "HOST; outer(inner(3)); TRAILER;";
  const collector = new PythonSourceMapCollector(source, filename);
  const fn = node("Function", 1, 0, 8, { name: "f" });
  const call = node("Call", 2, 4, 19);
  const inner = node("Call", 2, 10, 18);
  const argument = node("Number", 2, 16, 17);
  fn.body = [call];
  collector.push(fn, position(generated, 0));
  collector.push(call, position(generated, 6));
  collector.push(inner, position(generated, 12));
  collector.push(argument, position(generated, 18));
  collector.pop(argument, position(generated, 19));
  collector.pop(inner, position(generated, 20));
  collector.pop(call, position(generated, 21));
  collector.pop(fn, position(generated, generated.length));
  return collector.finish(generated);
}
function register(map) {
  const registry = new PythonSourceMapRegistry();
  const executable = {};
  registry.register(executable, map.generated, map.source.text, map);
  return (offset) => {
    const p = position(map.generated, offset);
    return registry.lookup(executable, p.line, p.column);
  };
}

test("synthetic calls with missing or malformed positions remain unattributed", () => {
  for (const invalid of [{}, { start: { line: 0, col: 0 } },
    { start: { line: 1, col: 99 }, end: { line: 1, col: 100 } },
    { start: { line: 1, col: 3 }, end: { line: 1, col: 1 } }]) {
    const generated = "outer(inner())";
    const collector = new PythonSourceMapCollector(generated, "synthetic.py");
    const outer = node("Call", 1, 0, generated.length);
    const inner = { constructor: { name: "AST_Call" }, ...invalid };
    collector.push(outer, position(generated, 0));
    collector.push(inner, position(generated, 6));
    collector.pop(inner, position(generated, 13));
    collector.pop(outer, position(generated, generated.length));
    const lookup = register(collector.finish(generated));
    assert.equal(lookup(0).status, "mapped");
    assert.equal(lookup(6).status, "excluded");
  }
});

test("call attribution excludes arguments and preserves nested call coordinates", () => {
  const map = fixture();
  const lookup = register(map);
  assert.deepEqual(lookup(6), { status: "mapped", source: {
    filename: "same.py", name: "f", start: { line: 2, column: 4 },
    end: { line: 2, column: 19 },
  }, line: "    outer(inner(3))" });
  // The innermost literal is not itself the execution site.
  assert.equal(lookup(18).source.start.column, 10);
  assert.deepEqual(lookup(0), { status: "unmapped" });
  assert.deepEqual(lookup(21), { status: "unmapped" });
});

test("registration authenticates exact texts and isolates reused logical filenames", () => {
  const map = fixture();
  const registry = new PythonSourceMapRegistry();
  const oldExecutable = {};
  const newExecutable = {};
  registry.register(oldExecutable, map.generated, map.source.text, map);
  const replacement = JSON.parse(JSON.stringify(map));
  replacement.source.text = replacement.source.text.replace("inner(3)", "inner(9)");
  replacement.spans.forEach((span) => { if (span.source) span.source.name = "replacement"; });
  registry.register(newExecutable, map.generated, replacement.source.text, replacement);
  replacement.spans[0].source.name = "mutated";
  replacement.source.text = "mutated after registration";
  assert.equal(registry.lookup(oldExecutable, 1, 6).source.name, "f");
  assert.equal(registry.lookup(newExecutable, 1, 6).source.name, "replacement");
  assert.equal(registry.lookup(oldExecutable, 1, 6).line, "    outer(inner(3))");
  assert.equal(registry.lookup(newExecutable, 1, 6).line, "    outer(inner(9))");
  assert.deepEqual(registry.lookup({}, 1, 6), { status: "unmapped" });
  assert.throws(() => registry.register(oldExecutable, map.generated, map.source.text, map), /already registered/);
  assert.throws(() => registry.register({}, map.generated + " ", map.source.text, map), /generated source/);
  assert.throws(() => registry.register({}, map.generated, map.source.text + " ", map), /Python source/);
  assert.ok(Object.isFrozen(map.spans[0].source.start));
  assert.ok(Object.isFrozen(registry.lookup(oldExecutable, 1, 6).source));
});

test("explicit host exclusions do not erase a Python body TypeError raise site", () => {
  const source = "def f():\n    raise TypeError('body')\n";
  const generated = "binder(); throw TypeError('body');";
  const collector = new PythonSourceMapCollector(source, "body.py");
  const fn = node("Function", 1, 0, 8, { name: "f" });
  const thrown = node("Throw", 2, 4, 27);
  fn.body = [thrown];
  collector.push(fn, position(generated, 0));
  collector.exclude(0, 9);
  collector.push(thrown, position(generated, 10));
  collector.pop(thrown, position(generated, generated.length));
  collector.pop(fn, position(generated, generated.length));
  const lookup = register(collector.finish(generated));
  assert.deepEqual(lookup(2), { status: "excluded" });
  assert.equal(lookup(20).source.start.line, 2);
  assert.equal(lookup(20).source.name, "f");
});

test("wrappers and path replacements relocate exact surviving ranges, not new text", () => {
  const map = fixture();
  const prefix = "(function(){\n/* π 😀 */\n";
  const relocated = relocatePythonSourceMap(map, [
    { start: 0, end: 0, text: prefix },
    { start: 14, end: 16, text: "longer\nreplacement" },
    { start: map.generated.length, end: map.generated.length, text: "\n})();" },
  ]);
  const lookup = register(relocated);
  assert.deepEqual(lookup(0), { status: "unmapped" });
  assert.equal(lookup(prefix.length + 6).source.start.column, 4);
  assert.deepEqual(lookup(prefix.length + 14), { status: "unmapped" });
  const innerTail = prefix.length + 16 + "longer\nreplacement".length - 2;
  assert.equal(lookup(innerTail).source.start.column, 10);
  assert.deepEqual(lookup(relocated.generated.length - 2), { status: "unmapped" });
  assert.throws(() => relocatePythonSourceMap(map, [
    { start: 4, end: 7, text: "" }, { start: 6, end: 8, text: "" },
  ]), /overlapping/);
});

test("invalid, ambiguous and unbalanced mappings fail without guessed coordinates", () => {
  const collector = new PythonSourceMapCollector("f()", "bad.py");
  const call = node("Call", 1, 0, 3);
  collector.push(call, { line: 1, column: 0, offset: 0 });
  assert.throws(() => collector.pop({}, position("f()", 3)), /unbalanced/);
  assert.throws(() => collector.finish("f()"), /unfinished/);
  collector.pop(call, { line: 1, column: 2, offset: 3 });
  assert.throws(() => collector.finish("f()"), /coordinates/);

  const map = JSON.parse(JSON.stringify(fixture()));
  map.spans.push({ ...map.spans[1], source: { ...map.spans[1].source, name: "other" } });
  assert.deepEqual(register(map)(6), { status: "ambiguous" });
  map.spans[0].source.start.line = 1000;
  assert.throws(() => register(map), /exceeds text/);
});

test("large multiline collection and lookup use prepared line indexes", () => {
  const count = 12000;
  const text = "f()\n".repeat(count);
  const collector = new PythonSourceMapCollector(text, "large.py");
  for (let index = 0; index < count; index++) {
    const call = node("Call", index + 1, 0, 3);
    collector.push(call, { line: index + 1, column: 0, offset: index * 4 });
    collector.pop(call, { line: index + 1, column: 3, offset: index * 4 + 3 });
  }
  const map = collector.finish(text);
  assert.equal(map.spans.length, count);
  const registry = new PythonSourceMapRegistry();
  const executable = {};
  registry.register(executable, text, text, map);
  assert.equal(registry.lookup(executable, count, 1).source.start.line, count);
  assert.deepEqual(registry.lookup(executable, count, 3), { status: "unmapped" });
  // Structural guard, not a host-speed threshold: coordinate validation must
  // consume prepared indexes, never scan a prefix per AST node or frame.
  const implementation = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../tools/python/source-map.ts"), "utf8",
  );
  const offsetBody = implementation.slice(implementation.indexOf("function offsetAt("),
    implementation.indexOf("function freezeMap("));
  assert.doesNotMatch(offsetBody, /\b(?:for|while)\s*\(|indexOf\(|split\(/);
  assert.match(offsetBody, /starts\[line - 1\]/);
});

test("defaults and decorators retain enclosing co_name; nested and lambda bodies use their own", () => {
  const source = "def outer():\n    @decorate(fail())\n    def f(x=fail()):\n        return fail()\n    return f\nf = lambda x=fail(): fail()\n";
  const generated = "d(); a(); b(); c(); e();";
  const collector = new PythonSourceMapCollector(source, "scopes.py");
  const outer = node("Function", 1, 0, 12, { name: "outer" });
  const nested = node("Function", 3, 4, 20, { name: "f" });
  const decorator = node("Call", 2, 5, 21);
  const defaultCall = node("Call", 3, 12, 18);
  const bodyCall = node("Call", 4, 15, 21);
  const lambda = node("Function", 6, 4, 27);
  lambda.is_lambda = true;
  const lambdaDefault = node("Call", 6, 13, 19);
  const lambdaBody = node("Call", 6, 21, 27);
  outer.body = [nested];
  nested.body = [bodyCall];
  lambda.body = lambdaBody;
  const emit = (call, start) => {
    collector.push(call, position(generated, start));
    collector.pop(call, position(generated, start + 3));
  };
  collector.push(outer, position(generated, 0));
  collector.push(nested, position(generated, 0));
  emit(decorator, 0);
  emit(defaultCall, 5);
  emit(bodyCall, 10);
  collector.pop(nested, position(generated, 13));
  collector.pop(outer, position(generated, 13));
  collector.push(lambda, position(generated, 15));
  emit(lambdaDefault, 15);
  emit(lambdaBody, 20);
  collector.pop(lambda, position(generated, 23));
  const lookup = register(collector.finish(generated));
  assert.equal(lookup(0).source.name, "outer");
  assert.equal(lookup(5).source.name, "outer");
  assert.equal(lookup(10).source.name, "f");
  assert.equal(lookup(15).source.name, "<module>");
  assert.equal(lookup(20).source.name, "<lambda>");
  assert.equal(lookup(5).source.start.line, 3);
  assert.equal(lookup(5).source.start.column, 12);
});

test("unmodeled class and comprehension scopes withhold names instead of guessing", () => {
  for (const kind of ["Class", "ListComprehension", "GeneratorComprehension"]) {
    const collector = new PythonSourceMapCollector("f()", "scope.py");
    const scope = node(kind, 1, 0, 3, { name: "unproven" });
    const call = node("Call", 1, 0, 3);
    collector.push(scope, position("f()", 0));
    collector.push(call, position("f()", 0));
    collector.pop(call, position("f()", 3));
    collector.pop(scope, position("f()", 3));
    const frame = register(collector.finish("f()"))(1);
    assert.equal(frame.source.name, null);
    assert.equal(frame.source.start.line, 1);
  }
});

test("real transformed definitions preserve default and decorator call coordinates", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const source = "@decorate(fail())\ndef f(x=fail()):\n    return fail()\nclass C:\n    values = [f(x) for x in items()]\n";
    const collector = new PythonSourceMapCollector(source, "transformed.py");
    const ast = frontend.parse(source, { filename: "transformed.py", for_linting: true,
      import_dirs: [], runtime_imports: true, strict_python_scopes: true, scoped_flags: { sequential_definitions: true } });
    const output = new compiler.OutputStream({ omit_baselib: true, write_name: false,
      private_scope: false, beautify: true, source_map: collector });
    ast.print(output);
    const map = collector.finish(output.get());
    const sites = map.spans.filter(span => span.source).map(span => span.source);
    assert.ok(sites.some(site => site.start.line === 1 && site.name === "<module>"));
    assert.ok(sites.some(site => site.start.line === 2 && site.start.column === 8 && site.name === "<module>"));
    assert.ok(sites.some(site => site.start.line === 3 && site.start.column === 11 && site.name === "f"));
    assert.ok(sites.some(site => site.start.line === 5 && site.name === null));
  } finally {
    frontend.close();
  }
});

test("real nested lambda bodies block outer calls but permit their own execution sites", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const source of ["invoke(lambda: 1 + None)\n", "invoke(lambda: invoke(lambda: 1 + None))\n",
      "invoke(lambda: fail())\n", "invoke(lambda x=fail(): 1 + None)\n"]) {
      const collector = new PythonSourceMapCollector(source, "nested.py");
      const ast = frontend.parse(source, { filename: "nested.py", for_linting: true,
        import_dirs: [], runtime_imports: true });
      const output = new compiler.OutputStream({ omit_baselib: true, private_scope: false,
        write_name: false, beautify: true, source_map: collector });
      ast.print(output);
      const generated = output.get();
      const map = collector.finish(generated);
      const lookup = register(map);
      const prologue = generated.indexOf("var ρσ_cond_temp;");
      assert.ok(prologue >= 0);
      assert.equal(lookup(prologue).status, "unmapped", "function prologue must not borrow outer call");
      const operation = generated.indexOf("ρσ_operator_add(1, null)");
      if (operation >= 0) assert.equal(lookup(operation).status, "unmapped", source);
      for (const span of map.spans.filter(span => span.kind === "execution")) {
        const original = source.slice(span.source.start.column, span.source.end.column);
        if (original === "fail()") {
          assert.equal(lookup(span.start).status, "mapped");
          assert.equal(span.source.name, source.includes("x=fail()") ? "<module>" : "<lambda>");
        }
      }
    }
  } finally { frontend.close(); }
});

test("real comprehension scopes cannot borrow enclosing call attribution", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const source of ["invoke((1 + None for _ in [0]))\n", "invoke([1 + None for _ in [0]])\n",
      "invoke((fail() for _ in [0]))\n", "invoke([fail() for _ in [0]])\n"]) {
      const collector = new PythonSourceMapCollector(source, "comprehension.py");
      const ast = frontend.parse(source, { filename: "comprehension.py", for_linting: true,
        import_dirs: [], runtime_imports: true });
      const output = new compiler.OutputStream({ omit_baselib: true, private_scope: false,
        write_name: false, beautify: true, source_map: collector });
      ast.print(output);
      const generated = output.get();
      const map = collector.finish(generated);
      const lookup = register(map);
      assert.ok(map.spans.some(span => span.kind === "scope"));
      const operation = generated.indexOf("ρσ_operator_add(1, null)");
      if (source.includes("1 + None")) {
        assert.ok(operation >= 0);
        assert.equal(lookup(operation).status, "unmapped");
      } else {
        const fail = map.spans.find(span => span.source?.start.column === source.indexOf("fail()"));
        assert.ok(fail);
        assert.equal(lookup(fail.start).status, "mapped");
        assert.equal(lookup(fail.start).source.name, null);
      }
    }
  } finally { frontend.close(); }
});
