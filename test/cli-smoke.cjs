"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { defaultHistoryFile } = require("../dist/tools/repl.js");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");

assert.equal(defaultHistoryFile({ sage: true }, "/cache"), "/cache/sagejs/history");
assert.equal(
  defaultHistoryFile({ sage: false }, "/cache"),
  "/cache/sagejs/history-python",
);
for (const language of ["magma", "wolfram", "matlab", "maple"]) {
  assert.equal(
    defaultHistoryFile({ [language]: true }, "/cache"),
    `/cache/sagejs/history-${language}`,
  );
}

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
const help = run(["--help"]);
assert.match(help, /Sage\.js — research mathematics native to JavaScript/);
assert.match(help, /With no program, start an interactive Sage calculator/);
assert.match(help, /\.py files use Python and \.sage files use Sage/);
assert.match(help, /--python\s+ordinary Python syntax and division/);
assert.match(help, /--wolfram\s+experimental Wolfram Language frontend/);
assert.match(help, /sagejs-jupyter --install --user/);
assert.match(help, /Advanced subcommands:/);
assert.match(
  run(["compile", "--help"]),
  /Compile Sage\.js source code into JavaScript/,
);
assert.match(run([], "print(2^3)\nprint(sum([1..10]))\n"), /8\s+55\s*$/);
assert.equal(run([], "value = GF(5)\n").trim(), "");
assert.equal(
  run([], "value = GF(5)\nvalue\n").trim(),
  "Finite Field of size 5",
);
assert.equal(run(["--python"], "value = 17\n").trim(), "");
assert.equal(
  run(
    [],
    [
      "print([1..5])",
      "print([1,3,..,9])",
      "print([1,..,2,..,5])",
      "print(list((1..5)))",
      "print([...])",
      "",
    ].join("\n"),
  ).trim(),
  [
    "[1, 2, 3, 4, 5]",
    "[1, 3, 5, 7, 9]",
    "[1, 2, 3, 4, 5]",
    "[1, 2, 3, 4, 5]",
    "[Ellipsis]",
  ].join("\n"),
);
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
    ["--python"],
    [
      "z = complex(3, 4)",
      "print(type(z), z.real, z.imag, abs(z))",
      "print(z * z, z + 2, 2 - z, z.conjugate())",
      "",
    ].join("\n"),
  ).trim(),
  [
    "<class 'complex'> 3 4 5",
    "(-7+24j) (5+4j) (-1-4j) (3-4j)",
  ].join("\n"),
);
assert.equal(
  run(
    ["--python"],
    [
      "def pooled_constant(): return 2",
      "",
      "print(pooled_constant())",
      "3",
      "print(pooled_constant())",
      "",
    ].join("\n"),
  ).trim(),
  "2\n3\n2",
);
assert.match(
  run(
    ["compile", "--python", "--omit-baselib"],
    "def pooled_real(): return 1.5\n",
  ),
  /var ρσ_const_0 = Number\("1\.5"\)/,
);
assert.doesNotMatch(
  run(
    ["compile", "--python", "--omit-baselib"],
    [
      "class LazyMethods:",
      "    from __python__ import no_bound_methods",
      "    def value(self): return 1",
      "",
    ].join("\n"),
  ),
  /LazyMethods\.prototype\.__bind_methods__/,
);
assert.equal(
  run(
    ["--python"],
    [
      "n = 923098402834028349082348209384",
      "print(n + 1)",
      "print(-5 // 2, -5 % 2)",
      "print(pow(555557, 1000002, 1000003))",
      "print(int.from_bytes((258).to_bytes(2, 'big'), 'big'))",
      "print((1, 2) + (3,))",
      "print(isinstance((1, 2), tuple), list((1, 2)))",
      "left, right = 1, 2",
      "left, right = right, left",
      "print(left, right)",
      "print({2**70: 1})",
      "",
    ].join("\n"),
  ).trim(),
  [
    "923098402834028349082348209385",
    "-3 1",
    "1",
    "258",
    "(1, 2, 3)",
    "True [1, 2]",
    "2 1",
    "{1180591620717411303424: 1}",
  ].join("\n"),
);
assert.equal(
  run(
    [],
    [
      "sage: print(2^3)",
      "sage: for n in [1..3]:",
      "....:     print(n)",
      "....:",
      "",
    ].join("\n"),
  ).trim(),
  "8\n1\n2\n3",
);
assert.equal(
  run(["--python"], ">>> print(2**5)\n").trim(),
  "32",
);

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

const longReal =
  "1.00000000000000000000000000000000000000000000000000001505";
assert.equal(
  run(
    [],
    [
      `literal = ${longReal}`,
      `text = "${longReal}"`,
      "R = RealField(1000)",
      "print(type(literal))",
      "print(parent(literal).precision())",
      "print(R(literal) == R(text))",
      "print(R(RR(text)) == R(text))",
      'print(R(-literal) == R("-" + text))',
      "",
    ].join("\n"),
  ).trim().split("\n").slice(-5).join("\n"),
  [
    "<class 'RealLiteral'>",
    "190",
    "True",
    "False",
    "True",
  ].join("\n"),
);

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

assert.deepEqual(
  run(
    [],
    [
      'values = [10, 20];',
      'print(values[1])',
      'values[0] = 30',
      'print(values)',
      'print({"key": 7}["key"])',
      'print(GF(5)["x"])',
      'print(type(GF(5)["x"]))',
      'A.<a> = GF(5)[];',
      'print(A)',
      'print(a)',
      'B.<b> = (GF(5))[];',
      'print(B)',
      'print(b)',
      'C.<c> = FiniteField(5)[];',
      'print(C)',
      'print(c)',
      '',
    ].join("\n"),
  ).trim().split("\n"),
  [
    "20",
    "[30, 20]",
    "7",
    "Univariate Polynomial Ring in x over Finite Field of size 5",
    "<class 'PolynomialRingParent'>",
    "Univariate Polynomial Ring in a over Finite Field of size 5",
    "a",
    "Univariate Polynomial Ring in b over Finite Field of size 5",
    "b",
    "Univariate Polynomial Ring in c over Finite Field of size 5",
    "c",
  ],
);
assert.match(
  run([], "GF(5)[]\n"),
  /Unexpected token/,
);
assert.match(
  run(["--python"], "R.<x> = ZZ[]\n"),
  /Unexpected token/,
);
assert.deepEqual(
  run([], "f(x) = x^2\nf\nf(3)\nf.derivative()\n")
    .trim()
    .split("\n"),
  ["x |--> x^2", "9", "x |--> 2*x"],
);
assert.match(
  run(["--python"], "f(x) = x**2\n"),
  /cannot assign to a function call/,
);
assert.deepEqual(
  run(
    [],
    "R.<x, y> = ZZ[]\nprint(R)\nprint((x + y)^2)\n",
  )
    .trim()
    .split("\n"),
  [
    "Multivariate Polynomial Ring in x, y over Integer Ring",
    "x^2 + 2*x*y + y^2",
  ],
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

assert.equal(
  run(
    [],
    [
      "class Example:",
      '    """An example class."""',
      "    def __init__(self, label='example'):",
      "        self.label = label",
      "    def value(self, n=2):",
      '        """Return an example value."""',
      "        return n",
      "",
      "example = Example();",
      "print(Example.__name__)",
      "print(Example.__doc__)",
      "print('value' in dir(example))",
      "print('constructor' in dir(example))",
      "print('help' in dir())",
      "help(example.value)",
      "help(Example)",
      "",
    ].join("\n"),
  ).trim(),
  [
    "Example",
    "An example class.",
    "True",
    "False",
    "True",
    "Help on method value in module __main__:",
    "",
    "value(n=2)",
    "",
    "    Return an example value.",
    "Help on class Example:",
    "",
    "class Example(label='example')",
    "",
    "    An example class.",
    "",
    "Methods:",
    "    value(n=2)",
    "        Return an example value.",
  ].join("\n"),
);

assert.match(
  run(
    [],
    [
      "E = EisensteinForms(389,2)",
      "b = E.basis(prec=5)[0]",
      "b.q_expansion?",
      "",
    ].join("\n"),
  ),
  /Help on method q_expansion in module sage\.modular\.modform\.element:[\s\S]*FLINT/,
);

assert.equal(
  run(
    [],
    [
      "R.<x> = GF(5)[]",
      "R",
      "R.0",
      "",
    ].join("\n"),
  ).trim(),
  "Univariate Polynomial Ring in x over Finite Field of size 5\nx",
);

for (const identifier of ["r", "R", "f", "F", "u", "U", "v", "V", "rr", "RR"]) {
  assert.equal(
    run(["--python"], `${identifier} = 17\n${identifier}\n`).trim(),
    "17",
    `string-prefix-like identifier failed at end-of-input: ${identifier}`,
  );
}

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
  const loadedFile = join(temporary, "loaded example.sage");
  const loadingFile = join(temporary, "loading-example.sage");
  writeFileSync(sageFile, "print(2^5)\n", "utf8");
  writeFileSync(pythonFile, "print(2^5)\n", "utf8");
  writeFileSync(
    loadedFile,
    [
      "loaded_value = 17",
      "def loaded_square(n):",
      "    return n^2",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    loadingFile,
    [
      `load ${JSON.stringify(loadedFile)}`,
      "print(loaded_square(7))",
      "",
    ].join("\n"),
    "utf8",
  );
  assert.match(run([sageFile]), /^32\s*$/);
  assert.match(run([pythonFile]), /^7\s*$/);
  assert.match(run(["--python", pythonFile]), /^7\s*$/);
  assert.match(run(["--sage", pythonFile]), /^32\s*$/);
  assert.equal(run([loadingFile]).trim(), "49");
  assert.match(
    run(["compile", "--omit-baselib", sageFile]),
    /var ρσ_const_0 = Integer\("2"\),\s+ρσ_const_1 = Integer\("5"\)/,
  );
  assert.match(
    run(["compile", "--python", "--omit-baselib", pythonFile]),
    /var ρσ_const_0 = Integer\("2"\),\s+ρσ_const_1 = Integer\("5"\)/,
  );
  assert.equal(
    run(
      [],
      [
        `load ${JSON.stringify(loadedFile)}`,
        "print(loaded_value)",
        "print(loaded_square(5))",
        "",
      ].join("\n"),
    ).trim(),
    "17\n25",
  );
  assert.equal(
    run(
      [],
      [
        `attach(${JSON.stringify(loadedFile)})`,
        "print(loaded_square(6))",
        "",
      ].join("\n"),
    ).trim(),
    "36",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Sage and Python CLI modes passed.");
