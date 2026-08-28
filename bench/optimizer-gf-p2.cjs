#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../dist/tools/kernel.js");
const createCompiler = require("../dist/tools/compiler.js").default;
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");

const check = process.argv.includes("--check");
const iterations = 1_000_000;
const genericIterations = 10_000;
const samples = 7;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function handwritten(count) {
  const prime = 97;
  const modulusC0 = 5;
  const modulusC1 = 1;
  const factorC0 = 3;
  const factorC1 = 4;
  const addendC0 = 5;
  const addendC1 = 6;
  let valueC0 = 1;
  let valueC1 = 2;
  for (let index = 0; index < count; index += 1) {
    const quadratic = valueC1 * factorC1;
    let nextC0 = (
      valueC0 * factorC0 - quadratic * modulusC0 + addendC0
    ) % prime;
    let nextC1 = (
      valueC0 * factorC1 + valueC1 * factorC0 -
      quadratic * modulusC1 + addendC1
    ) % prime;
    if (nextC0 < 0) nextC0 += prime;
    if (nextC1 < 0) nextC1 += prime;
    valueC0 = nextC0;
    valueC1 = nextC1;
  }
  return [valueC0, valueC1];
}

function measureHandwritten() {
  handwritten(iterations);
  const observations = [];
  let checksum;
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    checksum = handwritten(iterations);
    observations.push(performance.now() - start);
  }
  assert.deepEqual(checksum, [25, 93]);
  return observations;
}

async function measureCompilation() {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  const source = `
def field_program(count, values, left, right):
    for index in range(count):
        left = left*right + values[index]
        right = right-left
    return left, right
`;
  const parserOptions = {
    filename: "<optimizer-gf-p2-benchmark>",
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
    baselib_plain: readFileSync(
      join(__dirname, "..", "dist", "compiler", "baselib-plain-pretty.js"),
      "utf8",
    ),
    beautify: false,
    private_scope: false,
    write_name: false,
    exact_integers: true,
    python_tuples: true,
    python_attributes: true,
  };
  try {
    const measurements = {};
    for (const level of ["O0", "O2"]) {
      const observations = [];
      let emittedBytes = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const started = performance.now();
        const ast = frontend.parse(source, {
          ...parserOptions,
          optimization_level: level,
        });
        const output = new compiler.OutputStream(outputOptions);
        ast.print(output);
        const javascript = output.get();
        observations.push(performance.now() - started);
        emittedBytes = Buffer.byteLength(javascript);
      }
      measurements[level] = {
        median_ms: median(observations),
        emitted_bytes: emittedBytes,
      };
    }
    return {
      ...measurements,
      optimized_size_delta_bytes:
        measurements.O2.emitted_bytes - measurements.O0.emitted_bytes,
    };
  } finally {
    frontend.close();
  }
}

async function measurePublic() {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import time
P.<x> = PolynomialRing(GF(97))
K.<a> = GF(97^2, modulus=x^2 + x + 5)

def optimized(count):
    value = K(1) + 2*a
    multiplier = K(3) + 4*a
    increment = K(5) + 6*a
    for index in range(count):
        value = value * multiplier + increment
    return value

def generic(count):
    value = K(1) + 2*a
    multiplier = K(3) + 4*a
    increment = K(5) + 6*a
    for index in range(count):
        product = value * multiplier
        value = product + increment
    return value

K._machineExtensionIsolatedMinSteps = 2000000000
optimized(${iterations})
print('resources', 'before', len(K._nativeResourceChildren))
for sample in range(${samples}):
    started = time.time()
    value = optimized(${iterations})
    print('v8', time.time() - started, repr(value), K._lastCompilerOptimizationRoute)
print('resources', 'after-v8', len(K._nativeResourceChildren))

K._machineExtensionIsolatedMinSteps = 4096
optimized(${iterations})
for sample in range(${samples}):
    started = time.time()
    value = optimized(${iterations})
    print('isolated', time.time() - started, repr(value), K._lastCompilerOptimizationRoute)
print('resources', 'after-isolated', len(K._nativeResourceChildren))

generic(${genericIterations})
for sample in range(${samples}):
    started = time.time()
    value = generic(${genericIterations})
    print('generic', time.time() - started, repr(value), 'boxed-resource')
`);
    const groups = { v8: [], isolated: [], generic: [] };
    const routes = new Set();
    const resources = {};
    for (const line of result.stdout.trim().split(/\r?\n/)) {
      const resourceMatch = line.match(/^resources (before|after-v8|after-isolated) (\d+)$/);
      if (resourceMatch) {
        resources[resourceMatch[1]] = Number(resourceMatch[2]);
        continue;
      }
      const match = line.match(
        /^(v8|isolated|generic) ([0-9.eE+-]+) (.+) (v8-extension-tuple|native-compiled-source|wasm-compiled-source|boxed-resource)$/,
      );
      assert.ok(match, `unexpected benchmark line: ${line}`);
      const [, group, seconds, value, route] = match;
      groups[group].push(Number(seconds) * 1000);
      routes.add(route);
      assert.equal(
        value,
        group === "generic" ? "15*a + 81" : "93*a + 25",
      );
    }
    for (const observations of Object.values(groups)) {
      assert.equal(observations.length, samples);
    }
    return { groups, routes: [...routes].sort(), resources };
  } finally {
    session.close();
  }
}

async function main() {
  const handwrittenMs = measureHandwritten();
  const compilation = await measureCompilation();
  const { groups, routes, resources } = await measurePublic();
  const handwrittenMedian = median(handwrittenMs);
  const v8Median = median(groups.v8);
  const isolatedMedian = median(groups.isolated);
  const genericMedian = median(groups.generic);
  const genericProjectedMs = genericMedian * iterations / genericIterations;
  const report = {
    schema: "sagejs.optimizing-mathematics.gf-p2/v1",
    node: process.version,
    representation: "extension-tuple(number,2)",
    iterations,
    generic_iterations: genericIterations,
    samples,
    medians_ms: {
      handwritten_javascript: handwrittenMedian,
      public_v8: v8Median,
      public_isolated: isolatedMedian,
      public_generic: genericMedian,
      public_generic_projected: genericProjectedMs,
    },
    ratios: {
      v8_over_handwritten: v8Median / handwrittenMedian,
      isolated_over_handwritten: isolatedMedian / handwrittenMedian,
      generic_projected_over_v8: genericProjectedMs / v8Median,
      generic_projected_over_isolated: genericProjectedMs / isolatedMedian,
    },
    routes,
    compilation,
    resources: {
      ...resources,
      v8_materialized_resource_delta: resources["after-v8"] - resources.before,
      isolated_materialized_resource_delta:
        resources["after-isolated"] - resources["after-v8"],
    },
    target_contracts: {
      v8: { boundary_crossings: 0, materializations: 1 },
      isolated: { boundary_crossings: 1, copied_bytes: 16, materializations: 1 },
    },
    reviewed_ceilings: {
      target_over_handwritten: 2,
      minimum_generic_speedup: 20,
      maximum_compile_median_ms: 250,
      maximum_optimized_size_delta_bytes: 16384,
      maximum_materialized_resources_per_sample: 2,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check) {
    assert.ok(report.ratios.v8_over_handwritten <= 2);
    assert.ok(report.ratios.isolated_over_handwritten <= 2);
    assert.ok(report.ratios.generic_projected_over_v8 >= 20);
    assert.ok(report.ratios.generic_projected_over_isolated >= 20);
    assert.ok(compilation.O2.median_ms <= 250);
    assert.ok(compilation.optimized_size_delta_bytes <= 16384);
    assert.ok(report.resources.v8_materialized_resource_delta <= 2 * samples);
    assert.ok(report.resources.isolated_materialized_resource_delta <= 2 * samples);
    assert.ok(routes.includes("v8-extension-tuple"));
    assert.ok(
      routes.includes("native-compiled-source") ||
        routes.includes("wasm-compiled-source"),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
