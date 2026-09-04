#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..", "..");
const iterations = Number(process.env.SAGEJS_MULTILINGUAL_BENCH_ITERATIONS || 500);
assert.ok(Number.isSafeInteger(iterations) && iterations > 0);

const source = String.raw`
import collections.abc, hashlib, json, math, re, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.numerics.frontends import create_frontend_registry

iterations = ${iterations}
registry = create_frontend_registry()
workloads = (
    ("matlab", "linsolve", ([[3, 1], [1, 2]], [9, 8]), {}),
    ("wolfram", "LeastSquares", ([[1, 0], [0, 1], [1, 1]], [1, 2, 3]), {}),
    ("python-scipy", "numpy.linalg.svd", ([[1, 2], [3, 4]],), {}),
    ("matlab", "conv", ([1, 2], [3, 4]), {}),
    ("wolfram", "NIntegrate", (lambda x: x*x, 0, 1), {"expression": "x^2"}),
    ("sage", "linear_regression", ([0, 1, 2], [1, 3, 5]), {}),
)

started = time.perf_counter()
lowered = []
for index in range(iterations):
    for language, name, arguments, options in workloads:
        lowered.append(registry.lower(language, name, *arguments, **options))
lower_seconds = time.perf_counter() - started

started = time.perf_counter()
round_trips = 0
for intent in lowered:
    for target in ("sage", "python-scipy"):
        emitted = registry.emit(intent, target)
        parsed = registry.parse(emitted, target, intent.operation_ref)
        assert parsed.digest == intent.digest
        round_trips += 1
round_trip_seconds = time.perf_counter() - started

print(json.dumps({
    "schema_version": 1,
    "workload": "foundational-catalog-lowering-and-checked-round-trip",
    "runtime": "cpython",
    "operations_per_iteration": len(workloads),
    "iterations": iterations,
    "lowerings": len(lowered),
    "round_trips": round_trips,
    "lower_seconds": lower_seconds,
    "round_trip_seconds": round_trip_seconds,
    "lowerings_per_second": len(lowered) / lower_seconds,
    "round_trips_per_second": round_trips / round_trip_seconds,
}, sort_keys=True))
`;

const executable = process.env.PYTHON ||
  (process.platform === "win32" ? "python" : "python3");
const result = spawnSync(executable, ["-I", "-c", source], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
process.stdout.write(result.stdout);
