// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const packageDirectory = path.join(__dirname, "../src/lib/conway_polynomials");
const sourcePath = path.join(packageDirectory, "CPimport.txt");
const dataPath = path.join(packageDirectory, "conway_polynomials.json");

async function repr(session, source) {
  return (await session.evaluate(source)).repr;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

test("bundled Conway data retains its preferred source and compact table", () => {
  const source = fs.readFileSync(sourcePath);
  const data = fs.readFileSync(dataPath);
  assert.equal(source.length, 1_328_858);
  assert.equal(data.length, 1_114_459);
  assert.equal(
    crypto.createHash("sha256").update(source).digest("hex"),
    "fb8938b43c1a988c70ed1638a31bb86f571a7af363852513e839b4f172b2f108",
  );
  assert.equal(
    crypto.createHash("sha256").update(data).digest("hex"),
    "43a555093e65ac1eed877c7bb79e6e8d44ad63285dc52fb227e64e2e7aa298ea",
  );
  for (const [filename, expected] of [
    ["COPYING", "c35c4803a28e23c137940749e5a90626796dd83b48e0956a0d2e8b3208b248c5"],
    ["LICENSE", "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986"],
  ]) {
    const value = fs.readFileSync(path.join(packageDirectory, filename));
    assert.equal(crypto.createHash("sha256").update(value).digest("hex"), expected);
  }

  const compact = JSON.parse(data);
  assert.equal(Object.keys(compact).length, 10_453);
  assert.equal(
    Object.values(compact).reduce(
      (count, degrees) => count + Object.keys(degrees).length,
      0,
    ),
    47_090,
  );
  assert.deepEqual(compact[60869][3], [60867, 2, 0, 1]);
  const generated = spawnSync(
    process.execPath,
    [path.join(__dirname, "../scripts/generate-conway-data.cjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(generated.status, 0, generated.stderr);
});

test("ConwayPolynomials matches Sage mapping and error semantics", async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate(
      [
        "import conway_polynomials",
        "from sage.databases.conway import ConwayPolynomials, DictInMapping",
        "from pickle import dumps, loads",
        "c = ConwayPolynomials()",
      ].join("\n"),
    );
    assert.equal(await repr(session, "c"), "Frank Lübeck's database of Conway polynomials");
    assert.equal(await repr(session, "len(c)"), "47090");
    assert.equal(await repr(session, "bool(c)"), "True");
    assert.equal(await repr(session, "next(iter(c))"), "(2, 1)");
    assert.equal(await repr(session, "c[60869, 3]"), "(60867, 2, 0, 1)");
    assert.equal(await repr(session, "c[[60869, 3]]"), "(60867, 2, 0, 1)");
    assert.equal(await repr(session, "c.degrees(60821)"), "[1, 2, 3, 4]");
    assert.equal(await repr(session, "c.degrees(10000019)"), "[]");
    assert.equal(await repr(session, "c.has_polynomial(97, 12)"), "True");
    assert.equal(await repr(session, "c.has_polynomial(60821, 5)"), "False");
    assert.equal(await repr(session, "2 in c.primes()"), "True");
    assert.equal(
      await repr(session, "c[60859]"),
      "{1: (60856, 1), 2: (3, 60854, 1), 3: (60856, 8, 0, 1), 4: (3, 32881, 3, 0, 1)}",
    );
    assert.equal(
      await repr(session, "conway_polynomials.database() is conway_polynomials.database()"),
      "True",
    );
    assert.equal(await repr(session, "loads(dumps(c)) == c"), "True");
    assert.equal(await repr(session, "type(c.keys()).__name__"), "'KeysView'");
    assert.equal(await repr(session, "type(c.items()).__name__"), "'ItemsView'");
    assert.equal(await repr(session, "type(c.values()).__name__"), "'ValuesView'");
    assert.equal(
      await repr(session, "values = list(c.values()); (len(values), values[0], values[-1])"),
      "(47090, (1, 1), (3, 100525, 3, 0, 1))",
    );
    assert.equal(await repr(session, "c.get((60869, 3))"), "(60867, 2, 0, 1)");
    assert.equal(await repr(session, "c.get((97, 128), 'x')"), "'x'");
    assert.equal(
      await repr(
        session,
        [
          "K = GF(65537**2, 'a')",
          "coefficients = tuple(value.lift() for value in K.modulus().coefficients())",
          "(K.modulus(), coefficients, coefficients == c[65537, 2])",
        ].join("\n"),
      ),
      "(x^2 + 65536*x + 3, (3, 65536, 1), True)",
    );

    await session.evaluate(
      [
        "errors = {}",
        "for name, expression in [('prime', lambda: c[10000019]), ('pair', lambda: c[97, 128]), ('polynomial', lambda: c.polynomial(97, 128))]:",
        "    try:",
        "        expression()",
        "    except Exception as error:",
        "        errors[name] = (type(error).__name__, str(error), repr(error.args))",
      ].join("\n"),
    );
    assert.equal(await repr(session, "errors['prime']"), "('KeyError', '10000019', '(10000019,)')");
    assert.equal(await repr(session, "errors['pair']"), "('KeyError', '(97, 128)', '((97, 128),)')");
    assert.equal(
      await repr(session, "errors['polynomial'][1]"),
      "'Conway polynomial over F_97 of degree 128 not in database.'",
    );
    await session.evaluate(
      [
        "backing = {}",
        "view = DictInMapping(backing)",
        "backing[0] = 1",
        "try:",
        "    view[2] = 3",
        "except TypeError as error:",
        "    assignment_error = str(error)",
      ].join("\n"),
    );
    assert.equal(await repr(session, "view"), "{0: 1}");
    assert.equal(await repr(session, "view.keys() == {0}"), "True");
    assert.equal(await repr(session, "view.items() == {(0, 1)}"), "True");
    assert.equal(
      await repr(session, "assignment_error"),
      '"\'DictInMapping\' object does not support item assignment"',
    );
  } finally {
    await session.close();
  }
});

test("compact Conway materialization stays within its cold-load budget", async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate(
      "from sagejs_serialization import load_integer_tuple_table",
    );
    const samples = [];
    for (let repetition = 0; repetition < 5; repetition += 1) {
      const started = performance.now();
      const result = await session.evaluate(
        `table = load_integer_tuple_table(${JSON.stringify(dataPath)})\n(len(table), table[60869][3])`,
      );
      samples.push(performance.now() - started);
      assert.equal(result.repr, "(10453, (60867, 2, 0, 1))");
    }
    assert.ok(
      median(samples) < 200,
      `median compact table load ${median(samples).toFixed(1)} ms exceeded 200 ms`,
    );
  } finally {
    await session.close();
  }
});

test("complete Conway values materialize within the Sage-scale budget", async () => {
  const session = await createSage({ mode: "python" });
  try {
    await session.evaluate(
      "from sage.databases.conway import ConwayPolynomials\nc = ConwayPolynomials()",
    );
    const samples = [];
    for (let repetition = 0; repetition < 5; repetition += 1) {
      const started = performance.now();
      const result = await session.evaluate(
        "values = list(c.values()); (len(values), values[0], values[-1])",
      );
      samples.push(performance.now() - started);
      assert.equal(
        result.repr,
        "(47090, (1, 1), (3, 100525, 3, 0, 1))",
      );
    }
    assert.ok(
      median(samples) < 100,
      `median complete values load ${median(samples).toFixed(1)} ms exceeded 100 ms`,
    );
  } finally {
    await session.close();
  }
});

test("Conway data access fails deterministically without filesystem capability", async () => {
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput: (text) => output.push(text),
  });
  Reflect.deleteProperty(globalThis, "__sagejs_host__");
  try {
    evaluator.evaluate(
      [
        "from sage.databases.conway import ConwayPolynomials",
        "try:",
        "    ConwayPolynomials()",
        "except RuntimeError as error:",
        "    print(str(error))",
      ].join("\n"),
    );
    assert.equal(
      output.join("").trim(),
      "Conway polynomial database data is unavailable in this runtime.",
    );
  } finally {
    evaluator.close();
  }
});

test("ordinary CPython uses the portable Conway JSON fallback", () => {
  const result = spawnSync(
    pythonExecutable(),
    [
      "-c",
      [
        "import collections.abc, json",
        `import sys; sys.path.append(${JSON.stringify(path.join(__dirname, "../src/lib"))})`,
        "from sage.databases.conway import ConwayPolynomials",
        "c = ConwayPolynomials()",
        "print(len(c), len(c.primes()), c[60869, 3])",
      ].join("\n"),
    ],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: process.env,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "47090 10453 (60867, 2, 0, 1)");
});
