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

const rationals = run("print(1/3 + 1/6)\n");
assert.equal(rationals.stdout.trim(), "1/2");
assert.doesNotMatch(rationals.stderr, new RegExp(marker));

const polynomialParent = run('print(PolynomialRing(ZZ, "x"))\n');
assert.match(
  polynomialParent.stdout,
  /Univariate Polynomial Ring in x over Integer Ring/,
);
assert.doesNotMatch(polynomialParent.stderr, new RegExp(marker));

const polynomial = run(
  [
    "R.<x> = ZZ[]",
    "print((1 + x) + 1/3)",
    "print(parent((1 + x) + 1/3))",
    "S.<y> = QQ[]",
    "print(S is PolynomialRing(QQ, \"y\"))",
    "print(QQ(1/3) + (1 + x) == x + 4/3)",
    "print(QQ(1/3) == S(QQ(1/3)))",
    "print(not (QQ(1/3) == S(QQ(2/3))))",
    "print((x + 1)^3)",
    "print(y + 1/3)",
    "try:",
    '    x + PolynomialRing(ZZ, "y").gen()',
    "except TypeError:",
    '    print("incompatible variables rejected")',
    "",
  ].join("\n"),
);
assert.deepEqual(polynomial.stdout.trim().split("\n"), [
  "x + 4/3",
  "Univariate Polynomial Ring in x over Rational Field",
  "True",
  "True",
  "True",
  "True",
  "x^3 + 3*x^2 + 3*x + 1",
  "y + 1/3",
  "incompatible variables rejected",
]);
assert.equal(polynomial.stderr.match(new RegExp(marker, "g"))?.length, 1);

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
