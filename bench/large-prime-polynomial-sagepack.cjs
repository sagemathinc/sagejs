#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = String.raw`
import json
import time

p = 2305843009213693951
R = PolynomialRing(GF(p), "x")
coefficients = [
    (index * 1000000007 + index * index * 97 + 11) % p
    for index in range(20000)
]
value = R(coefficients)

def median_ms(operation, samples=9):
    for _repeat in range(3):
        operation()
    values = []
    for _repeat in range(samples):
        started = time.perf_counter()
        operation()
        values.append(1000 * (time.perf_counter() - started))
    values.sort()
    return values[len(values) // 2]

packet = dumps(value)
answer = loads(packet)
assert answer == value and answer.parent() is R
print(json.dumps({
    "schema": "sagejs.benchmark/word-prime-polynomial-sagepack-v1",
    "modulus": str(p),
    "coefficientCount": len(coefficients),
    "sagePackBytes": len(packet),
    "medianMilliseconds": {
        "dump": median_ms(lambda: dumps(value)),
        "load": median_ms(lambda: loads(packet)),
    },
}))
`;

const result = spawnSync(resolve(root, "bin", "sagejs"), ["--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const measurement = JSON.parse(result.stdout.trim());
assert.equal(measurement.modulus, "2305843009213693951");
assert.equal(measurement.coefficientCount, 20000);
assert.ok(measurement.sagePackBytes < 180_000);
assert.ok(measurement.medianMilliseconds.dump < 250);
assert.ok(measurement.medianMilliseconds.load < 250);
console.log(JSON.stringify(measurement, null, 2));
