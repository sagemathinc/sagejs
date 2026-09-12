// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const { Parser, Language } = require("web-tree-sitter");
const esbuild = require("esbuild");

const lowererPath = join(__dirname, "../tools/python/lowerer.ts");
const compiled = new Module(lowererPath, module);
compiled.require = name => {
  if (["./contract", "./optimizer", "./semantic"].includes(name)) return {};
  throw new Error(`unexpected dependency: ${name}`);
};
compiled._compile(esbuild.transformSync(readFileSync(lowererPath, "utf8"), {
  loader: "ts", format: "cjs", target: "es2022",
}).code, lowererPath);
const { PythonCstLowerer } = compiled.exports;

test("yield ownership follows definition and comprehension execution scopes", async () => {
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await Language.load(require.resolve("tree-sitter-python/tree-sitter-python.wasm")));
  const subject = new PythonCstLowerer({}, {}, {});
  const cases = [
    ["def inner(x=(yield 1)):\n        return x", true, false],
    ["def inner(*, x=(yield 1)):\n        return x", true, false],
    ["def inner():\n        yield 1", false, true],
    ["inner = lambda x=(yield 1): x", true, false],
    ["inner = lambda: (yield 1)", false, true],
    ["@(yield 1)\n    def inner():\n        pass", true, false],
    ["class Inner((yield 1)):\n        pass", true],
    ["class Inner:\n        def method(x=(yield 1)):\n            pass", false],
    ...["(x for x in (yield 1))", "[x for x in (yield 1)]", "{x for x in (yield 1)}", "{x:x for x in (yield 1)}"].map(expr => [`return ${expr}`, true]),
    ["return (x for x in [1] if (lambda: (yield 1)))", false, true],
  ];
  try {
    for (const [statement, expected, nestedExpected] of cases) {
      const tree = parser.parse(`def outer():\n    ${statement}\n`);
      try {
        assert.equal(tree.rootNode.hasError, false, statement);
        const outer = tree.rootNode.namedChildren[0];
        assert.equal(subject.containsYieldInScope(outer.childForFieldName("body")), expected, statement);
        const nested = outer.childForFieldName("body").descendantsOfType(["function_definition", "lambda"])[0];
        if (nestedExpected !== undefined) {
          assert.equal(subject.containsYieldInScope(nested.childForFieldName("body")), nestedExpected, statement);
        }
      } finally { tree.delete(); }
    }
    // The historical evaluated-annotation flag is opt-in; future annotations
    // and the default text-only mode must not introduce suspension points.
    const tree = parser.parse("def outer():\n    def inner(x: (yield 1)) -> (yield 2):\n        pass\n");
    try {
      const body = tree.rootNode.namedChildren[0].childForFieldName("body");
      for (const [mode, expected] of [[false, false], ["future", false], [true, true]]) {
        subject.annotationsMode = mode;
        assert.equal(subject.containsYieldInScope(body), expected);
      }
    } finally { tree.delete(); }
  } finally { parser.delete(); }
});
