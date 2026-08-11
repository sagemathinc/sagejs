#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = [
  "import time",
  "measurements = []",
  "for base in [ZZ, QQ]:",
  "    source = random_matrix(base, 200)",
  "    for name in ['list', 'rows', 'columns']:",
  "        samples = []",
  "        for sample in range(3):",
  "            started = time.perf_counter()",
  "            result = getattr(source, name)()",
  "            samples.append(1000 * (time.perf_counter() - started))",
  "        samples.sort()",
  "        measurements.append(samples[1])",
  "    for name in ['row', 'column']:",
  "        samples = []",
  "        for sample in range(3):",
  "            started = time.perf_counter()",
  "            result = getattr(source, name)(100)",
  "            samples.append(1000 * (time.perf_counter() - started))",
  "        samples.sort()",
  "        measurements.append(samples[1])",
  "print(*measurements)",
  "",
].join("\n");

const started = performance.now();
const result = spawnSync(
  process.execPath,
  [resolve(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: {
      ...process.env,
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
    },
    timeout: 120_000,
  },
);
const processMilliseconds = performance.now() - started;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.equal(result.stderr, "");
const milliseconds = result.stdout.trim().split(/\s+/).map(Number);
assert.equal(milliseconds.length, 10, result.stdout);
const [
  zzList,
  zzRows,
  zzColumns,
  zzRow,
  zzColumn,
  qqList,
  qqRows,
  qqColumns,
  qqRow,
  qqColumn,
] = milliseconds;

// These are structural gates against scalar FFI and uniform-limb
// compatibility materialization, with room for a heavily shared CI host.
assert.ok(zzList < 80, `ZZ list took ${zzList} ms`);
assert.ok(zzRows < 120, `ZZ rows took ${zzRows} ms`);
assert.ok(zzColumns < 250, `ZZ columns took ${zzColumns} ms`);
assert.ok(zzRow < 20, `ZZ row took ${zzRow} ms`);
assert.ok(zzColumn < 20, `ZZ column took ${zzColumn} ms`);
assert.ok(qqList < 250, `QQ list took ${qqList} ms`);
assert.ok(qqRows < 275, `QQ rows took ${qqRows} ms`);
assert.ok(qqColumns < 325, `QQ columns took ${qqColumns} ms`);
assert.ok(qqRow < 25, `QQ row took ${qqRow} ms`);
assert.ok(qqColumn < 25, `QQ column took ${qqColumn} ms`);

const previousMilliseconds = {
  zzList: 73,
  zzRows: 467,
  zzColumns: 404,
  qqList: 127,
  qqRows: 774,
  qqColumns: 761,
};
console.log(JSON.stringify({
  schema: "sagejs.benchmark/exact-matrix-bulk-host-views-v1",
  workload: { rows: 200, columns: 200, samples: 3 },
  milliseconds: {
    zzList,
    zzRows,
    zzColumns,
    zzRow,
    zzColumn,
    qqList,
    qqRows,
    qqColumns,
    qqRow,
    qqColumn,
    process: processMilliseconds,
  },
  previousCompatibilityBoundaryMilliseconds: previousMilliseconds,
  speedup: {
    zzList: previousMilliseconds.zzList / zzList,
    zzRows: previousMilliseconds.zzRows / zzRows,
    zzColumns: previousMilliseconds.zzColumns / zzColumns,
    qqList: previousMilliseconds.qqList / qqList,
    qqRows: previousMilliseconds.qqRows / qqRows,
    qqColumns: previousMilliseconds.qqColumns / qqColumns,
  },
}));
