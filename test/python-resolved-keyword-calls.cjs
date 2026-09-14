// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { createSage } = require("../dist/tools/kernel.js");
const createCompiler = require("../dist/tools/compiler.js").default;

const fixture = join(__dirname, "fixtures/resolved-keyword-calls.py");
const source = readFileSync(fixture, "utf8");

test("resolved keyword lowering keeps native and legacy receiver conventions", () => {
  const compiler = createCompiler();
  const emit = (receiver, member, pythonAttributes) => {
    const args = [];
    args.kwargs = [[new compiler.AST_SymbolRef({ name: "value" }), new compiler.AST_Number({ value: 1 })]];
    const call = new compiler.AST_Call({
      expression: new compiler.AST_Dot({
        expression: new compiler.AST_SymbolRef({ name: receiver }), property: member,
      }), args,
    });
    const output = new compiler.OutputStream({
      beautify: true, python_attributes: pythonAttributes, omit_baselib: true,
    });
    call.print(output);
    return output.get();
  };
  assert.match(emit("obj", "method", true), /ρσ_invoke_prepared_keywords\(ρσ_prepare_method_call\(obj, "method"\),/u);
  assert.match(emit("obj", "method", false), /ρσ_interpolate_kwargs_legacy\(obj,/u);
  assert.match(emit("Object", "keys", true), /ρσ_interpolate_kwargs\(Object,/u);
  assert.match(emit("obj", "ρσ_internal", true), /ρσ_interpolate_kwargs\(obj,/u);
});

test("resolved keyword calls have a CPython oracle", () => {
  const result = spawnSync(pythonExecutable(), [fixture], { encoding: "utf8", timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "resolved-keyword-calls-ok\n");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: resolved keyword and star calls preserve lookup and binding`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", (text) => { stderr += text; });
    const result = await session.evaluate(source);
    assert.equal(result.stdout, "resolved-keyword-calls-ok\n");
    assert.equal(stderr, "");
    // Existing JS string extensions are not part of the CPython oracle.
    await session.evaluate(`
assert 'abc'.toString() == '[object String]'
assert str('abc'.valueOf()) == 'abc'
`);
    assert.equal(stderr, "");
  });
}
