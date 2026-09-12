// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { default: createCompiler } = require("../dist/tools/compiler.js");
const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");

const cases = [
  ["plain numeric generator", "def f(n):\n    for i in range(n):\n        yield i\n", 0],
  ["handler-free delegation", "def f():\n    yield from child()\n", 0],
  ["handler-free await", "async def f():\n    await child()\n", 0],
  ["generator expression", "g = (i for i in range(3))\n", 0],
  ["handler suspension", "def f():\n    try:\n        raise error\n    except Exception:\n        yield 1\n", 1],
  ["pending finally", "def f():\n    try:\n        operation()\n    finally:\n        yield 1\n", 1],
  ["implicit async-with exit", "async def f():\n    async with context:\n        operation()\n", 1],
  ["nested owned body only", "def f():\n    def child():\n        try:\n            raise error\n        except Exception:\n            yield 1\n    yield from child()\n", 1],
];

for (const [name, source, expected] of cases) {
  test(`rebuilt emission selects ownership: ${name}`, async () => {
    const compiler = createCompiler();
    const frontend = await createPythonCompilerFrontend(compiler, "python");
    try {
      const ast = frontend.parse(source, {
        filename: `<${name}>`, for_linting: true, import_dirs: [],
        strict_python_scopes: true,
      });
      const output = new compiler.OutputStream({
        omit_baselib: true, write_name: false, private_scope: false,
        beautify: true, python_truthiness: true, python_attributes: true,
      });
      ast.print(output);
      assert.equal((output.get().match(/ρσ_handled_state\.wrap\(js_generator\./g) ?? []).length, expected);
    } finally { frontend.close(); }
  });
}

test("a rebuilt emitter retains wrapping for missing AST proof metadata", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("def f():\n    yield 1\n", {
      filename: "<missing-proof>", for_linting: true, import_dirs: [],
    });
    assert.equal(ast.body.length, 1);
    const definition = ast.body[0];
    assert.ok(definition instanceof compiler.AST_Lambda);
    assert.equal(definition.is_generator, true);
    assert.equal(definition.needs_handled_state, false);
    delete definition.needs_handled_state;
    const output = new compiler.OutputStream({
      omit_baselib: true, write_name: false, private_scope: false, beautify: true,
    });
    ast.print(output);
    assert.match(output.get(), /ρσ_handled_state\.wrap\(js_generator\.apply/);
  } finally { frontend.close(); }
});
