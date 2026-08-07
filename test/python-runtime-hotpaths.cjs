"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("optimized calls, equality, and indexing retain Python semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "def increment(value):",
    "    return value + 1",
    "increment.__call__ = lambda value: 1000",
    "class Callable:",
    "    def __call__(self, value):",
    "        return value + 2",
    "print(increment(4), Callable()(4))",
    "print(True == 1, 1 == 1.0, 10**20 == 1e20)",
    "print('same' == 'same', 'left' == 'right')",
    "print([1, 2] == [1, 2], (1, 2) == (1, 2))",
    "values = [10, 20, 30]",
    "frozen = (40, 50, 60)",
    "print(values[0], values[-1], frozen[1])",
    "class Alias:",
    "    @classmethod",
    "    def __class_getitem__(cls, key):",
    "        return (cls.__name__, key)",
    "print(Alias['parameter'])",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "5 6",
    "True True True",
    "True False",
    "True True",
    "10 30 50",
    "('Alias', 'parameter')",
  ].join("\n"));
});
