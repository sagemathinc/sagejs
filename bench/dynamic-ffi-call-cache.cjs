"use strict";

const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = process.env.SAGEJS_BENCH_ROOT
  ? resolve(process.env.SAGEJS_BENCH_ROOT)
  : resolve(__dirname, "..");
const iterations = Number(process.env.SAGEJS_FFI_BENCH_ITERATIONS || 200_000);
const rounds = Number(process.env.SAGEJS_FFI_BENCH_ROUNDS || 7);

const source = [
  "import json",
  "import time",
  "from sagejs.ffi.flint import (",
  "    fmpq_matrix, fmpq_matrix_entry_numerator, fmpq_matrix_set_entry,",
  ")",
  `iterations = ${iterations}`,
  `rounds = ${rounds}`,
  "matrix = fmpq_matrix(1, 1)",
  "fmpq_matrix_set_entry(matrix, 0, 0, 17, 19)",
  "for _ in range(1000):",
  "    fmpq_matrix_entry_numerator(matrix, 0, 0)",
  "samples = []",
  "for _ in range(rounds):",
  "    start = time.perf_counter()",
  "    value = 0",
  "    for _ in range(iterations):",
  "        value = fmpq_matrix_entry_numerator(matrix, 0, 0)",
  "    samples.append((time.perf_counter() - start) * 1e9 / iterations)",
  "samples.sort()",
  "print(json.dumps({",
  "    'workload': 'repeated scalar read from an owned FmpqMatrix resource',",
  "    'iterations_per_round': iterations,",
  "    'rounds': rounds,",
  "    'result': value,",
  "    'median_ns_per_call': samples[len(samples) // 2],",
  "    'samples_ns_per_call': samples,",
  "}))",
  "matrix.close()",
  "",
].join("\n");

const result = spawnSync(
  process.execPath,
  [join(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  },
);
if (result.status !== 0) {
  process.stderr.write(result.stdout + result.stderr);
  process.exitCode = result.status ?? 1;
} else {
  process.stdout.write(result.stdout);
}
