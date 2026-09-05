// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { runBufferedCommand } = require("../scripts/build-parallelism.cjs");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

// This exercises real compilation of the complete benchmark corpus, not just
// classification arithmetic. Keep it in post-build integration, not portable
// unit CI. Bound the whole compiler process tree and forward tier cancellation.
test("CoWasm runner emits behavior-gated provisional performance evidence", async () => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  // A cold standalone bundle takes about three minutes on the integration
  // host; leave headroom without permitting an unbounded compiler subprocess.
  const deadline = setTimeout(abort, 300000);
  deadline.unref();
  process.once("SIGTERM", abort);
  process.once("SIGINT", abort);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-python-performance-"));
  const reportPath = join(temporary, "report.json");
  try {
    const result = await runBufferedCommand(process.execPath, [
      join(__dirname, "..", "bench", "cowasm", "run.cjs"),
      "--only", "simple assignment",
      "--policy", "bench/python-compat/performance-policy.json",
      "--samples", "1", "--warmups", "0", "--json", reportPath,
    ], { cwd: join(__dirname, ".."), signal: controller.signal });
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
    clearTimeout(deadline);
    process.removeListener("SIGTERM", abort);
    process.removeListener("SIGINT", abort);
    rmSync(temporary, { recursive: true, force: true });
  }
});
