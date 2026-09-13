// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const test = require("node:test");

function resolver() {
  // Expose the actual built helper, without replacing its implementation.
  const source = readFileSync(join(__dirname, "../dist/compiler/compiler.js"), "utf8");
  assert.match(source, /\}\)\(\);\s*$/u);
  const realm = { console, require, __sagejs_runtime_require__: require, exports: {} };
  runInNewContext(source.replace(/\}\)\(\);\s*$/u,
    "globalThis.lookupProbe={resolve:ρσ_resolve_module_name,deleted:_BUILTINS_DELETED_BUILTIN,NameError};})();"), realm);
  return { ...realm.lookupProbe, realm };
}

test("module namespace lookup preserves Proxy membership/read order and mutation", () => {
  const { resolve } = resolver();
  const events = [];
  let value = 2;
  const target = Object.create({ inherited: 7 });
  Object.defineProperty(target, "answer", { configurable: true, get() {
    events.push("getter"); return value;
  } });
  const namespace = new Proxy(target, {
    has(object, name) { events.push(`has:${name}`); return Reflect.has(object, name); },
    get(object, name, receiver) {
      events.push(`get:${name}`); return Reflect.get(object, name, receiver);
    },
  });
  assert.equal(resolve(99, "answer", namespace, {}), 2);
  assert.deepEqual(events.splice(0), ["has:answer", "get:answer", "getter"]);
  value = 3;
  assert.equal(resolve(99, "answer", namespace, {}), 3);
  assert.deepEqual(events.splice(0), ["has:answer", "get:answer", "getter"]);
  assert.equal(resolve(undefined, "inherited", namespace, {}), 7);
  assert.deepEqual(events.splice(0), ["has:inherited", "get:inherited"]);
  delete target.answer;
  assert.equal(resolve(99, "answer", namespace, {}), 99);
  assert.deepEqual(events.splice(0), ["has:answer"]);
  const hidden = new Proxy({ answer: 5 }, {
    has() { return false; }, get() { throw Error("read despite absent membership"); },
  });
  assert.equal(resolve(99, "answer", hidden, {}), 99);
});

test("undefined bindings, sentinels and fallback representations retain their rules", () => {
  const { resolve, deleted, realm, NameError } = resolver();
  const namespace = Object.create(null);
  let reads = 0;
  Object.defineProperty(namespace, "answer", { get() { reads++; return undefined; } });
  assert.equal(resolve(undefined, "answer", namespace, { answer: 17 }), 17);
  assert.equal(reads, 1);
  realm.answer = 999;
  assert.throws(() => resolve(undefined, "answer", namespace, {}), NameError);
  assert.equal(resolve(undefined, "answer", {}, {}), 999);
  assert.throws(() => resolve(deleted, "answer", { answer: 7 }, {}), NameError);
  const cleared = realm.ρσ_cleared_exception = {};
  assert.equal(resolve(cleared, "answer", { answer: cleared }, {}), cleared);
  const builtins = { answer: 19, __sagejs_explicit_builtin_names__: new Set(["answer"]) };
  assert.equal(resolve(cleared, "answer", { answer: cleared }, builtins), 19);
  builtins.answer = 20;
  assert.equal(resolve(undefined, "answer", namespace, builtins), 20);
  function functionNamespace() {}
  functionNamespace.answer = 23;
  assert.equal(resolve(undefined, "answer", functionNamespace, {}), 23);
  assert.equal(resolve(undefined, "length", "abc", {}), 3);
  assert.equal(resolve(undefined, "answer", null, { answer: 29 }), 29);
  assert.equal(resolve(undefined, "answer", undefined, { answer: 31 }), 31);
});

test("reusable Python globals stay live across writes, deletions and builtin fallback", async (t) => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const errors = [];
  session.on("stderr", (text) => errors.push(text));
  await session.evaluate("globals()['dynamic_value'] = 11\ndef read_value():\n    return dynamic_value\nassert read_value() == 11");
  await session.evaluate("globals()['dynamic_value'] = 12\nassert read_value() == 12");
  const result = await session.evaluate([
    "del globals()['dynamic_value']",
    "try: read_value()",
    "except NameError: pass",
    "else: raise AssertionError('stale module value')",
    "len = len([1, 2])",
    "assert len == 2",
    "del len",
    "assert len([1, 2, 3]) == 3",
    "if True:",
    "    from math import sqrt",
    "assert sqrt(4) == 2",
    "from math import *",
    "assert floor(2.5) == 2",
    "print('live namespace passed')",
  ].join("\n"));
  assert.equal(result.stdout, "live namespace passed\n");
  assert.deepEqual(errors, []);
});
