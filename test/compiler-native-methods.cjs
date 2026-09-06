// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

// Optional local allocation/parse diagnostic (no conformance/performance gate):
// node test/fixtures/compiler-method-cost.cjs "$PWD"

test("compiler objects use prototype methods and retain receiver calls", async () => {
  const compiler = createCompiler();
  const token = new compiler.AST_Token({ value: "7" });
  const number = new compiler.AST_Number({ value: 7, start: token, end: token });
  for (const object of [token, number]) {
    assert.equal(Object.hasOwn(object, "clone"), false);
    assert.equal(object.clone, Object.getPrototypeOf(object).clone);
    const copy = object.clone();
    assert.notEqual(copy, object);
    assert.equal(copy.constructor, object.constructor);
    assert.equal(copy.value, object.value);
  }
  for (const method of ["walk", "_walk", "dump", "_dump"]) {
    assert.equal(Object.hasOwn(number, method), false, method);
  }
  const visited = [];
  number.walk({ _visit(node) { visited.push(node); } });
  assert.deepEqual(visited, [number]);

  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("answer = 6 * 7\n", {
      filename: "<compiler-native-methods>",
    });
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      beautify: true,
    });
    for (const method of ["print", "get", "with_parens", "spaced"]) {
      assert.equal(Object.hasOwn(output, method), false, method);
    }
    ast.print(output);
    assert.match(output.get(), /answer/);
    assert.ok(output.get().length > 0);
    const receiverOutput = new compiler.OutputStream({ beautify: true });
    receiverOutput.with_parens(() => receiverOutput.print("receiver"));
    receiverOutput.spaced.apply(receiverOutput, ["one", "two"]);
    assert.match(receiverOutput.get(), /^\(receiver\)one two$/);
  } finally {
    frontend.close();
  }
});

test("compiler native-method policy does not change Python method extraction", async (t) => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(String.raw`
class Base:
    def __init__(self, value):
        self.value = value
    def read(self):
        return self.value
class Child(Base):
    pass
instance = Child(42)
read = instance.read
assert read() == 42
assert read.__self__ is instance
# Canonical identity with Base.read is separate function-adapter work.
assert read.__func__ is instance.read.__func__
assert Base.read(instance) == 42
values = []
append = values.append
append(read())
assert values == [42]
print("compiler-method-boundary-ok")
`);
  assert.equal(result.stdout.trim(), "compiler-method-boundary-ok");
});
