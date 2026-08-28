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

const fixtureRoot = join(
  __dirname,
  "fixtures/optimizer-development/profile-routes-core",
);
const sources = Object.freeze({
  field: readFileSync(join(fixtureRoot, "closed-field.py"), "utf8"),
  float: readFileSync(join(fixtureRoot, "strict-float.py"), "utf8"),
});

const parserOptions = {
  filename: "<optimizer-profile-routes-core>",
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

let sharedEvaluator;
async function evaluator() {
  if (!sharedEvaluator) {
    sharedEvaluator = await createKernelEvaluatorAsync({
      mode: "sage",
      onOutput() {},
    });
  }
  return sharedEvaluator;
}

test.after(() => {
  sharedEvaluator?.close();
});

function emittedRoutes(source, observer) {
  const compiler = createCompiler();
  return createPythonCompilerFrontend(compiler, "sage").then((frontend) => {
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
  });
}

function terminalEvents(observation) {
  const events = observation.privateEvents.events;
  const entries = events.filter((event) =>
    event.outcome === "selected-static-entry"
  );
  const terminals = events.filter((event) =>
    event.outcome !== "selected-static-entry"
  );
  assert.equal(entries.length, 1, JSON.stringify(events));
  assert.equal(terminals.length, 1, JSON.stringify(events));
  assert.equal(entries[0].regionId, terminals[0].regionId);
  assert.equal(entries[0].kind, terminals[0].kind);
  return terminals[0];
}

async function profilePair(evaluator, source, call, filename) {
  const complete = `${source}\n${call}\n`;
  const ordinary = await evaluator.evaluate(complete, {
    filename: `${filename}.ordinary.py`,
    language: "sage",
  });
  const profiled = await evaluator.profile(complete, {
    filename: `${filename}.profiled.py`,
    language: "sage",
    samplingIntervalMicros: 500,
  });
  assert.equal(profiled.evaluation.stdout, ordinary.stdout);
  assert.equal(profiled.evaluation.repr, ordinary.repr);
  return profiled.observation;
}

test("production output omits the private observer and terminal calls follow effects", async () => {
  for (const source of Object.values(sources)) {
    const ordinary = await emittedRoutes(source);
    const explicitlyDisabled = await emittedRoutes(source, "");
    assert.equal(explicitlyDisabled, ordinary);
    assert.doesNotMatch(ordinary, /private_route_observer/);
  }

  const field = await emittedRoutes(sources.field, "$private_route_observer");
  const strictFloat = await emittedRoutes(
    sources.float,
    "$private_route_observer",
  );
  for (const javascript of [field, strictFloat]) {
    assert.match(javascript, /\$private_route_observer\([^)]*"guarded-fast"/);
    assert.match(javascript, /\$private_route_observer\([^)]*"guarded-fallback"/);
    assert.match(javascript, /\$private_route_observer\([^)]*"zero-trip"/);
    assert.match(javascript, /\$private_route_observer\([^)]*"error"/);
    assert.ok(
      javascript.lastIndexOf("materialize(") <
        javascript.lastIndexOf('"guarded-fast"'),
      "fast terminal must follow transaction materialization",
    );
    assert.ok(
      javascript.indexOf('"error"') <
        javascript.indexOf("throw new RuntimeError", javascript.indexOf('"error"')),
      "guard-error evidence must immediately precede the established throw",
    );
  }
  assert.match(field, /"guarded-fallback",\s*[^)]*\.reason/);
  assert.match(field, /"guarded-fallback",\s*"zip-shape"/);
  assert.match(
    field,
    /"guarded-fallback",\s*"sequence-element-representation-mismatch"/,
  );
  assert.match(strictFloat, /"guarded-fallback",\s*[^)]*\.reason/);
});

test("scalar and strict-float routes conserve one entry and one terminal", async () => {
  const kernel = await evaluator();
  {
    const cases = [
      {
        source: sources.field,
        call: "print(modular_recurrence(7, R(1), R(37), R(11)))",
        filename: "field-fast",
        outcome: "guarded-fast",
      },
      {
        source: sources.field,
        call: "print(modular_recurrence(3, 1, 2, 3))",
        filename: "field-fallback",
        outcome: "guarded-fallback",
      },
      {
        source: sources.field,
        call: "print(modular_recurrence(0, R(1), R(37), R(11)))",
        filename: "field-zero",
        outcome: "zero-trip",
      },
      {
        source: sources.field,
        call: [
          "values = tuple([R(2), 3, R(5)])",
          "print(modular_horner(values, R(1), R(37)))",
        ].join("\n"),
        filename: "field-stream-fallback",
        outcome: "guarded-fallback",
      },
      {
        source: sources.float,
        call: "print(float_recurrence(7, float(2), float(3)))",
        filename: "float-fast",
        outcome: "guarded-fast",
      },
      {
        source: sources.float,
        call: "print(float_recurrence(3, 2, 3))",
        filename: "float-fallback",
        outcome: "guarded-fallback",
      },
      {
        source: sources.float,
        call: "print(float_recurrence(0, float(2), float(3)))",
        filename: "float-zero",
        outcome: "zero-trip",
      },
    ];
    for (const item of cases) {
      const observation = await profilePair(
        kernel,
        item.source,
        item.call,
        item.filename,
      );
      assert.equal(terminalEvents(observation).outcome, item.outcome);
    }
  }
});

test("an exception in the untouched fallback remains explicitly incomplete", async () => {
  const kernel = await evaluator();
  const call = [
    "left = tuple([R(2), R(3)])",
    "right = tuple([R(5)])",
    "modular_strict_zip(left, right)",
  ].join("\n");
  await assert.rejects(
    kernel.profile(`${sources.field}\n${call}\n`, {
      filename: "field-zip-fallback-error.py",
      language: "sage",
      samplingIntervalMicros: 500,
    }),
    (error) => {
      assert.ok(error instanceof OptimizerProfileExecutionError);
      assert.match(error.observation.execution.error.message, /zip\(\) argument 2/);
      const events = error.observation.privateEvents.events;
      assert.equal(
        events.filter((event) => event.outcome === "selected-static-entry").length,
        1,
      );
      assert.equal(
        events.filter((event) => event.outcome !== "selected-static-entry").length,
        0,
      );
      return true;
    },
  );
});

test("guard-error routes authenticate before preserving the existing exception", async () => {
  const kernel = await evaluator();
  {
    for (const item of [
      {
        source: sources.field,
        call: "modular_recurrence_error(3, 1, 2, 3)",
        reason: "live-in-brand-mismatch",
      },
      {
        source: sources.float,
        call: "float_recurrence_error(3, 1, 2)",
        reason: "live-in-not-binary64",
      },
    ]) {
      await assert.rejects(
        kernel.profile(`${item.source}\n${item.call}\n`, {
          filename: `guard-error-${item.reason}.py`,
          language: "sage",
          samplingIntervalMicros: 500,
        }),
        (error) => {
          assert.ok(error instanceof OptimizerProfileExecutionError);
          assert.equal(error.observation.execution.status, "threw");
          assert.match(error.observation.execution.error.message, new RegExp(item.reason));
          assert.equal(terminalEvents(error.observation).outcome, "error");
          return true;
        },
      );
    }
  }
});
