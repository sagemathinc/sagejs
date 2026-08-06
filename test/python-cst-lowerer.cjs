"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
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
        frontend,
        source,
        parserOptions,
        outputOptions,
      );
      assert.equal(result.direct, true, `${source}: ${result.error?.message}`);
      assert.equal(result.sameJavaScript, true, source);
    }
  } finally {
    frontend.close();
  }
});

test("authoritative compilation sends only imports to the stage-zero resolver", async () => {
  const compiler = createCompiler();
  const originalParse = compiler.parse.bind(compiler);
  const bootstrapSources = [];
  compiler.parse = (source, options) => {
    bootstrapSources.push(source);
    return originalParse(source, options);
  };
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "import sagejs.runtime as runtime\n" +
      "answer = 6 * 7\n" +
      "try:\n    raise ValueError('bad') from cause\nexcept ValueError:\n    pass\n",
      parserOptions,
    );
    assert.equal(ast.body.length, 3);
    assert.deepEqual(bootstrapSources, ["import sagejs.runtime as runtime\n"]);
    assert.equal(ast.body[1].body.right.operator, "*");
  } finally {
    frontend.close();
  }
});
