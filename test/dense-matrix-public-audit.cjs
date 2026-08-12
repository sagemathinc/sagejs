#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "bench", "dense-matrix-public-audit.cjs"),
    "--quick",
    "--runtime",
    "sagejs",
    "--check",
    "--json",
  ],
  {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
  },
);

if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(result.stdout);
assert.equal(report.schema, "sagejs.benchmark/dense-matrix-public-audit-v1");
assert.equal(report.policy.mode, "quick");
assert.deepEqual(Object.keys(report.runtimes), ["sagejs"]);
assert.deepEqual(
  report.runtimes.sagejs.map((item) => item.domain),
  ["ZZ", "QQ", "GF2", "GF7", "GFWORD"],
);
for (const domain of report.runtimes.sagejs) {
  assert.equal(domain.ok, true);
  assert.equal(domain.cases.length, 14);
  assert.ok(
    domain.cases.every(
      (item) => item.witness === "verified" || item.status === "unsupported",
    ),
  );
}
assert.ok(
  report.runtimes.sagejs.some((domain) =>
    domain.cases.some((item) => item.backends.length !== 0),
  ),
);
assert.ok(
  report.findings.some(
    (item) =>
      item.kind === "backend-classification-gap" && item.domain === "GFWORD",
  ),
);

console.log("dense matrix public audit quick contract ok");
