"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { compile } = require("../tools/native-compiler-poc.cjs");
const mpc = require("../packages/flint");

const root = join(__dirname, "..");
const source = join(__dirname, "native-compiler-input.sage");
const benchmarkSource = join(__dirname, "native-multiply-benchmark.sage");
const output = join(__dirname, ".native-poc");
const sagejs = join(root, "bin", "sagejs");
const sage =
  process.env.SAGELITE_SAGE || "/opt/cocalc-webdev-python/bin/sage";
const cases = [
  [53, 500000],
  [1000, 100000],
  [10000, 10000],
];

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function execute(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const timings = new Map();
  for (const line of result.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "RESULT") continue;
    const [, precisionText, iterationsText, , elapsedText] = fields;
    const precision = Number(precisionText);
    const entry = timings.get(precision) || {
      iterations: Number(iterationsText),
      samples: [],
    };
    entry.samples.push(Number(elapsedText));
    timings.set(precision, entry);
  }
  assert.equal(timings.size, cases.length);
  return timings;
}

function complex(realText, imagText, precision) {
  return mpc.complexFromReals(
    mpc.realFromString(realText, precision),
    mpc.realFromString(imagText, precision),
  );
}

function rawMultiply(precision, iterations) {
  let value = complex("1.25", "-0.75", precision);
  const step = complex(
    "1.0000000000000002",
    "0.0000000000000001",
    precision,
  );
  for (let index = 0; index < iterations; index += 1) {
    value = mpc.complexMul(value, step);
  }
  return value;
}

const generated = compile(source, output);
const addon = require(generated.modulePath);
const nativeLoop = addon[generated.functionName];

const expected = mpc.complexToString(rawMultiply(53, 1000));
const actualParts = nativeLoop(53, 1000);
const actual = mpc.complexToString(
  complex(actualParts.real, actualParts.imag, 53),
);
assert.equal(actual, expected, "generated loop changed MPC semantics");

const nativeTimings = new Map();
for (const [precision, iterations] of cases) {
  nativeLoop(precision, Math.min(iterations, 10000));
  const samples = [];
  for (let sample = 0; sample < 7; sample += 1) {
    const start = performance.now();
    const answer = nativeLoop(precision, iterations);
    samples.push((performance.now() - start) / 1000);
    assert.equal(typeof answer.real, "string");
  }
  nativeTimings.set(precision, { iterations, samples });
}

const results = [
  ["generated C", nativeTimings],
  [
    "Sage.js",
    execute("Sage.js", process.execPath, [sagejs, benchmarkSource]),
  ],
  ["SageMath", execute("SageMath", sage, [benchmarkSource])],
];

console.log(
  "precision runtime".padEnd(29),
  "median".padStart(10),
  "ns/iteration".padStart(15),
  "speedup".padStart(10),
);
console.log("-".repeat(68));
const medians = new Map();
for (const [label, timings] of results) {
  for (const [precision, entry] of timings) {
    const seconds = median(entry.samples);
    const nanoseconds = (seconds * 1e9) / entry.iterations;
    medians.set(`${label}:${precision}`, nanoseconds);
    console.log(
      `${String(precision).padStart(5)} bits  ${label.padEnd(14)}`.padEnd(29),
      `${(seconds * 1000).toFixed(2)} ms`.padStart(10),
      nanoseconds.toFixed(1).padStart(15),
      label === "generated C"
        ? "-".padStart(10)
        : `${(
            nanoseconds / medians.get(`generated C:${precision}`)
          ).toFixed(1)}x`.padStart(10),
    );
  }
}
