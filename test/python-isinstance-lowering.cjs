// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { default: createCompiler } = require("../dist/tools/compiler.js");
const { createPythonCompilerFrontend } = require(
  "../dist/tools/python/compiler-frontend.js"
);

test("isinstance lowering is dynamic except in explicit compiler bootstrap", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  const options = {
    filename: "<isinstance-lowering>",
    for_linting: true,
    import_dirs: [],
    strict_python_scopes: true,
    scoped_flags: { dict_literals: true, overload_getitem: true },
  };
  function nodes(source, extra = {}) {
    const found = [];
    frontend.parse(source, { ...options, ...extra }).walk({
      _visit(node, descend) {
        found.push(node);
        if (descend !== undefined) descend();
      },
    });
    return found;
  }
  try {
    // Invalid builtin shapes remain valid Python syntax: a local replacement
    // may accept them, and the real builtin must reject them only at runtime.
    for (const source of [
      "isinstance(value, kind)",
      "isinstance(value, (left, right))",
      "isinstance(value, [kind])",
      "isinstance()",
      "isinstance(value)",
      "isinstance(value, kind, extra)",
      "isinstance(value=value, classinfo=kind)",
      "isinstance(*values)",
      "isinstance(value, kind, **options)",
      "isinstance(*(value,), *(kind,), **{})",
    ]) {
      for (const extra of [{}, { compiler_bootstrap: false }]) {
        const lowered = nodes(source, extra);
        assert.ok(lowered.some((node) => node instanceof compiler.AST_Call &&
          node.expression instanceof compiler.AST_SymbolRef &&
          node.expression.name === "isinstance"), source);
        assert.ok(!lowered.some((node) => node instanceof compiler.AST_Binary &&
          node.operator === "instanceof"), source);
      }
    }
    const bootstrap = nodes("isinstance(value, kind)", { compiler_bootstrap: true });
    assert.equal(bootstrap.filter((node) => node instanceof compiler.AST_Binary &&
      node.operator === "instanceof").length, 1);
    for (const source of ["isinstance(value)", "isinstance(value, kind, extra)",
      "isinstance(value, classinfo=kind)"]) {
      assert.throws(() => nodes(source, { compiler_bootstrap: true }),
        /isinstance\(\) must be called with exactly two arguments/);
    }
    // The internal exception stays limited to the bare source spelling.
    for (const extra of [{}, { compiler_bootstrap: true }]) {
      assert.ok(!nodes("builtins.isinstance(value, kind)", extra).some((node) =>
        node instanceof compiler.AST_Binary && node.operator === "instanceof"));
    }
  } finally {
    frontend.close();
  }
});
