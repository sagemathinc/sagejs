// sagejs-test-tier: specialized
"use strict";

process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("the checked-in first campaign evidence is accepted and content-addressed", () => {
  const filename = path.join(__dirname, "..", "architecture", "optimizer-development",
    "evidence", "campaign-1-arrow.json");
  const report = validateReport(JSON.parse(fs.readFileSync(filename, "utf8")));
  assert.equal(report.decision.status, "accepted");
  assert.equal(report.promotable, true);
  assert.equal(report.comparisons.representativeVector.positivePairs, 11);
  assert.equal(report.comparisons.heldoutSlope.positivePairs, 11);
});
