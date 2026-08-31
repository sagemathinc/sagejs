#!/usr/bin/env node
"use strict";

const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "../../..");
const cliArgs = process.argv.slice(2);

function option(name, fallback) {
  const index = cliArgs.indexOf(name);
  return index === -1 ? fallback : cliArgs[index + 1];
}

const samples = Number(option("--samples", "5"));
const output = option("--output", "");
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

const witness = String.raw`
import json
import math
import statistics
import time
from sagejs.numerics.optimization import least_squares, minimize, minimize_scalar

SAMPLES = ${samples}

def rosenbrock(point):
    return sum(
        100.0*(point[index+1]-point[index]*point[index])**2 + (1.0-point[index])**2
        for index in range(len(point)-1)
    )

def rosenbrock_gradient(point):
    gradient = [0.0 for _ in point]
    for index in range(len(point)-1):
        difference = point[index+1] - point[index]*point[index]
        gradient[index] += -400.0*point[index]*difference + 2.0*(point[index]-1.0)
        gradient[index+1] += 200.0*difference
    return gradient

def measure(name, expected_method, solve, count=SAMPLES):
    warm = solve()
    assert warm.validation.passed and warm.method == expected_method
    durations = []
    last = warm
    for _ in range(count):
        started = time.perf_counter()
        last = solve()
        durations.append(1000.0*(time.perf_counter()-started))
        assert last.validation.passed and last.method == expected_method
    return {
        "id": name,
        "durations_ms": durations,
        "median_ms": statistics.median(durations),
        "method": last.method,
        "status": last.status,
        "success": last.success,
        "iterations": last.iterations,
        "evaluations": last.evaluations,
        "validation_residual": last.residual,
    }

initial20 = [-1.2 if index % 2 == 0 else 1.0 for index in range(20)]
x_values = [0.0, 1.0, 2.0, 3.0]
records = [
    measure(
        "bounded-brent-quadratic",
        "bounded-brent",
        lambda: minimize_scalar(lambda x: (x-2.0)**2, -1.0, 5.0),
    ),
    measure(
        "nelder-mead-rosenbrock-2",
        "nelder-mead",
        lambda: minimize(
            rosenbrock, [-1.2, 1.0], method="nelder-mead",
            maxiter=3000, max_elapsed_ms=120000,
        ),
    ),
    measure(
        "bfgs-rosenbrock-20",
        "bfgs",
        lambda: minimize(
            rosenbrock, initial20, gradient=rosenbrock_gradient, method="bfgs",
            maxiter=3000, max_evaluations=50000, max_elapsed_ms=120000,
        ),
    ),
    measure(
        "least-squares-exponential",
        "damped-gauss-newton",
        lambda: least_squares(
            lambda point: [
                point[0]*math.exp(-point[1]*x)-2.0*math.exp(-0.5*x)
                for x in x_values
            ],
            [1.5, 0.4], max_elapsed_ms=120000,
        ),
    ),
]
summary_trace = measure(
    "trace-summary-nelder-mead",
    "nelder-mead",
    lambda: minimize(
        rosenbrock, [-1.2, 1.0], method="nelder-mead",
        maxiter=3000, max_elapsed_ms=120000, trace="summary",
    ),
    1,
)
iteration_trace = measure(
    "trace-iterations-nelder-mead",
    "nelder-mead",
    lambda: minimize(
        rosenbrock, [-1.2, 1.0], method="nelder-mead",
        maxiter=3000, max_elapsed_ms=120000, trace="iterations",
    ),
    1,
)
records.extend([summary_trace, iteration_trace])
print(json.dumps({"samples": SAMPLES, "workloads": records}, sort_keys=True))
`;

function spawn(executable, args, input) {
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 600_000,
  });
  const coldMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { cold_process_ms: coldMs, ...JSON.parse(result.stdout.trim()) };
}

function runCPython() {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, statistics, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return spawn(python, ["-I", "-c", prefix + witness]);
}

function runSagejs() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-opt-performance-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, witness);
    return spawn(process.execPath, [join(root, "bin/sagejs"), "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const corpus = readFileSync(join(__dirname, "corpus.json"));
const crypto = require("node:crypto");
const receipt = {
  schema_version: 1,
  source_revision: spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim(),
  corpus_sha256: crypto.createHash("sha256").update(corpus).digest("hex"),
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  policy: {
    warmup_runs: 1,
    measured_samples: samples,
    timer: "time.perf_counter around complete solve including callbacks and validation",
    cold_process_reported_separately: true,
    native_disabled: true,
  },
  runtimes: {
    cpython: runCPython(),
    sagejs_dynamic: runSagejs(),
  },
};

const text = `${JSON.stringify(receipt, null, 2)}\n`;
if (output) writeFileSync(output, text);
else process.stdout.write(text);
