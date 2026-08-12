#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const program = String.raw`
import time

def median(operation):
    for _warmup in range(3):
        operation()
    samples = []
    for _sample in range(9):
        started = time.perf_counter()
        operation()
        samples.append(1000*(time.perf_counter() - started))
    samples.sort()
    return samples[len(samples)//2]

R = PolynomialRing(ZZ, "x")
x = R.gen()
integer_outer = R([(17*index + 3) % 101 - 50 for index in range(65)])
integer_inner = R([(11*index + 5) % 29 - 14 for index in range(9)])
integer_right = R([(31*index + 7) % 103 - 51 for index in range(64)])

S = PolynomialRing(QQ, "y")
rational = S([
    QQ((43*index + 9) % 127 - 63) / QQ(index % 19 + 1)
    for index in range(1001)
])

field = GF(2305843009213693951)
T = PolynomialRing(field, "z")
prime_outer = T([(104729*index + 17) for index in range(257)])
prime_inner = T([(65537*index + 3) for index in range(9)])
prime_right = T([(31337*index + 11) for index in range(256)])

measurements = [
    median(lambda: integer_outer(integer_inner)),
    median(lambda: integer_outer.resultant(integer_right)),
    median(lambda: rational.integral()),
    median(lambda: prime_outer(prime_inner)),
    median(lambda: prime_outer.resultant(prime_right)),
]
print("|".join(str(value) for value in measurements))
`;

const result = spawnSync(
  process.execPath,
  [resolve(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: program,
    env: {
      ...process.env,
      SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
    },
    timeout: 120_000,
  },
);
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.equal(result.stderr, "", `${result.stdout}\n${result.stderr}`);
const values = result.stdout.trim().split("|").map(Number);
assert.equal(values.length, 5, result.stdout);
assert.ok(values.every(Number.isFinite), result.stdout);
for (const value of values) {
  assert.ok(value < 1000, `public structural operation took ${value}ms`);
}

console.log(JSON.stringify({
  schema: "sagejs.benchmark/public-polynomial-structural-v1",
  implementation: "public-generated-flint-dispatch",
  warmup: 3,
  samples: 9,
  milliseconds: {
    integerComposeDegree64By8: values[0],
    integerResultantDegree64By63: values[1],
    rationalIntegralDegree1000: values[2],
    primeComposeDegree256By8: values[3],
    primeResultantDegree256By255: values[4],
  },
}, null, 2));
