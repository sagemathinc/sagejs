// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
const {
  installBootstrapAstBridge,
} = require("../dist/tools/self.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

test("first self-host pass can bridge the node surface required by source lowering", async () => {
  const compiler = createCompiler();
  for (const name of [
    "AST_AnnotatedAssignment",
    "AST_TimedStatement",
    "AST_AsyncFor",
  ]) {
    assert.equal(delete compiler[name], true, name);
  }
  assert.equal(compiler.AST_AnnotatedAssignment, undefined);
  assert.equal(compiler.AST_TimedStatement, undefined);
  assert.equal(compiler.AST_AsyncFor, undefined);

  installBootstrapAstBridge(compiler);
  for (const name of [
    "AST_AnnotatedAssignment",
    "AST_TimedStatement",
    "AST_AsyncFor",
  ]) {
    assert.equal(typeof compiler[name], "function", name);
  }

  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const module = frontend.parse(
      "class FrameSummary:\n" +
        "    value: int = 1\n" +
        "    def method(self):\n" +
        "        return self.value\n",
      { filename: "bootstrap-bridge.py" },
    );
    assert.ok(module.body[0] instanceof compiler.AST_Class);
    assert.ok(
      module.body[0].python_namespace_body.some(
        (statement) =>
          statement instanceof compiler.AST_AnnotatedAssignment ||
          statement.body instanceof compiler.AST_AnnotatedAssignment,
      ),
    );
  } finally {
    frontend.close();
  }
});
