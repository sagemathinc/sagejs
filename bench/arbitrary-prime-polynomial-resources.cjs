#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { performance } = require("node:perf_hooks");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = String.raw`
import json
import time

def median_ms(operation, samples=5):
    operation()
    values = []
    for _repeat in range(samples):
        started = time.perf_counter()
        operation()
        values.append(1000 * (time.perf_counter() - started))
    values.sort()
    return values[len(values) // 2]

measurements = {}
for bits, p in [(89, 2**89 - 1), (127, 2**127 - 1), (521, 2**521 - 1)]:
    R = PolynomialRing(GF(p), "x")
    x = R.gen()
    left_values = [(index*index*97 + index*1000003 + 11) % p for index in range(512)]
    right_values = [(index*index*193 + index*65537 + 19) % p for index in range(512)]
    left = R(left_values)
    right = R(right_values)
    product = left*right
    common = (x - 3)*(x + 5)*(x - 7)
    gcd_left = common*left
    gcd_right = common*right
    packed = dumps(left)
    assert loads(packed) == left
    measurements[str(bits)] = {
        "construct512": median_ms(lambda: R(left_values)),
        "coefficients512": median_ms(lambda: left.coefficients(sparse=False)),
        "add512": median_ms(lambda: left + right),
        "multiply512": median_ms(lambda: left*right, 3),
        "divremProductByLeft": median_ms(lambda: product.quo_rem(left), 3),
        "gcd514": median_ms(lambda: gcd_left.gcd(gcd_right), 3),
        "xgcd514": median_ms(lambda: gcd_left.xgcd(gcd_right), 3),
        "evaluate511": median_ms(lambda: left(123456789)),
        "dumps511": median_ms(lambda: dumps(left)),
        "loads511": median_ms(lambda: loads(packed)),
    }
print(json.dumps(measurements, sort_keys=True))
`;

const directory = mkdtempSync(join(tmpdir(), "sagejs-arbitrary-prime-benchmark-"));
let coldMilliseconds;
let measurements;
try {
  const program = join(directory, "benchmark.py");
  writeFileSync(program, source);
  const started = performance.now();
  const result = spawnSync(resolve(root, "bin", "sagejs"), [program], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1" },
    timeout: 180_000,
  });
  coldMilliseconds = performance.now() - started;
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stderr, "");
  measurements = JSON.parse(result.stdout.trim());
} finally {
  rmSync(directory, { recursive: true, force: true });
}
assert.deepEqual(Object.keys(measurements), ["89", "127", "521"]);
for (const [bits, sample] of Object.entries(measurements)) {
  assert.ok(Object.values(sample).every(Number.isFinite));
  // Generous order-of-magnitude gates reject element-at-a-time host calls or
  // accidental quadratic public fallbacks while tolerating shared CI hosts.
  assert.ok(sample.construct512 < 250, `${bits}-bit construction: ${sample.construct512} ms`);
  assert.ok(sample.coefficients512 < 250, `${bits}-bit coefficients: ${sample.coefficients512} ms`);
  assert.ok(sample.add512 < 100, `${bits}-bit add: ${sample.add512} ms`);
  assert.ok(sample.multiply512 < 1_000, `${bits}-bit multiply: ${sample.multiply512} ms`);
  assert.ok(sample.divremProductByLeft < 1_000, `${bits}-bit divrem: ${sample.divremProductByLeft} ms`);
  assert.ok(sample.gcd514 < 2_000, `${bits}-bit gcd: ${sample.gcd514} ms`);
  assert.ok(sample.xgcd514 < 2_000, `${bits}-bit xgcd: ${sample.xgcd514} ms`);
  assert.ok(sample.evaluate511 < 100, `${bits}-bit evaluate: ${sample.evaluate511} ms`);
}

console.log(JSON.stringify({
  schema: "sagejs.benchmark/arbitrary-prime-polynomial-resources-v1",
  coldMilliseconds,
  measurements,
}, null, 2));
