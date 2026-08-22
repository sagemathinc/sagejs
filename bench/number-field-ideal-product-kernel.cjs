#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const check = process.argv.includes("--check");
const repeats = check ? 24 : 200;
const result = spawnSync(sagejs, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  timeout: 180_000,
  input: String.raw`
import json
import time
import sagejs.number_fields.ideal_arithmetic as ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 + 4*x - 1, "a")
O = K.maximal_order()
primes = []
for rational_prime in (2, 3, 5, 7):
    primes.extend(P for P, _exponent in O.factor_rational_prime(rational_prime))
pairs = [(left, right) for left in primes for right in primes]

def measured(product, repeats):
    started = time.perf_counter_ns()
    answers = []
    for index in range(repeats):
        left, right = pairs[index % len(pairs)]
        answers.append(product(left, right))
    return answers, (time.perf_counter_ns() - started) / 1_000_000_000

packed, packed_seconds = measured(lambda left, right: left * right, ${repeats})
readable, readable_seconds = measured(ideals._readable_ideal_product, ${repeats})
assert packed == readable
print(json.dumps({
    "schema": "sagejs.number-fields/ideal-product-kernel-benchmark-v1",
    "degree": 3,
    "pairs": len(pairs),
    "repeats": ${repeats},
    "packed_seconds": packed_seconds,
    "readable_seconds": readable_seconds,
    "speedup": readable_seconds / packed_seconds,
}, sort_keys=True, separators=(",", ":")))
`,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
const receipt = JSON.parse(result.stdout.trim());
assert.equal(receipt.schema, "sagejs.number-fields/ideal-product-kernel-benchmark-v1");
assert.ok(receipt.speedup > 0);
console.log(JSON.stringify(receipt, null, 2));
