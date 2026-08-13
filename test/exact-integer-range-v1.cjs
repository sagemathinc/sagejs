#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

async function main() {
  const session = await createSage();
  try {
    const pythonSource = [
      "cases = [",
      "    list(range(5)),",
      "    list(range(5, -2, -2)),",
      "    list(range(3, 3)),",
      "    list(range(-4, 7, 3)),",
      "    list(range(9007199254740990, 9007199254740995)),",
      "]",
      "first = iter(range(1, 8, 2))",
      "second = iter(range(1, 8, 2))",
      "exhausted = iter(range(1))",
      "only = next(exhausted)",
      "fallback = next(exhausted, 'done')",
      "stopped = False",
      "try:",
      "    next(exhausted)",
      "except StopIteration:",
      "    stopped = True",
      "protocol = [",
      "    iter(first) is first,",
      "    next(first),",
      "    next(first),",
      "    list(first),",
      "    list(second),",
      "    list(range(1, 8, 2)),",
      "    [(left, right) for left in range(3) for right in range(2)],",
      "    [only, fallback, stopped],",
      "]",
      "print(repr([cases, protocol]))",
    ].join("\n");
    const cpython = spawnSync(pythonExecutable(), ["-c", pythonSource], {
      encoding: "utf8",
    });
    assert.equal(cpython.error, undefined, cpython.error?.message);
    assert.equal(cpython.status, 0, cpython.stderr);

    const sagePython = await session.evaluate(pythonSource);
    assert.equal(sagePython.stderr ?? "", "");
    assert.equal(sagePython.stdout.trim(), cpython.stdout.trim());

    const sageRanges = await session.evaluate([
      "import sagejs.runtime as runtime",
      "assert [1..5] == [1, 2, 3, 4, 5]",
      "assert [5..1] == [5]",
      "assert [4..4] == [4]",
      "assert [1,3..8] == [1, 3, 5, 7]",
      "assert [5,3..0] == [5, 3, 1]",
      "assert [3,1..5] == [3, 1]",
      "assert [9007199254740990..9007199254740994] == [",
      "    9007199254740990, 9007199254740991, 9007199254740992,",
      "    9007199254740993, 9007199254740994",
      "]",
      "assert [9007199254740990,9007199254740991..9007199254740994] == [",
      "    9007199254740990, 9007199254740991, 9007199254740992,",
      "    9007199254740993, 9007199254740994",
      "]",
      "assert [1.5..3.5] == [1.5, 2.5, 3.5]",
      "assert [QQ(1,2)..QQ(5,2)] == [QQ(1,2), QQ(3,2), QQ(5,2)]",
      "assert [pi,pi+1..pi+3] == [pi, pi+1, pi+2, pi+3]",
      "assert [1,2,4..9] == [1, 2, 4, 6, 8]",
      "assert [False..3] == [False, 1, 2, 3]",
      "class MarkedIterable:",
      "    __sagejs_range__ = True",
      "    def __iter__(self):",
      "        yield 11",
      "        yield 13",
      "assert list(MarkedIterable()) == [11, 13]",
      "huge = iter(range(10**30))",
      "assert [next(huge), next(huge), next(huge)] == [0, 1, 2]",
      "failures = 0",
      "for operation in [",
      "    lambda: range(1, 5, 0),",
      "    lambda: [1,1..5],",
      "    lambda: runtime.exact_integer_range_values(0, 1, 2**32),",
      "    lambda: runtime.exact_integer_range_values(0, 1, -1),",
      "    lambda: runtime.exact_integer_range_values(0.5, 1, 2),",
      "    lambda: runtime.exact_integer_range_iterator(0, 0, 2),",
      "]:",
      "    try:",
      "        operation()",
      "    except:",
      "        failures += 1",
      "assert failures == 6",
      "print('exact integer ranges passed')",
    ].join("\n"));
    assert.equal(sageRanges.stderr ?? "", "");
    assert.equal(sageRanges.stdout.trim(), "exact integer ranges passed");
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
