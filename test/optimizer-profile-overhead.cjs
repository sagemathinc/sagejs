// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Script } = require("node:vm");

const { hotColdFixture } = require(
  "./fixtures/optimizer-development/profile/helpers.cjs"
);
const {
  runAuthenticatedNodeProfile,
} = require("../dist/tools/optimizer-profiler.js");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measuredMicros(action) {
  const start = process.hrtime.bigint();
  const value = action();
  return { value, micros: Number(process.hrtime.bigint() - start) / 1_000 };
}

test("the sampling profiler preserves results and has a reviewed discovery overhead bound", async (t) => {
  const baselineMicros = [];
  const profiledMicros = [];
  const iterations = 80_000_000;

  // The bound is deliberately a discovery-tool bound, not a benchmark claim.
  // It catches accidental per-iteration instrumentation while tolerating CI
  // scheduling noise. Production performance receipts remain profiler-off.
  for (let sample = 0; sample < 5; sample += 1) {
    const baseline = hotColdFixture(iterations, `baseline:///overhead-${sample}.js`);
    const plain = measuredMicros(() =>
      new Script(baseline.javascript, { filename: baseline.url }).runInThisContext());
    baselineMicros.push(plain.micros);

    const fixture = hotColdFixture(
      iterations,
      `sagejs-profile:///overhead-${process.pid}-${Date.now()}-${sample}.js`,
    );
    let profiledValue;
    const receipt = await runAuthenticatedNodeProfile({
      map: fixture.map,
      javascript: fixture.javascript,
      samplingIntervalMicros: 500,
      execute() {
        profiledValue = new Script(fixture.javascript, {
          filename: fixture.url,
        }).runInThisContext();
        return profiledValue;
      },
    });
    assert.equal(profiledValue, plain.value);
    profiledMicros.push(receipt.sampling.wallMicros);
  }

  const baselineMedian = median(baselineMicros);
  const profiledMedian = median(profiledMicros);
  const ratio = profiledMedian / baselineMedian;
  t.diagnostic(
    `Node Inspector median ${profiledMedian.toFixed(0)}us vs ` +
      `${baselineMedian.toFixed(0)}us unprofiled (${ratio.toFixed(3)}x)`,
  );
  assert.ok(
    ratio <= 1.75,
    `sampling overhead ${ratio.toFixed(3)}x exceeded the reviewed 1.75x discovery bound`,
  );
});
