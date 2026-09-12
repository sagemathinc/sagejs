// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { runInNewContext } = require("node:vm");

test("expression default tuples preserve independent output options and original AST", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("function = lambda value=(1, 2): value\n", {
      filename: "<expression-default-options>",
    });
    const expression = ast.body[0].body.right;
    // The stage-zero AST ABI represents tuple defaults as AST_Seq. Keep its
    // existing normalization independently of the modern CST array node.
    expression.argnames.defaults.value = compiler.AST_Seq.from_array(
      expression.argnames.defaults.value.elements,
    );
    const originalDefaults = expression.argnames.defaults;
    for (const pythonAttributes of [false, true]) {
      for (const pythonTuples of [false, true]) {
        const output = new compiler.OutputStream({
          omit_baselib: true, write_name: false, beautify: true,
          python_attributes: pythonAttributes, python_tuples: pythonTuples,
        });
        expression.print(output);
        assert.equal(expression.argnames.defaults, originalDefaults);
        const functionValue = runInNewContext(output.get(), {
          ρσ_math_tuple: values => ({ tuple: values }),
          ρσ_dict: value => value ?? {},
          ρσ_function_code: () => ({}),
          ρσ_function_type: {},
          ρσ_modules: {},
          ρσ_live_scope_dict: value => value,
        });
        const value = pythonAttributes ? functionValue.__defaults__.tuple[0] : functionValue.__defaults__.value;
        assert.equal(!!value.tuple, pythonAttributes || pythonTuples);
        assert.deepEqual(Array.from(value.tuple ?? value), [1, 2]);
      }
    }
  } finally { frontend.close(); }
});

for (const mode of ["python", "sage"]) {
  test(`nested definition yield defaults suspend their enclosing function (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/generator-definition-scope.py"), "utf8",
    ));
    assert.equal(result.stdout.trim(), "generator-definition-scope-ok");
  });
}
