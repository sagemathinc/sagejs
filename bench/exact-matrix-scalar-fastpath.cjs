#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const reads = 20_000;
const writes = 10_000;
const source = [
  "import time",
  `reads = ${reads}`,
  `writes = ${writes}`,
  "measurements = []",
  "for base in [ZZ, QQ]:",
  "    source = random_matrix(base, 100)",
  "    source[0, 0]",
  "    started = time.perf_counter()",
  "    for index in range(reads):",
  "        value = source[index % 100, (index * 17) % 100]",
  "    measurements.append(1000 * (time.perf_counter() - started))",
  "    target = zero_matrix(base, 100)",
  "    target[0, 0] = 1",
  "    started = time.perf_counter()",
  "    for index in range(writes):",
  "        target[index % 100, (index * 17) % 100] = index - 5000",
  "    measurements.append(1000 * (time.perf_counter() - started))",
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
const [zzRead, zzWrite, qqRead, qqWrite] = result.stdout
  .trim()
  .split(/\s+/)
  .map(Number);

// These are regression ceilings, not claimed uncontended timings. They leave
// room for the shared CI host while rejecting a return to validating every
// FLINT rational entry through a second gcd or bulk materialization.
assert.ok(zzRead < 450, `ZZ scalar reads took ${zzRead} ms`);
assert.ok(qqRead < 450, `QQ scalar reads took ${qqRead} ms`);
assert.ok(zzWrite < 700, `ZZ scalar writes took ${zzWrite} ms`);
assert.ok(qqWrite < 700, `QQ scalar writes took ${qqWrite} ms`);

console.log(JSON.stringify({
  schema: "sagejs.benchmark/exact-matrix-scalar-fastpath-v1",
  workload: { rows: 100, columns: 100, reads, writes },
  milliseconds: { zzRead, zzWrite, qqRead, qqWrite, process: processMilliseconds },
  microsecondsPerOperation: {
    zzRead: 1000 * zzRead / reads,
    zzWrite: 1000 * zzWrite / writes,
    qqRead: 1000 * qqRead / reads,
    qqWrite: 1000 * qqWrite / writes,
  },
}));
