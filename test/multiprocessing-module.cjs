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
      "print(p.apply(add, (20, 22)))",
      "def affine_keywords(x, scale=1, shift=0):",
      "    return scale*x + shift",
      "print(p.apply(affine_keywords, (5,), {'scale': 7, 'shift': 2}))",
      "print(list(p.imap(affine, [3, 5, 7])))",
      "print(sorted(p.imap_unordered(affine, [3, 5, 7])))",
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
      "42",
      "37",
      "[16, 22, 28]",
      "[16, 22, 28]",
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

test("async pool results support callbacks, errors, and timeouts", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool, TimeoutError",
      "from time import sleep, time",
      "callbacks = []",
      "errors = []",
      "def square(x):",
      "    return x*x",
      "def quotient(x):",
      "    return 1 // x",
      "def missing(key):",
      "    return {}[key]",
      "def record(value):",
      "    callbacks.append(value)",
      "def record_error(error):",
      "    errors.append(type(error).__name__)",
      "p = Pool(2)",
      "started = time()",
      "one = p.apply_async(sleep, (0.15,), callback=record)",
      "print(time() - started < 0.1, one.ready())",
      "try:",
      "    one.successful()",
      "except ValueError:",
      "    print('not-ready')",
      "try:",
      "    one.get(0.01)",
      "except TimeoutError:",
      "    print('timeout')",
      "print(one.get(2), one.ready(), one.successful(), callbacks)",
      "mapped = p.map_async(square, [2, 3, 4], callback=record)",
      "starred = p.starmap_async(pow, [(2, 5), (3, 3)])",
      "bad = p.apply_async(quotient, (0,), error_callback=record_error)",
      "missing_result = p.apply_async(missing, ('x',))",
      "print(mapped.get(2), starred.get(2))",
      "try:",
      "    bad.get(2)",
      "except ZeroDivisionError as error:",
      "    print(type(error).__name__, errors)",
      "try:",
      "    missing_result.get(2)",
      "except KeyError as error:",
      "    print(type(error).__name__)",
      "p.close()",
      "p.join()",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    [
      "True False",
      "not-ready",
      "timeout",
      "None True True [None]",
      "[4, 9, 16] [32, 27]",
      "ZeroDivisionError ['ZeroDivisionError']",
      "KeyError",
    ].join("\n"),
  );
});

test("pool initializers and shutdown preserve pending result semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool",
      "from time import sleep, time",
      "def initialize(value):",
      "    global worker_offset",
      "    worker_offset = value",
      "def add_offset(value):",
      "    return worker_offset + value",
      "joined_callbacks = []",
      "p = Pool(2, initializer=initialize, initargs=(40,))",
      "print(p.map(add_offset, [1, 2, 3, 4]))",
      "pending = p.apply_async(add_offset, (5,), callback=joined_callbacks.append)",
      "started = time()",
      "p.close()",
      "print(time() - started < 0.1)",
      "p.join()",
      "print(pending.get(), pending.get(), joined_callbacks)",
      "q = Pool(1)",
      "cancelled = q.apply_async(sleep, (1,))",
      "q.terminate()",
      "q.join()",
      "try:",
      "    cancelled.get()",
      "except RuntimeError as error:",
      "    print(type(error).__name__, str(error))",
      "def fail_initializer():",
      "    raise ValueError('initializer failed')",
      "try:",
      "    Pool(1, initializer=fail_initializer)",
      "except ValueError as error:",
      "    print(type(error).__name__, str(error))",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    [
      "[41, 42, 43, 44]",
      "True",
      "45 45 [45]",
      "RuntimeError multiprocessing pool was terminated",
      "ValueError initializer failed",
    ].join("\n"),
  );
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
