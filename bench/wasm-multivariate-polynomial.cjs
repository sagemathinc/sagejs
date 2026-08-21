#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix"),
);
const samples = Number.parseInt(process.env.SAGEJS_MPOLY_SAMPLES || "11", 10);
assert.ok(Number.isSafeInteger(samples) && samples >= 3 && samples % 2 === 1);

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function publicProfile() {
  const source = String.raw`
import time
Z = PolynomialRing(ZZ, names=("x", "y", "z"))
x, y, z = Z.gens()
Q = PolynomialRing(QQ, names=("x", "y", "z"))
qx, qy, qz = Q.gens()
def median(values):
    values.sort()
    return values[len(values)//2]
def measure(function, repeats):
    values = []
    value = None
    for _ in range(repeats):
        start = time.perf_counter()
        value = function()
        values.append((time.perf_counter() - start)*1000)
    return median(values), value
common = (x+y+z+1)**7 + (x-y+2*z+3)**6
left = common*((2*x+y+z+1)**6 + x*y*z + 1)
right = common*((x+3*y+2*z+2)**6 + x*z + 2)
gcd_ms, gcd_value = measure(lambda: left.gcd(right), ${samples})
resultant_left = (x+y+z+1)**7 + (x-y+2*z+3)**6 + y**5*z
resultant_right = (2*x-y+z+2)**6 + (x+2*y-z+1)**5 + z**6
resultant_ms, resultant_value = measure(
    lambda: resultant_left.resultant(resultant_right, x), ${samples}
)
generators = [
    qx**4+qy*qz+qx,
    qy**4+qz*qx+qy,
    qz**4+qx*qy+qz,
]
groebner_ms, basis = measure(
    lambda: Q.ideal(*generators).groebner_basis(), ${samples}
)
print(gcd_ms, resultant_ms, groebner_ms)
print(common.number_of_terms(), left.number_of_terms(), right.number_of_terms())
print(resultant_left.number_of_terms(), resultant_right.number_of_terms(),
      resultant_value.number_of_terms(), len(basis))
`;
  const lines = run(process.execPath, [join(root, "bin/sagejs"), "--python"], {
    input: source,
  }).split(/\r?\n/);
  const milliseconds = lines[0].split(" ").map(Number);
  const gcdTerms = lines[1].split(" ").map(Number);
  const resultantTerms = lines[2].split(" ").map(Number);
  return {
    warmup: "construct once, then odd-count median of immutable public calls",
    samples,
    gcd: {
      medianMs: milliseconds[0],
      commonTerms: gcdTerms[0],
      leftTerms: gcdTerms[1],
      rightTerms: gcdTerms[2],
    },
    resultant: {
      medianMs: milliseconds[1],
      leftTerms: resultantTerms[0],
      rightTerms: resultantTerms[1],
      outputTerms: resultantTerms[2],
    },
    groebner: {
      medianMs: milliseconds[2],
      inputGenerators: 3,
      outputGenerators: resultantTerms[3],
    },
  };
}

function factorial(value) {
  let answer = 1n;
  for (let index = 2n; index <= BigInt(value); index += 1n) answer *= index;
  return answer;
}

function addTerm(polynomial, exponents, coefficient) {
  const key = exponents.join(",");
  const value = (polynomial.get(key) || 0n) + coefficient;
  if (value === 0n) polynomial.delete(key);
  else polynomial.set(key, value);
}

function linearPower(coefficients, degree) {
  const answer = new Map();
  const numerator = factorial(degree);
  for (let x = 0; x <= degree; x += 1) {
    for (let y = 0; y <= degree - x; y += 1) {
      for (let z = 0; z <= degree - x - y; z += 1) {
        const constant = degree - x - y - z;
        const multiplicity = numerator /
          (factorial(x) * factorial(y) * factorial(z) * factorial(constant));
        const coefficient = multiplicity *
          coefficients[0] ** BigInt(x) * coefficients[1] ** BigInt(y) *
          coefficients[2] ** BigInt(z) * coefficients[3] ** BigInt(constant);
        addTerm(answer, [x, y, z], coefficient);
      }
    }
  }
  return answer;
}

function addPolynomial(target, source) {
  for (const [key, coefficient] of source) {
    addTerm(target, key.split(",").map(Number), coefficient);
  }
  return target;
}

function pushU32(output, value) {
  output.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24);
}

function pushTerm(output, key, coefficient) {
  const exponents = key.split(",").map(Number);
  let magnitude = coefficient < 0n ? -coefficient : coefficient;
  const words = [];
  while (magnitude !== 0n) {
    words.push(Number(magnitude & 0xffffffffn));
    magnitude >>= 32n;
  }
  pushU32(output, coefficient < 0n ? 2 : 1);
  pushU32(output, words.length);
  for (const word of words) pushU32(output, word);
  for (const exponent of exponents) pushU32(output, exponent);
}

function representativePacket() {
  const left = linearPower([1n, 1n, 1n, 1n], 7);
  addPolynomial(left, linearPower([1n, -1n, 2n, 3n], 6));
  addTerm(left, [0, 5, 1], 1n);
  const right = linearPower([2n, -1n, 1n, 2n], 6);
  addPolynomial(right, linearPower([1n, 2n, -1n, 1n], 5));
  addTerm(right, [0, 0, 6], 1n);
  const output = [];
  for (const value of [0x49504d53, 1, 1, 3, 0, 0, left.size, right.size]) {
    pushU32(output, value);
  }
  for (const [key, coefficient] of left) pushTerm(output, key, coefficient);
  for (const [key, coefficient] of right) pushTerm(output, key, coefficient);
  return Uint8Array.from(output);
}

function packedCoreProfile() {
  const packet = representativePacket();
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-mpoly-bench-"));
  try {
    const source = join(temporary, "bench.c");
    const executable = join(temporary, "bench");
    const array = Array.from(packet).join(",");
    writeFileSync(source, String.raw`
#define _POSIX_C_SOURCE 200809L
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "multivariate_wasm_core.h"
static const uint8_t input[] = {${array}};
static int compare(const void *left, const void *right) {
    double a = *(const double *) left, b = *(const double *) right;
    return (a > b) - (a < b);
}
int main(void) {
    uint8_t *output = malloc(SAGEJS_MPOLY_MAX_OUTPUT_BYTES);
    double values[${samples}];
    size_t output_length = 0;
    int index, status;
    struct timespec start, end;
    if (output == NULL) return 2;
    for (index = 0; index < ${samples}; index++) {
        clock_gettime(CLOCK_MONOTONIC, &start);
        status = sagejs_fmpz_mpoly_resultant_packed(
            input, sizeof(input), output, SAGEJS_MPOLY_MAX_OUTPUT_BYTES,
            &output_length);
        clock_gettime(CLOCK_MONOTONIC, &end);
        if (status != SAGEJS_MPOLY_PACKED_OK) return 3;
        values[index] = (end.tv_sec-start.tv_sec)*1000.0 +
            (end.tv_nsec-start.tv_nsec)/1000000.0;
    }
    qsort(values, ${samples}, sizeof(double), compare);
    printf("%.9f %zu %zu\n", values[${Math.floor(samples / 2)}],
        sizeof(input), output_length);
    free(output);
    return 0;
}
`);
    run(process.env.CC || "cc", [
      "-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
      `-I${join(root, "packages/flint/src")}`,
      `-I${join(prefix, "include")}`,
      join(root, "packages/flint/src/multivariate_wasm_core.c"), source,
      `-L${join(prefix, "lib")}`,
      "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lpthread", "-lm",
      "-o", executable,
    ]);
    const [medianMs, inputBytes, outputBytes] = run(executable, []).split(" ").map(Number);
    return {
      medianMs,
      inputBytes,
      outputBytes,
      boundaryCrossingsPerResultant: 1,
      copiedBytesPerResultant: inputBytes + outputBytes,
      outputCapacityBytes: 16 * 1024 * 1024,
      samples,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const result = {
  schema: "sagejs.benchmark/wasm-multivariate-polynomial-v1",
  generatedAt: new Date().toISOString(),
  host: { platform: process.platform, architecture: process.arch, node: process.version },
  workload: "3-variable exact resultant, degrees 7 and 6, 120x84 input terms",
  publicProfile: publicProfile(),
  packedNativeCore: packedCoreProfile(),
};
result.selection = {
  operation: "resultant",
  versusGcdRatio: result.publicProfile.resultant.medianMs /
    result.publicProfile.gcd.medianMs,
  versusGroebnerRatio: result.publicProfile.resultant.medianMs /
    result.publicProfile.groebner.medianMs,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
