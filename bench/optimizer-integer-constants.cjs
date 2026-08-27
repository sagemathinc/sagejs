#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const samples = 7;
const genericCount = 500;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
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

function primeOracle(count) {
  let value = 3;
  for (let index = 0; index < count; index += 1) {
    value = (value * value + 1) % 1009;
  }
  return [value];
}

function extensionOracle(count) {
  let value = [2, 3, 1];
  for (let index = 0; index < count; index += 1) {
    value = extensionMultiply(value, value);
    value[0] = (value[0] + 1) % 5;
  }
  return value;
}

const cases = [
  {
    name: "word-residue-ring",
    count: 5_000_000,
    route: "v8-number-residue-region",
    maximumMilliseconds: 150,
    minimumSpeedup: 10,
    oracle: primeOracle,
    setup: `
R=Zmod(1009)
parent=R
initial=R(3)
one=R(1)`,
    answer: "tuple([int(answer)])",
  },
  {
    name: "cubic-extension-field",
    count: 200_000,
    route: "v8-extension-tuple-region",
    maximumMilliseconds: 750,
    minimumSpeedup: 5,
    oracle: extensionOracle,
    setup: `
P.<x>=PolynomialRing(GF(5))
K.<a>=GF(5^3, modulus=x^3+x+1)
parent=K
initial=K(2)+3*a+a*a
one=K(1)`,
    answer: "tuple(answer._power_basis_coordinates())",
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

function source(item, count, includeThreaded) {
  return `
import time
${item.setup}
def natural(count,value):
    for index in range(count):
        value=value*value+1
    return value
def threaded(count,value,one):
    for index in range(count):
        value=value*value+one
    return value
natural(${count},initial)
${includeThreaded ? `threaded(${count},initial,one)` : ""}
for sample in range(${samples}):
    started=time.time()
    answer=natural(${count},initial)
    print('natural',time.time()-started,${item.answer},getattr(parent,'_lastCompilerOptimizationRoute','generic'))
${includeThreaded ? `    started=time.time()
    answer=threaded(${count},initial,one)
    print('threaded',time.time()-started,${item.answer},getattr(parent,'_lastCompilerOptimizationRoute','generic'))` : ""}
`;
}

function parse(stdout) {
  const result = { natural: [], threaded: [], routes: new Set(), answers: [] };
  for (const line of stdout.trim().split(/\r?\n/)) {
    const match = line.match(
      /^(natural|threaded) ([0-9.eE+-]+) \(([^)]*)\) ([a-z0-9-]+)$/,
    );
    assert.ok(match, line);
    result[match[1]].push(Number(match[2]) * 1000);
    result.answers.push(
      match[3].split(",").filter(Boolean).map((value) => Number(value.trim())),
    );
    result.routes.add(match[4]);
  }
  return result;
}

async function measure(item) {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    const fast = parse((await optimized.evaluate(
      source(item, item.count, true),
    )).stdout);
    const slow = parse((await generic.evaluate(
      source(item, genericCount, false),
    )).stdout);
    return { fast, slow };
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
}

(async () => {
  const report = { samples, generic_count: genericCount, cases: [] };
  for (const item of cases) {
    const { fast, slow } = await measure(item);
    const answer = item.oracle(item.count);
    const genericAnswer = item.oracle(genericCount);
    assert.ok(fast.answers.every((value) =>
      JSON.stringify(value) === JSON.stringify(answer)
    ));
    assert.ok(slow.answers.every((value) =>
      JSON.stringify(value) === JSON.stringify(genericAnswer)
    ));
    const natural = median(fast.natural);
    const threaded = median(fast.threaded);
    const generic = median(slow.natural);
    const projectedGeneric = generic * item.count / genericCount;
    const entry = {
      name: item.name,
      count: item.count,
      answer,
      routes: [...fast.routes],
      medians_ms: {
        natural_integer_constant: natural,
        manually_threaded_ring_one: threaded,
        generic_prefix: generic,
        projected_generic: projectedGeneric,
      },
      natural_over_threaded_ratio: natural / threaded,
      speedup_over_projected_generic: projectedGeneric / natural,
      natural_nanoseconds_per_step: natural * 1e6 / item.count,
    };
    if (check) {
      assert.deepEqual([...fast.routes], [item.route]);
      assert.deepEqual([...slow.routes], ["generic"]);
      assert.ok(natural <= item.maximumMilliseconds, `${item.name}: ${natural}ms`);
      assert.ok(
        entry.natural_over_threaded_ratio <= 1.5,
        `${item.name}: natural/threaded=${entry.natural_over_threaded_ratio}`,
      );
      assert.ok(
        entry.speedup_over_projected_generic >= item.minimumSpeedup,
        `${item.name}: speedup=${entry.speedup_over_projected_generic}`,
      );
    }
    report.cases.push(entry);
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
