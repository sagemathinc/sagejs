#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { performance } = require("node:perf_hooks");

const root = resolve(__dirname, "..");
const sizes = [32, 64, 96, 128, 192];
const samples = 5;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function workloadEntries(rows, columns) {
  const entries = new Array(rows * columns).fill(0n);
  for (let row = 0; row < rows; row += 1) {
    entries[row * columns + row] = 1n;
    for (const [shift, value] of [[1, -2n], [7, 3n], [19, -1n]]) {
      const column = row + shift;
      if (column < columns) entries[row * columns + column] = value;
    }
  }
  return entries;
}

function nativeProfile(environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sparse-zz-bench-"));
  try {
    const script = join(directory, "benchmark.py");
    writeFileSync(script, `
import json
import sagejs.runtime as runtime

sizes = ${JSON.stringify(sizes)}
samples = ${samples}
result = {}
for rows in sizes:
    columns = rows + 12
    entries = [0 for _ in range(rows * columns)]
    for row in range(rows):
        entries[row * columns + row] = 1
        for shift, value in [(1, -2), (7, 3), (19, -1)]:
            column = row + shift
            if column < columns:
                entries[row * columns + column] = value
    timings = []
    for _sample in range(samples):
        source = matrix(ZZ, rows, columns, entries, sparse=True)
        started = runtime.wall_time()
        kernel = source.right_kernel_matrix()
        timings.append((runtime.wall_time() - started) * 1000)
        assert kernel.dimensions() == (12, columns)
    result[str(rows)] = timings
print(json.dumps(result))
`);
    const run = spawnSync(
      process.execPath,
      [resolve(root, "bin", "sagejs"), "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
        timeout: 300_000,
      },
    );
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(run.stderr || run.stdout);
    const raw = JSON.parse(run.stdout);
    return Object.fromEntries(Object.entries(raw).map(([size, timings]) => [
      size,
      { samples_ms: timings, median_ms: median(timings) },
    ]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function directWasmProfile(instantiateFlintFactor) {
  const traces = [];
  const wasm = await readFile(resolve(
    root,
    "packages/flint-wasm/dist/flint-factor.wasm",
  ));
  const started = performance.now();
  const flint = await instantiateFlintFactor(wasm, {
    recordCapability: (...record) => traces.push(record),
  });
  const initializationMs = performance.now() - started;
  const result = {};
  for (const rows of sizes) {
    const columns = rows + 12;
    const source = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
    const values = workloadEntries(rows, columns);
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] === 0n) continue;
      flint.ffiFmpzMatrixSetEntry(
        source,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        values[index],
      );
    }
    const timings = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const sampleStarted = performance.now();
      const kernel = flint.ffiFmpzMatrixRightKernel(source);
      timings.push(performance.now() - sampleStarted);
      if (
        flint.ffiFmpzMatrixNrows(kernel) !== 12n ||
        flint.ffiFmpzMatrixNcols(kernel) !== BigInt(columns)
      ) {
        throw new Error("direct Wasm kernel shape mismatch");
      }
      flint.ffiFmpzMatrixClose(kernel);
    }
    flint.ffiFmpzMatrixClose(source);
    result[String(rows)] = {
      samples_ms: timings,
      median_ms: median(timings),
    };
  }
  if (flint.__sagejs_wasm_resource_live_count__() !== 0n) {
    throw new Error("direct benchmark leaked FLINT resources");
  }
  return {
    initialization_ms: initializationMs,
    sizes: result,
    kernel_calls: traces.filter(
      ([id]) => id === "ffi:flint:fmpz_matrix_right_kernel",
    ).length,
  };
}

async function publicNodeWasmProfile(createSage) {
  const started = performance.now();
  const sage = await createSage();
  const initializationMs = performance.now() - started;
  try {
    const source = `
import json
import sagejs.runtime as runtime
sizes = ${JSON.stringify(sizes)}
samples = ${samples}
result = {}
for rows in sizes:
    columns = rows + 12
    entries = [0 for _ in range(rows * columns)]
    for row in range(rows):
        entries[row * columns + row] = 1
        for shift, value in [(1, -2), (7, 3), (19, -1)]:
            column = row + shift
            if column < columns:
                entries[row * columns + column] = value
    timings = []
    for _sample in range(samples):
        source = matrix(ZZ, rows, columns, entries, sparse=True)
        started = runtime.wall_time()
        kernel = source.right_kernel_matrix()
        timings.append((runtime.wall_time() - started) * 1000)
        assert kernel.dimensions() == (12, columns)
    result[str(rows)] = timings
print(json.dumps(result))
`;
    const evaluationStarted = performance.now();
    const evaluated = await sage.evaluate(source);
    const evaluationMs = performance.now() - evaluationStarted;
    const raw = JSON.parse(evaluated.stdout);
    return {
      initialization_ms: initializationMs,
      evaluation_ms: evaluationMs,
      sizes: Object.fromEntries(Object.entries(raw).map(([size, timings]) => [
        size,
        { samples_ms: timings, median_ms: median(timings) },
      ])),
      boundary_crossings: evaluated.instrumentation.boundary_crossings,
      copied_bytes: evaluated.instrumentation.copied_bytes,
      routes: evaluated.instrumentation.routes.filter((route) =>
        route.capability_id === "ffi:flint:fmpz_matrix_right_kernel"
      ),
    };
  } finally {
    await sage.close();
  }
}

async function main() {
  const [{ instantiateFlintFactor }, { createSage }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/flint-wasm/index.mjs"))),
    import(pathToFileURL(resolve(root, "packages/flint-wasm/node-kernel.mjs"))),
  ]);
  const native = nativeProfile();
  const disabled = nativeProfile({ SAGEJS_NATIVE_DISABLE: "1" });
  const directWasm = await directWasmProfile(instantiateFlintFactor);
  const publicNodeWasm = await publicNodeWasmProfile(createSage);
  const crossovers = Object.fromEntries(sizes.map((size) => {
    const key = String(size);
    return [key, {
      direct_wasm_over_native: directWasm.sizes[key].median_ms /
        native[key].median_ms,
      public_wasm_over_native: publicNodeWasm.sizes[key].median_ms /
        native[key].median_ms,
    }];
  }));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.benchmark/sparse-integer-linear-algebra-wasm-v1",
    workload: {
      coefficient_ring: "ZZ",
      dimensions: sizes.map((rows) => [rows, rows + 12]),
      nonzeros_per_row_at_most: 4,
      nullity: 12,
      samples,
      warmup: "first sample retained and reported",
    },
    host: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    native,
    disabled_native: disabled,
    direct_wasm: directWasm,
    public_node_wasm: publicNodeWasm,
    crossovers,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
