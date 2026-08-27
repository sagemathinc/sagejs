#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const count = 200_000;
const genericCount = 500;
const samples = 5;

const cases = [
  {
    name: "cubic",
    prime: 5,
    degree: 3,
    polynomial: "x^3+x+1",
    modulus: [1, 1, 0],
    initial: [1, 1, 1],
    factor: [2, 3, 4],
    setup: "aa=a*a",
    initialSource: "K(1)+a+aa",
    factorSource: "K(2)+3*a+4*aa",
    coefficientSource: "K(index)+((index+1)%5)*a+((index^2+2)%5)*aa",
    coefficient(index) {
      return [index % 5, (index + 1) % 5, (index * index + 2) % 5];
    },
    maximumMs: 150,
  },
  {
    name: "quartic",
    prime: 3,
    degree: 4,
    polynomial: "x^4+x+2",
    modulus: [2, 1, 0, 0],
    initial: [1, 2, 1, 2],
    factor: [2, 1, 2, 1],
    setup: "bb=b*b\nbbb=bb*b",
    initialSource: "K(1)+2*b+bb+2*bbb",
    factorSource: "K(2)+b+2*bb+bbb",
    coefficientSource: "K(index)+((index+1)%3)*b+((index^2+1)%3)*bb+((index^3+2)%3)*bbb",
    coefficient(index) {
      return [
        index % 3,
        (index + 1) % 3,
        (index * index + 1) % 3,
        (index * index * index + 2) % 3,
      ];
    },
    maximumMs: 250,
  },
];

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function makeScalarHorner(item) {
  const lines = [];
  for (let component = 0; component < item.degree; component += 1) {
    lines.push(
      `let v${component}=initial[${component}];`,
      `const f${component}=factor[${component}];`,
      `const m${component}=modulus[${component}];`,
    );
  }
  lines.push("for(let step=0;step<count;step++){", "const c=coefficients[step];");
  for (let exponent = 0; exponent < 2 * item.degree - 1; exponent += 1) {
    const terms = [];
    for (let left = 0; left < item.degree; left += 1) {
      const right = exponent - left;
      if (right >= 0 && right < item.degree) terms.push(`v${left}*f${right}`);
    }
    lines.push(`let t${exponent}=(${terms.join("+")})%prime;`);
  }
  for (let exponent = 2 * item.degree - 2; exponent >= item.degree; exponent -= 1) {
    for (let component = 0; component < item.degree; component += 1) {
      const target = exponent - item.degree + component;
      lines.push(
        `const q${exponent}_${component}=(t${exponent}*m${component})%prime;`,
        `t${target}=t${target}>=q${exponent}_${component}?` +
          `t${target}-q${exponent}_${component}:` +
          `t${target}+prime-q${exponent}_${component};`,
      );
    }
  }
  for (let component = 0; component < item.degree; component += 1) {
    lines.push(
      `const s${component}=t${component}+c[${component}];`,
      `v${component}=s${component}>=prime?s${component}-prime:s${component};`,
    );
  }
  lines.push(
    "}",
    `return [${item.initial.map((_value, index) => `v${index}`).join(",")}];`,
  );
  return new Function(
    "count", "prime", "modulus", "initial", "factor", "coefficients",
    lines.join(""),
  );
}

function measureScalar(item, iterations) {
  const coefficients = Array.from(
    { length: iterations },
    (_unused, index) => Object.freeze(item.coefficient(index)),
  );
  const run = makeScalarHorner(item);
  const args = [iterations, item.prime, item.modulus, item.initial, item.factor, coefficients];
  run(...args);
  const observations = [];
  let answer;
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    answer = run(...args);
    observations.push(performance.now() - started);
  }
  return { answer, observations };
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

function publicSource(item, iterations, label) {
  const generator = item.degree === 3 ? "a" : "b";
  return `
import time
P.<x> = PolynomialRing(GF(${item.prime}))
K.<${generator}> = GF(${item.prime}^${item.degree}, modulus=${item.polynomial})
${item.setup}
values=tuple(${item.coefficientSource} for index in range(${iterations}))
def horner(values):
    value=${item.initialSource}
    point=${item.factorSource}
    for coefficient in values:
        value=value*point+coefficient
    return value
horner(values)
for sample in range(${samples}):
    started=time.time()
    answer=horner(values)
    print('${label}', time.time()-started, tuple(answer._machineCoordinates), K._lastCompilerOptimizationRoute)
print('resources', len(K._nativeResourceChildren))
`;
}

function parse(stdout, label) {
  const observations = [];
  const routes = new Set();
  let answer;
  let resources;
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
    answer = match[2].split(",").map((value) => Number(value.trim()));
    routes.add(match[3]);
  }
  return { observations, routes: [...routes], answer, resources };
}

async function measurePublic(item) {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const fast = parse(
      (await optimized.evaluate(publicSource(item, count, "fast"))).stdout,
      "fast",
    );
    const slow = parse(
      (await generic.evaluate(publicSource(item, genericCount, "generic"))).stdout,
      "generic",
    );
    return { fast, slow };
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
}

(async () => {
  const report = { count, generic_count: genericCount, samples, cases: [] };
  for (const item of cases) {
    const scalar = measureScalar(item, count);
    const genericOracle = measureScalar(item, genericCount);
    const publicResults = await measurePublic(item);
    const fastMedian = median(publicResults.fast.observations);
    const genericMedian = median(publicResults.slow.observations);
    const projectedGeneric = genericMedian * count / genericCount;
    const entry = {
      name: item.name,
      answer: publicResults.fast.answer,
      routes: publicResults.fast.routes,
      resources: publicResults.fast.resources,
      medians_ms: {
        guarded_streaming_v8: fastMedian,
        scalar_js_lower_bound: median(scalar.observations),
        generic_prefix: genericMedian,
        projected_generic: projectedGeneric,
      },
      speedup_over_projected_generic: projectedGeneric / fastMedian,
    };
    assert.deepEqual(publicResults.fast.answer, scalar.answer);
    assert.deepEqual(publicResults.slow.answer, genericOracle.answer);
    if (check) {
      assert.deepEqual(publicResults.fast.routes, ["v8-extension-tuple-stream"]);
      assert.deepEqual(publicResults.slow.routes, ["generic"]);
      assert.equal(publicResults.fast.resources, 0);
      assert.ok(fastMedian <= item.maximumMs, `${item.name}: ${fastMedian}ms`);
      assert.ok(entry.speedup_over_projected_generic >= 50, item.name);
    }
    report.cases.push(entry);
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
