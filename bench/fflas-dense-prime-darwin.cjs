#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "darwin") {
  process.stdout.write("Darwin Accelerate benchmark skipped on this host\n");
  process.exit(0);
}

const root = resolve(__dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "sagejs-darwin-fflas-"));
try {
  const source = join(directory, "benchmark.py");
  writeFileSync(source, String.raw`
import json
import time

def median_ms(operation, samples=9):
    values = []
    for _repeat in range(3):
        operation()
    for _repeat in range(samples):
        started = time.perf_counter()
        result = operation()
        # Force one result access so a future lazy implementation cannot make
        # the benchmark measure only expression construction.
        result[result.nrows() - 1, result.ncols() - 1]
        values.append(1000 * (time.perf_counter() - started))
    values.sort()
    return values[len(values) // 2]

field = GF(7)
matrix_300 = random_matrix(field, 300)
matrix_500 = random_matrix(field, 500)
print(json.dumps({
    "schema": "sagejs.benchmark/darwin-accelerate-fflas-v1",
    "medianMilliseconds": {
        "square300": median_ms(lambda: matrix_300 * matrix_300),
        "square500": median_ms(lambda: matrix_500 * matrix_500),
    },
}))
`);
  const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), source], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_REQUIRED: "1",
      // Small exact matrices benchmark more reproducibly with a single BLAS
      // worker. This also makes CPU and wall time directly comparable with
      // SageMath's single-threaded reference measurement.
      VECLIB_MAXIMUM_THREADS: "1",
    },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const measurement = JSON.parse(result.stdout.trim());
  process.stdout.write(`${JSON.stringify(measurement, null, 2)}\n`);
  if (process.argv.includes("--check")) {
    assert.ok(
      measurement.medianMilliseconds.square500 < 15,
      `Darwin FFLAS 500x500 square took ${measurement.medianMilliseconds.square500}ms`,
    );
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
