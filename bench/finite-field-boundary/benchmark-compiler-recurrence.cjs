#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../../dist/tools/kernel.js");

const check = process.argv.includes("--check");
const samplesArgument = process.argv.find((value) => value.startsWith("--samples="));
const samples = samplesArgument ? Number(samplesArgument.slice(10)) : 9;
if (!Number.isSafeInteger(samples) || samples < 3) {
  throw new RangeError("--samples must be an integer of at least 3");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import time


def compiler_recurrence(count, parent):
    value = parent(1)
    multiplier = parent(12345)
    increment = parent(6789)
    for index in range(count):
        value = value * multiplier + increment
    return value


field = GF(65521)
compiler_recurrence(1000000, field)
for sample in range(${samples}):
    started = time.time()
    value = compiler_recurrence(10000000, field)
    elapsed = time.time() - started
    print(elapsed, int(value))
`);
    assert.equal(result.stderr ?? "", "");
    const observations = result.stdout.trim().split(/\r?\n/).map((line) => {
      const [secondsText, checksumText] = line.trim().split(/\s+/);
      return {
        seconds: Number(secondsText),
        checksum: Number(checksumText),
      };
    });
    assert.equal(observations.length, samples);
    for (const observation of observations) {
      assert.equal(observation.checksum, 19598);
      assert.ok(Number.isFinite(observation.seconds) && observation.seconds > 0);
    }
    const nanoseconds = observations.map(
      ({ seconds }) => (seconds * 1e9) / 10000000,
    );
    const report = {
      schema: "sagejs.finite-field-compiler-recurrence/v1",
      node: process.version,
      samples,
      iterations: 10000000,
      modulus: 65521,
      checksum: 19598,
      samples_ns_per_step: nanoseconds,
      median_ns_per_step: median(nanoseconds),
      reviewed_maximum_ns_per_step: 50,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (check) {
      assert.ok(
        report.median_ns_per_step <= report.reviewed_maximum_ns_per_step,
        `guarded recurrence regressed to ${report.median_ns_per_step.toFixed(3)} ns/step`,
      );
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
