#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const flint = require(join(root, "packages", "flint"));
const prime89 = (1n << 89n) - 1n;

let currentSagejsFailure;
try {
  flint.nmodPolyGen(prime89);
  currentSagejsFailure = { unexpectedlySucceeded: true };
} catch (error) {
  currentSagejsFailure = {
    operation: "PolynomialRing(GF(2^89-1), 'x').gen() legacy backend",
    error: error.name,
    message: error.message,
  };
}
assert.deepEqual(currentSagejsFailure, {
  operation: "PolynomialRing(GF(2^89-1), 'x').gen() legacy backend",
  error: "RangeError",
  message: "BigInt does not fit in an unsigned FLINT word",
});

const script = String.raw`
import json
import sys
import time
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.polynomial_algorithms.arbitrary_prime_contract import (
    normalized_residues,
    polynomial_add_mod,
    polynomial_divrem_mod,
    polynomial_evaluate_mod,
    polynomial_gcd_mod,
    polynomial_multiply_mod,
    polynomial_xgcd_mod,
)

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
for bits, prime in [(89, 2**89 - 1), (127, 2**127 - 1)]:
    coefficients = [
        (index * index * 97 + index * 1000003 + 11) % prime
        for index in range(512)
    ]
    other = [
        (index * index * 193 + index * 65537 + 19) % prime
        for index in range(512)
    ]
    left = normalized_residues(coefficients, prime)
    right = normalized_residues(other, prime)
    product = polynomial_multiply_mod(left, right, prime)
    common = polynomial_multiply_mod([-3, 1], polynomial_multiply_mod([5, 1], [-7, 1], prime), prime)
    gcd_left = polynomial_multiply_mod(common, left, prime)
    gcd_right = polynomial_multiply_mod(common, right, prime)
    measurements[str(bits)] = {
        "construct512": median_ms(lambda: normalized_residues(coefficients, prime)),
        "add512": median_ms(lambda: polynomial_add_mod(left, right, prime)),
        "multiply512QuadraticOracle": median_ms(lambda: polynomial_multiply_mod(left, right, prime), 3),
        "divremProductByLeft": median_ms(lambda: polynomial_divrem_mod(product, left, prime), 3),
        "gcd514": median_ms(lambda: polynomial_gcd_mod(gcd_left, gcd_right, prime), 3),
        "xgcd514": median_ms(lambda: polynomial_xgcd_mod(gcd_left, gcd_right, prime), 3),
        "evaluate511": median_ms(lambda: polynomial_evaluate_mod(left, 123456789, prime)),
    }
print(json.dumps(measurements, sort_keys=True))
`;

const fallback = spawnSync("python3", ["-c", script], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
});
if (fallback.error) throw fallback.error;
assert.equal(fallback.status, 0, `${fallback.stdout}\n${fallback.stderr}`);

// Recorded on 2026-08-12 with SageMath 10.9.post1, Linux x86_64, and an AMD
// EPYC 7B13.  Cold means the first GF/ring/generator/4096-coefficient
// construction after importing Sage; warm values are medians after warmup.
const recordedSage109Milliseconds = {
  "89": {
    coldFieldRingConstruct4096: 17.425,
    construct4096: 3.134,
    add4096: 0.069,
    multiply512: 0.172,
    divremProductByLeft: 0.501,
    gcd514: 0.505,
    xgcd514: 0.471,
    evaluate4095: 0.990,
    factorDegree32: 5.832,
    rootsDegree32: 5.893,
    dumps4095: 20.804,
    loads4095: 13.138,
    serializedBytes: 65911,
  },
  "127": {
    coldFieldRingConstruct4096: 5.297,
    construct4096: 3.246,
    add4096: 0.061,
    multiply512: 0.207,
    divremProductByLeft: 0.614,
    gcd514: 0.577,
    xgcd514: 0.505,
    evaluate4095: 1.005,
    factorDegree32: 8.168,
    rootsDegree32: 9.803,
    dumps4095: 19.953,
    loads4095: 14.217,
    serializedBytes: 65914,
  },
};

console.log(JSON.stringify({
  schema: "sagejs.benchmark/arbitrary-prime-polynomial-contract-v1",
  currentSagejsFailure,
  resourceTarget: {
    implementation: "generated fmpz_mod_ctx_t + fmpz_mod_poly_t owner",
    capacityPrediction: false,
    resultOwnership: "callee",
  },
  portableQuadraticOracleMilliseconds: JSON.parse(fallback.stdout),
  recordedSage109Milliseconds,
}, null, 2));
