"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluator,
} = require("../dist/tools/kernel-evaluator.js");

test("Pool.map and starmap use persistent isolated evaluators", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool, cpu_count, get_start_method",
      "import os",
      "def affine(x):",
      "    return 3*x + 7",
      "def pair(x):",
      "    return (x, x + 1)",
      "def add(x, y):",
      "    return x + y",
      "p = Pool(2)",
      "print(p.map(affine, [4, 1, 9, 2]))",
      "pairs = p.map(pair, [10, 20])",
      "print(pairs, isinstance(pairs[0], tuple))",
      "print(p.starmap(add, [(1, 2), (10, 20), (100, 7)]))",
      "print(p.map(os.path.basename, ['/a/b', '/x/y']))",
      "print(p.map(affine, [10**30]))",
      "print(cpu_count() >= 1, get_start_method())",
      "p.close()",
      "p.join()",
      "try:",
      "    p.map(affine, [1])",
      "except ValueError as error:",
      "    print(type(error).__name__, str(error))",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    [
      "[19, 10, 34, 13]",
      "[(10, 11), (20, 21)] True",
      "[3, 30, 107]",
      "['b', 'y']",
      "[3000000000000000000000000000007]",
      "True sagejs-worker",
      "ValueError Pool not running",
    ].join("\n"),
  );
});

test("Pool.map propagates worker exceptions with their Python type", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
      [
        "from multiprocessing import Pool",
        "def quotient(x):",
        "    return 1 // x",
        "try:",
        "    with Pool(2) as p:",
        "        p.map(quotient, [2, 1, 0, 3])",
        "except ZeroDivisionError as error:",
        "    print(type(error).__name__, str(error))",
      ].join("\n"),
    );
  assert.equal(
    result.stdout.trim(),
    "ZeroDivisionError integer division or modulo by zero",
  );
});

test("warm Pool.map tasks execute concurrently", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool",
      "from time import sleep, time",
      "p = Pool(4)",
      "p.map(sleep, [0.01, 0.01, 0.01, 0.01])",
      "started = time()",
      "p.map(sleep, [0.2, 0.2, 0.2, 0.2])",
      "elapsed = time() - started",
      "p.close()",
      "print(elapsed < 0.65)",
    ].join("\n"),
  );
  assert.equal(result.stdout.trim(), "True");
});

test("multiprocessing imports without a worker host capability", () => {
  const output = [];
  const evaluator = createKernelEvaluator({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  delete global.__sagejs_host__;
  try {
    evaluator.evaluate(
      [
        "from multiprocessing import Pool",
        "print(Pool.__name__)",
        "try:",
        "    Pool(1)",
        "except NotImplementedError as error:",
        "    print(type(error).__name__, str(error))",
      ].join("\n"),
    );
    assert.equal(
      output.join("").trim(),
      [
        "Pool",
        "NotImplementedError multiprocessing requires a worker-thread host capability",
      ].join("\n"),
    );
  } finally {
    evaluator.close();
  }
});
