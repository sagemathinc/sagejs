"use strict";

// Read-only adversarial regression probes for the Phase 6 final reporter.  The
// inputs below used to publish unsupported letter outcomes.  They must now fail
// closed.  This does not create qualification evidence or open reserve fields.

const assert = require("node:assert/strict");

const runner = require("./run_class_unit_qualification.cjs");
const reporter = require("./report_class_unit_qualification.cjs");

function qualified(receipt) {
  const result = structuredClone(receipt);
  result.qualifiedTiming = true;
  return result;
}

function receiptFor(manifestData, field, options = {}) {
  return qualified(runner.syntheticReceipt(field, { manifestData, ...options }));
}

function frozenPopulation(manifestData, completedCount, {
  slowdown = 1.5,
  referenceSecondsPerCall = 1.25,
  attributedGapFraction = 1,
} = {}) {
  return manifestData.manifest.fields.map((field, index) => receiptFor(manifestData, field, {
    status: index < completedCount ? "complete_matched" : "unsupported_branch",
    slowdown,
    referenceSecondsPerCall,
    attributedGapFraction,
  }));
}

function main() {
  const manifestData = runner.validateManifest();

  // Attack 1: self-asserted qualification plus incoherent campaign identity.
  const disabledQualification = frozenPopulation(manifestData, 24);
  disabledQualification.forEach((receipt, index) => {
    receipt.provenance.commit = (index % 2 ? "2" : "1").repeat(40);
    receipt.provenance.sagejsArtifacts.addon = (index % 2 ? "8" : "e").repeat(64);
    receipt.host.hostname = index % 2 ? "synthetic-b.invalid" : "synthetic-a.invalid";
  });
  const disabledQualificationReport = reporter.aggregateReceipts(disabledQualification, {
    manifestData,
  });
  assert.equal(manifestData.manifest.executionEnabled, false);
  assert.equal(manifestData.manifest.reserveOpeningEnabled, false);
  assert.equal(new Set(disabledQualification.map(receipt => receipt.runId)).size, 1);
  assert.equal(new Set(disabledQualification.map(receipt => receipt.provenance.commit)).size, 2);
  assert.equal(new Set(disabledQualification.map(receipt => receipt.host.hostname)).size, 2);
  assert.equal(disabledQualificationReport.thresholdOutcome, "A");
  assert.equal(disabledQualificationReport.outcome, "D");
  assert.equal(disabledQualificationReport.qualificationDecisionEligible, false);

  // Attack 2: partial population attempting to publish Outcome B.
  const developmentOnly = frozenPopulation(manifestData, 24).slice(0, 16);
  const partialReport = reporter.aggregateReceipts(developmentOnly, {
    manifestData,
    requireFullPopulation: false,
  });
  assert.equal(partialReport.received, 16);
  assert.equal(partialReport.cases.filter(item => item.status === "not_run").length, 8);
  assert.equal(partialReport.thresholdOutcome, "B");
  assert.equal(partialReport.outcome, "D");

  // Attack 3: naked summary scalar attempting to publish Outcome C.
  const scalarAttribution = frozenPopulation(manifestData, 1, {
    slowdown: 8,
    attributedGapFraction: 0.8,
  });
  const scalarAttributionReport = reporter.aggregateReceipts(scalarAttribution, {
    manifestData,
  });
  assert.equal(scalarAttributionReport.completedMatched, 1);
  assert.equal(scalarAttributionReport.attributedGapFraction, null);
  assert.equal(scalarAttributionReport.outcome, "D");

  // Attack 4: incomplete failure diagnosis attempting to publish Outcome B.
  const missingDivergences = frozenPopulation(manifestData, 16, { slowdown: 2.5 });
  for (const receipt of missingDivergences.slice(16)) {
    receipt.summary.firstDivergence = null;
  }
  assert.throws(() => reporter.aggregateReceipts(missingDivergences, { manifestData }),
    /no first divergence/);

  // Attack 5: loose reports retain raw blocks/provenance, but cannot claim that
  // they are journal-authenticated without a validated campaign index.
  const firstPublishedCase = disabledQualificationReport.cases[0];
  assert.equal(firstPublishedCase.blocks.length, 11);
  assert(firstPublishedCase.provenance.sagejsArtifacts.addon);
  assert.equal(firstPublishedCase.journal, null);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/phase6-final-report-adversarial-regression-v2",
    attacksRejected: {
      selfAssertedOutcomeA: disabledQualificationReport.outcome,
      reusedRunIdsObserved: new Set(disabledQualification.map(receipt => receipt.runId)).size,
      heterogeneousCommitsObserved: new Set(disabledQualification.map(receipt =>
        receipt.provenance.commit)).size,
      heterogeneousHostsObserved: new Set(disabledQualification.map(receipt =>
        receipt.host.hostname)).size,
      partialOutcomeB: partialReport.outcome,
      missingPopulationCount: partialReport.cases.filter(item => item.status === "not_run").length,
      nakedScalarOutcomeC: scalarAttributionReport.outcome,
      incompleteFailureDiagnosisRejected: true,
      looseRawEvidenceRetainedButUnauthenticated: firstPublishedCase.journal === null,
    },
    qualifiedTiming: false,
    reserveFieldsOpened: false,
  }, null, 2));
}

module.exports = { main };

if (require.main === module) main();
