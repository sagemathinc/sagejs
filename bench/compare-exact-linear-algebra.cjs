"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "exact-linear-algebra.sage");
const sagejs = join(root, "bin", "sagejs");
const defaultSage = existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const sage = process.env.SAGELITE_SAGE || defaultSage;

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
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const timings = new Map();
  for (const line of result.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "RESULT") continue;
    const [, operation, iterationsText, , elapsedText] = fields;
    const entry = timings.get(operation) || {
      iterations: Number(iterationsText),
      samples: [],
    };
    entry.samples.push(Number(elapsedText));
    timings.set(operation, entry);
  }
  if (timings.size !== 8) {
    throw new Error(`${label} produced ${timings.size} benchmark cases`);
  }
  return timings;
}

const results = [
  ["Sage.js", execute("Sage.js", process.execPath, [sagejs, source])],
  ["SageMath", execute("SageMath", sage, [source])],
];

console.log(
  "operation runtime".padEnd(35),
  "median".padStart(11),
  "ms/operation".padStart(15),
  "relative".padStart(11),
);
console.log("-".repeat(75));

const sageMedians = new Map();
for (const [operation, entry] of results[1][1]) {
  sageMedians.set(
    operation,
    (median(entry.samples) * 1000) / entry.iterations,
  );
}
for (const [label, timings] of results) {
  for (const [operation, entry] of timings) {
    const seconds = median(entry.samples);
    const milliseconds = (seconds * 1000) / entry.iterations;
    console.log(
      `${operation.padEnd(21)} ${label.padEnd(12)}`.padEnd(35),
      `${(seconds * 1000).toFixed(2)} ms`.padStart(11),
      milliseconds.toFixed(4).padStart(15),
      `${(milliseconds / sageMedians.get(operation)).toFixed(2)}x`.padStart(11),
    );
  }
}
