// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { createContext, runInContext } = require("node:vm");
const { spawnSync } = require("node:child_process");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
// Read-only seed for source qualification before building this worktree.
const compilerRoot = resolve(process.env.SAGEJS_OBJECT_SETATTR_COMPILER_ROOT || root);
const pythonDescriptors = `
calls = []
setter_error = ValueError("descriptor setter failed")
class Descriptor:
    def __get__(self, instance, owner):
        return 11
    def __set__(self, instance, value):
        calls.append(value)
        return False
class ThrowingDescriptor:
    def __set__(self, instance, value):
        raise setter_error
class Receiver:
    field = Descriptor()
    throwing = ThrowingDescriptor()
    @property
    def readonly(self):
        return 13
receiver = Receiver()
class Owned:
    pass
owned = Owned()
object.__setattr__(receiver, "field", 17)
assert calls == [17]
try:
    object.__setattr__(receiver, "throwing", 19)
except ValueError as caught:
    assert caught is setter_error
else:
    raise AssertionError("setter error swallowed")
try:
    object.__setattr__(receiver, "readonly", 23)
except AttributeError:
    pass
else:
    raise AssertionError("readonly property accepted")
`;

async function main() {
  const python = spawnSync(pythonExecutable(),
    ["-c", pythonDescriptors], { encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr || String(python.error));
  const compiler = require(join(compilerRoot, "dist/tools/compiler.js")).default();
  const frontend = await require(join(compilerRoot, "dist/tools/python/compiler-frontend.js"))
    .createPythonCompilerFrontend(compiler, "python");
  try {
    const source = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
    const start = source.indexOf("@runtime.native_method\ndef _builtins_object_setattr(");
    const section = source.slice(start,
      source.indexOf("\n\n@runtime.native_method\ndef _builtins_object_delattr", start));
    const checked = "        if not runtime.reflect.set(self, name, value):\n" +
      "            raise AttributeError(\"object attribute '\" + name + \"' is read-only\")";
    assert.ok(section.includes(checked), "source checks the host write result");
    const old = section.replace(checked, "        runtime.reflect.set(self, name, value)")
      .replace("def _builtins_object_setattr(", "def old_object_setattr(");
    const names = [...new Set([...section.matchAll(/\b(_builtins_\w+)\(/g)].map(m => m[1]))]
      .filter(name => name !== "_builtins_object_setattr");
    const prelude = "import sagejs.runtime as runtime\n" +
      "_builtins = runtime.reflect.get(runtime.reflect.get(runtime.global_object, " +
      "\"__sagejs_baselib_modules__\"), \"sagejs._baselib.builtins\")\n" +
      names.map(name => `${name} = runtime.reflect.get(_builtins, "${name}")`).join("\n") + "\n";
    const ast = frontend.parse(prelude + section + "\n\n" + old + "\n\n" + pythonDescriptors,
      { filename: "<object-setattr-source-oracle>" });
    const output = new compiler.OutputStream({
      baselib_plain: readFileSync(join(compilerRoot, "dist/compiler/baselib-plain-pretty.js"), "utf8"),
      write_name: false, beautify: true, private_scope: false,
    });
    ast.print(output);
    const context = createContext({ console, require, Buffer, process,
      __sagejs_runtime_require__: require });
    runInContext(output.get(), context);
    const main = context.ρσ_modules.__main__;
    const builtins = context.__sagejs_baselib_modules__["sagejs._baselib.builtins"];
    const writers = [
      ["source", (target, name, value) => main._builtins_object_setattr.call(target, name, value)],
      ["ordinary", builtins.ρσ_setattr],
    ];
    if (compilerRoot === resolve(root)) {
      writers.push(["shipped", (target, name, value) =>
        builtins._builtins_object_setattr.call(target, name, value)]);
    }
    const rejects = [
      () => Object.freeze({ field: 1 }),
      () => Object.preventExtensions({}),
      () => Object.seal({}),
      () => Object.freeze(new Date(0)),
      () => Object.freeze(new Map()),
      () => Object.defineProperty({}, "field", { value: 1, writable: false }),
      () => Object.create(Object.defineProperty({}, "field", { value: 1, writable: false })),
      () => Object.defineProperty({}, "field", { get() { return 1; } }),
      () => new Proxy({}, { set() { return false; } }),
    ];
    for (const make of rejects) {
      const target = make();
      assert.equal(builtins._builtins_has_instance_dict(target), false);
      const before = Reflect.get(target, "field");
      assert.equal(main.old_object_setattr.call(target, "field", 3), null,
        "the old source silently accepted a rejected host write");
      assert.equal(Reflect.get(target, "field"), before);
      for (const [label, write] of writers) {
        assert.throws(() => write(target, "field", 3), error =>
          error.name === "AttributeError" && error.message === "object attribute 'field' is read-only", label);
        assert.equal(Reflect.get(target, "field"), before);
      }
    }
    Object.freeze(main.receiver);
    for (const [label, write] of writers) {
      for (const target of [{}, Object.create(null), new Date(0), new Map(),
        Object.seal({ field: 1 }), Object.preventExtensions({ field: 1 })]) {
        assert.equal(builtins._builtins_has_instance_dict(target), false);
        assert.equal(write(target, "field", 5), null, label);
        assert.equal(Reflect.get(target, "field"), 5);
      }
      for (const result of [undefined, null, false]) {
        let calls = 0;
        const target = Object.freeze(Object.defineProperty({}, "field", {
          set(value) { assert.equal(this, target); assert.equal(value, 7); calls++; return result; },
        }));
        assert.equal(write(target, "field", 7), null, label);
        assert.equal(calls, 1, "setter return value is not the Reflect.set result");
      }
      const error = new Error("native setter failed");
      const target = Object.defineProperty({}, "field", { set() { throw error; } });
      assert.throws(() => write(target, "field", 9), caught => caught === error);
      assert.throws(() => write({}, 7, 9), caught => caught.name === "TypeError");
      assert.equal(write(main.owned, "extra", 41), null);
      assert.equal(Reflect.get(main.owned, "extra"), 41);
      const callsBefore = main.calls.length;
      // Python data descriptors run before owned storage or host fallback.
      write(main.receiver, "field", 29);
      assert.equal(main.calls.length, callsBefore + 1);
      assert.equal(main.calls[main.calls.length - 1], 29);
      assert.throws(() => write(main.receiver, "throwing", 31), caught => caught === main.setter_error);
      assert.throws(() => write(main.receiver, "readonly", 37), caught => caught.name === "AttributeError");
    }
    console.log(`object setattr: old-source defect reproduced; ${writers.map(([name]) => name).join("/")} writes and descriptor oracles passed`);
  } finally { frontend.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
