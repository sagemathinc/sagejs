// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const test = require("node:test");

test("AST type predicate aliases the existing primitive without another wrapper", async () => {
  const root = join(__dirname, "..");
  const compiler = require(root).createCompiler();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const source = readFileSync(join(root, "src/ast_types.py"), "utf8");
    const imports = source.match(/^from js import js_instanceof, js_new[^\n]*$/m)[0];
    assert.match(source, /^is_node_type = js_instanceof$/m);
    assert.doesNotMatch(source, /^def is_node_type\(/m);
    const ast = frontend.parse(`${imports}\nis_node_type = js_instanceof\n`, {
      filename: "ast-type-probe.py", libdir: join(root, "src/lib"),
      compiler_bootstrap: true,
    });
    const output = new compiler.OutputStream({ omit_baselib: true, beautify: true });
    ast.print(output);
    const declaration = output.get().match(/function js_instanceof\(obj, cls\) \{[^]*?\n\s*\}/)[0];
    // Python-mode module initialization resolves the imported binding once;
    // this must alias the function, not call it or recreate a wrapper.
    assert.match(output.get(), /is_node_type = ρσ_resolve_module_name\(js_instanceof, "js_instanceof",/);
    assert.match(declaration, /return obj instanceof cls;/);
    assert.doesNotMatch(declaration, /ρσ_resolve_callable|ρσ_resolve_module_name/);
    const check = runInNewContext(`(${declaration})`);
    class Parent {}
    class Child extends Parent {}
    assert.equal(check(new Child(), Parent), true);
    assert.equal(check({}, Parent), false);
    assert.equal(check(null, Parent), false);
    const foreign = runInNewContext("({ Array, value: [] })");
    assert.equal(check(foreign.value, foreign.Array), true);
    assert.equal(check(foreign.value, Array), false);
    let calls = 0;
    const token = {};
    const custom = { [Symbol.hasInstance](value) { calls++; assert.equal(this, custom); return value === token; } };
    assert.equal(check(token, custom), true);
    assert.equal(calls, 1);
    const sentinel = new Error("hasInstance error");
    assert.throws(() => check(token, { [Symbol.hasInstance]() { throw sentinel; } }), error => error === sentinel);
    for (const invalid of [null, undefined, 3, {}]) {
      assert.throws(() => check(token, invalid), error => error.name === "TypeError");
    }
    // Metadata intentionally identifies the private primitive, not a wrapper.
    assert.equal(check.name, "js_instanceof");
  } finally { frontend.close(); }
});
