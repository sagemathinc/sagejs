#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const source = String.raw`
import json, time
from sagejs.plotting.grid_sampling import sample_scalar_grid, sample_vector_grid

def scalar(x, y):
    return x*x - 2*x*y + y*y

def u(x, y):
    return x + y

def v(x, y):
    return x - y

start = time.perf_counter()
scalar_grid = sample_scalar_grid(
    scalar, (-4, 4), (-3, 3), plot_points=(400, 400)
)
scalar_seconds = time.perf_counter() - start
start = time.perf_counter()
vector_grid = sample_vector_grid(
    (u, v), (-4, 4), (-3, 3), plot_points=(100, 100)
)
vector_seconds = time.perf_counter() - start
print(json.dumps({
    "scalar_samples": scalar_grid["sample_count"],
    "scalar_seconds": scalar_seconds,
    "scalar_checksum": [scalar_grid["z"][0][0], scalar_grid["z"][-1][-1]],
    "vector_samples": vector_grid["sample_count"],
    "vector_seconds": vector_seconds,
    "vector_checksum": vector_grid["maximum_magnitude"],
}, sort_keys=True))
`;

function run(label, executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim());
}

const cpythonSource = String.raw`
import collections.abc, json, math, sys, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
` + source;
const cpython = run("CPython", "/usr/bin/python3", ["-I", "-c", cpythonSource]);

const directory = mkdtempSync(join(tmpdir(), "sagejs-field-bench-"));
const filename = join(directory, "benchmark.py");
let sagejs;
try {
  writeFileSync(filename, source);
  sagejs = run("Sage.js", process.execPath, [join(root, "bin/sagejs"), filename]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

if (JSON.stringify(cpython.scalar_checksum) !== JSON.stringify(sagejs.scalar_checksum)) {
  throw new Error("scalar benchmark checksum mismatch");
}
if (Math.abs(cpython.vector_checksum - sagejs.vector_checksum) > 1e-12) {
  throw new Error("vector benchmark checksum mismatch");
}

console.log(JSON.stringify({
  workload: {
    scalar: "400x400 polynomial field, one measured materialization",
    vector: "100x100 affine two-component field, one measured materialization",
    native: "disabled",
    host: `${process.platform}-${process.arch}`,
  },
  cpython,
  sagejs,
}, null, 2));
