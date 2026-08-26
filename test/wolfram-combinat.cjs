// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

let frontend;
let temporaryDirectory;

test.before(async () => {
  frontend = await createForeignFrontend("wolfram");
  temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-wolfram-combinat-"));
});

test.after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

function run(source) {
  const filename = join(
    temporaryDirectory,
    `case-${Math.random().toString(36).slice(2)}.wl`,
  );
  writeFileSync(filename, source);
  return spawnSync(process.execPath, [sagejs, "--wolfram", filename], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
}

// Direct 1:1 name-and-argument-order matches lower to a bare Sage.js
// function call with no `_wolfram.` wrapper.
test("direct-match counting heads lower to the bare Sage.js function", () => {
  const cases = {
    "Fibonacci[10]": "fibonacci(10)",
    "CatalanNumber[5]": "catalan_number(5)",
    "BellB[6]": "bell_number(6)",
    "StirlingS2[5,2]": "stirling_number2(5, 2)",
    "Multinomial[2,3,4]": "multinomial(2, 3, 4)",
    "Pochhammer[5,3]": "rising_factorial(5, 3)",
    "FactorialPower[5,3]": "falling_factorial(5, 3)",
    "Subfactorial[5]": "number_of_derangements(5)",
    "EulerE[6]": "euler_number(6)",
    "HarmonicNumber[5]": "harmonic_number(5)",
    "HarmonicNumber[5,2]": "harmonic_number(5, 2)",
    "QBinomial[4,2,2]": "q_binomial(4, 2, 2)",
  };
  for (const [source, expected] of Object.entries(cases)) {
    const lowering = frontend.lower(source);
    assert.match(
      lowering.source,
      new RegExp(`print\\(${expected.replace(/[()]/g, "\\$&")}\\)`),
      `expected ${source} to lower to ${expected}`,
    );
  }
});

// Wolfram semantics differ from the matching Sage.js function, so these
// heads lower through a `_wolfram.<Head>` wrapper instead.
test("semantics-differing counting heads lower through the _wolfram wrapper", () => {
  const cases = {
    "LucasL[10]": "_wolfram.LucasL(10)",
    "StirlingS1[5,2]": "_wolfram.StirlingS1(5, 2)",
    "PartitionsP[5]": "_wolfram.PartitionsP(5)",
    "IntegerPartitions[4]": "_wolfram.IntegerPartitions(4)",
  };
  for (const [source, expected] of Object.entries(cases)) {
    const lowering = frontend.lower(source);
    assert.match(
      lowering.source,
      new RegExp(`print\\(${expected.replace(/[()[\].]/g, "\\$&")}\\)`),
      `expected ${source} to lower to ${expected}`,
    );
  }
});

test("counting heads execute to the documented Wolfram values", () => {
  const source = [
    "Fibonacci[10]",
    "LucasL[10]",
    "CatalanNumber[5]",
    "BellB[6]",
    "StirlingS1[5,2]",
    "StirlingS2[5,2]",
    "Multinomial[2,3,4]",
    "Pochhammer[5,3]",
    "FactorialPower[5,3]",
    "Subfactorial[5]",
    "EulerE[6]",
    "HarmonicNumber[5]",
    "HarmonicNumber[5,2]",
    "QBinomial[4,2,2]",
    "PartitionsP[5]",
    "PartitionsP[-3]",
    "IntegerPartitions[4]",
    "",
  ].join("\n");
  const execution = run(source);
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(
    execution.stdout.trim(),
    [
      "55",
      "123",
      "42",
      "203",
      "-50",
      "15",
      "1260",
      "210",
      "60",
      "44",
      "-61",
      "137/60",
      "5269/3600",
      "35",
      "7",
      "0",
      "[[4], [3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]",
    ].join("\n"),
  );
});

test("StirlingS1 is signed, unlike Sage's unsigned stirling_number1", () => {
  // Wolfram documents StirlingS1[n, k] = (-1)^(n - k) * (unsigned c(n, k)).
  const cases = [
    ["StirlingS1[5,2]", "-50"],
    ["StirlingS1[5,5]", "1"],
    ["StirlingS1[6,3]", "-225"],
    ["StirlingS1[6,4]", "85"],
  ];
  const execution = run(
    cases.map(([source]) => source).join("\n") + "\n",
  );
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(
    execution.stdout.trim(),
    cases.map(([, expected]) => expected).join("\n"),
  );
});

test("Pochhammer is rising and FactorialPower is falling, never swapped", () => {
  const execution = run(
    ["Pochhammer[5,3]", "FactorialPower[5,3]", ""].join("\n"),
  );
  assert.equal(execution.status, 0, execution.stderr);
  // Pochhammer(5,3) = 5*6*7 = 210 (rising); FactorialPower(5,3) = 5*4*3 = 60
  // (falling).  Getting these backwards would swap the two outputs.
  assert.equal(execution.stdout.trim(), ["210", "60"].join("\n"));
});

test("Rule arguments are refused by name for counting heads", () => {
  const heads = [
    ["Fibonacci[5, Foo -> 1]", "Fibonacci"],
    ["StirlingS1[5, 2, Foo -> 1]", "StirlingS1"],
    ["QBinomial[4, 2, 2, Foo -> 1]", "QBinomial"],
  ];
  for (const [source, head] of heads) {
    assert.throws(
      () => frontend.lower(source),
      (error) =>
        error.name === "WolframSyntaxError" &&
        error.message ===
          `${head} options are not supported yet: Rule expressions do ` +
            "not lower to keyword arguments outside plot options",
      `expected ${source} to be refused by name`,
    );
  }
  // The refusal is enforced at lowering time, before execution.
  const execution = run("Fibonacci[5, Foo -> 1]\n");
  assert.notEqual(execution.status, 0);
  assert.match(execution.stderr, /Fibonacci options are not supported yet/);
});

test("Fibonacci[n, x] and BellB[n, x] are not silently ignored", () => {
  // The second positional argument (Fibonacci/Bell polynomials) is a
  // different Wolfram function that is not implemented; it must fail
  // loudly rather than lowering as if it were absent.
  const fibonacci = run("Fibonacci[5, 2]\n");
  assert.notEqual(fibonacci.status, 0);
  const bell = run("BellB[5, 2]\n");
  assert.notEqual(bell.status, 0);
});

test("LucasL[n, x] (Lucas polynomials) is refused with a clear message", () => {
  const execution = run("LucasL[5, 2]\n");
  assert.notEqual(execution.status, 0);
  assert.match(execution.stderr, /Lucas polynomials/);
});

test("counting heads are importable from the Sage module path", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sage.combinat import fibonacci",
        "fibonacci(10)",
      ].join("\n"),
    );
    assert.equal(result.repr, "55");
  } finally {
    await session.close();
  }
});
