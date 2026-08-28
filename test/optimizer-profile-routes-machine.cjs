// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const createCompiler = require("../dist/tools/compiler.js").default;
const {
  createKernelEvaluatorAsync,
} = require("../dist/tools/kernel-evaluator.js");
const {
  OptimizerProfileExecutionError,
} = require("../dist/tools/optimizer-profiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

const source = readFileSync(join(
  __dirname,
  "fixtures/optimizer-development/profile-routes-machine/machine-regions.py",
), "utf8");

const parserOptions = {
  filename: "<optimizer-profile-routes-machine>",
  basedir: process.cwd(),
  libdir: join(__dirname, "../src/lib"),
  for_linting: true,
  import_dirs: [],
  exact_integer_literals: true,
  strict_python_scopes: true,
  reuse_main_module: true,
  runtime_imports: true,
  optimization_level: "O2",
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
  rational_division: true,
  python_tuples: true,
  python_truthiness: true,
  python_attributes: true,
  module_registry: "__sagejs_kernel_modules__",
  reuse_main_module: true,
};

async function emitted(observer) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(source, parserOptions);
    const options = { ...outputOptions };
    if (observer !== undefined) options.optimizer_profile_observer = observer;
    const output = new compiler.OutputStream(options);
    ast.print(output);
    return output.get();
  } finally {
    frontend.close();
  }
}

function eventCount(event) {
  return event.count ?? 1;
}

function oneTerminal(observation) {
  const entries = observation.privateEvents.events.filter((event) =>
    event.outcome === "selected-static-entry"
  );
  const terminals = observation.privateEvents.events.filter((event) =>
    event.outcome !== "selected-static-entry"
  );
  assert.equal(entries.reduce((sum, event) => sum + eventCount(event), 0), 1);
  assert.equal(terminals.reduce((sum, event) => sum + eventCount(event), 0), 1);
  assert.equal(entries[0].regionId, terminals[0].regionId);
  assert.equal(entries[0].kind, terminals[0].kind);
  return terminals[0];
}

async function profile(call, filename) {
  const evaluator = await createKernelEvaluatorAsync({ mode: "sage", onOutput() {} });
  try {
    return await evaluator.profile(`${source}\n${call}\n`, {
      filename: `${filename}.py`,
      language: "sage",
      samplingIntervalMicros: 500,
    });
  } finally {
    evaluator.close();
  }
}

test("machine-domain telemetry is absent ordinarily and terminal calls follow publication", async () => {
  const ordinary = await emitted();
  assert.equal(await emitted(""), ordinary);
  assert.doesNotMatch(ordinary, /private_route_observer/);

  const instrumented = await emitted("$private_route_observer");
  for (const kind of [
    "bounded-integer-region",
    "strict-float-array-region",
    "modular-batch-region",
    "fixed-extension-region",
  ]) {
    assert.match(instrumented, new RegExp(JSON.stringify(kind)));
  }
  for (const outcome of ["guarded-fast", "guarded-fallback", "zero-trip", "error"]) {
    assert.match(instrumented, new RegExp(JSON.stringify(outcome)));
  }
  assert.ok(
    instrumented.indexOf("materialize(") <
      instrumented.lastIndexOf('"guarded-fast"'),
    "fast terminal evidence must follow result materialization",
  );
  assert.ok(
    instrumented.indexOf('"error"') <
      instrumented.indexOf("throw new RuntimeError", instrumented.indexOf('"error"')),
    "guard error evidence must precede the existing throw",
  );
});

test("all four machine domains conserve fast, fallback, and zero-trip routes", async () => {
  const cases = [
    ["bounded-fast", "print(bounded_fallback(4, 1, 2, 1))", "guarded-fast"],
    ["bounded-fallback", "print(bounded_fallback(2, 1.5, 2, 1))", "guarded-fallback"],
    ["bounded-zero", "sentinel = object()\nprint(bounded_fallback(0, sentinel, sentinel, sentinel) is sentinel)", "zero-trip"],
    ["float-array-fast", "print(float_array_fallback((float(1), float(2)), float(0), float(2)))", "guarded-fast"],
    ["float-array-fallback", "print(float_array_fallback([float(1), float(2)], float(0), float(2)))", "guarded-fallback"],
    ["float-array-zero", "print(float_array_fallback((), float(1), float(2)))", "zero-trip"],
    ["modular-fast", "R = Zmod(1009)\nprint(modular_batch_fallback(2, (R(1), R(2))))", "guarded-fast"],
    ["modular-fallback", "print(modular_batch_fallback(2, (1, 2)))", "guarded-fallback"],
    ["modular-zero", "print(modular_batch_fallback(0, ()))", "zero-trip"],
    ["extension-fast", "K = GF(5^3, 'a')\na = K.gen()\nprint(fixed_extension_fallback(2, K, a))", "guarded-fast"],
    ["extension-fallback", "print(fixed_extension_fallback(2, ZZ, ZZ(1)))", "guarded-fallback"],
    ["extension-zero", "K = GF(5^3, 'a')\na = K.gen()\nprint(fixed_extension_fallback(0, K, a))", "zero-trip"],
  ];
  for (const [filename, call, expected] of cases) {
    const result = await profile(call, filename);
    assert.equal(result.observation.execution.status, "returned");
    assert.equal(oneTerminal(result.observation).outcome, expected, filename);
  }
});

test("all four machine-domain guard errors authenticate before throwing", async () => {
  const cases = [
    ["bounded-error", "bounded_error(2, 1.5, 2, 1)"],
    ["float-array-error", "float_array_error((float(1), 2), float(0), float(2))"],
    ["modular-error", "modular_batch_error(2, (1, 2))"],
    ["extension-error", "fixed_extension_error(2, ZZ, ZZ(1))"],
  ];
  for (const [filename, call] of cases) {
    await assert.rejects(profile(call, filename), (error) => {
      assert.ok(error instanceof OptimizerProfileExecutionError);
      assert.equal(error.observation.execution.status, "threw");
      assert.match(error.observation.execution.error.message, /optimizer runtime guard failed/);
      assert.equal(oneTerminal(error.observation).outcome, "error");
      return true;
    });
  }
});
