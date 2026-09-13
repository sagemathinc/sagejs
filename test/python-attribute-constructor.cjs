// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
const createCompiler = require("../dist/tools/compiler.js").default;

for (const pythonAttributes of [false, true]) {
  for (const values of [[], [17]]) {
    test(`attribute constructor targets the retrieved class (${pythonAttributes}, ${values.length} arguments)`, () => {
      const compiler = createCompiler();
      const expression = new compiler.AST_New({
        expression: new compiler.AST_Dot({
          expression: new compiler.AST_SymbolRef({ name: "namespace" }),
          property: "Thing",
        }),
        args: values.map(value => new compiler.AST_Number({ value })),
      });
      const output = new compiler.OutputStream({
        beautify: true, python_attributes: pythonAttributes, omit_baselib: true,
      });
      expression.print(output);
      let lookups = 0;
      class Thing {
        constructor(value = 5) { this.value = value; }
      }
      const instance = vm.runInNewContext(`(${output.get()})`, {
        namespace: { Thing },
        ρσ_getattr_missing: {},
        ρσ_getattr_internal(object, key) {
          assert.equal(new.target, undefined, "attribute lookup is not a constructor");
          lookups++;
          return object[key];
        },
      });
      assert.ok(instance instanceof Thing);
      assert.equal(instance.value, values[0] ?? 5);
      assert.equal(lookups, pythonAttributes ? 1 : 0);
    });
  }
}
