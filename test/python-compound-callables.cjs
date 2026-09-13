// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {spawnSync} = require("node:child_process");
const {join} = require("node:path");
const test = require("node:test");
const {createSage} = require("../dist/tools/kernel.js");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const fixture = join(__dirname, "fixtures/compound-callables.py");

test("compound callable fixture passes the CPython oracle", () => {
  const result = spawnSync(pythonExecutable(), ["-X", "utf8", fixture], {
    encoding: "utf8", timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "compound-callables-ok\n");
});

for (const mode of ["python", "sage"]) {
  test(`${mode}: compound callable values and argument order`, async (t) => {
    const session = await createSage({mode});
    t.after(() => session.close());
    let stderr = "";
    session.on("stderr", text => { stderr += text; });
    const result = await session.evaluate(readFileSync(fixture, "utf8"));
    assert.equal(result.stdout, "compound-callables-ok\n");
    assert.equal(stderr, "");
  });
}

test("compound call lowering retains direct, constructor and legacy exemptions", () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const emit = ({direct = false, construct = false, python = true,
    expression = new compiler.AST_Conditional({
      condition: new compiler.AST_SymbolRef({name: "condition"}),
      consequent: new compiler.AST_SymbolRef({name: "left"}),
      alternative: new compiler.AST_SymbolRef({name: "right"}),
    })} = {}) => {
    const call = new (construct ? compiler.AST_New : compiler.AST_Call)({
      expression, args: [], direct_call: direct,
    });
    const output = new compiler.OutputStream({
      omit_baselib: true, python_attributes: python, beautify: true,
    });
    call.print(output);
    return output.get();
  };
  assert.match(emit(), /ρσ_invoke_prepared_method\(\[\(/u);
  for (const options of [{direct: true}, {construct: true}, {python: false}]) {
    assert.doesNotMatch(emit(options), /ρσ_invoke_prepared_method/u);
  }
  const sequence = emit({expression: new compiler.AST_Seq({
    car: new compiler.AST_SymbolRef({name: "left"}),
    cdr: new compiler.AST_SymbolRef({name: "right"}),
  })});
  const result = new Function("ρσ_invoke_prepared_method", "left", "right",
    `return ${sequence}`)(
    (context, args) => [context.length, context[0], args.length], "discard", "chosen",
  );
  assert.deepEqual(result, [1, ["discard", "chosen"], 0],
    "sequence value occupies one target slot");
});
