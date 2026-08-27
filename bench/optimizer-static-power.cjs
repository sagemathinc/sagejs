#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const count = 20_000;
const genericCount = 100;
const samples = 5;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function residuePower(value, exponent, modulus) {
  let result = 1;
  let base = value;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = result * base % modulus;
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) base = base * base % modulus;
  }
  return result;
}

function extensionMultiply(left, right) {
  const product = new Array(5).fill(0);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      product[i + j] = (product[i + j] + left[i] * right[j]) % 5;
    }
  }
  for (let exponent = 4; exponent >= 3; exponent -= 1) {
    const factor = product[exponent];
    product[exponent - 3] = (product[exponent - 3] - factor + 5) % 5;
    product[exponent - 2] = (product[exponent - 2] - factor + 5) % 5;
  }
  return product.slice(0, 3);
}

function extensionPower(value, exponent) {
  let result = [1, 0, 0];
  let base = value;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) result = extensionMultiply(result, base);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) base = extensionMultiply(base, base);
  }
  return result;
}

function residueOracle(iterations) {
  let answer = 0;
  for (let index = 0; index < iterations; index += 1) {
    const value = (index * index + 3) % 1009;
    answer = (answer + residuePower(value, 19, 1009) -
      residuePower(value, 65537, 1009) + 1009) % 1009;
  }
  return [answer];
}

function cubicOracle(iterations) {
  let answer = [0, 0, 0];
  for (let index = 0; index < iterations; index += 1) {
    const value = [index % 5, (index + 1) % 5, (index * index + 2) % 5];
    const first = extensionPower(value, 19);
    const second = extensionPower(value, 65537);
    answer = answer.map((component, position) =>
      (component + first[position] - second[position] + 5) % 5);
  }
  return answer;
}

const cases = [
  {
    name: "word-residue-ring",
    route: "v8-number-residue-stream",
    oracle: residueOracle,
    answer: "tuple([int(answer)])",
    setup(iterations) {
      return `
R=Zmod(1009)
values=tuple(R(index^2+3) for index in range(${iterations}))
zero=R(0)
parent=R`;
    },
  },
  {
    name: "cubic-extension-field",
    route: "v8-extension-tuple-stream",
    oracle: cubicOracle,
    answer: "tuple(answer._power_basis_coordinates())",
    setup(iterations) {
      return `
P.<x>=PolynomialRing(GF(5))
K.<a>=GF(5^3, modulus=x^3+x+1)
aa=a*a
values=tuple(K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(${iterations}))
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
def high_power_sum(values, zero):
    answer=zero
    for index in range(len(values)):
        answer=answer+values[index]^19-values[index]^65537
    return answer
high_power_sum(values,zero)
for sample in range(${samples}):
    started=time.time()
    answer=high_power_sum(values,zero)
    print('${label}',time.time()-started,${item.answer},getattr(parent,'_lastCompilerOptimizationRoute','generic'))
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
  const report = { count, generic_count: genericCount, samples, exponents: [19, 65537], cases: [] };
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
        guarded_binary_power_stream: fastMedian,
        generic_prefix: genericMedian,
        projected_generic: projectedGeneric,
      },
      speedup_over_projected_generic: projectedGeneric / fastMedian,
    };
    if (check) {
      assert.deepEqual(result.fast.routes, [item.route]);
      assert.deepEqual(result.slow.routes, ["generic"]);
      assert.equal(result.fast.resources, 0);
      assert.ok(fastMedian <= 500, `${item.name}: ${fastMedian}ms`);
      assert.ok(entry.speedup_over_projected_generic >= 5, item.name);
    }
    report.cases.push(entry);
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
