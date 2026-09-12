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
const names = ["ρσ_native_method_adapter", "ρσ_unbound_method_adapter",
  "ρσ_check_interrupt", "ρσ_normalize_exception"];

// Exercise the unchanged native ABI bodies directly; full self-hosted/module
// linkage remains a separate build qualification, not implied by this test.
function context() {
  const declarations = [...source.matchAll(/^def (\S+)\(([^)]*)\):[^]*?return r"""%js ([^]*?)"""/gm)]
    .map((match) => `function ${match[1]}(${match[2]}) {return ${match[3]};}`);
  class KeyboardInterrupt extends Error {}
  const globals = { KeyboardInterrupt, ρσ_exception_value: (value) => value };
  return runInNewContext(`${declarations.join("\n")}; ({${names.join(",")}, globalThis})`, globals);
}

test("shared bootstrap has exactly the four moved adapters and unique ownership", () => {
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
