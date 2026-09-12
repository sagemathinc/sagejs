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

function setup() {
  const match = source.match(/ρσ_handled_state = r"""%js ([^]*?)"""/);
  assert.ok(match, "exercise the actual counted source helper");
  class RuntimeError extends Error {}
  const context = { RuntimeError };
  const state = runInNewContext(match[1], context);
  return { state, active: () => context.__sagejs_last_exception__, context, RuntimeError };
}

test("handler ownership is identity based and the cross-module accessor is read-only", () => {
  const { state, active, context, RuntimeError } = setup();
  const outer = new Error("outer");
  const inner = new Error("inner");
  const a = state.enter(outer);
  const b = state.enter(inner);
  assert.equal(state.reraise(), inner);
  state.leave(b);
  assert.equal(state.reraise(), outer);
  state.leave(a);
  assert.equal(active(), null);
  assert.throws(() => state.reraise(), RuntimeError);
  assert.equal(Object.getOwnPropertyDescriptor(context, "__sagejs_last_exception__").set, undefined);
});

test("a handler-free generator inherits each current resumer", () => {
  const { state, active } = setup();
  const iterator = state.wrap((function* () { yield active(); yield active(); })());
  assert.equal(state.wrap(iterator), iterator);
  for (const error of [new Error("first"), new Error("second")]) {
    const caller = state.enter(error);
    assert.equal(iterator.next().value, error);
    assert.equal(active(), error);
    state.leave(caller);
    assert.equal(active(), null);
  }
  assert.equal(iterator.next().done, true);
});

test("resume adapters remain inherited and preserve the native generator prototype chain", () => {
  const { state, active } = setup();
  function* generator() { yield 1; yield 2; }
  const first = generator();
  const second = generator();
  const original = Object.getPrototypeOf(first);
  state.wrap(first);
  state.wrap(second);
  assert.equal(Object.getPrototypeOf(first), Object.getPrototypeOf(second));
  assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(first)), original);
  for (const name of ["next", "throw", "return"]) {
    assert.equal(Object.hasOwn(first, name), false);
    assert.equal(Object.hasOwn(original, name), false);
  }
  assert.equal(first.next().value, 1);
  const extracted = first.next.bind(first);
  assert.equal(extracted().value, 2);
  assert.equal(first.next.call(second).value, 1);
  assert.throws(() => Reflect.apply(first.next, undefined, []), TypeError);
  assert.deepEqual(first.return(42), { done: true, value: 42 });
  const error = new Error("injected");
  assert.throws(() => second.throw(error), actual => actual === error);
  assert.equal(active(), null);
});

test("native return yielding in finally preserves ownership until done", () => {
  const { state, active } = setup();
  const owned = new Error("owned");
  const outer = new Error("outer");
  const iterator = state.wrap((function* () {
    const node = state.enter(owned);
    try {
      try { yield "start"; }
      finally { yield active(); assert.equal(active(), owned); }
    } finally { state.leave(node); }
  })());
  assert.equal(iterator.next().value, "start");
  assert.equal(active(), null);
  const caller = state.enter(outer);
  assert.deepEqual(iterator.return("return-value"), { done: false, value: owned });
  assert.equal(active(), outer);
  assert.deepEqual(iterator.next(), { done: true, value: "return-value" });
  assert.equal(active(), outer);
  state.leave(caller);
  assert.equal(active(), null);
});

test("native throw completion and raw result conversion restore the caller first", () => {
  const { state, active } = setup();
  const owned = new Error("owned");
  const outer = new Error("outer");
  class StopIteration extends Error {}
  const iterator = state.wrap((function* () {
    const node = state.enter(owned);
    try { yield 1; } finally { state.leave(node); }
  })());
  iterator.next();
  const caller = state.enter(outer);
  const stop = new StopIteration();
  assert.throws(() => iterator.throw(stop), error => error === stop);
  assert.equal(active(), outer);
  const result = iterator.next();
  assert.deepEqual(result, { done: true, value: undefined });
  // Python result-to-StopIteration conversion lives outside this native layer.
  assert.equal(active(), outer);
  state.leave(caller);
  assert.equal(active(), null);
});

test("reentrant native rejection and borrowed methods preserve receiver semantics", () => {
  const { state, active } = setup();
  const owned = new Error("owned");
  let iterator;
  iterator = state.wrap((function* () {
    const node = state.enter(owned);
    try {
      assert.throws(() => iterator.next(), /already running/);
      assert.equal(active(), owned);
      yield active();
    } finally { state.leave(node); }
  })());
  assert.throws(() => iterator.next.call({}), TypeError);
  assert.equal(iterator.next().value, owned);
  assert.equal(active(), null);
  iterator.return();
  const raw = (function* () { yield active(); })();
  const caller = state.enter(owned);
  assert.equal(iterator.next.call(raw).value, owned);
  state.leave(caller);
  assert.equal(active(), null);
});

test("delegated child ownership does not leak into a suspended parent", () => {
  const { state, active } = setup();
  const owned = new Error("owned");
  const outer = new Error("outer");
  const child = state.wrap((function* () {
    const node = state.enter(owned);
    try { yield active(); } finally { state.leave(node); }
  })());
  const parent = state.wrap((function* () {
    const node = state.enter(outer);
    try { yield* child; yield active(); } finally { state.leave(node); }
  })());
  assert.equal(parent.next().value, owned);
  assert.equal(active(), null);
  assert.equal(parent.next().value, outer);
  assert.equal(active(), null);
  parent.next();
  assert.equal(active(), null);
});

test("emitter replaces the old global writer and wraps before native throw binding", () => {
  const exceptions = readFileSync(join(root, "src/output/exceptions.py"), "utf8");
  assert.ok(!exceptions.includes("globalThis.__sagejs_last_exception__"));
  assert.ok(exceptions.includes("ρσ_last_exception = ρσ_Exception"));
  const functions = readFileSync(join(root, "src/output/functions.py"), "utf8");
  assert.ok(functions.indexOf("ρσ_handled_state.wrap(js_generator.apply") <
    functions.indexOf('output.assign("result.__native_throw__")'));
  const builtins = readFileSync(join(root, "src/baselib/builtins.py"), "utf8");
  assert.ok(builtins.includes("_builtins_generator_result(iterator.__native_throw__(exception))"));
  const lowerer = readFileSync(join(root, "tools/python/lowerer.ts"), "utf8");
  assert.ok(!lowerer.includes("catchDepth"));
});
