"use strict";

// The raw Node-API baseline performs the same MPC operations as
// complex-arithmetic.sage without Sage.js element or operator wrappers.

const { performance } = require("node:perf_hooks");
const native = require("../packages/flint");

const cases = [
  ["add", 53, 500000],
  ["multiply", 53, 500000],
  ["add", 1000, 200000],
  ["multiply", 1000, 100000],
  ["add", 10000, 50000],
  ["multiply", 10000, 10000],
];

function real(text, precision) {
  return native.realFromString(text, precision);
}

function complex(realText, imagText, precision) {
  return native.complexFromReals(
    real(realText, precision),
    real(imagText, precision),
  );
}

function run(operation, precision, iterations) {
  let value = complex("1.25", "-0.75", precision);
  const step =
    operation === "add"
      ? complex(
          "0.0000000000000002",
          "0.0000000000000001",
          precision,
        )
      : complex(
          "1.0000000000000002",
          "0.0000000000000001",
          precision,
        );
  const binary =
    operation === "add" ? native.complexAdd : native.complexMul;
  for (let index = 0; index < iterations; index += 1) {
    value = binary(value, step);
  }
  return value;
}

for (const [operation, precision, iterations] of cases) {
  run(operation, precision, Math.min(10000, iterations));
  for (let sample = 0; sample < 7; sample += 1) {
    const start = performance.now();
    const answer = run(operation, precision, iterations);
    const elapsed = (performance.now() - start) / 1000;
    // Keep the final opaque value observably live through the timing boundary.
    native.complexPrecision(answer);
    console.log(
      "RESULT",
      operation,
      precision,
      iterations,
      sample,
      elapsed,
    );
  }
}

const probeValue = complex("1.25", "-0.75", 53);
for (const [label, operation] of [
  ["complexPrecision", () => native.complexPrecision(probeValue)],
  ["complexEqual", () => native.complexEqual(probeValue, probeValue)],
]) {
  const iterations = 1000000;
  for (let index = 0; index < 10000; index += 1) operation();
  for (let sample = 0; sample < 7; sample += 1) {
    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) operation();
    const elapsed = (performance.now() - start) / 1000;
    console.log("PROBE", label, iterations, sample, elapsed);
  }
}
