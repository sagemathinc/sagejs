// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const test = require("node:test");
const root = join(__dirname, "..");
const source = readFileSync(join(root, "src/baselib/bootstrap_shared.py"), "utf8");
const names = ["ρσ_copy_method_metadata", "ρσ_native_method_adapter", "ρσ_unbound_method_adapter",
  "ρσ_check_interrupt", "ρσ_normalize_exception"];

// Exercise the native ABI bodies directly; full self-hosted/module
// linkage remains a separate build qualification, not implied by this test.
function context() {
  const declarations = [...source.matchAll(/^def (\S+)\(([^)]*)\):[^]*?return r"""%js ([^]*?)"""/gm)]
    .map((match) => `function ${match[1]}(${match[2]}) {return ${match[3]};}`);
  class KeyboardInterrupt extends Error {}
  const globals = { KeyboardInterrupt, ρσ_exception_value: (value) => value };
  return runInNewContext(`${declarations.join("\n")}; ({${names.join(",")}, globalThis})`, globals);
}

test("shared bootstrap has four adapters and one shared metadata copier", () => {
  assert.deepEqual([...source.matchAll(/^def (\S+)\(/gm)].map((match) => match[1]), names);
  for (const filename of ["compiler_bootstrap.py", "sagejs_bootstrap.py"]) {
    const previous = readFileSync(join(root, "src/baselib", filename), "utf8");
    for (const name of names) assert.ok(!previous.includes(`def ${name}(`));
  }
  const graph = JSON.parse(readFileSync(join(root, "architecture/package-graph.json"), "utf8"));
  assert.ok(graph.packages.find(entry => entry.id === "core-runtime").files
    .includes("src/baselib/bootstrap_shared.py"));
});

test("shared receiver adapters preserve binding, metadata getters, and cache identity", () => {
  const api = context();
  function explicit(receiver, value) { return [receiver, value]; }
  explicit.__argnames__ = ["self", "value"];
  let defaults = [7];
  Object.defineProperty(explicit, "__defaults__", { get: () => defaults });
  explicit.__name__ = "explicit";
  const native = api.ρσ_native_method_adapter(explicit);
  const receiver = {};
  assert.deepEqual(native.call(receiver, 3), [receiver, 3]);
  assert.deepEqual(Array.from(native.__argnames__), ["value"]);
  assert.equal(native.__name__, "explicit");
  assert.equal(native.__sagejs_native_method__, true);
  defaults = [9];
  assert.equal(native.__defaults__, defaults);

  function host(value) { return [this, value]; }
  host.__argnames__ = ["value"];
  Object.defineProperty(host, "__defaults__", { get: () => defaults });
  const unbound = api.ρσ_unbound_method_adapter(host);
  assert.deepEqual(unbound(receiver, 5), [receiver, 5]);
  assert.deepEqual(Array.from(unbound.__argnames__), ["self", "value"]);
  assert.equal(unbound.__func__, host);
  assert.equal(unbound.__python_descriptor__, true);
  assert.equal(api.ρσ_unbound_method_adapter(host), unbound);
  defaults = [11];
  assert.equal(unbound.__defaults__, defaults);
});

const metadataFields = [
  "__annotations__", "__annotations_text__", "__code__", "__defaults__",
  "__doc__", "__globals__", "__handles_kwarg_interpolation__", "__kwdefaults__",
  "__kwonly__", "__module__", "__name__", "__positional_only__", "__python_type__",
  "__qualname__", "__varargs__", "__varkw__",
];

test("metadata copier preserves per-field descriptor/read/write order", () => {
  const api = context();
  const events = [];
  const values = Object.fromEntries(metadataFields.map((name, index) => [name, index]));
  const getter = () => { throw new Error("live defaults must not be read while copying"); };
  Object.defineProperty(values, "__defaults__", {get: getter, configurable: false});
  const target = new Proxy(values, {
    getOwnPropertyDescriptor(object, name) {
      events.push(["descriptor", name]);
      return Reflect.getOwnPropertyDescriptor(object, name);
    },
    get(object, name) {
      events.push(["get", name]);
      return Reflect.get(object, name);
    },
  });
  const copied = {};
  const method = new Proxy(copied, {
    set(object, name, value) {
      events.push(["set", name]);
      return Reflect.set(object, name, value);
    },
    defineProperty(object, name, descriptor) {
      events.push(["define", name]);
      return Reflect.defineProperty(object, name, descriptor);
    },
  });
  api.ρσ_copy_method_metadata(method, target);
  assert.deepEqual(events, metadataFields.flatMap(name => name === "__defaults__"
    ? [["descriptor", name], ["define", name]]
    : [["descriptor", name], ["get", name], ["set", name]]));
  assert.deepEqual(Object.getOwnPropertyDescriptor(copied, "__defaults__"),
    Object.getOwnPropertyDescriptor(values, "__defaults__"));
  for (const name of metadataFields.filter(name => name !== "__defaults__")) {
    assert.equal(copied[name], values[name]);
  }
});

test("metadata copying propagates descriptor and destination failures in order", () => {
  const api = context();
  for (const failure of ["descriptor", "write"]) {
    const events = [];
    const error = new Error(failure);
    const target = new Proxy({}, {
      getOwnPropertyDescriptor(object, name) {
        events.push(["descriptor", name]);
        if (failure === "descriptor" && name === "__code__") throw error;
        return Reflect.getOwnPropertyDescriptor(object, name);
      },
      get(object, name) { events.push(["get", name]); return name; },
    });
    const method = new Proxy({}, {
      set(object, name, value) {
        events.push(["set", name]);
        if (failure === "write" && name === "__code__") throw error;
        return Reflect.set(object, name, value);
      },
    });
    assert.throws(() => api.ρσ_copy_method_metadata(method, target), value => value === error);
    const prefix = metadataFields.slice(0, 2).flatMap(name =>
      [["descriptor", name], ["get", name], ["set", name]]);
    assert.deepEqual(events, prefix.concat(failure === "descriptor"
      ? [["descriptor", "__code__"]]
      : [["descriptor", "__code__"], ["get", "__code__"], ["set", "__code__"]]));
  }
});

test("adapter argument names precede metadata and unbound cache publication follows it", () => {
  const api = context();
  for (const kind of ["native", "unbound"]) {
    const events = [];
    function original() {}
    original.__argnames__ = kind === "native" ? ["self", "value"] : ["value"];
    const target = new Proxy(original, {
      get(object, name) { events.push(["get", name]); return Reflect.get(object, name); },
      getOwnPropertyDescriptor(object, name) {
        events.push(["descriptor", name]);
        return Reflect.getOwnPropertyDescriptor(object, name);
      },
      set(object, name, value) {
        events.push(["set", name]);
        assert.equal(name, "__sagejs_unbound_adapter__");
        assert.equal(value.__func__, target);
        assert.equal(value.__python_descriptor__, true);
        return Reflect.set(object, name, value);
      },
    });
    const adapter = api[kind === "native" ? "ρσ_native_method_adapter" : "ρσ_unbound_method_adapter"](target);
    const expected = kind === "unbound" ? [["get", "__sagejs_unbound_adapter__"]] : [];
    expected.push(["get", "__argnames__"], ["get", "__argnames__"]);
    expected.push(...metadataFields.flatMap(name => [["descriptor", name], ["get", name]]));
    if (kind === "unbound") expected.push(["set", "__sagejs_unbound_adapter__"]);
    assert.deepEqual(events, expected);
    assert.deepEqual(Array.from(adapter.__argnames__), kind === "native" ? ["value"] : ["self", "value"]);
    events.length = 0;
    if (kind === "unbound") {
      assert.equal(api.ρσ_unbound_method_adapter(target), adapter);
      assert.deepEqual(events, [["get", "__sagejs_unbound_adapter__"], ["get", "__sagejs_unbound_adapter__"]]);
    } else {
      assert.equal(adapter.__sagejs_native_method__, true);
    }
  }
});

test("shared interruption adapters retain native errors and consume interrupt flags", () => {
  const api = context();
  const ordinary = new Error("ordinary");
  assert.equal(api.ρσ_normalize_exception(ordinary), ordinary);
  assert.equal(api.ρσ_check_interrupt(), undefined);
  const state = new Int32Array(new SharedArrayBuffer(4));
  api.globalThis.__sagejs_interrupt_state__ = state;
  Atomics.store(state, 0, 1);
  assert.throws(() => api.ρσ_check_interrupt(), api.globalThis.KeyboardInterrupt);
  assert.equal(Atomics.load(state, 0), 0);
  assert.equal(api.ρσ_check_interrupt(), undefined);
  Atomics.store(state, 0, 1);
  const normalized = api.ρσ_normalize_exception({ code: "ERR_SCRIPT_EXECUTION_INTERRUPTED" });
  assert.ok(normalized instanceof api.globalThis.KeyboardInterrupt);
  assert.equal(Atomics.load(state, 0), 0);
});

test("both bootstrap layouts initialize shared adapters before builtins", () => {
  const self = readFileSync(join(root, "tools/self.js"), "utf8");
  const selected = self.match(/const COMPILER_BASELIB_MODULES = new Set\(([^]*?)\);/)[1];
  assert.ok(runInNewContext(selected).includes("bootstrap_shared.py"));
  const legacySort = self.match(/items.sort\((function[^]*?)\n  \}\);/)[1] + "\n}";
  const sort = runInNewContext(`(${legacySort})`);
  const lexicalPriority = self.match(/const priority = (function[^]*?)\n      \};/)[1] + "\n}";
  const priority = runInNewContext(`(${lexicalPriority})`);
  for (const bootstrap of ["compiler_bootstrap.py", "sagejs_bootstrap.py"]) {
    const files = ["errors.py", "builtins.py", bootstrap, "bootstrap_shared.py", "runtime_primitives.py"];
    assert.deepEqual(files.slice().sort(sort).slice(0, 3),
      ["runtime_primitives.py", "bootstrap_shared.py", "builtins.py"]);
    assert.deepEqual(files.slice().sort((a, b) => priority({ filename: a }) - priority({ filename: b })),
      ["runtime_primitives.py", "bootstrap_shared.py", bootstrap, "builtins.py", "errors.py"]);
  }
});
