// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const createCompiler = require("../dist/tools/compiler.js").default;
const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");

function initializer(code, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...code.matchAll(new RegExp(
    escaped + "\\.__annotations__\\s*=\\s*([^;]+);", "g"))];
  assert.equal(matches.length, 1, "one metadata initializer required");
  return matches[0][1].replace(/\s+/g, "");
}

function exactInitializer(code, name, expected) {
  assert.equal(initializer(code, name), expected);
}

test("annotation initializer oracle rejects constructor, wrappers and duplicates", () => {
  const good = 'tag.__annotations__=ρσ_dict_literal(["value",7]);';
  exactInitializer(good, "tag", 'ρσ_dict_literal(["value",7])');
  for (const mutant of [
    good.replace("ρσ_dict_literal", "ρσ_dict"),
    good.replace('ρσ_dict_literal(["value",7])', '(function(){return ρσ_dict_literal(["value",7])})()'),
    good.replace('ρσ_dict_literal(["value",7])', 'wrap(ρσ_dict_literal(["value",7]))'),
    good + good, "", good.replace('"value",7', '7,"value"'),
  ]) assert.throws(() => exactInitializer(mutant, "tag", 'ρσ_dict_literal(["value",7])'));
});

test("annotation emission preserves public flat pairs and private raw metadata", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const future of [true, false]) for (const raw of [true, false]) {
      const source = (future ? "from __future__ import annotations" :
        "from __python__ import annotations") +
        "\ndef tagged(value: 7) -> 11:\n    pass\ndef empty():\n    pass\n" +
        "class C:\n    def method(self: 5, value: 7) -> 11:\n        pass\n";
      const ast = frontend.parse(source, {
        filename: "<annotation-pairs>", import_dirs: [],
        scoped_flags: { dict_literals: true, bound_methods: true },
      });
      const output = new compiler.OutputStream({
        omit_baselib: true, private_scope: false, write_name: false,
        python_attributes: !raw, beautify: false,
      });
      ast.print(output);
      const code = output.get();
      const expected = raw ? (future ? '{"value":"7","return":"11"}' : '{"value":7,return:11}')
        : (future ? 'ρσ_dict_literal(["value","7","return","11"])'
          : 'ρσ_dict_literal(["value",7,"return",11])');
      exactInitializer(code, "$ρσ$py$tagged", expected);
      exactInitializer(code, "$ρσ$py$empty", raw ? "{}" : "ρσ_dict_literal([])");
      assert.ok(code.includes('__annotations_text__ = {"value":"7","return":"11"}'));
      const methodExpected = raw ? expected :
        (future ? 'ρσ_dict_literal(["self","5","value","7","return","11"])'
          : 'ρσ_dict_literal(["self",5,"value",7,"return",11])');
      exactInitializer(code, "$ρσ$py$C.prototype.method", methodExpected);
      assert.ok(code.includes(
        '$ρσ$py$C.prototype.method.__annotations_text__ = {"value":"7","return":"11"}'));
    }
  } finally { frontend.close(); }
});

for (const mode of ["python", "sage"]) {
  test(`future annotation dictionaries preserve keys, receivers and identity (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    const result = await session.evaluate(readFileSync(
      join(__dirname, "fixtures/python-annotation-flat-pairs.py"), "utf8"));
    assert.equal(result.stdout.trim(), "annotation-flat-pairs-ok");
  });
  test(`annotated receiver is retained independently of special keys (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    await session.evaluate(`
from __future__ import annotations
class C:
    def method(self: C, value: int) -> str:
        pass
    @classmethod
    def make(cls: type, value: int) -> C:
        pass
assert list(C.method.__annotations__) == ["self", "value", "return"]
assert C().method.__annotations__ is C.method.__annotations__
assert list(C.make.__annotations__) == ["cls", "value", "return"]
`);
  });
  test(`explicit eager annotations evaluate once, in order, including failures (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    await session.evaluate(`
from __python__ import annotations
events = []
def mark(value):
    events.append(value)
    return value
def special(__proto__: mark("proto"), constructor: mark("ctor"), /, *args: mark("args"), value: mark("value"), **kw: mark("kw")) -> mark("return"):
    pass
expected = ["proto", "ctor", "args", "value", "kw", "return"]
assert events == expected
assert list(special.__annotations__) == ["__proto__", "constructor", "args", "value", "kw", "return"]
assert list(special.__annotations__.values()) == expected
assert special.__annotations__ is special.__annotations__
assert events == expected
def factory():
    def empty():
        pass
    def typed(value: mark("factory")):
        pass
    return empty, typed
empty_a, typed_a = factory()
empty_b, typed_b = factory()
assert events == expected + ["factory", "factory"]
empty_a.__annotations__["extra"] = 1
typed_a.__annotations__["extra"] = 2
assert "extra" not in empty_b.__annotations__
assert "extra" not in typed_b.__annotations__
assert empty_a.__annotations__ is empty_a.__annotations__
assert typed_a.__annotations__ is typed_a.__annotations__
events = expected[:]
class C:
    def method(self: "C", value: int) -> str:
        pass
    @classmethod
    def make(cls: type, value: int) -> "C":
        pass
assert list(C.method.__annotations__) == ["self", "value", "return"]
assert list(C.make.__annotations__) == ["cls", "value", "return"]
def fail():
    events.append("fail")
    raise ValueError("annotation")
try:
    def broken(a: mark("before"), b: fail(), c: mark("after")):
        pass
except ValueError:
    pass
else:
    assert False
assert events == expected + ["before", "fail"]
`);
  });
  test(`eager class annotations must not observe early class publication (${mode})`, async t => {
    const session = await createSage({ mode });
    t.after(() => session.close());
    await session.evaluate(`
from __python__ import annotations
try:
    class UndefinedReceiver:
        def method(self: UndefinedReceiver):
            pass
except NameError:
    pass
else:
    assert False
`);
  });
}
