// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("class method sharing is bounded by descriptor and metadata form", async () => {
  const compiler = require("../dist/tools/compiler.js").default();
  const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const [decorator, parameters, annotations, copies] of [
      ["", "self, value=3", false, 1],
      ["    @identity\n", "self, value=3", false, 2],
      ["    @staticmethod\n", "value=3", false, 2],
      ["    @classmethod\n", "cls, value=3", false, 2],
      ["", "self, /, value=3", false, 2],
      ["", "self, value: int=3", true, 2],
    ]) {
      const source = "def identity(function): return function\nclass Base: pass\nclass Child(Base):\n" + decorator +
        `    def method(${parameters}):\n        return 'shared-factory-body-marker'\n`;
      const ast = frontend.parse(source, {
        filename:"<shared-method-shape>", for_linting:true,
        scoped_flags:{annotations,bound_methods:true,sequential_definitions:true},
      });
      const output = new compiler.OutputStream({omit_baselib:true,write_name:false,beautify:true,python_attributes:true,python_truthiness:true});
      ast.print(output);
      assert.equal((output.get().match(/shared-factory-body-marker/g) ?? []).length, copies);
    }
  } finally { frontend.close(); }
});

for (const mode of ["python", "sage"]) {
  test(`shared class methods preserve both namespace protocols (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/shared-class-method-factories.py"), "utf8",
    ));
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout.trim(), "shared-class-method-factories-ok");
  });
  test(`evaluated method annotations retain the existing fallback (${mode})`, async (t) => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(`
from __python__ import annotations
class AnnotationBase: pass
class Annotated(AnnotationBase):
    def method(self, value: int=3) -> int:
        return value
assert Annotated().method() == 3
assert Annotated.method.__annotations__['value'] is int
assert Annotated.method.__annotations__['return'] is int
print('evaluated-annotation-fallback-ok')
`);
    assert.equal(result.stdout.trim(), "evaluated-annotation-fallback-ok");
  });
}
