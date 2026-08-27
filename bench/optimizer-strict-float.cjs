#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const check = process.argv.includes("--check");
const samplesArgument = process.argv.find((value) => value.startsWith("--samples="));
const samples = samplesArgument ? Number(samplesArgument.slice(10)) : 7;
if (!Number.isSafeInteger(samples) || samples < 3) {
  throw new RangeError("--samples must be an integer of at least 3");
}

const optimizedIterations = check ? 2_000_000 : 5_000_000;
const genericIterations = check ? 50_000 : 200_000;
const x = 0.125;
const a = 1.0000001192092896;
const b = 1e-9;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function bits(value) {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return Buffer.from(buffer).toString("hex");
}

function oracle(iterations) {
  let value = x;
  for (let index = 0; index < iterations; index += 1) {
    value = value * a + b;
  }
  return bits(value);
}

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage({ mode: "python" });
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

async function measureSage(level, iterations) {
  const session = await sessionAtLevel(level);
  try {
    const result = await session.evaluate(`
import time
from array import array

def recurrence(n: int, value: float, multiplier: float, increment: float) -> float:
    for index in range(n):
        value = value*multiplier + increment
    return value

def bits(value):
    return array('d', [value]).tobytes().hex()

recurrence(${Math.min(iterations, 100_000)}, ${x}, ${a}, ${b})
for sample in range(${samples}):
    started = time.perf_counter()
    answer = recurrence(${iterations}, ${x}, ${a}, ${b})
    elapsed = time.perf_counter() - started
    print(elapsed, bits(answer))
`);
    assert.equal(result.stderr ?? "", "");
    const observations = result.stdout.trim().split(/\r?\n/).map((line) => {
      const [seconds, checksum] = line.split(/\s+/);
      return { seconds: Number(seconds), checksum };
    });
    assert.equal(observations.length, samples);
    assert.ok(observations.every(({ checksum }) => checksum === oracle(iterations)));
    return observations.map(({ seconds }) => seconds * 1e9 / iterations);
  } finally {
    await session.close();
  }
}

function measureCPython(iterations) {
  const source = `
import struct
import time

def recurrence(n, value, multiplier, increment):
    for index in range(n):
        value = value*multiplier + increment
    return value

recurrence(min(${iterations}, 100000), ${x}, ${a}, ${b})
for sample in range(${samples}):
    started = time.perf_counter()
    answer = recurrence(${iterations}, ${x}, ${a}, ${b})
    elapsed = time.perf_counter() - started
    print(elapsed, struct.pack('=d', answer).hex())
`;
  const result = spawnSync(pythonExecutable(), ["-"], {
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const observations = result.stdout.trim().split(/\r?\n/).map((line) => {
    const [seconds, checksum] = line.split(/\s+/);
    return { seconds: Number(seconds), checksum };
  });
  assert.ok(observations.every(({ checksum }) => checksum === oracle(iterations)));
  return observations.map(({ seconds }) => seconds * 1e9 / iterations);
}

async function main() {
  const optimized = await measureSage("O2", optimizedIterations);
  const generic = await measureSage("O0", genericIterations);
  const cpython = measureCPython(optimizedIterations);
  const optimizedMedian = median(optimized);
  const genericMedian = median(generic);
  const cpythonMedian = median(cpython);
  const report = {
    schema: "sagejs.optimizer-strict-float/v1",
    node: process.version,
    samples,
    operation: "ordered binary64 multiply-add recurrence (no contraction)",
    inputs: { x, a, b },
    optimized_iterations: optimizedIterations,
    generic_iterations: genericIterations,
    checksum: oracle(optimizedIterations),
    optimized_samples_ns_per_step: optimized,
    generic_samples_ns_per_step: generic,
    cpython_samples_ns_per_step: cpython,
    optimized_median_ns_per_step: optimizedMedian,
    generic_median_ns_per_step: genericMedian,
    cpython_median_ns_per_step: cpythonMedian,
    speedup_over_sagejs_o0: genericMedian / optimizedMedian,
    speedup_over_cpython: cpythonMedian / optimizedMedian,
    reviewed_maximum_optimized_ns_per_step: 30,
    reviewed_minimum_o0_speedup: 5,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check) {
    assert.ok(
      optimizedMedian <= report.reviewed_maximum_optimized_ns_per_step,
      `strict float lowering regressed to ${optimizedMedian.toFixed(3)} ns/step`,
    );
    assert.ok(
      report.speedup_over_sagejs_o0 >= report.reviewed_minimum_o0_speedup,
      `strict float lowering is only ${report.speedup_over_sagejs_o0.toFixed(2)}x faster than O0`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
