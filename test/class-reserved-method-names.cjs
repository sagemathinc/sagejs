// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

// Every public method is also published on the constructor so the unbound
// function is reachable, but a JavaScript function already owns `length`,
// `name`, `caller` and `arguments`, and the first two are not writable.  An
// ordinary assignment therefore throws inside the strict-mode wrapper the
// compiler emits, which took out any class defining a method with one of those
// names -- `Partition.length()` in Sage's combinatorics API, for one.
const PROGRAM = [
  "class Box:",
  "    def __init__(self, items):",
  "        self._items = items",
  "    def __len__(self):",
  "        return len(self._items)",
  "    def length(self):",
  "        return len(self._items)",
  "    def name(self):",
  "        return 'box'",
  "    def caller(self):",
  "        return 'caller'",
  "    def arguments(self):",
  "        return 'arguments'",
  "b = Box([1, 2, 3])",
  "[len(b), b.length(), b.name(), b.caller(), b.arguments()]",
].join("\n");

test("a class may define methods named like function properties", async () => {
  const session = await createSage({ mode: "python" });
  try {
    assert.equal(
      (await session.evaluate(PROGRAM)).repr,
      "[3, 3, 'box', 'caller', 'arguments']",
    );
    // The unbound method is reachable on the class, as it is for any other name.
    assert.equal(
      (await session.evaluate("Box.length(b)")).repr,
      "3",
    );
  } finally {
    await session.close();
  }
});
