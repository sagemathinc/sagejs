#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const iterations = 1_000_000;
const genericIterations = 1_000;
const samples = 5;

const cases = [
  {
    name: "cubic",
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
    name: "quartic",
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

function makeHandwritten(item) {
  const { degree, prime, modulus, value, factor, increment } = item;
  const lines = [];
  for (let index = 0; index < degree; index += 1) {
    lines.push(`let v${index}=${value[index]};`);
  }
  lines.push("for(let step=0;step<count;step++){", `const p=${prime};`);
  for (let exponent = 0; exponent < 2 * degree - 1; exponent += 1) {
    const terms = [];
    for (let left = 0; left < degree; left += 1) {
      const right = exponent - left;
      if (right >= 0 && right < degree) terms.push(`v${left}*${factor[right]}`);
    }
    lines.push(`let t${exponent}=(${terms.join("+")})%p;`);
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      lines.push(`t${target}=((t${target}-t${exponent}*${modulus[index]})%p+p)%p;`);
    }
  }
  for (let index = 0; index < degree; index += 1) {
    lines.push(`v${index}=(t${index}+${increment[index]})%p;`);
  }
  lines.push("}", `return [${value.map((_entry, index) => `v${index}`).join(",")}];`);
  return new Function("count", lines.join(""));
}

function makeDynamicHandwritten(item) {
  const { degree } = item;
  const lines = [];
  for (let index = 0; index < degree; index += 1) {
    lines.push(
      `let v${index}=value[${index}];`,
      `const f${index}=factor[${index}];`,
      `const m${index}=modulus[${index}];`,
      `const i${index}=increment[${index}];`,
    );
  }
  lines.push("for(let step=0;step<count;step++){");
  for (let exponent = 0; exponent < 2 * degree - 1; exponent += 1) {
    const terms = [];
    for (let left = 0; left < degree; left += 1) {
      const right = exponent - left;
      if (right >= 0 && right < degree) terms.push(`v${left}*f${right}`);
    }
    lines.push(`let t${exponent}=(${terms.join("+")})%prime;`);
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      lines.push(
        `const c${exponent}_${index}=(t${exponent}*m${index})%prime;`,
        `t${target}=t${target}>=c${exponent}_${index}?` +
          `t${target}-c${exponent}_${index}:` +
          `t${target}+prime-c${exponent}_${index};`,
      );
    }
  }
  for (let index = 0; index < degree; index += 1) {
    lines.push(
      `const s${index}=t${index}+i${index};`,
      `v${index}=s${index}>=prime?s${index}-prime:s${index};`,
    );
  }
  lines.push("}", `return [${item.value.map((_entry, index) => `v${index}`).join(",")}];`);
  return new Function(
    "count", "prime", "modulus", "value", "factor", "increment",
    lines.join(""),
  );
}

function measureHandwritten(item) {
  const run = makeHandwritten(item);
  run(iterations);
  const observations = [];
  let answer;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    answer = run(iterations);
    observations.push(performance.now() - started);
  }
  return { observations, answer };
}

function measureDynamicHandwritten(item) {
  const run = makeDynamicHandwritten(item);
  const args = [
    iterations,
    item.prime,
    item.modulus,
    item.value,
    item.factor,
    item.increment,
  ];
  run(...args);
  const observations = [];
  let answer;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    answer = run(...args);
    observations.push(performance.now() - started);
  }
  return { observations, answer };
}

function source(item, count, threshold, label) {
  return `
import time
P.<x> = PolynomialRing(GF(${item.prime}))
K.<a> = GF(${item.prime}^${item.degree}, modulus=${item.polynomial})
def recurrence(count):
${item.setup.map((line) => `    ${line}`).join("\n")}
    for index in range(count):
        value = value*factor+increment
    return value
K._machineExtensionIsolatedMinSteps = ${threshold}
recurrence(${count})
for sample in range(${samples}):
    started = time.time()
    value = recurrence(${count})
    print('${label}', time.time()-started, tuple(value._machineCoordinates), K._lastCompilerOptimizationRoute)
print('resources', len(K._nativeResourceChildren))
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
  const observations = [];
  const routes = new Set();
  let resources;
  let answer;
  for (const line of stdout.trim().split(/\r?\n/)) {
    const resource = line.match(/^resources (\d+)$/);
    if (resource) {
      resources = Number(resource[1]);
      continue;
    }
    const match = line.match(new RegExp(
      `^${label} ([0-9.eE+-]+) \\(([^)]*)\\) ([a-z0-9-]+)$`,
    ));
    assert.ok(match, line);
    observations.push(Number(match[1]) * 1000);
    answer = match[2].split(",").map((entry) => Number(entry.trim()));
    routes.add(match[3]);
  }
  assert.equal(observations.length, samples);
  return { observations, routes: [...routes], resources, answer };
}

async function measurePublic(item) {
  const v8 = await sessionAtLevel("O2");
  const isolated = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const [v8Result, isolatedResult, genericResult] = await Promise.all([
      v8.evaluate(source(item, iterations, 2_000_000_000, "v8")),
      isolated.evaluate(source(item, iterations, 4096, "isolated")),
      generic.evaluate(source(item, genericIterations, 4096, "generic")),
    ]);
    return {
      v8: parse(v8Result.stdout, "v8"),
      isolated: parse(isolatedResult.stdout, "isolated"),
      generic: parse(genericResult.stdout, "generic"),
    };
  } finally {
    await Promise.all([v8.close(), isolated.close(), generic.close()]);
  }
}

async function main() {
  const report = {
    schema: "sagejs.optimizing-mathematics.extension-degrees/v1",
    node: process.version,
    iterations,
    generic_iterations: genericIterations,
    samples,
    cases: {},
    reviewed_ceilings: {
      v8_over_constant_handwritten: 8,
      isolated_over_constant_handwritten: 2.25,
      v8_over_dynamic_handwritten: 2,
      isolated_over_dynamic_handwritten: 2,
      minimum_generic_speedup: 20,
      maximum_materialized_resources: 32,
    },
  };
  for (const item of cases) {
    const handwritten = measureHandwritten(item);
    const dynamicHandwritten = measureDynamicHandwritten(item);
    const genericAnswer = makeHandwritten(item)(genericIterations);
    const publicResults = await measurePublic(item);
    assert.deepEqual(dynamicHandwritten.answer, handwritten.answer);
    assert.deepEqual(publicResults.v8.answer, handwritten.answer);
    assert.deepEqual(publicResults.isolated.answer, handwritten.answer);
    assert.deepEqual(publicResults.generic.answer, genericAnswer);
    const handwrittenMedian = median(handwritten.observations);
    const dynamicHandwrittenMedian = median(dynamicHandwritten.observations);
    const v8Median = median(publicResults.v8.observations);
    const isolatedMedian = median(publicResults.isolated.observations);
    const genericMedian = median(publicResults.generic.observations);
    const genericProjected = genericMedian * iterations / genericIterations;
    report.cases[item.name] = {
      degree: item.degree,
      representation: `extension-tuple(number,${item.degree})`,
      medians_ms: {
        constant_handwritten_javascript: handwrittenMedian,
        dynamic_handwritten_javascript: dynamicHandwrittenMedian,
        public_v8: v8Median,
        public_isolated: isolatedMedian,
        public_generic: genericMedian,
        public_generic_projected: genericProjected,
      },
      ratios: {
        v8_over_constant_handwritten: v8Median / handwrittenMedian,
        isolated_over_constant_handwritten: isolatedMedian / handwrittenMedian,
        v8_over_dynamic_handwritten: v8Median / dynamicHandwrittenMedian,
        isolated_over_dynamic_handwritten: isolatedMedian / dynamicHandwrittenMedian,
        generic_projected_over_v8: genericProjected / v8Median,
        generic_projected_over_isolated: genericProjected / isolatedMedian,
      },
      routes: {
        v8: publicResults.v8.routes,
        isolated: publicResults.isolated.routes,
        generic: publicResults.generic.routes,
      },
      resources: {
        v8: publicResults.v8.resources,
        isolated: publicResults.isolated.resources,
        generic: publicResults.generic.resources,
      },
      answer: handwritten.answer,
    };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check) {
    for (const item of Object.values(report.cases)) {
      assert.ok(item.ratios.v8_over_constant_handwritten <= 8);
      assert.ok(item.ratios.isolated_over_constant_handwritten <= 2.25);
      assert.ok(item.ratios.v8_over_dynamic_handwritten <= 2);
      assert.ok(item.ratios.isolated_over_dynamic_handwritten <= 2);
      assert.ok(item.ratios.generic_projected_over_v8 >= 20);
      assert.ok(item.ratios.generic_projected_over_isolated >= 20);
      assert.deepEqual(item.routes.v8, ["v8-extension-tuple"]);
      assert.ok(item.routes.isolated.every((route) =>
        route === "native-compiled-source" || route === "wasm-compiled-source"));
      assert.deepEqual(item.routes.generic, ["generic"]);
      assert.ok(item.resources.v8 <= 32);
      assert.ok(item.resources.isolated <= 32);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
