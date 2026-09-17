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

test("exact subtraction and multiplication preserve overflow and in-place dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "boundary = 9007199254740991",
      "print(repr(-boundary - 2), type(-boundary - 2) is int)",
      "print(repr(3037000500 * 3037000500), type(3037000500 * 3037000500) is int)",
      "print(repr(True - 2), repr(False * boundary))",
      "print(repr(4.0 - 1), type(4.0 - 1) is float)",
      "print(repr(2.0 * 3), type(2.0 * 3) is float)",
      "print('ab' * 3, 3 * 'cd')",
      "class UsesInPlace:",
      "    def __init__(self):",
      "        self.calls = []",
      "    def __isub__(self, other):",
      "        self.calls.append(('isub', other))",
      "        return self",
      "    def __imul__(self, other):",
      "        self.calls.append(('imul', other))",
      "        return self",
      "item = UsesInPlace()",
      "same = item",
      "item -= 7",
      "item *= 8",
      "print(item is same, item.calls)",
      "class UsesFallback:",
      "    def __sub__(self, other):",
      "        return ('sub', other)",
      "    def __mul__(self, other):",
      "        return ('mul', other)",
      "left = UsesFallback()",
      "subtracted = left",
      "subtracted -= 9",
      "multiplied = left",
      "multiplied *= 10",
      "print(subtracted, multiplied)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "-9007199254740993 True",
      "9223372037000250000 True",
      "-1 0",
      "3.0 True",
      "6.0 True",
      "ababab cdcdcd",
      "True [('isub', 7), ('imul', 8)]",
      "('sub', 9) ('mul', 10)",
    ].join("\n"),
  );
});

test("exact power preserves Python negatives and in-place dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print(repr(3 ** 7), type(3 ** 7) is int)",
      "print(repr(2 ** 53), type(2 ** 53) is int)",
      "print(repr((-2) ** 3), repr((-2) ** 4))",
      "print(repr(2 ** -1), type(2 ** -1) is float)",
      "negative_in_place = 2",
      "negative_in_place **= -1",
      "print(repr(negative_in_place), type(negative_in_place) is float)",
      "print(repr(2.0 ** 3), type(2.0 ** 3) is float)",
      "class UsesIpow:",
      "    def __init__(self):",
      "        self.calls = []",
      "    def __ipow__(self, other):",
      "        self.calls.append(('ipow', other))",
      "        return self",
      "item = UsesIpow()",
      "same = item",
      "item **= 5",
      "print(item is same, item.calls)",
      "class UsesPow:",
      "    def __pow__(self, other):",
      "        return ('pow', other)",
      "fallback = UsesPow()",
      "fallback **= 6",
      "print(fallback)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "2187 True",
      "9007199254740992 True",
      "-8 16",
      "0.5 True",
      "0.5 True",
      "8.0 True",
      "True [('ipow', 5)]",
      "('pow', 6)",
    ].join("\n"),
  );
});

test("exact bitwise operators preserve bools, wide integers, and in-place dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate(
    [
      "print(True & False, True | False, True ^ True)",
      "print(type(True & False) is bool, type(True | 2) is int)",
      "wide = 2 ** 60",
      "print(wide & (wide + 3), wide | 3, wide ^ 3)",
      "print(-1 & 5, -8 | 3, -8 ^ 3)",
      "a = 12345",
      "a &= 37",
      "b = 12345",
      "b |= 37",
      "c = 12345",
      "c ^= 37",
      "print(a, b, c)",
      "class UsesIand:",
      "    def __iand__(self, other):",
      "        return ('iand', other)",
      "item = UsesIand()",
      "item &= 9",
      "print(item)",
      "class UsesXor:",
      "    def __xor__(self, other):",
      "        return ('xor', other)",
      "fallback = UsesXor()",
      "fallback ^= 10",
      "print(fallback)",
    ].join("\n"),
  );
  assert.equal(
    result.stdout.trim(),
    [
      "False True False",
      "True True",
      "1152921504606846976 1152921504606846979 1152921504606846979",
      "5 -5 -5",
      "33 12349 12316",
      "('iand', 9)",
      "('xor', 10)",
    ].join("\n"),
  );
});
