#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python"], {
  cwd: root,
  encoding: "utf8",
  input: [
    "import time",
    "orders = [1000, 10000, 30030]",
    "samples = []",
    "for order in orders:",
    "    started = time.perf_counter()",
    "    value = cyclotomic_polynomial(order)",
    "    elapsed = 1000 * (time.perf_counter() - started)",
    "    samples.append([order, value._coefficient_length() - 1, elapsed])",
    "print(samples)",
    "",
  ].join("\n"),
  env: {
    ...process.env,
    SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
  },
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const samples = JSON.parse(result.stdout.trim());
const expectedDegrees = new Map([[1000, 400], [10000, 4000], [30030, 5760]]);
for (const [order, degree, milliseconds] of samples) {
  assert.equal(degree, expectedDegrees.get(order));
  assert.ok(
    milliseconds < 500,
    `Phi_${order} direct resource construction took ${milliseconds} ms`,
  );
}

console.log(JSON.stringify({
  schema: "sagejs.bench/fmpz-cyclotomic-resource-v1",
  baselines_ms: { 1000: 236, 10000: 1427, 30030: 3630 },
  measurements: samples.map(([order, degree, milliseconds]) => ({
    order,
    degree,
    milliseconds,
  })),
}, null, 2));
