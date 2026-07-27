"use strict";

const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "complex-arithmetic.sage");
const nativeSource = join(__dirname, "complex-native.cjs");
const sagejs = join(root, "bin", "sagejs");
const sage =
  process.env.SAGELITE_SAGE || "/opt/cocalc-webdev-python/bin/sage";

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
  const cases = new Map();
  const probes = new Map();
  for (const line of result.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] === "PROBE") {
      const [, probe, iterationsText, , elapsedText] = fields;
      const entry = probes.get(probe) || {
        iterations: Number(iterationsText),
        samples: [],
      };
      entry.samples.push(Number(elapsedText));
      probes.set(probe, entry);
      continue;
    }
    if (fields[0] !== "RESULT") continue;
    const [, operation, precisionText, iterationsText, , elapsedText] =
      fields;
    const key = `${operation}:${precisionText}`;
    const entry = cases.get(key) || {
      operation,
      precision: Number(precisionText),
      iterations: Number(iterationsText),
      samples: [],
    };
    entry.samples.push(Number(elapsedText));
    cases.set(key, entry);
  }
  if (cases.size !== 6) {
    throw new Error(`${label} produced ${cases.size} benchmark cases`);
  }
  cases.probes = probes;
  return cases;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const results = [
  ["raw Node-API", execute("raw Node-API", process.execPath, [nativeSource])],
  ["Sage.js", execute("Sage.js", process.execPath, [sagejs, source])],
  ["SageMath", execute("SageMath", sage, [source])],
];

console.log(
  "operation precision runtime".padEnd(38),
  "median".padStart(10),
  "ns/op".padStart(12),
  "Mops/s".padStart(10),
);
console.log("-".repeat(72));

const medians = new Map();
for (const [label, cases] of results) {
  for (const [key, entry] of cases) {
    const seconds = median(entry.samples);
    const nanoseconds = (seconds * 1e9) / entry.iterations;
    medians.set(`${label}:${key}`, nanoseconds);
    console.log(
      `${entry.operation.padEnd(9)} ${String(entry.precision).padStart(5)}  ${label.padEnd(14)}`.padEnd(38),
      `${(seconds * 1000).toFixed(1)} ms`.padStart(10),
      nanoseconds.toFixed(1).padStart(12),
      (1000 / nanoseconds).toFixed(3).padStart(10),
    );
  }
}

console.log("\nOverhead ratios (lower is better)");
console.log("-".repeat(72));
for (const key of results[0][1].keys()) {
  const entry = results[0][1].get(key);
  const raw = medians.get(`raw Node-API:${key}`);
  const sagejsTime = medians.get(`Sage.js:${key}`);
  const sageTime = medians.get(`SageMath:${key}`);
  console.log(
    `${entry.operation.padEnd(9)} ${String(entry.precision).padStart(5)} bits`,
    `Sage.js/raw ${(sagejsTime / raw).toFixed(2)}x`.padStart(20),
    `Sage.js/Sage ${(sagejsTime / sageTime).toFixed(2)}x`.padStart(22),
  );
}

console.log("\nRaw Node-API probes (no native result-object allocation)");
console.log("-".repeat(72));
for (const [label, entry] of results[0][1].probes) {
  const nanoseconds =
    (median(entry.samples) * 1e9) / entry.iterations;
  console.log(label.padEnd(24), `${nanoseconds.toFixed(1)} ns/call`);
}
