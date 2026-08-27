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
  for (let leftIndex = 0; leftIndex < degree; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < degree; rightIndex += 1) {
      const target = leftIndex + rightIndex;
      product[target] = (
        product[target] + left[leftIndex] * right[rightIndex]
      ) % prime;
    }
  }
  for (let exponent = product.length - 1; exponent >= degree; exponent -= 1) {
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = (
        product[target] - product[exponent] * modulus[index]
      ) % prime;
      if (product[target] < 0) product[target] += prime;
    }
  }
  return product.slice(0, degree);
}

function oracle(iterations, extension) {
  if (!extension) {
    let answer = 0;
    for (let index = 0; index < iterations; index += 1) {
      answer = (
        answer + ((index * index + 3) % 1009) *
          ((index * index * index + 7) % 1009)
      ) % 1009;
    }
    return [answer];
  }
  const answer = [0, 0, 0];
  for (let index = 0; index < iterations; index += 1) {
    const product = extensionMultiply(
      [index % 5, (index + 1) % 5, (index * index + 2) % 5],
      [(index + 2) % 5, (index * index + 3) % 5,
        (index * index * index + 1) % 5],
      5,
      [1, 1, 0],
    );
    for (let component = 0; component < 3; component += 1) {
      answer[component] = (answer[component] + product[component]) % 5;
    }
  }
  return answer;
}

const cases = [
  {
    name: "word-residue-ring",
    route: "v8-number-residue-stream",
    extension: false,
    answer: "tuple([int(answer)])",
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
    extension: true,
    answer: "tuple(answer._machineCoordinates)",
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

function source(item, iterations, includeIndex) {
  return `
import time
${item.setup(iterations)}
def zip_dot(left, right, zero):
    answer=zero
    for first, second in zip(left, right, strict=True):
        answer=answer+first*second
    return answer
def index_dot(left, right, zero):
    answer=zero
    for index in range(len(left)):
        answer=answer+left[index]*right[index]
    return answer
zip_dot(left,right,zero)
${includeIndex ? "index_dot(left,right,zero)" : ""}
for sample in range(${samples}):
    started=time.time()
    answer=zip_dot(left,right,zero)
    print('zip',time.time()-started,${item.answer},getattr(parent,'_lastCompilerOptimizationRoute','generic'))
${includeIndex ? `    started=time.time()
    answer=index_dot(left,right,zero)
    print('index',time.time()-started,${item.answer},getattr(parent,'_lastCompilerOptimizationRoute','generic'))` : ""}
`;
}

function parse(stdout) {
  const result = { zip: [], index: [], answers: {}, routes: {} };
  for (const line of stdout.trim().split(/\r?\n/)) {
    const match = line.match(
      /^(zip|index) ([0-9.eE+-]+) \(([^)]*)\) ([a-z0-9-]+)$/,
    );
    assert.ok(match, line);
    const kind = match[1];
    result[kind].push(Number(match[2]) * 1000);
    result.answers[kind] = match[3].split(",").filter(Boolean).map(Number);
    result.routes[kind] ??= new Set();
    result.routes[kind].add(match[4]);
  }
  return result;
}

(async () => {
  const report = { count, generic_count: genericCount, samples, cases: [] };
  for (const item of cases) {
    const optimized = await sessionAtLevel("O2");
    const generic = await sessionAtLevel("O0");
    let fast;
    let slow;
    try {
      [fast, slow] = await Promise.all([
        optimized.evaluate(source(item, count, true)),
        generic.evaluate(source(item, genericCount, false)),
      ]);
    } finally {
      await Promise.all([optimized.close(), generic.close()]);
    }
    const measured = parse(fast.stdout);
    const genericMeasured = parse(slow.stdout);
    const expected = oracle(count, item.extension);
    assert.deepEqual(measured.answers.zip, expected);
    assert.deepEqual(measured.answers.index, expected);
    assert.deepEqual(genericMeasured.answers.zip, oracle(genericCount, item.extension));
    const zipMedian = median(measured.zip);
    const indexMedian = median(measured.index);
    const genericMedian = median(genericMeasured.zip);
    const projectedGeneric = genericMedian * count / genericCount;
    const entry = {
      name: item.name,
      answer: expected,
      routes: Object.fromEntries(Object.entries(measured.routes).map(
        ([name, routes]) => [name, [...routes]],
      )),
      medians_ms: {
        guarded_zip: zipMedian,
        guarded_index: indexMedian,
        generic_zip_prefix: genericMedian,
        projected_generic_zip: projectedGeneric,
      },
      zip_to_index_ratio: zipMedian / indexMedian,
      speedup_over_projected_generic: projectedGeneric / zipMedian,
    };
    if (check) {
      assert.deepEqual(entry.routes.zip, [item.route]);
      assert.deepEqual(entry.routes.index, [item.route]);
      assert.ok(zipMedian <= 400, `${item.name}: ${zipMedian}ms`);
      assert.ok(entry.zip_to_index_ratio <= 2, item.name);
      assert.ok(entry.speedup_over_projected_generic >= 10, item.name);
    }
    report.cases.push(entry);
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
