#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const count = Number.parseInt(process.env.SAGEJS_SWEEP_BENCH_ITEMS || "256", 10);
if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
  throw new Error("SAGEJS_SWEEP_BENCH_ITEMS must be an integer from 1 to 10000");
}

const source = String.raw`
import json
import time
from sagejs.numerics.sweeps import SweepBudget, run_parameter_sweep

count = ${count}
parameters = list(range(count))
budget = SweepBudget(
    max_items=count,
    max_evaluations=count * 4,
    max_result_bytes=count * 128,
    max_trace_events=max(2, count),
)

def evaluator(parameter, context):
    return parameter * parameter + context.seed % 17

def direct_sample():
    started = time.perf_counter()
    values = [parameter * parameter for parameter in parameters]
    return (time.perf_counter() - started) * 1000.0, values[-1]

def sweep_sample():
    started = time.perf_counter()
    result = run_parameter_sweep(
        parameters,
        evaluator,
        seed=20260831,
        budget=budget,
        callback_record={"kind": "benchmark", "replayable": True},
    )
    elapsed = (time.perf_counter() - started) * 1000.0
    assert result.success
    serialize_started = time.perf_counter()
    encoded = result.to_json()
    serialize_ms = (time.perf_counter() - serialize_started) * 1000.0
    return elapsed, serialize_ms, len(encoded)

for _ in range(2):
    direct_sample()
    sweep_sample()

direct = [direct_sample()[0] for _ in range(7)]
sweeps = [sweep_sample() for _ in range(7)]
direct.sort()
sweep_times = sorted(sample[0] for sample in sweeps)
serialize_times = sorted(sample[1] for sample in sweeps)
record = {
    "schema_version": 1,
    "items": count,
    "samples": 7,
    "direct_ms": direct[3],
    "sweep_ms": sweep_times[3],
    "serialization_ms": serialize_times[3],
    "direct_us_per_item": direct[3] * 1000.0 / count,
    "sweep_us_per_item": sweep_times[3] * 1000.0 / count,
    "serialization_us_per_item": serialize_times[3] * 1000.0 / count,
    "encoded_bytes": sweeps[0][2],
}
print(json.dumps(record, sort_keys=True, separators=(",", ":")))
`;

function run(label, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} benchmark failed:\n${result.stderr || result.stdout}`);
  }
  const record = JSON.parse(result.stdout.trim());
  record.runtime = label;
  return record;
}

const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
const python = process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const reports = [run("cpython", python, ["-I", "-c", prefix + source])];

const directory = mkdtempSync(join(tmpdir(), "sagejs-sweep-bench-"));
try {
  const filename = join(directory, "benchmark.py");
  writeFileSync(filename, source);
  const sagejs = process.env.SAGEJS_TEST_BINARY || join(root, "bin", "sagejs");
  reports.push(
    run("sagejs-node", process.execPath, [sagejs, "--python", filename]),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log(JSON.stringify({ reports }, null, 2));
