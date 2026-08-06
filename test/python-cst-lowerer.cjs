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

test("comprehension targets stay in their implicit Python 3 scope", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "values = [v for v in range(3)]\n" +
      "mapping = {key: value for key, value in [(1, 2)]}\n",
      parserOptions,
    );
    const exports = ast.exports.map((symbol) => symbol.name);
    assert.deepEqual(exports.sort(), ["mapping", "values"]);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.doesNotMatch(javascript.split("\n")[0], /\bv\b/);
  } finally {
    frontend.close();
  }
});

test("module fallback names and explicit line continuations preserve Python semantics", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "try:\n    optional_name\nexcept NameError:\n    optional_name = 42\n" +
      "answer = optional_name <= \\\n    43\n",
      parserOptions,
    );
    assert.deepEqual(ast.annotated_locals, ["optional_name"]);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_check_unbound\(optional_name/);
    assert.doesNotMatch(javascript, /<= \\/);
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

test("observable chained assignments use Python hooks from left to right", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "first.child.value = second.child.value = marker\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /function\(ρσ_chain_assign_temp\)/);
    assert.equal((javascript.match(/ρσ_setattr/g) ?? []).length, 2);
    assert.match(javascript, /ρσ_getattr\(first, "child"\)/);
    assert.match(javascript, /ρσ_getattr\(second, "child"\)/);
    assert.ok(
      javascript.indexOf('ρσ_getattr(first, "child")') <
        javascript.indexOf('ρσ_getattr(second, "child")'),
    );

    const itemAst = frontend.parse(
      "shared = values[0] = marker\n",
      parserOptions,
    );
    const itemOutput = new compiler.OutputStream(outputOptions);
    itemAst.print(itemOutput);
    const itemJavascript = itemOutput.get();
    assert.match(itemJavascript, /function\(ρσ_chain_assign_temp\)/);
    assert.match(itemJavascript, /shared = ρσ_chain_assign_temp/);
    assert.match(itemJavascript, /ρσ_setitem\(values/);
    assert.ok(
      itemJavascript.indexOf("shared = ρσ_chain_assign_temp") <
        itemJavascript.indexOf("ρσ_setitem(values"),
    );
  } finally {
    frontend.close();
  }
});

test("chained comparisons preserve Python dispatch and shared operands", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "simple = left == middle == right\n" +
      "observed = first() < middle_value() <= last()\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.equal((javascript.match(/ρσ_equals/g) ?? []).length, 2);
    assert.match(javascript, /ρσ_equals\(left, middle\) && ρσ_equals\(middle, right\)/);
    assert.equal((javascript.match(/middle_value\?\.__call__/g) ?? []).length, 1);
    assert.match(javascript, /function\(ρσ_compare_left, ρσ_compare_middle\)/);
    assert.match(javascript, /&&/);
  } finally {
    frontend.close();
  }
});

test("nested loop targets unpack only the target pattern", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "for index, (value, expected) in items:\n" +
      "    result = (index, value, expected)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    assert.match(
      output.get(),
      /ρσ_unpack_nested\(\[null, \[null, null\]\], ρσ_Index/,
    );
  } finally {
    frontend.close();
  }
});
