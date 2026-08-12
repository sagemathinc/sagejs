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
x = R.gen()

def median_ms(operation, samples=9):
    values = []
    for _repeat in range(3):
        operation()
    for _repeat in range(samples):
        started = time.perf_counter()
        operation()
        values.append(1000 * (time.perf_counter() - started))
    values.sort()
    return values[len(values) // 2]

construction_coefficients = [
    (index * 1000000007 + index * index * 97 + 11) % p
    for index in range(20000)
]
construction_ms = median_ms(lambda: R(construction_coefficients))
large = R(construction_coefficients)
other = R([(index * 65537 + 19) % p for index in range(20000)])
add_ms = median_ms(lambda: large + other)
derivative_ms = median_ms(lambda: large.derivative())
evaluate_ms = median_ms(lambda: large(123456789))
sagepack = dumps(large)
sagepack_dump_ms = median_ms(lambda: dumps(large), 5)
sagepack_load_ms = median_ms(lambda: loads(sagepack), 5)
assert loads(sagepack) == large

left = R(construction_coefficients[:4000])
right = R(construction_coefficients[4000:8000])
multiply_ms = median_ms(lambda: left * right)
product = left * right
divrem_ms = median_ms(lambda: product.quo_rem(left))

common = R(construction_coefficients[:257])
gcd_left = common * R(construction_coefficients[257:769])
gcd_right = common * R(construction_coefficients[769:1281])
gcd_ms = median_ms(lambda: gcd_left.gcd(gcd_right))
xgcd_ms = median_ms(lambda: gcd_left.xgcd(gcd_right))

factored = R(1)
for root in range(1, 17):
    factored *= (x - root) ** (1 + root % 3)
factor_ms = median_ms(lambda: factored.factor(), 5)
roots_ms = median_ms(lambda: factored.roots(), 5)

print(json.dumps({
    "schema": "sagejs.benchmark/large-prime-polynomial-v1",
    "modulus": str(p),
    "degrees": {
        "linear": 19999,
        "multiply": 3999,
        "gcd": gcd_left.degree(),
        "factor": factored.degree(),
    },
    "medianMilliseconds": {
        "construction": construction_ms,
        "add": add_ms,
        "derivative": derivative_ms,
        "evaluate": evaluate_ms,
        "sagepackDump": sagepack_dump_ms,
        "sagepackLoad": sagepack_load_ms,
        "multiply": multiply_ms,
        "divrem": divrem_ms,
        "gcd": gcd_ms,
        "xgcd": xgcd_ms,
        "factor": factor_ms,
        "roots": roots_ms,
    },
    "sagepackBytes": len(sagepack),
}))
`;

const result = spawnSync(resolve(root, "bin", "sagejs"), ["--python"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  env: {
    ...process.env,
    SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
    SAGEJS_NATIVE_REQUIRED: "1",
  },
  timeout: 120_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const measurement = JSON.parse(result.stdout.trim());
assert.equal(measurement.modulus, "2305843009213693951");
console.log(JSON.stringify(measurement, null, 2));
