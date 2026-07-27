"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../..");
const sagejs = path.join(root, "bin", "sagejs");
const observer = path.join(__dirname, "observe-load.cjs");
const marker = "SAGEJS_FLINT_LOADED";

function run(source) {
  const result = spawnSync(
    process.execPath,
    ["--require", observer, sagejs],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result;
}

const arithmetic = run("print(2^100)\n");
assert.equal(
  arithmetic.stdout.trim(),
  "1267650600228229401496703205376",
);
assert.doesNotMatch(arithmetic.stderr, new RegExp(marker));

const factoring = run(
  [
    "a = factor(2026);",
    "print(a)",
    "print(type(a))",
    "print(isinstance(a, IntegerFactorization))",
    "print(a[0])",
    "print(a[-1])",
    "print(len(a))",
    "print(list(a))",
    "print(a.unit())",
    "print(a.value())",
    "b = factor(-360);",
    "print(b)",
    "print(list(b))",
    "print(b.unit())",
    "print(b.value())",
    "print(factor(1))",
    "print(factor(202693990283402830942083402834))",
    "",
  ].join("\n"),
);
assert.deepEqual(factoring.stdout.trim().split("\n"), [
  "2 * 1013",
  "<class 'IntegerFactorization'>",
  "True",
  "(2, 1)",
  "(1013, 1)",
  "2",
  "[(2, 1), (1013, 1)]",
  "1",
  "2026",
  "-1 * 2^3 * 3^2 * 5",
  "[(2, 3), (3, 2), (5, 1)]",
  "-1",
  "-360",
  "1",
  "2 * 3^2 * 37 * 20390333 * 14925961766090828753",
]);
assert.equal(factoring.stderr.match(new RegExp(marker, "g"))?.length, 1);

console.log("Sage.js factor() loads FLINT once, on first use.");
