#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const check = process.argv.includes("--check");
const coefficientCount = 1000;
const extensionDegree = 2;

function medianMilliseconds(operation, warmups = 2, samples = 7) {
  for (let index = 0; index < warmups; index += 1) operation();
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = process.hrtime.bigint();
    operation();
    values.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  values.sort((left, right) => left - right);
  return { median: values[Math.floor(values.length / 2)], samples: values };
}

function publicScalarIngressMilliseconds() {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-extension-public-bench-"));
  const sourcePath = join(temporary, "workload.py");
  const source = `
import json
import time

prime = GF(3)
modulus_ring = PolynomialRing(prime, "u")
u = modulus_ring.gen()
field = GF(9, "a", modulus=u**2 + 1)
a = field.gen()
ring = PolynomialRing(field, "x")
coefficients = [
    field((index*2 + 1) % 3) + field((index*7 + 2) % 3)*a
    for index in range(${coefficientCount})
]
ring(coefficients)
samples = []
for repeat in range(5):
    started = time.perf_counter()
    value = ring(coefficients)
    samples.append(1000*(time.perf_counter() - started))
samples.sort()
assert len(value.list()) == ${coefficientCount}
print(json.dumps({"median": samples[len(samples)//2], "samples": samples}))
`;
  try {
    writeFileSync(sourcePath, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin/sagejs"), sourcePath],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const flint = require(join(root, "packages/flint"));
const modulus = new BigUint64Array([1n, 0n, 1n]);
const coordinates = new BigUint64Array(coefficientCount * extensionDegree);
for (let index = 0; index < coefficientCount; index += 1) {
  coordinates[2 * index] = BigInt((2 * index + 1) % 3);
  coordinates[2 * index + 1] = BigInt((7 * index + 2) % 3);
}
const context = flint.ffiFqContextCreate(modulus, 3n, 3n);
const source = flint.ffiFqPolynomialCreate(
  context,
  coordinates,
  BigInt(coordinates.length),
  BigInt(coefficientCount),
);
try {
  const generatedIngress = medianMilliseconds(() => {
    const value = flint.ffiFqPolynomialCreate(
      context,
      coordinates,
      BigInt(coordinates.length),
      BigInt(coefficientCount),
    );
    flint.ffiFqPolynomialClose(value);
  });
  const generatedSquare = medianMilliseconds(() => {
    const value = flint.ffiFqPolynomialMul(source, source);
    flint.ffiFqPolynomialClose(value);
  });
  const publicScalar = publicScalarIngressMilliseconds();
  const report = {
    schema: "sagejs.benchmark/extension-polynomial-resources-v1",
    host: { node: process.version, platform: process.platform, arch: process.arch },
    workload: {
      characteristic: 3,
      extensionDegree,
      coefficientCount,
      flatCoordinateCount: coordinates.length,
      coordinateGenerationExcluded: true,
      warmups: 2,
      generatedSamples: 7,
      publicSamples: 5,
    },
    generatedResource: {
      bulkIngressMilliseconds: generatedIngress,
      squareMilliseconds: generatedSquare,
    },
    currentPublicScalarIngressMilliseconds: publicScalar,
    ingressSpeedup:
      publicScalar.median / generatedIngress.median,
  };
  if (check) {
    assert.ok(
      generatedIngress.median < 5,
      `generated bulk ingress took ${generatedIngress.median} ms`,
    );
    assert.ok(
      generatedSquare.median < 10,
      `generated square took ${generatedSquare.median} ms`,
    );
    assert.ok(
      report.ingressSpeedup > 20,
      `bulk ingress speedup was only ${report.ingressSpeedup}x`,
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  flint.ffiFqPolynomialClose(source);
  flint.ffiFqContextClose(context);
}
