#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const count = 100_000;
const genericCount = 500;
const samples = 5;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function extensionMultiply(left, right, prime, modulus) {
  const degree = modulus.length;
  const product = new Array(2 * degree - 1).fill(0);
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      product[i + j] = (product[i + j] + left[i] * right[j]) % prime;
    }
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = (
        (product[target] - product[exponent] * modulus[index]) % prime + prime
      ) % prime;
    }
  }
  return product.slice(0, degree);
}

function cubicOracle(iterations) {
  const prime = 5;
  const answer = [0, 0, 0];
  for (let index = 0; index < iterations; index += 1) {
    const left = [index % 5, (index + 1) % 5, (index * index + 2) % 5];
    const right = [
      (index + 2) % 5,
      (index * index + 3) % 5,
      (index * index * index + 1) % 5,
    ];
    const product = extensionMultiply(left, right, prime, [1, 1, 0]);
    for (let component = 0; component < 3; component += 1) {
      answer[component] = (answer[component] + product[component]) % prime;
    }
  }
  return answer;
}

function residueOracle(iterations) {
  let answer = 0;
  for (let index = 0; index < iterations; index += 1) {
    answer = (
      answer + ((index * index + 3) % 1009) * ((index * index * index + 7) % 1009)
    ) % 1009;
  }
  return [answer];
}

const cases = [
  {
    name: "word-residue-ring",
    route: "v8-number-residue-stream",
    oracle: residueOracle,
    answerSource: "tuple([int(answer)])",
    setup(iterations) {
      return `
R=Zmod(1009)
left=tuple(R(index^2+3) for index in range(${iterations}))
right=tuple(R(index^3+7) for index in range(${iterations}))
zero=R(0)
parent=R`;
    },
  },
  {
    name: "cubic-extension-field",
    route: "v8-extension-tuple-stream",
    oracle: cubicOracle,
    answerSource: "tuple(answer._machineCoordinates)",
    setup(iterations) {
      return `
P.<x>=PolynomialRing(GF(5))
K.<a>=GF(5^3, modulus=x^3+x+1)
aa=a*a
left=tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(${iterations}))
right=tuple(K(index+2)+((index^2+3)%5)*a+((index^3+1)%5)*aa for index in range(${iterations}))
zero=K(0)
parent=K`;
    },
  },
];

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

function source(item, iterations, label) {
  return `
import time
${item.setup(iterations)}
def dot_product(left, right, zero):
    answer=zero
    for index in range(len(left)):
        answer=answer+left[index]*right[index]
    return answer
dot_product(left,right,zero)
for sample in range(${samples}):
    started=time.time()
    answer=dot_product(left,right,zero)
    print('${label}',time.time()-started,${item.answerSource},getattr(parent,'_lastCompilerOptimizationRoute','generic'))
print('resources',len(parent._nativeResourceChildren) if hasattr(parent,'_nativeResourceChildren') else 0)
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
    answer = match[2].split(",").filter(Boolean).map((value) => Number(value.trim()));
    routes.add(match[3]);
  }
  return { observations, routes: [...routes], answer, resources };
}

async function measure(item) {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const fast = parse((await optimized.evaluate(source(item, count, "fast"))).stdout, "fast");
    const slow = parse(
      (await generic.evaluate(source(item, genericCount, "generic"))).stdout,
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
    const result = await measure(item);
    assert.deepEqual(result.fast.answer, item.oracle(count));
    assert.deepEqual(result.slow.answer, item.oracle(genericCount));
    const fastMedian = median(result.fast.observations);
    const genericMedian = median(result.slow.observations);
    const projectedGeneric = genericMedian * count / genericCount;
    const entry = {
      name: item.name,
      answer: result.fast.answer,
      route: result.fast.routes,
      resources: result.fast.resources,
      medians_ms: {
        guarded_streaming_v8: fastMedian,
        generic_prefix: genericMedian,
        projected_generic: projectedGeneric,
      },
      speedup_over_projected_generic: projectedGeneric / fastMedian,
    };
    if (check) {
      assert.deepEqual(result.fast.routes, [item.route]);
      assert.deepEqual(result.slow.routes, ["generic"]);
      assert.equal(result.fast.resources, 0);
      assert.ok(fastMedian <= 350, `${item.name}: ${fastMedian}ms`);
      assert.ok(entry.speedup_over_projected_generic >= 10, item.name);
    }
    report.cases.push(entry);
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
