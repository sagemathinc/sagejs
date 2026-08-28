// sagejs-test-tier: specialized
"use strict";

process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runPromotionEvidence,
  validateReport,
} = require("../bench/optimizer-workloads/arrow-field-compiler-promotion.cjs");

test("public pass-disabled/selected compiler smoke is exact", async () => {
  const report = await runPromotionEvidence({
    points: 5,
    samples: 1,
    warmups: 1,
    allowUnverifiedBuild: true,
  });
  validateReport(report);
  assert.equal(report.promotable, false);
  assert.equal(report.comparisons.representativeVector.rawPairs.length, 1);
  assert.equal(report.comparisons.heldoutSlope.rawPairs.length, 1);
});
