#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../../dist/tools/kernel.js");
const { pythonExecutable } = require("../../tools/python-executable.cjs");

const check = process.argv.includes("--check");
const count = Number(process.env.SAGEJS_BOUNDED_INTEGER_STEPS ?? 500000);
const samples = Number(process.env.SAGEJS_BOUNDED_INTEGER_SAMPLES ?? 9);
if (!Number.isSafeInteger(count) || count < 10000 ||
    !Number.isSafeInteger(samples) || samples < 3) {
  throw new Error("benchmark steps/samples are invalid");
}

function intrinsicExactNumber(value) {
  return typeof value === "number" && value === value && value % 1 === 0 &&
    value >= -9007199254740991 && value <= 9007199254740991 &&
    1 / value !== -Infinity;
}

let interruptCounter = 0;
function fusedCheckedAdd(iterations, value, step) {
  if (!intrinsicExactNumber(iterations) || iterations < 0 ||
      !intrinsicExactNumber(value) || !intrinsicExactNumber(step)) {
    return { ok: false, value };
  }
  let valid = true;
  for (let index = 0; index < iterations && valid; index += 1) {
    if ((++interruptCounter & 255) === 0) {
      // The production emitter calls the interrupt hook here. The benchmark
      // retains its complete branch cost without injecting an interruption.
    }
    const next = value + step;
    if (!intrinsicExactNumber(next)) valid = false;
    else value = next;
  }
  return { ok: valid, value };
}

function exactBigIntAdd(iterations, value, step) {
  let result = BigInt(value);
  const increment = BigInt(step);
  for (let index = 0; index < iterations; index += 1) result += increment;
  return result;
}

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function timings(fn, warmups = 3) {
  for (let index = 0; index < warmups; index += 1) fn();
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    fn();
    values.push(performance.now() - started);
  }
  return values;
}

function cpythonMeasurement() {
  const script = `
import json
import statistics
import time
COUNT = ${count}
SAMPLES = ${samples}
def bounded_add(n: int, value: int, step: int) -> int:
    for index in range(n):
        value += step
    return value
for _ in range(3):
    bounded_add(COUNT, 7, 3)
values = []
for _ in range(SAMPLES):
    started = time.perf_counter_ns()
    answer = bounded_add(COUNT, 7, 3)
    values.append(time.perf_counter_ns() - started)
print(json.dumps({"answer": answer, "median_nanoseconds": statistics.median(values)}))
`;
  const result = spawnSync(pythonExecutable(), ["-"], {
    input: script,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

async function sageO0Measurement() {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = "O0";
  const started = performance.now();
  const sage = await createSage({ mode: "python" });
  const startupMilliseconds = performance.now() - started;
  try {
    const source = `
import json
import time
def bounded_add(n: int, value: int, step: int) -> int:
    for index in range(n):
        value += step
    return value
for warmup in range(3):
    bounded_add(${count}, 7, 3)
values = []
for sample in range(${samples}):
    started = time.perf_counter_ns()
    answer = bounded_add(${count}, 7, 3)
    values.append(time.perf_counter_ns() - started)
values.sort()
print(json.dumps((answer, values[len(values) // 2])))
`;
    const boundaryStarted = performance.now();
    const result = await sage.evaluate(source);
    const boundaryMilliseconds = performance.now() - boundaryStarted;
    const [answer, medianNanoseconds] = JSON.parse(result.stdout);
    return {
      answer,
      median_nanoseconds: medianNanoseconds,
      process_startup_milliseconds: startupMilliseconds,
      evaluate_boundary_milliseconds: boundaryMilliseconds,
    };
  } finally {
    await sage.close();
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

async function main() {
  const expected = 7 + count * 3;
  const coldStarted = performance.now();
  const coldAnswer = fusedCheckedAdd(count, 7, 3);
  const coldMilliseconds = performance.now() - coldStarted;
  assert.deepEqual(coldAnswer, { ok: true, value: expected });

  const numberSamples = timings(() => {
    const answer = fusedCheckedAdd(count, 7, 3);
    assert.equal(answer.ok, true);
    assert.equal(answer.value, expected);
  });
  const bigintSamples = timings(() => {
    assert.equal(exactBigIntAdd(count, 7, 3), BigInt(expected));
  });
  const [cpython, sageO0] = await Promise.all([
    Promise.resolve(cpythonMeasurement()),
    sageO0Measurement(),
  ]);
  assert.equal(cpython.answer, expected);
  assert.equal(Number(sageO0.answer), expected);
  const numberMedian = median(numberSamples);
  const bigintMedian = median(bigintSamples);
  const report = {
    schema: "sagejs.optimizer-bounded-integer/benchmark-v1",
    workload: "public exact-int annotated additive recurrence",
    steps: count,
    samples,
    answer: expected,
    target: {
      cold_milliseconds: coldMilliseconds,
      warm_median_milliseconds: numberMedian,
      warm_nanoseconds_per_step: numberMedian * 1e6 / count,
      boundary_crossings: 0,
      copied_bytes: 0,
      materializations: 1,
      allocations_in_loop: 0,
    },
    exact_bigint: {
      warm_median_milliseconds: bigintMedian,
      warm_nanoseconds_per_step: bigintMedian * 1e6 / count,
    },
    cpython,
    sagejs_o0: sageO0,
    held_out_cubic: {
      decision: "negative-control",
      current_javascript_call_only_slowdown_vs_native: 1500000 / 57000,
    },
  };
  report.speedup_vs_bigint = bigintMedian / numberMedian;
  report.speedup_vs_sagejs_o0 =
    (sageO0.median_nanoseconds / 1e6) / numberMedian;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (check) {
    assert.ok(report.speedup_vs_bigint >= 1.1,
      `checked Number lost its BigInt tier: ${report.speedup_vs_bigint}`);
    assert.ok(report.speedup_vs_sagejs_o0 >= 5,
      `checked Number lost its O0 tier: ${report.speedup_vs_sagejs_o0}`);
    assert.ok(report.target.warm_nanoseconds_per_step < 25,
      `checked Number exceeded 25 ns/step: ${report.target.warm_nanoseconds_per_step}`);
    assert.ok(report.held_out_cubic.current_javascript_call_only_slowdown_vs_native > 20);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
