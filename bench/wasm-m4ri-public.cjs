#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const workload = String.raw`
from time import perf_counter

F = GF(2)
n = 384
A = matrix(F, n, n, lambda i,j: (i*104729 + j*13007 + i*j + 17) % 2)
B = matrix(F, n, n, lambda i,j: (i*65537 + j*8191 + 3*i*j + 29) % 2)
R = matrix(F, 320, n, lambda i,j: (i*524287 + j*4099 + 5*i*j + 11) % 2)
Q = matrix(F, n, n, lambda i,j: 1 if i == j else ((i*257 + j*17 + 1) % 2 if j > i else 0))
rhs = matrix(F, n, 1, lambda i,j: (i*31 + 7) % 2)

def measured(operation):
    samples = []
    for repeat in range(5):
        if operation == "multiply":
            start = perf_counter(); result = A * B
        elif operation == "rank":
            source = A.__copy__()
            start = perf_counter(); result = source.rank()
        elif operation == "kernel":
            source = R.__copy__()
            start = perf_counter(); result = source.right_kernel_matrix()
        else:
            left = Q.__copy__(); right = rhs.__copy__()
            start = perf_counter(); result = left.solve_right(right)
        samples.append(perf_counter() - start)
    samples.sort()
    return samples[len(samples)//2]

for operation in ["multiply", "rank", "kernel", "solve"]:
    print(operation, measured(operation))
`;

function timings(output) {
  const result = {};
  for (const line of output.trim().split(/\n/)) {
    const [name, elapsed] = line.trim().split(/\s+/);
    const value = Number(elapsed);
    if (!["multiply", "rank", "kernel", "solve"].includes(name) ||
        !Number.isFinite(value) || value <= 0) {
      throw new Error(`invalid M4RI benchmark output: ${JSON.stringify(line)}`);
    }
    result[name] = value;
  }
  assert.deepEqual(Object.keys(result).sort(), ["kernel", "multiply", "rank", "solve"]);
  return result;
}

function desktopTimings() {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_FORBID_MATRIX_NAPI: "1" },
      input: workload,
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return timings(result.stdout);
}

async function wasmTimings() {
  const { createSage } = await import("../packages/flint-wasm/node-kernel.mjs");
  const sage = await createSage();
  try {
    const result = await sage.evaluate(workload, { timeout: 120_000 });
    const observed = new Set(
      result.instrumentation.routes
        .filter((route) =>
          route.selected_route === "receipt-backed-wasm-artifact" &&
          route.call_count >= 1
        )
        .map((route) => route.capability_id),
    );
    for (const operation of [
      "matrix_mul",
      "matrix_rank",
      "matrix_right_kernel",
      "matrix_solve",
    ]) {
      assert.ok(
        observed.has(`ffi:m4ri:${operation}`),
        `public benchmark did not observe ffi:m4ri:${operation}`,
      );
    }
    return timings(result.stdout);
  } finally {
    await sage.close();
  }
}

(async () => {
  const desktop = process.platform === "win32" ? null : desktopTimings();
  const wasm = await wasmTimings();
  const comparisons = Object.fromEntries(
    Object.keys(wasm).map((operation) => [operation, {
      wasm_seconds: wasm[operation],
      desktop_seconds: desktop?.[operation] ?? null,
      wasm_over_desktop: desktop === null
        ? null
        : wasm[operation] / desktop[operation],
    }]),
  );
  console.log(JSON.stringify({
    schema: "sagejs.wasm-m4ri-public-benchmark/v1",
    workload: {
      matrix_order: 384,
      kernel_shape: [320, 384],
      samples: 5,
      statistic: "warm-median",
      operations: ["multiply", "rank", "right-kernel", "solve"],
    },
    comparisons,
  }, null, 2));
})().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
