// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Script } = require("node:vm");

const { default: createCompiler, createBootstrapCompiler } = require(
  "../dist/tools/compiler.js"
);
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  comparePythonFrontends,
} = require("../dist/tools/python/differential.js");
const {
  installTimingHooks,
  measureInitialization,
} = require("../dist/tools/timing.js");

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

function checkedModuleRead(name, moduleId = "__main__") {
  return `ρσ_check_unbound(ρσ_resolve_module_name(void 0, ${JSON.stringify(name)}, ` +
    `ρσ_modules[${JSON.stringify(moduleId)}], (typeof __builtins__ !== "undefined" ? ` +
    `__builtins__ : (ρσ_modules.builtins || globalThis))), ${JSON.stringify(name)})`;
}

// Assert the complete namespace/unbound-check protocol before normalizing only
// these named reads for structural emitter assertions. This preserves call
// counts and ordering, and cannot hide a wrong scope, binding, or missing check.
function normalizeCheckedModuleReads(javascript, names) {
  for (const name of names) {
    const checked = checkedModuleRead(name);
    assert.ok(javascript.includes(checked), `missing checked module read: ${name}`);
    javascript = javascript.split(checked).join(name);
  }
  return javascript;
}

// The timing tests deliberately execute no baselib. Supply only the exact
// lookup contract their one host callback needs, validating every namespace
// argument rather than silently treating name-resolution helpers as identities.
function installTimingLookupFixture(name, callback) {
  const bindings = Object.freeze({ [name]: callback });
  const names = [
    "__builtins__", "ρσ_modules", "ρσ_resolve_module_name", "ρσ_check_unbound",
  ];
  const saved = names.map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  Object.assign(globalThis, {
    __builtins__: bindings,
    ρσ_modules: { builtins: bindings },
    ρσ_resolve_module_name(value, actualName, namespace, builtins) {
      assert.equal(value, undefined);
      assert.equal(actualName, name);
      assert.equal(namespace, globalThis.ρσ_modules.__main__);
      assert.equal(builtins, bindings);
      return bindings[actualName];
    },
    ρσ_check_unbound(value, actualName) {
      assert.equal(actualName, name);
      assert.equal(value, callback);
      return value;
    },
  });
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

test("checked-read normalization preserves counts and rejects stale lookup shapes", () => {
  const read = checkedModuleRead("value");
  assert.equal(normalizeCheckedModuleReads(`${read}; ${read}`, ["value"]), "value; value");
  for (const stale of [
    "value",
    checkedModuleRead("value", "wrong_module"),
    read.replace('))), "value")', '))), "wrong_name")'),
    read.replace("void 0", "value"),
  ]) {
    assert.throws(() => normalizeCheckedModuleReads(stale, ["value"]),
      /missing checked module read: value/);
  }
});

function wrapTimeitStatement(compiler, ast, { number, repeat = 7 } = {}) {
  const statements = ast.body;
  const body =
    statements.length === 1
      ? statements[0]
      : new compiler.AST_BlockStatement({
          start: statements[0]?.start ?? ast.start,
          end: statements.at(-1)?.end ?? ast.end,
          body: statements,
        });
  const statement = new compiler.AST_TimedStatement({
    start: body.start,
    end: body.end,
    body,
  });
  statement.timeit_number = number ?? null;
  statement.timeit_repeat = repeat;
  ast.body = [statement];
  return ast;
}

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

test("closed modular recurrences receive a guarded scalar loop", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const emit = (source) => {
      const ast = frontend.parse(source, parserOptions);
      const output = new compiler.OutputStream(outputOptions);
      ast.print(output);
      return output.get();
    };
    const optimized = emit(`
def recurrence(n, field):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for index in range(n):
        value = value * multiplier + increment
    return value
`);
    assert.match(optimized, /ρσ_prepare_machine_field_region\(/);
    assert.match(optimized, /ρσ_FieldCount\d+, 5, \[\]\)/);
    assert.match(optimized, /ρσ_fast_machine_residue_recurrence\(/);
    assert.match(optimized, /ρσ_FieldAdaptiveResult\d+ !== null/);
    assert.match(optimized, /ρσ_operator_add_exact\(ρσ_operator_mul_exact\(/);

    const generic = (() => {
      const ast = frontend.parse(`
def recurrence(n, field):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for index in range(n):
        value = value * multiplier + increment
    return value
`, { ...parserOptions, optimization_level: "O0" });
      const output = new compiler.OutputStream(outputOptions);
      ast.print(output);
      return output.get();
    })();
    assert.doesNotMatch(generic, /ρσ_prepare_machine_field_region\(/);
    assert.doesNotMatch(generic, /ρσ_fast_machine_residue_recurrence\(/);
    assert.match(generic, /ρσ_operator_add_exact\(ρσ_operator_mul_exact\(/);

    for (const source of [
      `for multiplier in range(count):\n    value = value * multiplier + increment\n`,
      `for index in range(count):\n    value = value * multiplier + increment\n    seen.append(1)\n`,
      `for index in range(count):\n    value = value * multiplier + increment\nelse:\n    finished = True\n`,
      `range = custom_range\nfor index in range(count):\n    value = value * multiplier + increment\n`,
    ]) {
      assert.doesNotMatch(emit(source), /ρσ_prepare_machine_field_region\(/);
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

test("starred assignment targets are declared in every Python scope", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "first, *rest = [1, 2, 3]\n" +
        "def split(values):\n" +
        "    head, *middle, last = values\n" +
        "    return head, middle, last\n",
      parserOptions,
    );
    assert.deepEqual(
      ast.localvars.map((symbol) => symbol.name),
      ["ρσ_unpack", "first", "rest"],
    );
    const split = ast.body.find((statement) =>
      statement instanceof compiler.AST_Lambda
    );
    assert.ok(split);
    assert.deepEqual(
      split.localvars.map((symbol) => symbol.name),
      ["ρσ_unpack", "head", "middle", "last"],
    );

    const output = new compiler.OutputStream({
      ...outputOptions,
      private_scope: true,
    });
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var ρσ_unpack, \$ρσ\$py\$first, \$ρσ\$py\$rest/);
    assert.match(
      javascript,
      /var ρσ_unpack, \$ρσ\$py\$head, \$ρσ\$py\$middle, \$ρσ\$py\$last/,
    );
  } finally {
    frontend.close();
  }
});

test("bare and reusable main programs emit strict JavaScript", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    for (const reuse_main_module of [false, true]) {
      const ast = frontend.parse("answer = 42\n", {
        ...parserOptions,
        reuse_main_module,
      });
      const output = new compiler.OutputStream({
        ...outputOptions,
        private_scope: false,
        reuse_main_module,
      });
      ast.print(output);
      const javascript = output.get();
      assert.match(javascript, /^"use strict";/);
      assert.match(
        javascript,
        /__sagejs_module_namespaces__\.add\(ρσ_modules\.__main__\)/,
      );
    }
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
    assert.match(output.get(), /__sagejs_timing_start__/);
    assert.match(output.get(), /__sagejs_timing_finish__/);
    assert.match(output.get(), /performance\.now\(\)/);
    assert.doesNotThrow(() => new Script(output.get()));
  } finally {
    frontend.close();
  }
});

test("compiler-marked timeit calibrates an inline statement", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const saved = new Map(
    ["tick", "ρσ_resolve_callable", "ρσ_check_interrupt"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const reports = [];
  let now = 0;
  let ticks = 0;
  const uninstallTimingHooks = installTimingHooks(
    globalThis,
    (text) => reports.push(text),
    {
      timeitPolicy: {
        now: () => now,
        calibrationTargetMs: 2,
        maximumNumber: 10_000,
      },
    },
  );
  globalThis.tick = () => {
    ticks += 1;
    now += 0.025;
  };
  globalThis.ρσ_resolve_callable = (value) => value;
  globalThis.ρσ_check_interrupt = () => undefined;
  const restoreLookup = installTimingLookupFixture("tick", globalThis.tick);
  let temporaryName;
  let previousTemporary;
  try {
    const ast = wrapTimeitStatement(
      compiler,
      frontend.parse("tick()\n", parserOptions),
    );
    assert.equal(ast.body[0].constructor.name, "AST_TimedStatement");
    assert.equal(ast.body[0].timeit_number, null);
    assert.equal(ast.body[0].timeit_repeat, 7);
    const explicit = wrapTimeitStatement(
      compiler,
      frontend.parse("tick()\n", parserOptions),
      { number: 4, repeat: 2 },
    );
    assert.equal(explicit.body[0].timeit_number, 4);
    assert.equal(explicit.body[0].timeit_repeat, 2);

    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /__sagejs_timeit_start__/);
    assert.match(javascript, /for \(ρσ_time_start_/);
    assert.match(javascript, /ρσ_check_interrupt/);
    temporaryName = javascript.match(
      /const (ρσ_time_start_[A-Za-z0-9_]+_context) =/,
    )?.[1];
    assert.ok(temporaryName);
    assert.doesNotMatch(javascript, /globalThis\["ρσ_time_start_.*_context/);
    previousTemporary = Object.getOwnPropertyDescriptor(
      globalThis,
      temporaryName,
    );
    const sentinel = {};
    globalThis[temporaryName] = sentinel;
    new Script(javascript).runInThisContext();
    assert.equal(ticks, 812);
    assert.equal(globalThis[temporaryName], sentinel);
    assert.equal(reports.length, 1);
    assert.match(
      reports[0],
      /^25\.0 µs ± 0 µs per loop .*7 runs, 100 loops each\)$/,
    );
  } finally {
    restoreLookup();
    uninstallTimingHooks();
    if (temporaryName) {
      if (previousTemporary) {
        Object.defineProperty(globalThis, temporaryName, previousTemporary);
      } else {
        delete globalThis[temporaryName];
      }
    }
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    frontend.close();
  }
});

test("compiler-emitted timeit aborts cleanly after an exception", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const saved = new Map(
    ["timeit_boom", "ρσ_resolve_callable", "ρσ_check_interrupt"].map(
      (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)],
    ),
  );
  const reports = [];
  const uninstallTimingHooks = installTimingHooks(globalThis, (text) =>
    reports.push(text),
  );
  const failure = new Error("timeit failure");
  globalThis.timeit_boom = () => {
    throw failure;
  };
  globalThis.ρσ_resolve_callable = (value) => value;
  globalThis.ρσ_check_interrupt = () => undefined;
  const restoreLookup = installTimingLookupFixture(
    "timeit_boom", globalThis.timeit_boom,
  );
  try {
    const ast = wrapTimeitStatement(
      compiler,
      frontend.parse("timeit_boom()\n", parserOptions),
      { number: 2, repeat: 2 },
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    assert.throws(
      () => new Script(output.get()).runInThisContext(),
      (error) => error === failure,
    );
    measureInitialization(
      "runtime",
      "unrelated later initialization",
      () => undefined,
    );
    assert.deepEqual(reports, []);
  } finally {
    restoreLookup();
    uninstallTimingHooks();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    frontend.close();
  }
});

test("compiler-emitted timing closes its collector when execution raises", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const previousBoom = Object.getOwnPropertyDescriptor(globalThis, "boom");
  const previousResolveCallable = Object.getOwnPropertyDescriptor(
    globalThis,
    "ρσ_resolve_callable",
  );
  const reports = [];
  const uninstallTimingHooks = installTimingHooks(globalThis, (text) =>
    reports.push(text),
  );
  const installedStart = globalThis.__sagejs_timing_start__;
  const installedFinish = globalThis.__sagejs_timing_finish__;
  let token;
  let completedTiming;
  globalThis.__sagejs_timing_start__ = () => {
    token = installedStart();
    return token;
  };
  globalThis.__sagejs_timing_finish__ = (candidate) => {
    completedTiming = installedFinish(candidate);
    return completedTiming;
  };
  const failure = new Error("timed failure");
  globalThis.boom = () => {
    throw failure;
  };
  globalThis.ρσ_resolve_callable = (value) => value;
  const restoreLookup = installTimingLookupFixture("boom", globalThis.boom);
  try {
    const ast = frontend.parse("%time boom()\n", parserOptions);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);

    assert.throws(
      () => new Script(output.get()).runInThisContext(),
      (error) => error === failure,
    );
    measureInitialization(
      "runtime",
      "unrelated later initialization",
      () => undefined,
    );

    assert.equal(token.finished, true);
    assert.deepEqual(completedTiming.initialization, []);
    assert.equal(reports.length, 1);
  } finally {
    if (token && !token.finished) installedFinish(token);
    restoreLookup();
    uninstallTimingHooks();
    if (previousBoom) {
      Object.defineProperty(globalThis, "boom", previousBoom);
    } else {
      delete globalThis.boom;
    }
    if (previousResolveCallable) {
      Object.defineProperty(
        globalThis,
        "ρσ_resolve_callable",
        previousResolveCallable,
      );
    } else {
      delete globalThis.ρσ_resolve_callable;
    }
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
    assert.match(
      javascript,
      /var ρσ_Result\s+= \[\], \$ρσ\$py\$v;/,
    );
    assert.match(
      javascript,
      /var ρσ_Result\s+= ρσ_dict\(\), ρσ_unpack, \$ρσ\$py\$key, \$ρσ\$py\$value;/,
    );
    assert.doesNotMatch(
      javascript,
      /ρσ_resolve_module_name\(\$ρσ\$py\$(?:v|key|value)/,
    );
    assert.doesNotMatch(javascript, /\["(?:v|key|value)"\]:/);
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
    assert.match(
      javascript,
      /ρσ_check_unbound\(ρσ_resolve_module_name\(\$ρσ\$py\$optional_name/,
    );
    assert.match(
      javascript,
      /ρσ_resolve_module_name\(\$ρσ\$py\$optional_name, "optional_name"/,
    );
    assert.doesNotMatch(javascript, /<= \\/);
  } finally {
    frontend.close();
  }
});

test("module-level global declarations retain isolated lexical cells", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "global Object\nObject = 'module value'\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var [^;]*\$ρσ\$py\$Object[^;]*;/);
    assert.match(
      javascript,
      /\["Object"\]: \{enumerable:true,get:\(\)=>\$ρσ\$py\$Object/,
    );
    assert.match(javascript, /\$ρσ\$py\$Object = "module value"/);
    assert.doesNotMatch(javascript, /(?:^|\n)var Object;/);
  } finally {
    frontend.close();
  }
});

test("class-body global declarations bind the isolated module cell", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "import sagejs.runtime as runtime\n" +
        "class Holder:\n" +
        "    global Object\n" +
        "    Object = 'class value'\n" +
        "    global runtime\n" +
        "    runtime = replacement\n" +
        "answer = runtime.native_get(target, property_name)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var [^;]*\$ρσ\$py\$Object[^;]*;/);
    assert.match(javascript, /\$ρσ\$py\$Object = "class value"/);
    assert.doesNotMatch(javascript, /Holder\.prototype\.Object/);
    assert.doesNotMatch(javascript, /(?:^|\n)var Object;/);
    assert.match(
      javascript,
      /\$ρσ\$py\$runtime = ρσ_resolve_module_name\(void 0, "replacement"/,
    );
    assert.match(
      javascript,
      /ρσ_getattr_internal\([^;\n]*\$ρσ\$py\$runtime[^;\n]*"native_get"/,
    );
    assert.doesNotMatch(javascript, /\$ρσ\$py\$answer = target\[property_name\]/);
  } finally {
    frontend.close();
  }
});

test("same-named module assignments fall back to Python builtins", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "try:\n    next = next\nexcept NameError:\n    next = lambda value: value.next()\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /\$ρσ\$py\$next = ρσ_check_unbound\(ρσ_resolve_module_name\(\$ρσ\$py\$next, "next"/,
    );
  } finally {
    frontend.close();
  }
});

test("module exception targets use the containing lexical cell", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "try:\n    raise ValueError()\nexcept ValueError as len:\n    pass\n" +
        "answer = len([1, 2])\n",
      parserOptions,
    );
    assert.ok(ast.localvars.some((symbol) => symbol.name === "len"));
    assert.ok(ast.exports.some((symbol) => symbol.name === "len"));
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var [^;]*\$ρσ\$py\$len[^;]*;/);
    assert.match(
      javascript,
      /\["len"\]: \{enumerable:true,get:\(\)=>\$ρσ\$py\$len/,
    );
    assert.match(javascript, /\$ρσ\$py\$len = ρσ_Exception/);
    assert.match(javascript, /\$ρσ\$py\$len = ρσ_cleared_exception/);
    assert.doesNotMatch(javascript, /var \$ρσ\$py\$len = ρσ_Exception/);
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
    const javascript = normalizeCheckedModuleReads(output.get(), ["Object"]);

    assert.equal((javascript.match(/ρσ_math_tuple/g) ?? []).length >= 4, true);
    assert.equal((javascript.match(/ρσ_setitem/g) ?? []).length >= 2, true);
    assert.match(
      javascript,
      /Object\.defineProperty\(\$ρσ\$py\$targets, "answer", \{"value":/,
    );
    assert.doesNotMatch(javascript, /Object\.defineProperty\([^\n]+ρσ_dict/);
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs_constructor[^\n]+\$ρσ\$py\$Point/,
    );
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
    const javascript = normalizeCheckedModuleReads(output.get(), [
      "first", "second", "marker",
    ]);
    assert.match(javascript, /function\(ρσ_chain_assign_temp\)/);
    assert.equal((javascript.match(/ρσ_setattr/g) ?? []).length, 2);
    assert.match(
      javascript,
      /ρσ_getattr_internal\(first, "child", ρσ_getattr_missing\)/,
    );
    assert.match(
      javascript,
      /ρσ_getattr_internal\(second, "child", ρσ_getattr_missing\)/,
    );
    assert.ok(
      javascript.indexOf(
        'ρσ_getattr_internal(first, "child", ρσ_getattr_missing)',
      ) <
        javascript.indexOf(
          'ρσ_getattr_internal(second, "child", ρσ_getattr_missing)',
        ),
    );

    const itemAst = frontend.parse(
      "shared = values[0] = marker\n",
      parserOptions,
    );
    const itemOutput = new compiler.OutputStream(outputOptions);
    itemAst.print(itemOutput);
    const itemJavascript = normalizeCheckedModuleReads(itemOutput.get(), [
      "values", "marker",
    ]);
    assert.match(itemJavascript, /function\(ρσ_chain_assign_temp\)/);
    assert.match(itemJavascript, /shared = ρσ_chain_assign_temp/);
    assert.match(itemJavascript, /ρσ_setitem\(values/);
    assert.ok(
      itemJavascript.indexOf("shared = ρσ_chain_assign_temp") <
        itemJavascript.indexOf("ρσ_setitem(values"),
    );

    const chainedItemsAst = frontend.parse(
      "values[0] = values[1] = marker\n",
      parserOptions,
    );
    const chainedItemsOutput = new compiler.OutputStream(outputOptions);
    chainedItemsAst.print(chainedItemsOutput);
    const chainedItemsJavascript = normalizeCheckedModuleReads(chainedItemsOutput.get(), [
      "values", "marker",
    ]);
    assert.match(chainedItemsJavascript, /function\(ρσ_chain_assign_temp\)/);
    assert.equal((chainedItemsJavascript.match(/ρσ_setitem/g) ?? []).length, 2);
    assert.ok(
      chainedItemsJavascript.indexOf(
        'ρσ_setitem(values, ρσ_resolve_callable(Integer)("0")',
      ) <
        chainedItemsJavascript.indexOf(
          'ρσ_setitem(values, ρσ_resolve_callable(Integer)("1")',
        ),
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
    assert.match(
      javascript,
      /\$ρσ\$py\$__version__ = \$ρσ\$py\$version = "9\.1\.1"/,
    );
    assert.doesNotMatch(javascript, /ρσ_check_unbound\(\$ρσ\$py\$version/);
  } finally {
    frontend.close();
  }
});

test("Python augmented division selects true division instead of Sage rationals", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("value /= 4\n", parserOptions);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_operator_idiv_python_exact/);
    assert.doesNotMatch(javascript, /ρσ_operator_idiv_exact/);
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
      /Session\.prototype\.Interrupted = ρσ_resolve_module_name\(void 0, "Interrupted"/,
    );
    assert.doesNotMatch(
      javascript,
      /Session\.prototype\.Interrupted = Session\.prototype\.Interrupted/,
    );
  } finally {
    frontend.close();
  }
});

test("a first annotated class assignment reads its same-named module global", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "description = 'outer'\n" +
        "class Application:\n" +
        "    description: str = str(description)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Application\.prototype\.description = ρσ_resolve_callable\(ρσ_resolve_module_name\(void 0, "str"[^;]+\)\(ρσ_check_unbound\(ρσ_resolve_module_name\(void 0, "description"/,
    );
    assert.doesNotMatch(
      javascript,
      /str\)\(Application\.prototype\.description\)/,
    );
  } finally {
    frontend.close();
  }
});

test("formatted strings invoke format on their template value", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse("result = f'{value!r}'\n", parserOptions);
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /\ρσ_getattr_internal\("\{!r\}", "format"/,
    );
    assert.doesNotMatch(
      javascript,
      /\ρσ_getattr_internal\(ρσ_str, "format"/,
    );
  } finally {
    frontend.close();
  }
});

test("decorated instance methods adapt receivers into explicit arguments", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Session:\n" +
        "    @contextmanager\n" +
        "    def transaction(self):\n" +
        "        yield self\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Session\.prototype\.transaction = \(function\(ρσ_original_method\)/,
    );
    assert.match(
      javascript,
      /ρσ_original_method\.__sagejs_method_signature_excludes_self__=true/,
    );
    assert.match(javascript, /ρσ_native_method_adapter\(ρσ_decorated_method\)/);
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
    const javascript = normalizeCheckedModuleReads(output.get(), ["package"]);
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs\(package, ρσ_getattr_internal\(package, "marker", ρσ_getattr_missing\)/,
    );
    assert.match(
      javascript,
      /ρσ_resolve_callable\(ρσ_getattr_internal\(package, "factory", ρσ_getattr_missing\)\)/,
    );
  } finally {
    frontend.close();
  }
});

test("subscripted callable instances resolve through __call__", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "result = handlers[name](owner, proposal)\n" +
        "configured = handlers[name](owner, allow_none=True)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = normalizeCheckedModuleReads(output.get(), [
      "handlers", "name", "owner", "proposal",
    ]);
    assert.match(
      javascript,
      /\u03c1\u03c3_resolve_callable\(\u03c1\u03c3_getitem\([^\n]+\)\)\(owner, proposal\)/,
    );
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs\(ρσ_expr_temp, ρσ_resolve_callable\(ρσ_expr_temp\), \[owner\]\.concat/,
    );
  } finally {
    frontend.close();
  }
});

test("inherited class variables stay out of subclass namespaces", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Base:\n" +
        "    inherited = 1\n" +
        "class Child(Base):\n" +
        "    local = 2\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.doesNotMatch(
      javascript,
      /\$ρσ\$py\$Child\["inherited"\]\s*=/,
    );
    assert.match(javascript, /\$ρσ\$py\$Child\["local"\]\s*=/);
  } finally {
    frontend.close();
  }
});

test("Python dir loops preserve inherited namespace entries", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "for name in dir(cls):\n" +
        "    consume(name)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = normalizeCheckedModuleReads(output.get(), ["dir", "cls"]);
    assert.doesNotMatch(javascript, /for \([^)]* in cls\)/);
    assert.match(javascript, /ρσ_resolve_callable\(dir\)\(cls\)/);
    assert.match(javascript, /for \(var ρσ_Index\d+ of ρσ_Iter\d+\)/);
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
      /ρσ_getattr_internal\(ρσ_getattr_internal\(\$ρσ\$py\$Number, "Integer", ρσ_getattr_missing\), "Long", ρσ_getattr_missing\)/,
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
    assert.match(javascript, /var [^;]*\$ρσ\$py\$this/);
    assert.match(javascript, /\$ρσ\$py\$answer = \$ρσ\$py\$this/);
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
    assert.match(
      javascript,
      /\$ρσ\$py\$default\.prototype\.__init__\.__name__/,
    );
    assert.doesNotMatch(javascript, /(?:^|[^\w$])default\.prototype/);
  } finally {
    frontend.close();
  }
});

test("zero-argument super uses hygienic class and receiver bindings", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Object(Base):\n" +
        "    def __init__(Reflect, value):\n" +
        "        super().__init__(value)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.ok(javascript.includes(
      `ρσ_resolve_callable(${checkedModuleRead("super")})($ρσ$py$Object, $ρσ$py$Reflect)`,
    ));
    assert.doesNotMatch(javascript, /\)\(Object, Reflect\)/);
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
    assert.match(
      javascript,
      /ρσ_apply_metaclass\(\$ρσ\$py\$Meta, "Example"/,
    );
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
    assert.ok(output.get().includes(
      `ρσ_extends($ρσ$py$Entries, ${checkedModuleRead("list")})`,
    ));
  } finally {
    frontend.close();
  }
});

test("parameterized imported bases resolve through the Python base protocol", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "import typing as t\nclass Entries(t.List[str]):\n    pass\n",
      parserOptions,
    );
    const definition = ast.body[1];
    assert.equal(definition.parent.expression.name, "ρσ_resolve_class_base");
    const output = new compiler.OutputStream(outputOptions);
    definition.print(output);
    assert.match(
      output.get(),
      /ρσ_resolve_callable\(ρσ_resolve_class_base\)\(ρσ_getitem\([^\n]*List[^\n]*str/,
    );
  } finally {
    frontend.close();
  }
});

test("hygienic star imports stay inside the Python module", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from exported_names import *\n",
      { ...parserOptions, module_id: "star_consumer" },
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /\u03c1\u03c3_modules\["star_consumer"\]\[\u03c1\u03c3_star_name\] =/,
    );
    assert.doesNotMatch(javascript, /globalThis\[\u03c1\u03c3_star_name\]/);
  } finally {
    frontend.close();
  }
});

test("star-imported reads use the live Python module namespace", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from exported_names import *\nanswer = dynamic_name\n",
      { ...parserOptions, module_id: "star_consumer" },
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.ok(javascript.includes(
      `$ρσ$py$answer = ${checkedModuleRead("dynamic_name", "star_consumer")};`,
    ));
    assert.doesNotMatch(javascript, /typeof \$\u03c1\u03c3\$py\$dynamic_name/);
  } finally {
    frontend.close();
  }
});

test("nested functions resolve star-imported module names dynamically", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from exported_names import *\ndef read():\n    return dynamic_name\n",
      { ...parserOptions, module_id: "star_consumer" },
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.ok(javascript.includes(
      `return ${checkedModuleRead("dynamic_name", "star_consumer")};`,
    ));
  } finally {
    frontend.close();
  }
});

test("deleting a star-imported name declares a synchronized module cell", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from exported_names import *\ndel dynamic_name\n",
      { ...parserOptions, module_id: "star_consumer" },
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /var \$ρσ\$py\$dynamic_name/);
    assert.match(
      javascript,
      /\$ρσ\$py\$dynamic_name\s*=\s*ρσ_delete_name\(/,
    );
  } finally {
    frontend.close();
  }
});

test("class prebinding reads bypass identically named closure cells", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "module_value = 'module'\n" +
        "def make(module_value):\n" +
        "    class Scoped:\n" +
        "        captured = module_value\n" +
        "        module_value = 'class'\n" +
        "    return Scoped\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /prototype\.captured = \u03c1\u03c3_resolve_module_name\(void 0, "module_value", \u03c1\u03c3_modules\["__main__"\]/,
    );
    assert.doesNotMatch(
      javascript,
      /prototype\.captured = \$\u03c1\u03c3\$py\$module_value/,
    );
  } finally {
    frontend.close();
  }
});

test("class prebinding markers preserve hygienic assignment targets", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class NativeIntegerVector:\n" +
        "    _ENTRY_CHARGE = 32\n",
      parserOptions,
    );
    const classNode = ast.body.find((statement) =>
      statement instanceof compiler.AST_Class
    );
    assert.ok(classNode);
    const assignment = classNode.body
      .map((statement) => statement.body ?? statement)
      .find((statement) => statement instanceof compiler.AST_Assign);
    assert.ok(assignment);

    // Imported modules retain this sequential LOAD_NAME marker in their
    // serialized analysis. Reproduce that durable form directly so cached
    // output cannot regress to an unbound raw JavaScript class name.
    assignment.left.python_class_prebinding_fallback = true;
    assignment.left.python_identifier = false;

    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /\$ρσ\$py\$NativeIntegerVector\.prototype\._ENTRY_CHARGE\s*=/,
    );
    assert.doesNotMatch(
      javascript,
      /(?:^|[;\n]\s*)NativeIntegerVector\.prototype\._ENTRY_CHARGE\s*=/,
    );
  } finally {
    frontend.close();
  }
});

test("module imports retain namespace binding metadata for class LOAD_NAME", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "from exported_names import namedtuple\n" +
        "class Namespace:\n" +
        "    namedtuple = namedtuple\n",
      parserOptions,
    );
    assert.deepEqual(ast.python_import_bindings.namedtuple, {
      kind: "module",
      name: "namedtuple",
      module: "__main__",
      declare: true,
    });
  } finally {
    frontend.close();
  }
});

test("first class augmented assignment reads through LOAD_NAME", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "value = 'module'\n" +
        "def make(value):\n" +
        "    class Scoped:\n" +
        "        value += '!'\n" +
        "    return Scoped.value\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Scoped\.prototype\.value\s*=\s*ρσ_operator_iadd_exact\(ρσ_resolve_module_name\(/,
    );
  } finally {
    frontend.close();
  }
});

test("later class reads preserve sequential and conditional LOAD_NAME behavior", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "value = 10\n" +
        "class Sequential:\n" +
        "    value = 1\n" +
        "    value = value + 1\n" +
        "class Conditional:\n" +
        "    if False:\n" +
        "        value = 1\n" +
        "    value += 2\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Sequential\.prototype\.value\s*=\s*ρσ_operator_add_exact\(\(\$\u03c1\u03c3\$py\$Sequential\.prototype\.hasOwnProperty\("value"\)/,
    );
    assert.match(
      javascript,
      /Conditional\.prototype\.hasOwnProperty\("value"\)/,
    );
  } finally {
    frontend.close();
  }
});

test("reserved JavaScript function names remain Python class variables", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Descriptor:\n" +
        "    name: str | None = None\n" +
        "    length = 7\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /Object\.defineProperty\([^,]+, "name", \{value:/,
    );
    assert.match(
      javascript,
      /Object\.defineProperty\([^,]+, "length", \{value:/,
    );
  } finally {
    frontend.close();
  }
});

test("walrus targets use the Python grammar name field in every scope", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "def choose(values):\n" +
        "    if (selected := values[0]) is not None:\n" +
        "        return selected\n" +
        "    return [item for item in values if (seen := item)]\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    assert.doesNotThrow(() => ast.print(output));
    assert.match(output.get(), /selected/);
    assert.match(output.get(), /seen/);
  } finally {
    frontend.close();
  }
});

test("locals captures hygienically emitted function bindings", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "def snapshot(name):\n" +
        "    if name:\n" +
        "        level = 1\n" +
        "    return locals()\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /"level":\s*\$ρσ\$py\$level/);
    assert.match(javascript, /"name":\s*\$ρσ\$py\$name/);
    assert.doesNotMatch(javascript, /"level":\s*level[,}]/);
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
    const javascript = normalizeCheckedModuleReads(output.get(), [
      "left", "middle", "right", "first", "middle_value", "last", "a", "b", "c", "d", "e",
    ]);
    assert.equal((javascript.match(/ρσ_equals/g) ?? []).length, 6);
    assert.match(javascript, /ρσ_equals\(ρσ_compare_0, ρσ_compare_1\)/);
    assert.equal(
      (javascript.match(/ρσ_resolve_callable\(middle_value\)/g) ?? []).length,
      1,
    );
    for (const name of ["a", "b", "c", "d", "e"]) {
      assert.equal(
        (
          javascript.match(
            new RegExp(`ρσ_resolve_callable\\(${name}\\)`, "g"),
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

test("parenthesized comparisons do not merge into comparison chains", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "same = (left < middle) == (first < last)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = normalizeCheckedModuleReads(output.get(), [
      "left", "middle", "first", "last",
    ]);
    assert.match(
      javascript,
      /ρσ_equals\(ρσ_operator_lt\(left, middle\), \(?ρσ_operator_lt\(first, last\)\)?\)/,
    );
    assert.doesNotMatch(javascript, /ρσ_compare_/);
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
    assert.match(
      javascript,
      /ρσ_getattr_internal\(\$ρσ\$py\$Config, "name", ρσ_getattr_missing\)/,
    );
    assert.doesNotMatch(
      javascript,
      /Config\.prototype\.name\.call\(value\)/,
    );
  } finally {
    frontend.close();
  }
});

test("callable class variables retain runtime descriptor lookup", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Base:\n" +
        "    def selected(self):\n" +
        "        return 'base'\n" +
        "class Config(Base):\n" +
        "    selected = staticmethod(lambda: 'static')\n" +
        "result = Config.selected()\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /ρσ_getattr_internal\(\$ρσ\$py\$Config, "selected", ρσ_getattr_missing\)/,
    );
    assert.doesNotMatch(javascript, /Config\.prototype\.selected\(\)/);
    assert.match(javascript, /delete this\.selected/);
  } finally {
    frontend.close();
  }
});

test("dynamically installed class methods retain live descriptor lookup", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Dynamic:\n" +
        "    pass\n" +
        "name = 'add'\n" +
        "setattr(Dynamic, name, late_method)\n" +
        "result = Dynamic.add(Dynamic(), 3)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(javascript, /ρσ_getattr_internal/);
    assert.match(javascript, /Dynamic, "add", ρσ_getattr_missing/);
    assert.doesNotMatch(javascript, /Dynamic\.prototype\.add\.call/);
  } finally {
    frontend.close();
  }
});

test("keyword instance calls retain live descriptor lookup", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "class Dynamic:\n" +
        "    pass\n" +
        "setattr(Dynamic, 'compute', late_method)\n" +
        "result = Dynamic().compute(value=3)\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /ρσ_getattr_internal\(ρσ_expr_temp, "compute", ρσ_getattr_missing\)/,
    );
    assert.doesNotMatch(javascript, /ρσ_expr_temp\.compute/);
  } finally {
    frontend.close();
  }
});

test("context managers receive Python exception metadata", async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    const ast = frontend.parse(
      "with manager:\n" +
        "    raise problem\n",
      parserOptions,
    );
    const output = new compiler.OutputStream(outputOptions);
    ast.print(output);
    const javascript = output.get();
    assert.match(
      javascript,
      /var ρσ_with_exception = undefined, ρσ_with_suppress;/,
    );
    assert.match(javascript, /ρσ_type\(ρσ_with_exception\)/);
    assert.match(
      javascript,
      /ρσ_getattr_internal\(ρσ_with_exception, "__traceback__", null\)/,
    );
    assert.doesNotMatch(javascript, /ρσ_with_exception\.constructor/);
    assert.equal(
      (javascript.match(/ρσ_with_exception = undefined;/g) ?? []).length,
      1,
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
      /ρσ_getattr_internal\)\(\$ρσ\$py\$Cache, "for_config", ρσ_getattr_missing\)/,
    );
    assert.match(
      javascript,
      /ρσ_interpolate_kwargs\(ρσ_expr_temp/,
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
      /ρσ_getattr_internal\)\(\$ρσ\$py\$Function, "from_parent", ρσ_getattr_missing\)/,
    );
    assert.doesNotMatch(
      javascript,
      /Function\.prototype\.from_parent\.call/,
    );
  } finally {
    frontend.close();
  }
});
