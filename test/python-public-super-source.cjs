// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Script, createContext } = require("node:vm");
const { test } = require("node:test");
const esbuild = require("esbuild");

const root = join(__dirname, "..");
const builtinSource = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
const moduleSource = readFileSync(join(root, "src/output/modules.py"), "utf8");
const bootstrapSource = readFileSync(join(root, "tools/runtime-bootstrap.ts"), "utf8");

test("baselib publishes the public super spelling explicitly", () => {
  assert.doesNotMatch(builtinSource, /^super =/m);
  assert.match(builtinSource, /^runtime\.reflect\.set\(runtime\.global_object, "super", ρσ_py_super\)$/m);
});

const beginning = moduleSource.indexOf('            "if (!ρσ_modules.builtins');
assert.ok(beginning >= 0);
const end = moduleSource.indexOf("\n        )", beginning);
assert.ok(end > beginning);
// This emitter block consists solely of adjacent ordinary string literals.
// Evaluate those literals only; do not run Python code or a Sage compiler.
const lines = moduleSource.slice(beginning, end).split("\n");
for (const line of lines) assert.match(line.trim(), /^(["']).*\1$/);
const standaloneSource = new Script(lines.join(" +\n")).runInNewContext();
const nodeBeginning = bootstrapSource.indexOf('  const moduleRegistry = Reflect.get(globalThis, "ρσ_modules");');
const nodeEnd = bootstrapSource.indexOf("\n  const loading = new Set<string>();", nodeBeginning);
assert.ok(nodeBeginning >= 0 && nodeEnd > nodeBeginning);
const nodeSource = esbuild.transformSync(bootstrapSource.slice(nodeBeginning, nodeEnd), {
  loader: "ts", format: "cjs", target: "es2022",
}).code;

for (const host of ["node-facade", "standalone-facade"]) {
  test(`${host}: public super supports identity, mutation, deletion, and enumeration`, () => {
    const original = function originalSuper() {};
    const replacement = function replacementSuper() {};
    const context = createContext({
      super: original, ρσ_py_super: original, ρσ_modules: {},
      __sagejs_baselib_facade_names__: ["ρσ_py_super"],
      __sagejs_baselib_modules__: { "sagejs._baselib.builtins": { ρσ_py_super: original } },
      abs: Math.abs, ρσ_open() {}, __build_class__() {}, __import__() {},
    });
    new Script(host === "node-facade" ? nodeSource : standaloneSource).runInContext(context);
    const builtins = context.ρσ_modules.builtins;
    assert.equal(builtins.super, original);
    assert.ok(Object.keys(builtins).includes("super"));
    assert.equal(Reflect.set(builtins, "super", replacement), true);
    assert.equal(builtins.super, replacement);
    assert.equal(context.super, replacement, "global fallback sees the public write");
    assert.equal(context.ρσ_py_super, original, "internal implementation identity is not overwritten");
    assert.equal(Reflect.deleteProperty(builtins, "super"), true);
    assert.equal(Reflect.has(builtins, "super"), false);
    assert.equal(builtins.super, undefined);
    assert.equal(Reflect.has(context, "super"), false, "deletion cannot resurrect through global fallback");
    assert.ok(!Object.keys(builtins).includes("super"));
    assert.equal(Reflect.set(builtins, "super", original), true);
    assert.equal(builtins.super, original);
    assert.ok(Object.keys(builtins).includes("super"));
    if (host === "standalone-facade") {
      assert.equal(builtins.abs(-3), 3, "pre-existing standalone accessors remain intact");
      assert.equal(builtins.process, undefined, "the adapter does not expose arbitrary host globals");
    }
  });
}

test("standalone facade is emitted without requiring an explicit builtins import", () => {
  assert.match(moduleSource, /if not output.options.baselib_module_id and output.options.standalone_builtins:/);
  assert.match(readFileSync(join(root, "src/output/stream.py"), "utf8"), /"standalone_builtins": True/);
  assert.match(bootstrapSource, /standalone_builtins: false/);
});

test("standalone facade filters exports and preserves ordinary builtin writes and deletion", () => {
  const dir = function directory() {};
  const len = function length() {};
  const isinstance = function instanceCheck() {};
  const replacement = function replacement() {};
  const context = createContext({
    super() {}, ρσ_modules: {},
    __sagejs_baselib_facade_names__: ["dir", "len", "isinstance", "super"],
    __sagejs_baselib_modules__: {
      "sagejs._baselib.builtins": {dir, isinstance, hidden: 1},
      "sagejs._baselib.containers": {len},
      "sagejs.runtime": {dir: replacement, len: replacement},
      "sagejs": {dir: replacement},
      "unrelated": {isinstance: replacement},
    },
    abs: Math.abs, ρσ_open() {}, __build_class__() {}, __import__() {},
  });
  new Script(standaloneSource).runInContext(context);
  const builtins = context.ρσ_modules.builtins;
  for (const [name, original] of Object.entries({dir, len, isinstance})) {
    assert.equal(builtins[name], original);
    assert.ok(Object.keys(builtins).includes(name));
    builtins[name] = replacement;
    assert.equal(builtins[name], replacement);
    assert.equal(Reflect.deleteProperty(builtins, name), true);
    assert.equal(name in builtins, false);
    assert.equal(builtins[name], undefined);
    assert.ok(!Object.keys(builtins).includes(name));
    // Reinitialization must not resurrect a deleted builtin.
    new Script(standaloneSource).runInContext(context);
    assert.equal(name in builtins, false);
    builtins[name] = original;
    assert.equal(builtins[name], original);
  }
  assert.equal(builtins.hidden, undefined);
  assert.equal(builtins.process, undefined);
  assert.equal(builtins.__name__, "builtins");
});

test("standalone initialization retains an existing Node builtin proxy", () => {
  const context = createContext({
    super() {}, ρσ_modules: {},
    __sagejs_baselib_facade_names__: ["super"],
    __sagejs_baselib_modules__: {},
  });
  new Script(nodeSource).runInContext(context);
  const original = context.ρσ_modules.builtins;
  new Script(standaloneSource).runInContext(context);
  assert.equal(context.ρσ_modules.builtins, original);
});
