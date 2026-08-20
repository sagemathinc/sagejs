"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  defaultHistoryFile,
  replWelcomeBanner,
} = require("../dist/tools/repl.js");
const packageVersion = require("../package.json").version;

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");
const cache = join("/cache", "sagejs");
const releasePlatform =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : process.platform;
const bannerSuffix = `[${releasePlatform}-${process.arch}].`;

assert.equal(
  replWelcomeBanner({ sage: true }),
  `Welcome to Sage.js v${packageVersion} ${bannerSuffix}`,
);
assert.equal(
  replWelcomeBanner({ sage: false }),
  `Welcome to Sage.js v${packageVersion} (Python mode) ${bannerSuffix}`,
);
for (const [flag, displayName] of [
  ["magma", "Magma"],
  ["macaulay2", "Macaulay2"],
  ["m2", "Macaulay2"],
  ["maple", "Maple"],
  ["matlab", "MATLAB"],
  ["wolfram", "Wolfram"],
  ["mathematica", "Wolfram"],
]) {
  assert.equal(
    replWelcomeBanner({ [flag]: true }),
    `Welcome to Sage.js v${packageVersion} (${displayName} mode) ${bannerSuffix}`,
  );
}

assert.equal(defaultHistoryFile({ sage: true }, "/cache"), join(cache, "history"));
assert.equal(
  defaultHistoryFile({ sage: false }, "/cache"),
  join(cache, "history-python"),
);
for (const language of ["magma", "wolfram", "matlab", "maple"]) {
  assert.equal(
    defaultHistoryFile({ [language]: true }, "/cache"),
    join(cache, `history-${language}`),
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
  assert.equal(
    result.status,
    1,
    `failing command returned ${result.status}: sagejs ${args.join(" ")}\n${result.stderr}`,
  );
  assert.notEqual(result.stderr, "", "command unexpectedly produced no error");
  return result.stderr;
}

function runFailure(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
  });
  assert.equal(
    result.status,
    1,
    `failing command returned ${result.status}: sagejs ${args.join(" ")}\n` +
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

assert.equal(run(["--version"]).trim(), `sagejs ${packageVersion}`);
const help = run(["--help"]);
assert.match(help, /Sage\.js — research mathematics native to JavaScript/);
assert.match(help, /With no program, start an interactive Sage calculator/);
assert.match(help, /\.py files use Python and \.sage files use Sage/);
assert.match(help, /--python\s+ordinary Python syntax and division/);
assert.match(help, /--wolfram\s+experimental Wolfram Language frontend/);
assert.match(help, /sagejs --install-jupyter-kernel/);
assert.match(help, /--uninstall-jupyter-kernel/);
assert.match(help, /%time --breakdown EXPR/);
assert.match(help, /Advanced subcommands:/);
assert.match(
  run(["compile", "--help"]),
  /Compile Sage\.js source code into JavaScript/,
);
assert.match(
  run(["docs", "--help"]),
  /Search, inspect, and export the installed Sage\.js API documentation/,
);
assert.equal(existsSync(run(["docs", "path"]).trim()), true);
assert.match(
  run(["docs", "search", "--backend", "FLINT", "finite-field"]),
  /GF\(order: Any, name: Any=None/,
);
const documentedDimension = JSON.parse(
  run(["docs", "show", "--json", "dimension_cusp_forms"]),
);
assert.equal(documentedDimension.schema_version, 1);
assert.equal(documentedDimension.sage_compatibility.status, "partial");
assert.equal(
  documentedDimension.references[0].doi,
  "10.1007/BFb0065297",
);
const implicitPlotDocumentation = run([
  "docs",
  "show",
  "implicit_plot3d",
]);
assert.match(implicitPlotDocumentation, /^# implicit_plot3d/m);
assert.match(implicitPlotDocumentation, /`f = 0`/);
assert.match(implicitPlotDocumentation, /### Examples/);
assert.match(implicitPlotDocumentation, /```sage/);
assert.doesNotMatch(implicitPlotDocumentation, /``f = 0``|EXAMPLES::/);
const documentationCoverage = JSON.parse(
  run(["docs", "coverage", "--json"]),
);
assert.ok(documentationCoverage.registry_entries >= 26);
assert.equal(
  documentationCoverage.markdown_docstrings,
  documentationCoverage.registry_entries,
);
assert.deepEqual(documentationCoverage.invalid_markdown_entries, []);
assert.deepEqual(documentationCoverage.incomplete_entries, []);
assert.equal(
  JSON.parse(run(["docs", "export", "--jsonl"]).split("\n")[0])
    .schema_version,
  1,
);
assert.match(run([], "print(2^3)\nprint(sum([1..10]))\n"), /8\s+55\s*$/);
assert.equal(
  run(
    [],
    [
      "try:",
      "    raise TypeError('expected')",
      "except TypeError:",
      "    print('compound statement flushed at EOF')",
    ].join("\n") + "\n",
  ).trim(),
  "compound statement flushed at EOF",
);
assert.equal(run([], 'print("before")\nquit()\nprint("after")\n').trim(), "before");
const explicitExit = spawnSync(process.execPath, [cli], {
  cwd: root,
  encoding: "utf8",
  input: "exit(3)\n",
});
assert.equal(explicitExit.status, 3);
assert.equal(run([], "value = GF(5)\n").trim(), "");
assert.equal(
  run([], "value = GF(5)\nvalue\n").trim(),
  "Finite Field of size 5",
);
const timeitOutput = run(
  [],
  [
    "timeit_counter = 0",
    "%timeit -n2 -r3 timeit_counter += 1",
    "print(timeit_counter)",
    "",
  ].join("\n"),
);
assert.match(
  timeitOutput,
  /^[\d.]+ (?:ns|µs|ms|s) ± [\d.]+ (?:ns|µs|ms|s) per loop \(mean ± std\. dev\. of 3 runs, 2 loops each\)\n7\s*$/,
);
const timingBreakdownOutput = run(
  [],
  "%time --breakdown import colorsys\n",
);
assert.match(timingBreakdownOutput, /^CPU times:/);
assert.match(timingBreakdownOutput, /\nWall time: [\d.]+ms\n/);
assert.match(
  timingBreakdownOutput,
  /\nInitialization \(included in wall time\): [\d.]+ms\n/,
);
assert.match(timingBreakdownOutput, /\n  Module colorsys: [\d.]+ms\n/);
const pythonTimeitOutput = run(
  ["--python"],
  [
    "python_timeit_value = 0",
    "%timeit -n1 -r1 python_timeit_value = 2^3",
    "print(python_timeit_value)",
    "",
  ].join("\n"),
);
assert.match(
  pythonTimeitOutput,
  /^[\d.]+ (?:ns|µs|ms|s) ± [\d.]+ (?:ns|µs|ms|s) per loop \(mean ± std\. dev\. of 1 run, 1 loop each\)\n1\s*$/,
);
assert.equal(run(["--python"], "value = 17\n").trim(), "");
assert.equal(
  run(
    ["--python"],
    [
      "import sagejs.runtime as runtime",
      "import __main__",
      "value = 10",
      "",
      "def make_reader(offset):",
      "    def read(argument):",
      "        return value + offset + argument",
      "    return read",
      "",
      "reader = make_reader(2)",
      "value = 20",
      "",
      "class CurrentValue:",
      "    def read(self):",
      "        return value",
      "",
      "print(runtime.reflect.get(__main__, 'value'))",
      "print(reader(3), CurrentValue().read())",
      "print(__main__ is __import__('__main__'))",
      "print(__main__.CurrentValue is CurrentValue)",
      "print(__name__, __main__.__name__)",
      "__main__.value = 31",
      "ρσ_module_value = 7",
      "__main__.ρσ_module_value = 8",
      "print(value, globals()['value'], ρσ_module_value, 'value' in dir())",
      "",
      "del globals()['value']",
      "print(hasattr(__main__, 'value'), 'value' in globals(), 'value' in dir())",
      "__name__ = 'piped-main'",
      "",
      "print(__name__, __main__.__name__)",
      "",
    ].join("\n"),
  ).trim(),
  [
    "20",
    "25 20",
    "True",
    "True",
    "__main__ __main__",
    "31 31 8 True",
    "False False False",
    "piped-main piped-main",
  ].join("\n"),
);
assert.equal(
  run(
    ["--python"],
    [
      "arguments = 'lexical-value'",
      "import __main__",
      "print(arguments, __main__.arguments)",
      "__main__.arguments = 'module-write'",
      "print(arguments, __main__.arguments)",
      "",
      "def write_arguments():",
      "    global arguments",
      "    arguments = 'global-write'",
      "",
      "write_arguments()",
      "print(arguments, __main__.arguments)",
      "",
    ].join("\n"),
  ).trim(),
  [
    "lexical-value lexical-value",
    "module-write module-write",
    "global-write global-write",
  ].join("\n"),
);
assert.equal(
  run(
    ["--python"],
    [
      "import sagejs.runtime as runtime",
      "import __main__",
      "",
      "def intrinsic_parameter(runtime):",
      "    return runtime.upper()",
      "",
      "print(intrinsic_parameter('parameter-shadow'))",
      "__main__.runtime = 'module-shadow'",
      "",
      "print(runtime.upper())",
      "__proto__ = 17",
      "__sagejs_reusable_main__ = 18",
      "__sagejs_main_magic_initialized__ = 19",
      "__sagejs_live_scope_dict__ = 20",
      "",
      "print(__proto__, __main__.__proto__, globals()['__proto__'])",
      "print(__sagejs_reusable_main__, __sagejs_main_magic_initialized__, __sagejs_live_scope_dict__)",
      "",
    ].join("\n"),
  ).trim(),
  [
    "PARAMETER-SHADOW",
    "MODULE-SHADOW",
    "17 17 17",
    "18 19 20",
  ].join("\n"),
);
assert.equal(
  run(
    ["--python"],
    [
      "globals = lambda: 'globals-shadow'",
      "locals = lambda: 'locals-shadow'",
      "vars = lambda: 'vars-shadow'",
      "dir = lambda: ['dir-shadow']",
      "",
      "print(globals(), locals(), vars(), dir())",
      "",
    ].join("\n"),
  ).trim(),
  "globals-shadow locals-shadow vars-shadow ['dir-shadow']",
);
assert.equal(
  run(
    ["--python"],
    [
      "Object = 'Object-value'",
      "Reflect = 'Reflect-value'",
      "Symbol = 'Symbol-value'",
      "globalThis = 'globalThis-value'",
      "Math = 'Math-value'",
      "Map = 'Map-value'",
      "console = 'console-value'",
      "ρσ_modules = 'registry-value'",
      "ordinary_name = 'ordinary-value'",
      "",
      "print(Object, Reflect, Symbol, globalThis, Math, Map, console, ρσ_modules, ordinary_name)",
      "",
    ].join("\n"),
  ).trim(),
  "Object-value Reflect-value Symbol-value globalThis-value Math-value " +
    "Map-value console-value registry-value ordinary-value",
);
const pythonRuntimeFailure = runFailure(
  ["--python"],
  "raise RuntimeError('piped Python failure')\n",
);
assert.match(pythonRuntimeFailure.stderr, /piped Python failure/);
const sageRuntimeFailure = runFailure([], "1/0\n");
assert.match(sageRuntimeFailure.stderr, /rational division by zero/);
const pythonCompileFailure = runFailure(
  ["--python"],
  "if True print('invalid')\n",
);
assert.match(pythonCompileFailure.stdout, /Unexpected token/);
const eofRuntimeFailure = runFailure(
  ["--python"],
  "if True:\n    raise RuntimeError('EOF-flushed failure')\n",
);
assert.match(eofRuntimeFailure.stderr, /EOF-flushed failure/);
const asyncFunctionFailure = runFailure(
  ["--python"],
  [
    "async def fail_after_start():",
    "    raise RuntimeError('async function failure')",
    "",
    "fail_after_start().send(None)",
    "",
  ].join("\n"),
);
assert.match(asyncFunctionFailure.stderr, /async function failure/);

const interactiveFailureHarness = `
  const { PassThrough } = require("node:stream");
  const Repl = require(${JSON.stringify(join(root, "dist", "tools", "repl.js"))}).default;
  (async () => {
    const input = new PassThrough();
    input.isTTY = true;
    const output = new PassThrough();
    output.resume();
    const repl = await Repl({
      input,
      output,
      terminal: false,
      histfile: false,
      show_js: false,
    });
    input.end("raise RuntimeError('interactive failure')\\n");
    await repl.finished();
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      throw new Error("interactive input changed the process exit status");
    }
  })().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
`;
const interactiveFailureResult = spawnSync(
  process.execPath,
  ["-e", interactiveFailureHarness],
  { cwd: root, encoding: "utf8", timeout: 20000 },
);
assert.equal(interactiveFailureResult.status, 0, interactiveFailureResult.stderr);
assert.match(interactiveFailureResult.stderr, /interactive failure/);

const brokenPipeHarness = `
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [${JSON.stringify(cli)}, "--python"], {
    cwd: ${JSON.stringify(root)},
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timeout = setTimeout(() => {
    child.kill();
    process.exitCode = 2;
  }, 15000);
  child.stderr.pipe(process.stderr);
  child.stdout.destroy();
  setTimeout(() => child.stdin.end("print('x' * 1048576)\\n"), 20);
  child.on("close", (code, signal) => {
    clearTimeout(timeout);
    if (signal || code !== 0) {
      console.error(JSON.stringify({ code, signal }));
      process.exitCode = 1;
    }
  });
`;
const brokenPipeResult = spawnSync(process.execPath, ["-e", brokenPipeHarness], {
  cwd: root,
  encoding: "utf8",
  timeout: 20000,
});
assert.equal(brokenPipeResult.status, 0, brokenPipeResult.stderr);
assert.equal(
  run(
    [],
    [
      "print([1..5])",
      "print([1,3,..,9])",
      "print([1,..,2,..,5])",
      "print([pi,pi+1/10,..,pi+1])",
      "print(list((1..5)))",
      "print([...])",
      "",
    ].join("\n"),
  ).trim(),
  [
    "[1, 2, 3, 4, 5]",
    "[1, 3, 5, 7, 9]",
    "[1, 2, 3, 4, 5]",
    "[pi, 1/10 + pi, 1/5 + pi, 3/10 + pi, 2/5 + pi, 1/2 + pi, 3/5 + pi, 7/10 + pi, 4/5 + pi, 9/10 + pi, 1 + pi]",
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
    "<class 'complex'> 3.0 4.0 5.0",
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
  /var ρσ_const_0 = ρσ_float\("1\.5"\)/,
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
  runFailure([], "GF(5)[]\n").stdout,
  /Unexpected token/,
);
assert.match(
  runFailure(["--python"], "R.<x> = ZZ[]\n").stdout,
  /Unexpected token/,
);
assert.deepEqual(
  run([], "f(x) = x^2\nf\nf(3)\nf.derivative()\n")
    .trim()
    .split("\n"),
  ["x |--> x^2", "9", "x |--> 2*x"],
);
assert.deepEqual(
  run(
    [],
    "g(z) = z^2\nprint(g, parent(z))\n" +
      "h(u,v) = u^2 + v^2\nprint(h, h(3,4), parent(u), parent(v))\n",
  )
    .trim()
    .split("\n"),
  [
    "z |--> z^2 Symbolic Ring",
    "(u, v) |--> u^2 + v^2 25 Symbolic Ring Symbolic Ring",
  ],
);
assert.match(
  runFailure(["--python"], "f(x) = x**2\n").stdout,
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
      "    def __init__(self, label: str='example'):",
      "        self.label = label",
      "    def value(self, n: int=2) -> int:",
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
    "value(n: int=2) -> int",
    "",
    "    Return an example value.",
    "Help on class Example:",
    "",
    "class Example(label: str='example')",
    "",
    "    An example class.",
    "",
    "Methods:",
    "    value(n: int=2) -> int",
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
  const multiprocessingFile = join(temporary, "multiprocessing-example.py");
  const standaloneEllipticFile = join(temporary, "standalone-elliptic.sage");
  const standaloneEllipticOutput = join(temporary, "standalone-elliptic.js");
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
    standaloneEllipticFile,
    "E = EllipticCurve([-1, 0])\nprint(E.local_data(2).kodaira_symbol())\n",
    "utf8",
  );
  writeFileSync(
    multiprocessingFile,
    [
      "from multiprocessing import Pool",
      "import os",
      "def square(n):",
      "    return n*n",
      "def modular_dimension(n):",
      "    return str(dimension_modular_forms(n, 8))",
      "with Pool(2) as workers:",
      "    print(workers.map(square, [3, 5, 7]))",
      "    print(workers.map(modular_dimension, [3, 5, 7]))",
      "print(os.cpu_count() >= 1)",
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
  assert.equal(
    run([multiprocessingFile]).trim(),
    "[9, 25, 49]\n['3', '5', '5']\nTrue",
  );
  run([
    "compile",
    "--output",
    standaloneEllipticOutput,
    standaloneEllipticFile,
  ]);
  const standaloneElliptic = spawnSync(
    process.execPath,
    [standaloneEllipticOutput],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_PATH: join(root, "node_modules"),
      },
    },
  );
  assert.equal(standaloneElliptic.status, 0, standaloneElliptic.stderr);
  assert.equal(standaloneElliptic.stdout.trim(), "III");
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
