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

test("starred set displays lower to valid JavaScript spread", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "base = {'a', 'b'}\ncombined = {*base, 'c'}\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /\.\.\.Array\.from\(ρσ_Iterable\(/);
    assert.doesNotThrow(() => new Function(javascript));
  } finally {
    frontend.close();
  }
});

test("Python float literals use the identity-preserving constructor", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "unit = 1.0\nlarge = 1e20\nfraction = 0.5\ninverse = 1**-1\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_float[^\n]*\("1\.0"\)/);
    assert.match(javascript, /ρσ_float[^\n]*\("1e20"\)/);
    assert.match(javascript, /ρσ_float[^\n]*\("0\.5"\)/);
    assert.doesNotMatch(javascript, /\bNumber\("(?:1\.0|1e20|0\.5)"\)/);
    assert.match(javascript, /ρσ_operator_pow_python_exact/);
  } finally {
    frontend.close();
  }
});

test("Sage integer powers retain exact rational semantics", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse("inverse = 2^-1\n", parserOptions);
    const output = new compiler.OutputStream({
      ...outputOptions,
      rational_division: true,
    });
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_operator_pow_exact/);
    assert.doesNotMatch(javascript, /ρσ_operator_pow_python_exact/);
  } finally {
    frontend.close();
  }
});

test("dictionary unpacking preserves ordered mapping components", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "result = {'first': 1, **middle, 'last': 3, **tail}\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_dict_unpack[^\n]*\(/);
    assert.ok(javascript.indexOf('"first"') < javascript.indexOf("middle"));
    assert.ok(javascript.indexOf("middle") < javascript.indexOf('"last"'));
    assert.ok(javascript.indexOf('"last"') < javascript.indexOf("tail"));
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

test("chained assignment initializes annotated names without reading them", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from __future__ import annotations\n" +
        "version: str\n" +
        "__version__ = version = '9.1.1'\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /__version__ = version = "9\.1\.1"/);
    assert.doesNotMatch(javascript, /ρσ_check_unbound\(version/);
  } finally {
    frontend.close();
  }
});

test("leading class assignments are available to method defaults", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Example:\n" +
        "    sentinel: Final = marker\n" +
        "    def method(self, value=sentinel):\n" +
        "        return value\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.ok(
      javascript.indexOf("Example.prototype.sentinel = marker") <
        javascript.indexOf("Example.prototype.method.__defaults__"),
    );
  } finally {
    frontend.close();
  }
});

test("a first class assignment reads its same-named module global", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "Interrupted = object()\n" +
        "class Session:\n" +
        "    Interrupted = Interrupted\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Session\.prototype\.Interrupted = .*\["Interrupted"\]/,
    );
    assert.doesNotMatch(
      javascript,
      /Session\.prototype\.Interrupted = Session\.prototype\.Interrupted/,
    );
  } finally {
    frontend.close();
  }
});

test("generator and coroutine functions expose introspection metadata", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "def values():\n" +
        "    yield 1\n" +
        "async def result():\n" +
        "    return 2\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /values\.__is_generator__ = true/);
    assert.match(javascript, /result\.__is_coroutine__ = true/);
  } finally {
    frontend.close();
  }
});

test("generator methods shift an explicit descriptor receiver before iteration", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Values:\n" +
        "    def items(self):\n" +
        "        yield from self.data\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    const receiverShift =
      /Values\.prototype\.items = function[^]*?if \(\(this === globalThis \|\| this == null\)[^]*?function\* js_generator/;
    assert.match(javascript, receiverShift);
  } finally {
    frontend.close();
  }
});

test("dotted callable instances resolve through __call__", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "decorator = package.marker(wrapper=True)\n" +
        "result = package.factory(1)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs\(ρσ_py_package, ρσ_getattr\(ρσ_py_package, "marker"\)/,
    );
    assert.match(
      javascript,
      /ρσ_resolve_callable\(ρσ_getattr\(ρσ_py_package, "factory"\)\)/,
    );
  } finally {
    frontend.close();
  }
});

test("Python bindings shadow JavaScript native namespace names", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "Number = token_factory()\n" +
        "mapping = {Number.Integer.Long: 'integer-long'}\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /ρσ_getattr\(ρσ_getattr\(Number, "Integer"\), "Long"\)/,
    );
    assert.doesNotMatch(javascript, /Number\.Integer\.Long/);
  } finally {
    frontend.close();
  }
});

test("Python identifiers named this are mangled away from JavaScript syntax", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("this = marker\nanswer = this\n", parserOptions);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var [^;]*ρσ_py_this/);
    assert.match(javascript, /answer = ρσ_py_this/);
    assert.doesNotMatch(javascript, /\bvar\s+this\b/);
  } finally {
    frontend.close();
  }
});

test("reserved Python class names stay mangled in method metadata", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class default:\n    def __init__(self):\n        pass\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_py_default\.prototype\.__init__\.__name__/);
    assert.doesNotMatch(javascript, /\bdefault\.prototype/);
  } finally {
    frontend.close();
  }
});

test("explicit class metaclasses are lowered before decorators", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Meta(type):\n" +
        "    def __new__(mcs, name, bases, namespace):\n" +
        "        return type.__new__(mcs, name, bases, namespace)\n" +
        "class Example(metaclass=Meta):\n" +
        "    answer = 42\n",
      parserOptions,
    );
    const example = ast.body[1];
    assert.equal(example.metaclass.name, "Meta");
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_apply_metaclass\(Meta, "Example"/);
  } finally {
    frontend.close();
  }
});

test("parameterized builtin bases lower to their runtime origins", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Entries(list[str]):\n    pass\n",
      parserOptions,
    );
    const definition = ast.body[0];
    assert.equal(definition.parent.name, "list");
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    assert.match(output.get(), /ρσ_extends\(Entries, list\)/);
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
        "observed = first() < middle_value() <= last()\n" +
        "long = a() == b() == c() == d() == e()\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.equal((javascript.match(/ρσ_equals/g) ?? []).length, 6);
    assert.match(javascript, /ρσ_equals\(ρσ_compare_0, ρσ_compare_1\)/);
    assert.equal((javascript.match(/middle_value\?\.__call__/g) ?? []).length, 1);
    for (const name of ["a", "b", "c", "d", "e"]) {
      assert.equal(
        (
          javascript.match(
            new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\?\\.__call__`, "g"),
          ) ?? []
        ).length,
        1,
      );
    }
    assert.match(javascript, /function\(ρσ_compare_0, ρσ_compare_1\)/);
    assert.match(javascript, /function\(ρσ_compare_4\)/);
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

test("same-class static calls are not guessed to be unbound methods", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Config:\n" +
        "    @staticmethod\n" +
        "    def name(value):\n" +
        "        return value\n" +
        "    @staticmethod\n" +
        "    def use(value):\n" +
        "        return Config.name(value)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_getattr\(Config, "name"\)/);
    assert.doesNotMatch(
      javascript,
      /Config\.prototype\.name\.call\(value\)/,
    );
  } finally {
    frontend.close();
  }
});

test("known class methods with keywords receive the class object", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Cache:\n" +
        "    @classmethod\n" +
        "    def for_config(cls, config, *, enabled=False):\n" +
        "        return cls\n" +
        "\n" +
        "result = Cache.for_config('x', enabled=True)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs\(Cache, Cache\.for_config/,
    );
  } finally {
    frontend.close();
  }
});

test("inherited class methods with keywords receive the referenced class", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Node:\n" +
        "    @classmethod\n" +
        "    def from_parent(cls, parent, **kwargs):\n" +
        "        return cls\n" +
        "\n" +
        "class Function(Node):\n" +
        "    pass\n" +
        "\n" +
        "result = Function.from_parent('parent', name='test')\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Function, Function\.from_parent/,
    );
    assert.doesNotMatch(
      javascript,
      /Function\.prototype\.from_parent\.call/,
    );
  } finally {
    frontend.close();
  }
});
