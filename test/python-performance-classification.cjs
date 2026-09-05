// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  classifyMeasurement,
  validatePolicy,
} = require("../bench/python-compat/classify.cjs");

const policy = validatePolicy(JSON.parse(readFileSync(
  join(__dirname, "..", "bench", "python-compat", "performance-policy.json"),
  "utf8",
)));

function classify(scope, subjectMs, referenceMs, overrides = {}) {
  return classifyMeasurement(policy, {
    scope,
    subjectMs,
    referenceMs,
    behaviorMatch: true,
    comparable: true,
    ...overrides,
  });
}

test("Python performance policy keeps ratios below the absolute floor informational", () => {
  assert.equal(classify("warm-throughput", 0.011, 0.001).status, "within-envelope");
  assert.equal(classify("warm-throughput", 40, 5).status, "watch");
});

test("Python performance policy distinguishes default and critical cliffs", () => {
  assert.deepEqual(
    classify("warm-throughput", 220, 20),
    {
      status: "performance-cliff",
      ratio: 11,
      deltaMs: 200,
      reason: "default-threshold",
    },
  );
  assert.equal(
    classify("warm-throughput", 5100, 100).status,
    "critical-performance-cliff",
  );
  assert.equal(
    classify("warm-throughput", 10000, 1000).status,
    "critical-performance-cliff",
  );
});

test("interactive operations can be cliffs below the default tenfold ratio", () => {
  assert.deepEqual(
    classify("cold-import", 2000, 650),
    {
      status: "performance-cliff",
      ratio: 2000 / 650,
      deltaMs: 1350,
      reason: "interactive-latency-threshold",
    },
  );
  assert.equal(classify("warm-throughput", 2000, 650).status, "within-envelope");
});

test("behavior mismatch prevents a performance claim", () => {
  assert.deepEqual(
    classify("warm-throughput", 1000, 1, { behaviorMatch: false }),
    {
      status: "not-comparable",
      ratio: null,
      deltaMs: null,
      reason: "behavior-or-workload-not-comparable",
    },
  );
});

test("CoWasm runner emits behavior-gated provisional performance evidence", () => {
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
      { cwd: join(__dirname, ".."), encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.corpus.benchmarks[0], "simple assignment");
    assert.equal(report.performancePolicy.schema, policy.schema);
    const evidence = report.benchmarks["simple assignment"].runtimes.sagejs.performance;
    assert.equal(evidence.samples, 1);
    assert.equal(evidence.sampleQualified, false);
    assert.equal(evidence.confirmationStatus, "provisional-single-run");
    assert.match(evidence.status, /^(within-envelope|watch|performance-cliff|critical-performance-cliff)$/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
