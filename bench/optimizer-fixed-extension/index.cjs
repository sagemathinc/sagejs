#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../../dist/tools/kernel.js");
const { default: createCompiler } = require("../../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../../dist/tools/python/compiler-frontend.js");
const {
  FIXED_EXTENSION_REGION_PASS,
} = require(
  "../../dist/tools/python/optimizer/domains/fixed-extension/index.js"
);
const {
  fixedExtensionRegionPass,
} = require(
  "../../dist/tools/python/optimizer/passes/fixed-extension-region.js"
);

const check = process.argv.includes("--check");
const integrated = process.argv.includes("--integrated");
const iterations = 100_000;
const genericIterations = 100;
const samples = 5;

const cases = [
  {
    name: "quadratic-x2-plus-2",
    prime: 5,
    degree: 2,
    polynomial: "x^2+2",
    modulus: [2, 0],
    value: [1, 2],
    factor: [2, 1],
    increment: [3, 4],
    setup: [
      "value = K(1)+2*a",
      "factor = K(2)+a",
      "increment = K(3)+4*a",
    ],
  },
  {
    name: "cubic-x3-plus-x-plus-1",
    prime: 5,
    degree: 3,
    polynomial: "x^3+x+1",
    modulus: [1, 1, 0],
    value: [1, 2, 3],
    factor: [2, 1, 4],
    increment: [3, 4, 1],
    setup: [
      "aa = a*a",
      "value = K(1)+2*a+3*aa",
      "factor = K(2)+a+4*aa",
      "increment = K(3)+4*a+aa",
    ],
  },
  {
    name: "quartic-x4-plus-x-plus-2",
    prime: 3,
    degree: 4,
    polynomial: "x^4+x+2",
    modulus: [2, 1, 0, 0],
    value: [1, 2, 1, 2],
    factor: [2, 1, 2, 1],
    increment: [1, 1, 1, 1],
    setup: [
      "aa = a*a",
      "aaa = aa*a",
      "value = K(1)+2*a+aa+2*aaa",
      "factor = K(2)+a+2*aa+aaa",
      "increment = K(1)+a+aa+aaa",
    ],
  },
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function canonical(value, prime) {
  const result = value % prime;
  return result < 0 ? result + prime : result;
}

function multiply(left, right, prime, modulus) {
  const degree = modulus.length;
  const product = Array(2 * degree - 1).fill(0);
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      product[i + j] = canonical(
        product[i + j] + left[i] * right[j],
        prime,
      );
    }
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = canonical(
        product[target] - product[exponent] * modulus[index],
        prime,
      );
    }
  }
  return product.slice(0, degree);
}

function affine(item, count) {
  let value = [...item.value];
  for (let index = 0; index < count; index += 1) {
    value = multiply(value, item.factor, item.prime, item.modulus)
      .map((coefficient, coordinate) =>
        canonical(coefficient + item.increment[coordinate], item.prime));
  }
  return value.join(", ");
}

function walkAst(compiler, root, visitor) {
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
    "optimization_contract",
  ]);
  const seen = new Set();
  const visit = (value, ancestors) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, ancestors);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    visitor(value, ancestors);
    const childAncestors = [...ancestors, value];
    for (const [key, child] of Object.entries(value)) {
      if (!ignored.has(key) && typeof child !== "function") {
        visit(child, childAncestors);
      }
    }
  };
  visit(root, []);
}

const planningSource = `
def recurrence(count, value, factor, increment):
    for index in range(count):
        value = value*factor + increment
    return value
`;

async function measurePlanning() {
  const compiler = createCompiler();
  const frontendStarted = performance.now();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const frontendMilliseconds = performance.now() - frontendStarted;
  const observations = [];
  let target;
  try {
    for (let sample = 0; sample < samples; sample += 1) {
      const started = performance.now();
      const ast = frontend.parse(planningSource, {
        filename: "fixed-extension-benchmark.sage",
        for_linting: true,
        import_dirs: [],
        exact_integer_literals: true,
        strict_python_scopes: true,
        optimization_level: "O0",
        scoped_flags: {
          dict_literals: true,
          overload_getitem: true,
          bound_methods: true,
          sequential_definitions: true,
        },
      });
      let definition;
      walkAst(compiler, ast, (node) => {
        if (!definition && node instanceof compiler.AST_Function) definition = node;
      });
      definition.optimization_contract = {
        requiredPassId: FIXED_EXTENSION_REGION_PASS,
      };
      const candidates = [];
      fixedExtensionRegionPass.run(ast, {
        compiler,
        controls: {
          level: "O2",
          disabledPasses: new Set(),
          requiredOptimizations: new Set(),
          explain: false,
        },
        walk(root, visitor) {
          walkAst(compiler, root, visitor);
        },
        consider(candidate) {
          candidates.push(candidate);
        },
        observe() {
          throw new Error("fixed-extension pass must not emit observations");
        },
      });
      assert.equal(candidates.length, 1);
      target = candidates[0].internal.operands.fixedExtension.target;
      observations.push(performance.now() - started);
    }
  } finally {
    frontend.close();
  }
  return {
    frontend_cold_ms: frontendMilliseconds,
    plan_compile_samples_ms: observations,
    plan_compile_median_ms: median(observations),
    emitted_bytes: target.totalEmittedBytes,
    variants: target.variants.map((variant) => ({
      degree: variant.degree,
      emitted_bytes: variant.emittedBytes,
      code_budget_bytes: variant.codeBudgetBytes,
      compile_cost_units: variant.compileCostUnits,
      compile_budget_units: variant.compileBudgetUnits,
      exact_intermediate_maximum: variant.exactIntermediateMaximum,
    })),
  };
}

function source(item, count, label, withContract) {
  const contract = withContract
    ? `from sagejs.compiler import optimize
@optimize(require="${FIXED_EXTENSION_REGION_PASS}", coverage="all-loops", target="auto", guard_failure="fallback")
`
    : "";
  return `
import time
P.<x> = PolynomialRing(GF(${item.prime}))
K.<a> = GF(${item.prime}^${item.degree}, modulus=${item.polynomial})
${contract}def recurrence(count):
${item.setup.map((line) => `    ${line}`).join("\n")}
    for index in range(count):
        value = value*factor + increment
    return value

started = time.time()
first = recurrence(${count})
print('${label}-first', time.time()-started, tuple(first._machineCoordinates), K._lastCompilerOptimizationRoute)
for sample in range(${samples}):
    started = time.time()
    value = recurrence(${count})
    print('${label}-warm', time.time()-started, tuple(value._machineCoordinates), K._lastCompilerOptimizationRoute)
`;
}

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

function parse(stdout, label) {
  const first = [];
  const warm = [];
  const routes = new Set();
  let answer;
  for (const line of stdout.trim().split(/\r?\n/)) {
    const match = line.match(new RegExp(
      `^${label}-(first|warm) ([0-9.eE+-]+) \\(([^)]*)\\) ([a-z0-9-]+)$`,
    ));
    assert.ok(match, line);
    const milliseconds = Number(match[2]) * 1000;
    (match[1] === "first" ? first : warm).push(milliseconds);
    answer = match[3];
    routes.add(match[4]);
  }
  assert.equal(first.length, 1);
  assert.equal(warm.length, samples);
  return {
    first_ms: first[0],
    warm_samples_ms: warm,
    warm_median_ms: median(warm),
    routes: [...routes],
    answer,
  };
}

async function measurePublic(item) {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const optimizedStarted = performance.now();
    const optimizedResult = await optimized.evaluate(
      source(item, iterations, "optimized", integrated),
    );
    const optimizedEvaluateMilliseconds = performance.now() - optimizedStarted;
    const genericStarted = performance.now();
    const genericResult = await generic.evaluate(
      source(item, genericIterations, "generic", false),
    );
    const genericEvaluateMilliseconds = performance.now() - genericStarted;
    return {
      optimized: {
        ...parse(optimizedResult.stdout, "optimized"),
        evaluate_cold_ms: optimizedEvaluateMilliseconds,
      },
      generic: {
        ...parse(genericResult.stdout, "generic"),
        evaluate_cold_ms: genericEvaluateMilliseconds,
      },
    };
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
}

async function main() {
  const planning = await measurePlanning();
  const report = {
    schema: "sagejs.optimizing-mathematics.fixed-extension/v1",
    node: process.version,
    integration_mode: integrated ? "explicit-contract" : "existing-runtime-route",
    iterations,
    generic_iterations: genericIterations,
    samples,
    planning,
    cases: {},
    reviewed_ceilings: {
      frontend_cold_ms: 1000,
      plan_compile_median_ms: 250,
      public_evaluate_cold_ms: 5000,
      minimum_projected_o0_speedup: 10,
    },
  };
  for (const item of cases) {
    const measured = await measurePublic(item);
    assert.equal(measured.optimized.answer, affine(item, iterations));
    assert.equal(measured.generic.answer, affine(item, genericIterations));
    const genericProjected = measured.generic.warm_median_ms *
      iterations / genericIterations;
    report.cases[item.name] = {
      degree: item.degree,
      modulus: item.polynomial,
      optimized: measured.optimized,
      generic: measured.generic,
      generic_projected_ms: genericProjected,
      projected_o0_speedup:
        genericProjected / measured.optimized.warm_median_ms,
    };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check) {
    assert.ok(planning.frontend_cold_ms <=
      report.reviewed_ceilings.frontend_cold_ms);
    assert.ok(planning.plan_compile_median_ms <=
      report.reviewed_ceilings.plan_compile_median_ms);
    for (const variant of planning.variants) {
      assert.ok(variant.emitted_bytes <= variant.code_budget_bytes);
      assert.ok(variant.compile_cost_units <= variant.compile_budget_units);
    }
    for (const item of Object.values(report.cases)) {
      assert.ok(item.optimized.evaluate_cold_ms <=
        report.reviewed_ceilings.public_evaluate_cold_ms);
      assert.ok(item.projected_o0_speedup >=
        report.reviewed_ceilings.minimum_projected_o0_speedup);
      assert.ok(item.optimized.routes.some((route) =>
        route === "v8-extension-tuple" ||
        route === "native-compiled-source" ||
        route === "wasm-compiled-source"
      ));
      assert.deepEqual(item.generic.routes, ["generic"]);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
