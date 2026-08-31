#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { gzipSync } = require("node:zlib");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..", "..");
const sourceDirectory = join(root, "src/lib/sagejs/numerics/statistics");
const budget = JSON.parse(readFileSync(join(__dirname, "budget.json"), "utf8"));
const check = process.argv.includes("--check");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-statistics-bench-"));
  const filename = join(directory, "benchmark.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const workload = String.raw`
import json
import math
import time

from sagejs.numerics.statistics import (
    Normal,
    RandomStream,
    StudentT,
    describe,
    huber_regression,
    linear_regression,
    sample,
)

records = {}

values = [1e9 + ((index * 37) % 1000) / 10.0 for index in range(20000)]
started = time.monotonic()
summary = describe(values, trace="none")
records["describe_20000_ms"] = (time.monotonic() - started) * 1000.0

distribution = StudentT(7)
started = time.monotonic()
total = math.fsum(distribution.cdf((index - 1000) / 100.0) for index in range(2001))
records["student_t_cdf_2001_ms"] = (time.monotonic() - started) * 1000.0

started = time.monotonic()
draws = sample(Normal(2, 3), 5000, seed=20260831, trace="none")
records["normal_sample_5000_ms"] = (time.monotonic() - started) * 1000.0

x = [index / 10.0 for index in range(5000)]
y = [1.25 + 2.5 * value + ((index * 17) % 23 - 11) / 100.0 for index, value in enumerate(x)]
started = time.monotonic()
fit = linear_regression(x, y, trace="none")
records["linear_regression_5000_ms"] = (time.monotonic() - started) * 1000.0

robust_x = [float(index) for index in range(160)]
robust_y = [3.0 - 0.75 * value + ((index * 13) % 11 - 5) / 20.0 for index, value in enumerate(robust_x)]
for index in range(0, 160, 19):
    robust_y[index] += 80.0
started = time.monotonic()
robust = huber_regression(robust_x, robust_y, trace="none")
records["huber_regression_160_ms"] = (time.monotonic() - started) * 1000.0

records["witness"] = {
    "summary_mean": summary.value["mean"],
    "cdf_sum": total,
    "sample_first": draws.value[:3],
    "sample_count": len(draws.value),
    "linear_slope": fit.value["slope"],
    "huber_slope": robust.value["slope"],
    "huber_status": robust.status,
}
print(json.dumps(records, sort_keys=True))
`;

const cpython = runCPython(workload);
const sagejs = runSagejs(workload);
const sourceFiles = readdirSync(sourceDirectory)
  .filter((name) => name.endsWith(".py"))
  .sort();
const sources = sourceFiles.map((name) => readFileSync(join(sourceDirectory, name)));
const rawBytes = sources.reduce((total, value) => total + value.byteLength, 0);
const gzipBytes = gzipSync(Buffer.concat(sources), { level: 9 }).byteLength;

const witnessKeys = [
  "summary_mean",
  "cdf_sum",
  "linear_slope",
  "huber_slope",
];
for (const key of witnessKeys) {
  const left = cpython.witness[key];
  const right = sagejs.witness[key];
  assert.ok(Math.abs(left - right) <= 2e-11 * Math.max(1, Math.abs(left)), key);
}
assert.deepEqual(cpython.witness.sample_first, sagejs.witness.sample_first);
assert.equal(cpython.witness.sample_count, sagejs.witness.sample_count);
assert.equal(cpython.witness.huber_status, "converged");
assert.equal(sagejs.witness.huber_status, "converged");

const evidence = {
  schema_version: 1,
  workload: {
    descriptive_observations: 20000,
    student_t_cdf_evaluations: 2001,
    normal_draws: 5000,
    linear_regression_pairs: 5000,
    huber_regression_pairs: 160,
  },
  cpython,
  sagejs,
  payload: {
    python_source_files: sourceFiles.length,
    raw_bytes: rawBytes,
    gzip_bytes: gzipBytes,
    native_dependencies_added: 0,
  },
  equivalence: "numeric witnesses within 2e-11 relative; RNG prefix exact",
};

if (check) {
  for (const [runtime, record] of Object.entries({ cpython, sagejs })) {
    for (const [name, maximum] of Object.entries(budget.maximum_ms[runtime])) {
      assert.ok(record[name] <= maximum, `${runtime} ${name}: ${record[name]} > ${maximum}`);
    }
  }
  assert.ok(rawBytes <= budget.payload.maximum_raw_bytes);
  assert.ok(gzipBytes <= budget.payload.maximum_gzip_bytes);
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
