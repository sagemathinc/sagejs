#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseOutput } = require("../bench/dense-matrix-public-audit.cjs");

const root = resolve(__dirname, "..");

const attribution = parseOutput(String.raw`
[sagejs native] Matrix.setup GF(7) 2x2 -> setup-route
AUDIT_CASE|multiply
AUDIT_TRACE_BEGIN|multiply|first
[sagejs native] Matrix.multiply GF(7) 2x2 -> timed-route
AUDIT_TRACE_END|multiply|first
[sagejs native] Matrix.equal GF(7) 2x2 -> verifier-route
AUDIT_TRACE_BEGIN|multiply|warm-0
[sagejs native] Matrix.multiply GF(7) 2x2 -> timed-route
AUDIT_TRACE_END|multiply|warm-0
AUDIT_RESULT|multiply|1|0.5|0.5|0.5|verified
[sagejs native] Matrix.next_setup GF(7) 2x2 -> setup-route
AUDIT_CASE|transpose
AUDIT_TRACE_BEGIN|transpose|first
[sagejs native] Matrix.transpose GF(7) 2x2 -> transpose-route
AUDIT_TRACE_END|transpose|first
[sagejs native] Matrix.equal GF(7) 2x2 -> verifier-route
AUDIT_RESULT|transpose|1|0.5|0.5|0.5|verified
AUDIT_SCRIPT_MS|10
`);
assert.deepEqual(attribution.cases[0].backends, [
  "Matrix.multiply:timed-route",
]);
assert.deepEqual(attribution.cases[1].backends, [
  "Matrix.transpose:transpose-route",
]);
assert.equal(attribution.cases[0].first_measured_ms, 1);
assert.equal(attribution.cases[0].timed_scope, "operation-on-fixed-source");
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
assert.ok(
  report.comparisons.every((item) => item.operation !== "construct_random"),
);
for (const domain of report.runtimes.sagejs) {
  assert.equal(domain.ok, true);
  assert.equal(domain.audited_operations, 14);
  assert.equal(domain.cases.length, 14);
  assert.ok(
    domain.cases.every(
      (item) => item.witness === "verified" || item.status === "unsupported",
    ),
  );
}
const ordinaryDomains = report.runtimes.sagejs.filter(
  (domain) => domain.domain !== "GFWORD",
);
assert.ok(ordinaryDomains.every((domain) => domain.verified_operations === 14));
assert.ok(ordinaryDomains.every((domain) => domain.capability_holes.length === 0));
const wordPrime = report.runtimes.sagejs.find(
  (domain) => domain.domain === "GFWORD",
);
assert.equal(wordPrime.verified_operations, 12);
assert.deepEqual(wordPrime.capability_holes, ["swap_rows", "swap_columns"]);
for (const domain of report.runtimes.sagejs) {
  for (const operation of ["rref", "solve_right", "right_kernel"]) {
    const item = domain.cases.find((candidate) => candidate.operation === operation);
    assert.ok(!item.backends.some((backend) => backend.startsWith("Matrix.equal:")));
  }
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

const missingSage = spawnSync(
  process.execPath,
  [
    resolve(root, "bench", "dense-matrix-public-audit.cjs"),
    "--quick",
    "--runtime",
    "sage",
    "--check",
    "--json",
  ],
  {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, SAGEJS_MATRIX_AUDIT_DISABLE_SAGE: "1" },
  },
);
assert.equal(missingSage.status, 1);
const missingReport = JSON.parse(missingSage.stdout);
assert.deepEqual(missingReport.unavailable, [
  { runtime: "sage", reason: "no SageMath executable found" },
]);
assert.match(missingSage.stderr, /explicitly requested runtime unavailable: sage/);
