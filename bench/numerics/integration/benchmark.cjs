#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..", "..");
const source = String.raw`
import json
import math
import time
from sagejs.numerics.integration import integrate

workloads = [
    ("smooth", lambda x: math.exp(-x*x)*math.cos(3*x), -3.0, 3.0, {}),
    ("known_cusp", lambda x: abs(x-0.12345), 0.0, 1.0, {"breakpoints": [0.12345]}),
    ("infinite", lambda x: math.exp(-x), 0.0, float("inf"), {}),
]
records = []
for name, function, lower, upper, options in workloads:
    durations = []
    evaluations = []
    for repetition in range(25):
        started = time.perf_counter()
        result = integrate(
            function, lower, upper,
            absolute_tolerance=1e-10, relative_tolerance=1e-10,
            trace="none", **options
        )
        durations.append(1000.0*(time.perf_counter()-started))
        evaluations.append(result.evaluations)
        assert result.success
    durations.sort()
    records.append({
        "workload": name,
        "median_ms": durations[len(durations)//2],
        "min_ms": durations[0],
        "evaluations": evaluations[-1],
        "repetitions": len(durations),
        "includes_independent_validation": True,
    })
print(json.dumps(records, sort_keys=True))
`;

function execute(kind) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-integration-bench-"));
  const filename = join(directory, "benchmark.py");
  try {
    writeFileSync(filename, source);
    const command = kind === "sagejs"
      ? [process.execPath, [join(root, "bin/sagejs"), "--python", filename]]
      : [process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-I", filename]];
    const environment = { ...process.env, SAGEJS_NATIVE_DISABLE: "1" };
    if (kind === "cpython") {
      environment.PYTHONPATH = "";
      const prefix = [
        "import collections.abc, hashlib, json, math, sys, typing",
        `sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})`,
        source,
      ].join("\n");
      command[1] = ["-I", "-c", prefix];
    }
    const result = spawnSync(command[0], command[1], {
      cwd: root,
      encoding: "utf8",
      env: environment,
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  schema_version: 1,
  method: "same-source adaptive Gauss-Kronrod with independent GL8 validation",
  tolerance: { absolute: 1e-10, relative: 1e-10 },
  warmup: "first repetition retained; minimum and median reported",
  cpython: execute("cpython"),
  sagejs_dynamic: execute("sagejs"),
}, null, 2));
