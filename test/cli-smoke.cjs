"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  assert.equal(
    result.status,
    0,
    `command failed: sagejs ${args.join(" ")}\n${result.stderr}`
  );
  return result.stdout;
}

function runError(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  assert.notEqual(result.stderr, "", "command unexpectedly produced no error");
  return result.stderr;
}

assert.match(run(["--version"]), /^sagejs 0\.1\.0\s*$/);
assert.match(run([], "print(2^3)\nprint(sum([1..10]))\n"), /8\s+55\s*$/);
assert.equal(
  run(
    [],
    [
      "print(202693990283402830942083402834)",
      "print(jstype(9007199254740991))",
      "print(jstype(9007199254740992))",
      "print(923098402834028349082348209384 + 1)",
      "print(9007199254740991 + 1 + 1)",
      "print(2^100)",
      "n = 923098402834028349082348209384;",
      "n += 1;",
      "print(n)",
      "print(sum([923098402834028349082348209384, 1]))",
      "",
    ].join("\n"),
  ).trim(),
  [
    "202693990283402830942083402834",
    "number",
    "bigint",
    "923098402834028349082348209385",
    "9007199254740993",
    "1267650600228229401496703205376",
    "923098402834028349082348209385",
    "923098402834028349082348209385",
  ].join("\n"),
);
assert.match(run(["--python"], "print(2^3)\nprint(2**3)\n"), /1\s+8\s*$/);

assert.equal(
  run(
    [],
    [
      "a = 2/1;",
      "print(a)",
      "print(type(a))",
      "print(parent(a))",
      "print(a == 2)",
      "print(1 + a)",
      "print(a + 1)",
      "print(2/3 + 1/6)",
      "print(QQ(2, -4))",
      "q = 2;",
      "q /= 3;",
      "print(q)",
      "n = 923098402834028349082348209384;",
      "print((n/3)*3)",
      "",
    ].join("\n"),
  ).trim(),
  [
    "2",
    "<class 'Rational'>",
    "Rational Field",
    "True",
    "3",
    "3",
    "5/6",
    "-1/2",
    "2/3",
    "923098402834028349082348209384",
  ].join("\n"),
);
assert.match(runError([], "print(1/0)\n"), /rational division by zero/);

assert.deepEqual(
  run(
    [],
    [
      "class FakeParent:",
      "    def _first_ngens(self, count):",
      "        return [17, 23]",
      "",
      "P = FakeParent();",
      "R.<x, y> = P",
      "print(R is P)",
      "print(x)",
      "print(y)",
      "",
      "def local_generators(parent):",
      "    S.<u, v> = parent",
      "    return S, u, v",
      "",
      "result = local_generators(P);",
      "print(result[0] is P)",
      "print(result[1] + result[2])",
      "",
    ].join("\n"),
  ).trim().split("\n").slice(-5),
  ["True", "17", "23", "True", "40"],
);
assert.match(
  run(["--python"], "R.<x> = ZZ[]\n"),
  /Unexpected token/,
);
assert.match(
  runError([], "R.<x, y> = ZZ[]\n"),
  /multivariate polynomial rings are not implemented yet/,
);

assert.equal(
  run(
    [],
    [
      'R.<x> = PolynomialRing(ZZ)',
      'print(R)',
      'print(x)',
      'print(R.0 == x)',
      '',
    ].join("\n"),
  ).trim(),
  "Univariate Polynomial Ring in x over Integer Ring\nx\nTrue",
);

assert.deepEqual(
  run(
    [],
    [
      'class Extension:',
      '    def _first_ngens(self, count):',
      '        return [29]',
      '',
      'def extension(names=None):',
      '    return Extension(), names[0], names[0] + \"-map\"',
      '',
      'F.<b>, f, g = extension()',
      'print(b)',
      'print(f)',
      'print(g)',
      '',
    ].join("\n"),
  ).trim().split("\n").slice(-3),
  ["29", "b", "b-map"],
);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-test-"));
try {
  const sageFile = join(temporary, "example.sage");
  const pythonFile = join(temporary, "example.py");
  writeFileSync(sageFile, "print(2^5)\n", "utf8");
  writeFileSync(pythonFile, "print(2^5)\n", "utf8");
  assert.match(run([sageFile]), /^32\s*$/);
  assert.match(run(["--python", pythonFile]), /^7\s*$/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Sage and Python CLI modes passed.");
