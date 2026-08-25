#!/usr/bin/env node
// sagejs-test-tier: unit
// sagejs-test-portable: false
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const harness = resolve(
  root,
  "bench",
  "hyperelliptic",
  "benchmark-rational-public-scalar.cjs",
);
const benchmark = require(harness);

function run(arguments_) {
  return spawnSync(process.execPath, [harness, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

test("rational scalar acceptance source keeps non-torsion and huge torsion rows distinct", () => {
  const options = benchmark.optionsFromArguments(["--no-magma"]);
  const cases = benchmark.casesFor(options);
  assert.deepEqual(
    cases.map((row) => row.classification),
    [
      "non-torsion-exact-bounded-output",
      "non-torsion-exact-bounded-output",
      "non-torsion-exact-bounded-output",
      "torsion-large-scalar-no-coefficient-growth",
    ],
  );
  assert.equal(BigInt(cases[3].scalar).toString(2).length, 256);
  const source = benchmark.magmaSource(options, cases);
  assert.match(source, /HyperellipticCurve\([^\n]+,[^\n]+\)/);
  assert.match(source, /scalar\*c[0-3]P/);
  assert.match(source, /Eltseq\(c[0-3]value\)/);
  assert.throws(
    () => benchmark.optionsFromArguments(["--growing-exponent=7"]),
    /exact-publication exponent bound 6/,
  );
});

test("rational scalar acceptance rejects actual QQ output beyond its bit budget", () => {
  const result = run([
    "--no-magma",
    "--budget-check-only",
    "--samples=1",
    "--iterations=1",
    "--torsion-iterations=1",
    "--small-exponent=4",
    "--growing-exponent=4",
    "--max-output-bits=10",
  ]);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /actual output coefficient bits .* exceeds max_output_bits=10/);
});

test("rational scalar acceptance validates exact bounded rows without Magma", () => {
  const result = run([
    "--no-magma",
    "--budget-check-only",
    "--samples=1",
    "--iterations=1",
    "--torsion-iterations=1",
    "--small-exponent=2",
    "--growing-exponent=3",
    "--max-output-bits=100",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.sagejs.budget_check_only, true);
  assert.equal(report.magma.status, "not-requested");
  assert.equal(report.sagejs.rows.length, 4);
  for (const row of report.sagejs.rows) {
    assert.ok(row.actual_max_output_coefficient_bits <= 100);
    assert.ok(row.exact_result_sha256.length === 64);
    assert.equal(row.timing, null);
  }
});
