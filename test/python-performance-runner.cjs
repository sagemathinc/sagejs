// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

test("benchmark runner emits behavior-gated provisional performance evidence", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-python-performance-"));
  const reportPath = join(temporary, "report.json");
  try {
    const result = spawnSync(
      process.execPath,
      [
        join(__dirname, "..", "bench", "cowasm", "run.cjs"),
        "--only", "simple assignment",
        "--policy", "bench/python-compat/performance-policy.json",
        "--samples", "1",
        "--warmups", "0",
        "--json", reportPath,
      ],
      // This compiles the standalone corpus and invokes a reference Python.
      // It is an integration test, not part of the portable policy unit tests.
      { cwd: join(__dirname, ".."), encoding: "utf8", timeout: 300000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.corpus.benchmarks[0], "simple assignment");
    assert.equal(report.performancePolicy.schema, "sagejs.python-performance-policy/v1");
    const evidence = report.benchmarks["simple assignment"].runtimes.sagejs.performance;
    assert.equal(evidence.samples, 1);
    assert.equal(evidence.sampleQualified, false);
    assert.equal(evidence.confirmationStatus, "provisional-single-run");
    assert.match(evidence.status, /^(within-envelope|watch|performance-cliff|critical-performance-cliff)$/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
