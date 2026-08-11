"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

const root = resolve(__dirname, "..");
const parserOptions = {
  filename: "<container-truthiness>",
  for_linting: true,
  import_dirs: [],
  exact_integer_literals: true,
  strict_python_scopes: true,
  scoped_flags: {
    dict_literals: true,
    overload_getitem: true,
    bound_methods: true,
    sequential_definitions: true,
  },
};

const source = [
  "events = []",
  "def mark(label, value):",
  "    events.append(label)",
  "    return value",
  "class FalseByBool:",
  "    def __bool__(self):",
  "        return False",
  "    def __len__(self):",
  "        return 7",
  "class TrueByBool:",
  "    def __bool__(self):",
  "        return True",
  "class EmptyByLen:",
  "    def __len__(self):",
  "        return 0",
  "class FullByLen:",
  "    def __len__(self):",
  "        return 3",
  "class FalseFloat:",
  "    def __bool__(self):",
  "        return False",
  "    def __float__(self):",
  "        return 2.5",
  "class FalseIndex:",
  "    def __bool__(self):",
  "        return False",
  "    def __index__(self):",
  "        return 9",
  "class FalseInt:",
  "    def __bool__(self):",
  "        return False",
  "    def __int__(self):",
  "        return 11",
  "values = [",
  "    [], [1], (), (1,), {}, {'x': 1}, set(), {1},",
  "    '', 'x', b'', b'x', range(0), range(1),",
  "    FalseByBool(), TrueByBool(), EmptyByLen(), FullByLen(),",
  "]",
  "print([bool(value) for value in values])",
  "print(float(FalseFloat()), float(FalseIndex()), int(FalseInt()))",
  "for converter in (int, float):",
  "    try:",
  "        converter(b'')",
  "    except Exception as error:",
  "        print(type(error).__name__)",
  "branches = []",
  "for index, value in enumerate(values):",
  "    if value:",
  "        branches.append('T' + str(index))",
  "    elif not value:",
  "        branches.append('F' + str(index))",
  "print(branches)",
  "right = []",
  "iterations = 0",
  "while right:",
  "    iterations += 1",
  "    assert iterations < 2",
  "print('while-empty', iterations, bool(right))",
  "print(['yes' if value else 'no' for value in values])",
  "print([not value for value in values])",
  "events = []",
  "print(mark('false-and', []) and mark('missed-and', 5))",
  "print(mark('true-or', [1]) or mark('missed-or', 6))",
  "print(mark('true-and', [1]) and mark('hit-and', 7))",
  "print(mark('false-or', []) or mark('hit-or', 8))",
  "print(events)",
  "assert not []",
  "assert [1]",
  "try:",
  "    assert []",
  "except AssertionError:",
  "    print('assert-empty')",
  "print([value for value in range(4) if value])",
  "",
].join("\n");

async function compileWithDefaultTruthiness(program, overrides = {}) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(program, parserOptions);
    const output = new compiler.OutputStream({
      baselib_plain: readFileSync(
        join(root, "dist", "compiler", "baselib-plain-pretty.js"),
        "utf8",
      ),
      beautify: true,
      private_scope: false,
      write_name: false,
      exact_integers: true,
      python_tuples: true,
      python_attributes: true,
      ...overrides,
    });
    ast.print(output);
    return output.get();
  } finally {
    frontend.close();
  }
}

function generatedFunctionBody(javascript, name) {
  const start = javascript.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing generated function ${name}`);
  const end = javascript.indexOf(`${name}.__name__`, start);
  assert.notEqual(end, -1, `missing metadata after generated function ${name}`);
  return javascript.slice(start, end);
}

test("only the truth primitive uses native bootstrap conditions", () => {
  const baselib = readFileSync(
    join(root, "dist", "compiler", "baselib-plain-pretty.js"),
    "utf8",
  );
  const truthPrimitive = generatedFunctionBody(baselib, "ρσ_bool");
  const divisionNeighbor = generatedFunctionBody(
    baselib,
    "ρσ_operator_truediv",
  );
  const roundNeighbor = generatedFunctionBody(baselib, "ρσ_round");
  const keywordInterpolator = generatedFunctionBody(
    baselib,
    "ρσ_interpolate_kwargs",
  );
  const legacyKeywordInterpolator = generatedFunctionBody(
    baselib,
    "ρσ_interpolate_kwargs_legacy",
  );

  // Calling the truth primitive from its own conditions would recurse.  Its
  // `and`/`or` expressions must also remain native so they cannot overwrite a
  // caller's shared short-circuit temporary while deciding its truth value.
  assert.doesNotMatch(
    truthPrimitive.slice(truthPrimitive.indexOf("{") + 1),
    /ρσ_bool\(/,
  );
  assert.doesNotMatch(truthPrimitive, /ρσ_cond_temp/);

  // This exception is exactly function-scoped, not a builtins-module escape
  // hatch: functions on both sides of it retain Python-aware truth tests.
  assert.match(divisionNeighbor, /if \(ρσ_bool\(/);
  assert.match(roundNeighbor, /if \(ρσ_bool\(/);

  // Lexical baselib modules deliberately do not publish compiler helpers on
  // globalThis.  Correctly treating an empty `__argnames__` array as false
  // reaches these callable-adapter branches, so they must resolve getattr
  // through the explicit builtins module registry.
  for (const body of [keywordInterpolator, legacyKeywordInterpolator]) {
    assert.match(body, /_internal_builtin[^\n]*"ρσ_getattr"/);
    assert.doesNotMatch(body, /globalThis, "ρσ_getattr"/);
  }
});

test("Python truth testing is the safe OutputStream default", async () => {
  const javascript = await compileWithDefaultTruthiness(source);
  assert.match(javascript, /while \(ρσ_bool\(right\)\)/);
  assert.doesNotMatch(javascript, /while \(right\)/);
  assert.match(javascript, /if \(ρσ_bool\(value\)\)/);
  assert.match(javascript, /!ρσ_bool\(value\)/);
  assert.match(javascript, /ρσ_bool\(ρσ_cond_temp\) \?/);

  const directory = mkdtempSync(join(tmpdir(), "sagejs-truthiness-"));
  const pythonPath = join(directory, "truthiness.py");
  const javascriptPath = join(directory, "truthiness.js");
  let cpython;
  let generated;
  try {
    writeFileSync(pythonPath, source);
    writeFileSync(javascriptPath, javascript);
    cpython = spawnSync("python3", [pythonPath], {
      cwd: root,
      encoding: "utf8",
      timeout: 5_000,
    });
    generated = spawnSync(process.execPath, [javascriptPath], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      timeout: 5_000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(cpython.error, undefined, cpython.error?.message);
  assert.equal(cpython.status, 0, cpython.stderr);
  assert.equal(generated.error, undefined, generated.error?.message);
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
  assert.equal(generated.stderr, "");
  assert.equal(generated.stdout, cpython.stdout);
});

test("JavaScript truth testing remains an explicit escape hatch", async () => {
  const javascript = await compileWithDefaultTruthiness(
    "right = []\nwhile right:\n    break\n",
    { omit_baselib: true, python_truthiness: false },
  );
  assert.match(javascript, /while \(right\)/);
  assert.doesNotMatch(javascript, /while \(ρσ_bool\(right\)\)/);
});

test("truth testing and rich ordering are independent policies", async () => {
  const program = "left = []\nright = [1]\nif left < right:\n    print('ordered')\n";
  const richOrdering = await compileWithDefaultTruthiness(program, {
    omit_baselib: true,
    python_truthiness: false,
  });
  assert.match(richOrdering, /ρσ_operator_lt\(left, right\)/);

  const nativeOrdering = await compileWithDefaultTruthiness(
    program,
    { omit_baselib: true, python_ordering: false },
  );
  assert.match(nativeOrdering, /if \(ρσ_bool\(left < right\)\)/);
  assert.doesNotMatch(nativeOrdering, /ρσ_operator_lt\(left, right\)/);
});
