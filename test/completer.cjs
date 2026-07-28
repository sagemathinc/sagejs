"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInThisContext } = require("node:vm");
const createCompiler = require("../dist/tools/compiler.js").default;
const Completer = require("../dist/tools/completer.js").default;
const {
  importPath,
  libraryPath,
} = require("../dist/tools/utils.js");

const compiler = createCompiler();

function printAST(ast, keepBaselib = false) {
  const output = new compiler.OutputStream({
    omit_baselib: !keepBaselib,
    write_name: false,
    private_scope: false,
    beautify: true,
    keep_docstrings: true,
    exact_integers: true,
    baselib_plain: keepBaselib
      ? readFileSync(
          `${libraryPath}/baselib-plain-pretty.js`,
          "utf8",
        )
      : undefined,
  });
  ast.print(output);
  return output.get();
}

global.require = require;
runInThisContext(
  printAST(compiler.parse("(def ():\n yield 1\n)"), true),
);
runInThisContext('var __name__ = "__completion_test__";');

const source = [
  "class Example:",
  '    """An example class."""',
  "    def value(self, n=2):",
  "        return n",
  "",
  "example = Example();",
  'R = PolynomialRing(ZZ, "x");',
  "",
].join("\n");
const ast = compiler.parse(source, {
  filename: "<completion-test>",
  basedir: process.cwd(),
  libdir: importPath,
  jsage: true,
});
runInThisContext(printAST(ast));

const complete = Completer(compiler);

function completions(line) {
  const result = complete(line);
  assert.equal(result.length, 2);
  return result;
}

let [items, prefix] = completions("");
assert.equal(prefix, "");
assert.ok(items.includes("dir"));
assert.ok(items.includes("help"));
assert.ok(items.includes("example"));
assert.ok(!items.some((name) => name.startsWith("ρσ")));
assert.ok(!items.some((name) => name.startsWith("_builtins_")));

[items, prefix] = completions("exa");
assert.equal(prefix, "exa");
assert.ok(items.includes("example"));

[items, prefix] = completions("example.");
assert.equal(prefix, "");
assert.ok(items.includes("value"));
assert.ok(items.includes("__doc__"));
assert.ok(!items.includes("constructor"));
assert.ok(!items.some((name) => name.startsWith("ρσ")));

[items, prefix] = completions("example.va");
assert.equal(prefix, "va");
assert.deepEqual(items, ["value"]);

[items, prefix] = completions("R.");
assert.equal(prefix, "");
assert.ok(items.includes("base_ring"));
assert.ok(items.includes("gen"));
assert.ok(items.includes("variable_name"));
assert.ok(!items.includes("constructor"));

console.log("Python-facing global and attribute completion passed.");
