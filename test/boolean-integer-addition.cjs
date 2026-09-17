// sagejs-test-tier: integration
"use strict";

// A Python `bool` is an `int`, including where the sum leaves the range a
// JavaScript number holds exactly.  Expected values are CPython's, from a run
// of the same statements.

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("adding a boolean keeps the sum an exact integer", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "a = 9007199254740991",  // 2**53 - 1
      // The sum is 2**53, which a double still holds -- so this prints
      // correctly whether or not it is an integer.  The type is the tell.
      "print(repr(True + a), type(True + a) is int, type(a + True) is int)",
      // And this is where a float would go wrong, one operation later.
      "print(repr((True + a) + a), repr(a + True + a))",
      "print(repr(sum([True, a, a])), repr(1 + a + a))",
      // Below the boundary nothing changes, and False is still zero.
      "print(repr(True + True), repr(True + 1), repr(False + a), type(False + a) is int)",
      // A boolean added to a float is still a float.
      "print(repr(True + 1.5), type(True + 1.5) is float)",
      // Both operands boolean, at no boundary at all.
      "print(repr(True + False), type(True + False) is int)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "9007199254740992 True True",
      "18014398509481983 18014398509481983",
      "18014398509481983 18014398509481983",
      "2 2 9007199254740991 True",
      "2.5 True",
      "1 True",
    ].join("\n"),
  );
});

test("exact integer in-place addition preserves object and primitive dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "value = 9007199254740991",
      "value += True",
      "print(repr(value), type(value) is int)",
      "value += 1",
      "print(repr(value), type(value) is int)",
      "text = 'ab'",
      "text += 'cd'",
      "number = 1.5",
      "number += 2.5",
      "print(text, repr(number), type(number) is float)",
      "class UsesIadd:",
      "    def __init__(self):",
      "        self.calls = []",
      "    def __iadd__(self, other):",
      "        self.calls.append(('iadd', other))",
      "        return self",
      "    def __add__(self, other):",
      "        raise AssertionError('__add__ must not run')",
      "item = UsesIadd()",
      "same = item",
      "item += 7",
      "print(item is same, item.calls)",
      "class UsesAdd:",
      "    def __add__(self, other):",
      "        return ('add', other)",
      "fallback = UsesAdd()",
      "fallback += 8",
      "print(fallback)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "9007199254740992 True",
      "9007199254740993 True",
      "abcd 4.0 True",
      "True [('iadd', 7)]",
      "('add', 8)",
    ].join("\n"),
  );
});
