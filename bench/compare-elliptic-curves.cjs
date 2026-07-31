"use strict";

const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(__dirname, "elliptic-curves.sage");
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
    const [, operation, , , elapsedText] = fields;
    const samples = timings.get(operation) || [];
    samples.push(Number(elapsedText));
    timings.set(operation, samples);
  }
  if (timings.size !== 2) {
    throw new Error(`${label} produced ${timings.size} benchmark cases`);
  }
  return timings;
}

const results = [
  ["Sage.js", execute("Sage.js", process.execPath, [sagejs, source])],
  ["SageMath", execute("SageMath", sage, [source])],
];
const sageMedians = new Map(
  [...results[1][1]].map(([operation, samples]) => [
    operation,
    median(samples),
  ]),
);

console.log(
  "operation runtime".padEnd(34),
  "median".padStart(12),
  "relative".padStart(11),
);
console.log("-".repeat(60));
for (const [label, timings] of results) {
  for (const [operation, samples] of timings) {
    const seconds = median(samples);
    console.log(
      `${operation.padEnd(20)} ${label.padEnd(12)}`.padEnd(34),
      `${(seconds * 1000).toFixed(2)} ms`.padStart(12),
      `${(seconds / sageMedians.get(operation)).toFixed(2)}x`.padStart(11),
    );
  }
}
