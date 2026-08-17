"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");

const root = join(__dirname, "..");

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

test("workers include lazily split advanced elliptic algorithms", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool",
      "def local_reduction(p):",
      "    E = EllipticCurve([0,-2,0,9,8])",
      "    d = E.local_data(p)",
      "    return (str(d.kodaira_symbol()), d.conductor_valuation())",
      "with Pool(2) as workers:",
      "    print(workers.map(local_reduction, [2, 13]))",
    ].join("\n"),
  );
  assert.equal(result.stdout.trim(), "[('I1', 1), ('I1', 1)]");
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

test("workers preserve live compiled module globals", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from multiprocessing import Pool",
      "threshold = 5",
      "α = 7",
      "counter = 0",
      "def helper(value):",
      "    return value + α",
      "def bump(value):",
      "    global counter",
      "    counter += value",
      "    return counter + threshold + helper(0)",
      "def factorial(value):",
      "    return 1 if value <= 1 else value * factorial(value - 1)",
      "def even(value):",
      "    return True if value == 0 else odd(value - 1)",
      "def odd(value):",
      "    return False if value == 0 else even(value - 1)",
      "def Object(value):",
      "    return value + 1",
      "def missing_global(value):",
      "    return absent_worker_name + value",
      "deleted_worker_name = 9",
      "def deleted_global(value):",
      "    return deleted_worker_name + value",
      "del deleted_worker_name",
      "def worker_module_name(value):",
      "    return __name__",
      "def explicit_name_error(value):",
      "    raise NameError('explicit worker name error')",
      "with Pool(1) as workers:",
      "    print(workers.map(bump, [1, 2, 3]))",
      "    print(workers.map(factorial, [5]))",
      "    print(workers.map(even, [10, 11]))",
      "    print(workers.map(Object, [41]))",
      "    print(workers.map(worker_module_name, [0]))",
      "    try:",
      "        workers.map(missing_global, [1])",
      "    except NameError as error:",
      "        print(isinstance(error, NameError), 'absent_worker_name' in str(error))",
      "    try:",
      "        workers.map(deleted_global, [1])",
      "    except NameError as error:",
      "        print(isinstance(error, NameError), 'deleted_worker_name' in str(error))",
      "    try:",
      "        workers.map(explicit_name_error, [1])",
      "    except NameError as error:",
      "        print(isinstance(error, NameError), str(error))",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    "[13, 15, 18]\n[120]\n[True, False]\n[42]\n['__multiprocessing__']\n" +
      "True True\nTrue True\nTrue explicit worker name error",
  );
});

test("imported worker functions retain isolated live module cells", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-worker-module-name-"));
  try {
    writeFileSync(
      join(directory, "worker_a.py"),
      [
        "counter = 100",
        "def step(value):",
        "    global counter",
        "    counter += value",
        "    return (__name__, counter)",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "worker_b.py"),
      [
        "counter = 200",
        "def step(value):",
        "    global counter",
        "    counter += value",
        "    return (__name__, counter)",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "main.py"),
      [
        "from multiprocessing import Pool",
        "import worker_a, worker_b",
        "with Pool(1) as workers:",
        "    print(workers.map(worker_a.step, [1, 2]))",
        "    print(workers.map(worker_b.step, [1, 2]))",
        "    print(workers.map(worker_a.step, [3]))",
        "    print(workers.map(worker_b.step, [3]))",
        "",
      ].join("\n"),
    );
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), "main.py"], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        // This regression exercises serialized project modules rather than
        // the optional fail-closed precompiled task graph.
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: join(
          directory,
          "missing-task-modules",
        ),
      },
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      [
        "[('worker_a', 101), ('worker_a', 103)]",
        "[('worker_b', 201), ('worker_b', 203)]",
        "[('worker_a', 106)]",
        "[('worker_b', 206)]",
      ].join("\n"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multiprocessing imports without a worker host capability", async () => {
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  delete global.__sagejs_host__;
  try {
    evaluator.evaluate(
      [
        "from multiprocessing import Pool",
        "from multiprocessing import worker_module_available",
        "print(Pool.__name__)",
        "print(worker_module_available('worker_fixture'))",
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
        "False",
        "NotImplementedError multiprocessing requires a worker-thread host capability",
      ].join("\n"),
    );
  } finally {
    evaluator.close();
  }
});

test("task evaluators load only validated precompiled module resources", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-task-modules-"));
  const dependencyCache = {
    version: "test-compiler-version",
    signature: "dependency-source-signature",
    mode: "python",
    module: "worker_dependency",
    javascriptTemplate: [
      'var __file__ = "__sagejs_precompiled_module_filename__";',
      "var collision;",
      "collision = function collision(left, right) { return left + right; };",
      "var dependencyFixture = function dependencyFixture(value) { return collision(value, 1); };",
      'Reflect.set(ρσ_modules["worker_dependency"], "dependencyFixture", dependencyFixture);',
    ].join("\n"),
  };
  const cache = {
    version: "test-compiler-version",
    signature: "test-source-signature",
    mode: "python",
    module: "worker_fixture",
    javascriptTemplate: [
      'var __file__ = "__sagejs_precompiled_module_filename__";',
      'void Reflect.get(ρσ_modules, "__name__");',
      "var collision;",
      'var dependency = globalThis.__sagejs_load_module__("worker_dependency");',
      'var dependencyFixture = Reflect.get(dependency, "dependencyFixture");',
      "collision = function collision(value) { return value * 2; };",
      "var fixture = function fixture(value) { return dependencyFixture(value); };",
      'fixture.__module__ = "worker_fixture";',
      'fixture.__name__ = "fixture";',
      'Reflect.set(\u03c1\u03c3_modules["worker_fixture"], "fixture", fixture);',
    ].join("\n"),
  };
  writeFileSync(
    join(directory, "worker_fixture.json"),
    JSON.stringify(cache),
  );
  writeFileSync(
    join(directory, "worker_dependency.json"),
    JSON.stringify(dependencyCache),
  );
  writeFileSync(
    join(directory, "task-runtime-modules.json"),
    JSON.stringify({
      schema: "sagejs.task-runtime-modules/v1",
      roots: ["worker_fixture"],
      modules: {
        worker_fixture: {
          resource: "worker_fixture.json",
          version: cache.version,
          signature: cache.signature,
          mode: cache.mode,
          filename: "/__sagejs_task_modules__/worker_fixture.py",
        },
        worker_dependency: {
          resource: "worker_dependency.json",
          version: dependencyCache.version,
          signature: dependencyCache.signature,
          mode: dependencyCache.mode,
          filename: "/__sagejs_task_modules__/worker_dependency.py",
        },
        // This valid mapping intentionally has no resource file. Loading the
        // used fixture must not touch unrelated graph entries at startup.
        unused_fixture: {
          resource: "unused_fixture.json",
          version: cache.version,
          signature: cache.signature,
          mode: cache.mode,
          filename: "/__sagejs_task_modules__/unused_fixture.py",
        },
      },
    }),
  );
  try {
    const capability = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: directory,
        },
        input: [
          "from multiprocessing import worker_module_available",
          "print(worker_module_available('worker_fixture'))",
          "print(worker_module_available('worker_missing'))",
          "",
        ].join("\n"),
      },
    );
    assert.equal(capability.status, 0, capability.stderr);
    assert.equal(capability.stdout.trim(), "True\nFalse");

    const script = [
      'const { createTaskEvaluator } = require("./dist/tools/task-evaluator.js");',
      'const { hasPrecompiledTaskModule } = require("./dist/tools/resources.js");',
      "const evaluator = createTaskEvaluator({ mode: 'python', onOutput() {} });",
      "const source = 'function fixture(value) { return dependencyFixture(value); }';",
      "console.log(hasPrecompiledTaskModule('worker_fixture'));",
      "console.log(hasPrecompiledTaskModule('worker_missing'));",
      "console.log(evaluator.invoke({ module: 'worker_fixture', name: 'fixture', source }, [41]));",
      "try {",
      "  evaluator.invoke({ module: 'worker_missing', name: 'fixture', source }, [1]);",
      "} catch (error) {",
      "  console.log(error.name, error.message);",
      "}",
      "evaluator.close();",
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: directory,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      [
        "true",
        "false",
        "42",
        "ImportError No module named 'worker_missing'",
      ].join("\n"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
