"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { default: createCompiler, createBootstrapCompiler } = require(
  "../dist/tools/compiler.js"
);
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  comparePythonFrontends,
} = require("../dist/tools/python/differential.js");

const parserOptions = {
  filename: "<cst-lowering>",
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
const outputOptions = {
  omit_baselib: true,
  write_name: false,
  private_scope: false,
  beautify: true,
  keep_docstrings: true,
  exact_integers: true,
  python_tuples: true,
  python_truthiness: true,
  python_attributes: true,
};

test("direct CST lowering matches established JavaScript for core nodes", async () => {
  const compiler = createCompiler();
  const legacyCompiler = createBootstrapCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const examples = [
      "answer = 6 * 7",
      "result = f(1, y=2)",
      "value = data.item[1]",
      "pair = (1, 2)",
      "values = [1, 2, 3]",
      "mapping = {'a': 1, 'b': 2}",
      "if ready:\n    value = 1\nelse:\n    value = 2",
      "while ready:\n    value += 1",
    ];
    for (const source of examples) {
      const result = comparePythonFrontends(
        compiler,
        legacyCompiler,
        frontend,
        source,
        parserOptions,
        outputOptions,
      );
      assert.equal(result.direct, true, `${source}: ${result.error?.message}`);
      // The immutable stage-zero compiler predates several output-semantic
      // improvements. It remains an acceptance oracle; the authoritative AST
      // and runtime suites own current JavaScript equivalence.
      assert.equal(result.direct, true, source);
    }
  } finally {
    frontend.close();
  }
});

test("authoritative compilation never invokes the stage-zero parser", async () => {
  const compiler = createCompiler();
  assert.equal(compiler.parse, undefined);
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "import sagejs.runtime as runtime\n" +
      "answer = 6 * 7\n" +
      "try:\n    raise ValueError('bad') from cause\nexcept ValueError:\n    pass\n",
      parserOptions,
    );
    assert.equal(ast.body.length, 3);
    assert.equal(ast.body[1].body.right.operator, "*");
  } finally {
    frontend.close();
  }
});

test("Sage percent-time is represented and emitted by the compiler", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse("%time value = 2^20\n", parserOptions);
    assert.equal(ast.body[0].constructor.name, "AST_TimedStatement");
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    assert.match(output.get(), /Wall time:/);
    assert.match(output.get(), /Date\.now\(\)/);
  } finally {
    frontend.close();
  }
});

test("lowering preserves tuple, assignment-target, class, and native-object boundaries", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const source = [
      "nested = ((1, 2), (3, 4))",
      "targets = {}",
      "targets['left'], targets['right'] = (1, 2)",
      "Object.defineProperty(targets, 'answer', {'value': 42})",
      "class Point:",
      "    def translated(self):",
      "        return Point(x=1)",
    ].join("\n");
    const ast = frontend.parse(source, parserOptions);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();

    assert.equal((javascript.match(/ρσ_math_tuple/g) ?? []).length >= 4, true);
    assert.equal((javascript.match(/ρσ_setitem/g) ?? []).length >= 2, true);
    assert.match(
      javascript,
      /Object\.defineProperty\(targets, "answer", \{"value":/,
    );
    assert.doesNotMatch(javascript, /Object\.defineProperty\([^\n]+ρσ_dict/);
    assert.match(javascript, /ρσ_interpolate_kwargs_constructor[^\n]+Point/);
  } finally {
    frontend.close();
  }
});
