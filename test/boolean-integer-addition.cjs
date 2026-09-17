// sagejs-test-tier: integration
"use strict";

// A Python `bool` is an `int`, including where the sum leaves the range a
// JavaScript number holds exactly.  Expected values are CPython's, from a run
// of the same statements.

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { runInNewContext } = require("node:vm");

const { createSage } = require("../dist/tools/kernel.js");

test("native exact-add fast path preserves integers and delegates other values", () => {
  const source = readFileSync(join(__dirname, "..", "src", "baselib", "builtins.py"), "utf8");
  const match = source.match(
    /^def ρσ_operator_add_exact\(([^)]*)\)\s*->\s*Any:[^]*?return r"""%js ([^]*?)"""/m,
  );
  assert.ok(match);
  const parameters = match[1].replace(/:\s*[^,]+/g, "");
  const missing = {};
  const delegated = [];
  const exactAdd = runInNewContext(
    `(function(${parameters}) {return ${match[2]};})`,
    {
      _BUILTINS_MISSING: missing,
      ρσ_fast_closed_binary: () => missing,
      _builtins_operator_add_exact_slow: (left, right) => {
        delegated.push([left, right]);
        return "delegated";
      },
    },
  );
  assert.equal(exactAdd(2, 3), 5);
  assert.equal(exactAdd(true, true), 2);
  assert.equal(exactAdd(false, -0), 0);
  assert.equal(Object.is(exactAdd(false, -0), -0), false);
  assert.equal(exactAdd(Number.MAX_SAFE_INTEGER, 1), 9007199254740992n);
  assert.equal(exactAdd(3n, 4), 7n);
  assert.equal(exactAdd(1.5, 2), "delegated");
  assert.equal(exactAdd("a", "b"), "delegated");
  assert.deepEqual(delegated, [[1.5, 2], ["a", "b"]]);
});

test("native exact-iadd guard delegates mutable and mixed operands", () => {
  const source = readFileSync(join(__dirname, "..", "src", "baselib", "builtins.py"), "utf8");
  const match = source.match(
    /^def ρσ_operator_iadd_exact\(([^)]*)\)\s*->\s*Any:[^]*?return r"""%js ([^]*?)"""/m,
  );
  assert.ok(match);
  const parameters = match[1].replace(/:\s*[^,]+/g, "");
  const calls = [];
  const exactIadd = runInNewContext(
    `(function(${parameters}) {return ${match[2]};})`,
    {
      ρσ_operator_add_exact: (left, right) => {
        calls.push(["add", left, right]);
        return left + right;
      },
      _builtins_inplace: (left, right, name) => {
        calls.push([name, left, right]);
        return "delegated";
      },
    },
  );
  assert.equal(exactIadd(2, 3), 5);
  assert.equal(exactIadd("a", "b"), "ab");
  assert.equal(exactIadd({}, {}), "delegated");
  assert.equal(exactIadd(2, 3n), "delegated");
  assert.deepEqual(calls.map(call => call[0]), ["add", "add", "__iadd__", "__iadd__"]);
});

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
