#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const count = 4096;
const genericCount = 256;
const samples = 5;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function multiply(left, right) {
  const prime = 5;
  const product = new Array(5).fill(0);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      product[i + j] = (product[i + j] + left[i] * right[j]) % prime;
    }
  }
  // x^3 + x + 1 = 0.
  for (let exponent = 4; exponent >= 3; exponent -= 1) {
    const factor = product[exponent];
    product[exponent - 3] = (product[exponent - 3] - factor + prime) % prime;
    product[exponent - 2] = (product[exponent - 2] - factor + prime) % prime;
  }
  return product.slice(0, 3);
}

function coefficient(index) {
  return [index % 5, (index + 1) % 5, (index * index + 2) % 5];
}

function oracle(length) {
  let answer = [0, 0, 0];
  const point = [2, 3, 4];
  for (let index = length - 1; index >= 0; index -= 1) {
    const product = multiply(answer, point);
    const value = coefficient(index);
    answer = product.map((component, position) =>
      (component + value[position]) % 5);
  }
  return answer;
}

const source = String.raw`
import time
P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3+x+1)
aa = a*a
R.<t> = PolynomialRing(K)
polynomial = R([K(index)+((index+1)%5)*a+((index^2+2)%5)*aa for index in range(${count})])
stored = polynomial._machineFieldCoefficients
point = K(2)+3*a+4*aa
generic_coefficients = list(stored[:${genericCount}])
def generic_evaluate(coefficients, point):
    answer = K(0)
    for coefficient in reversed(coefficients):
        answer = answer*point+coefficient
    return answer
generic_evaluate(generic_coefficients, point)
for sample in range(${samples}):
    started=time.time()
    generic_answer=generic_evaluate(generic_coefficients, point)
    print('generic',time.time()-started,tuple(generic_answer._machineCoordinates))
before=len(K._nativeResourceChildren)
polynomial(point)
for sample in range(${samples}):
    K._lastCompilerOptimizationRoute='missing'
    started=time.time()
    public_answer=polynomial(point)
    print('public',time.time()-started,tuple(public_answer._machineCoordinates),K._lastCompilerOptimizationRoute)
after=len(K._nativeResourceChildren)
print('metadata',stored is polynomial._machineFieldCoefficients,len(stored),after-before)
`;

function parse(stdout) {
  const result = {
    generic: [],
    public: [],
    routes: new Set(),
    genericAnswer: null,
    publicAnswer: null,
    metadata: null,
  };
  for (const line of stdout.trim().split(/\r?\n/)) {
    const timing = line.match(
      /^(generic|public) ([0-9.eE+-]+) \(([^)]*)\)(?: ([a-z0-9-]+))?$/,
    );
    if (timing) {
      const kind = timing[1];
      result[kind].push(Number(timing[2]) * 1000);
      const answer = timing[3].split(",").map((value) => Number(value.trim()));
      result[`${kind}Answer`] = answer;
      if (timing[4]) result.routes.add(timing[4]);
      continue;
    }
    const metadata = line.match(/^metadata (True|False) (\d+) (-?\d+)$/);
    assert.ok(metadata, line);
    result.metadata = {
      stable: metadata[1] === "True",
      length: Number(metadata[2]),
      resourceDelta: Number(metadata[3]),
    };
  }
  return result;
}

(async () => {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O2";
  let sage;
  try {
    sage = await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
  try {
    const result = parse((await sage.evaluate(source)).stdout);
    const publicMedian = median(result.public);
    const genericMedian = median(result.generic);
    const projectedGeneric = genericMedian * count / genericCount;
    const report = {
      coefficient_count: count,
      generic_prefix_count: genericCount,
      samples,
      answers: {
        public: result.publicAnswer,
        generic_prefix: result.genericAnswer,
      },
      route: [...result.routes],
      metadata: result.metadata,
      medians_ms: {
        guarded_public_polynomial: publicMedian,
        generic_prefix: genericMedian,
        projected_generic: projectedGeneric,
      },
      speedup_over_projected_generic: projectedGeneric / publicMedian,
    };
    assert.deepEqual(result.publicAnswer, oracle(count));
    assert.deepEqual(result.genericAnswer, oracle(genericCount));
    if (check) {
      assert.deepEqual(report.route, ["v8-extension-tuple-stream"]);
      assert.deepEqual(result.metadata, {
        stable: true,
        length: count,
        resourceDelta: 0,
      });
      assert.ok(publicMedian <= 100, `${publicMedian}ms`);
      assert.ok(report.speedup_over_projected_generic >= 20);
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sage.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
