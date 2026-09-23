"use strict";

// sagejs-test-tier: unit
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runner = require("../bench/pari-class-group-port/run_class_unit_qualification.cjs");
const reporter = require("../bench/pari-class-group-port/report_class_unit_qualification.cjs");
const campaignIndex = require("../bench/pari-class-group-port/qualification_campaign_index.cjs");
const temporaryDirectories = [];

test.after(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function fileHash(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function enabledManifestData() {
  const data = runner.validateManifest();
  return {
    ...data,
    manifest: {
      ...data.manifest,
      executionEnabled: true,
      reserveOpeningEnabled: true,
    },
  };
}

function runId(index, prefix = "4") {
  return `00000000-0000-${prefix}000-8000-${String(index + 1).padStart(12, "0")}`;
}

function writeReceiptJournal(filename, receipt) {
  const { blocks, summary, ...declaration } = receipt;
  declaration.lock = { ...declaration.lock, releasedAt: null };
  runner.createReceiptJournal(filename, declaration);
  for (const block of blocks) runner.appendReceiptBlock(filename, block);
  runner.finalizeReceiptJournal(filename, summary, receipt.lock.releasedAt);
}

function resourceMetrics() {
  return {
    generatedSourceBytes: "61000000",
    objectBytes: "12000000",
    compilationNanoseconds: "90000000000",
    compilationPeakRssKiB: "1048576",
    ownerLiveHighWaterBytes: "1500000000",
    wholeProcessPeakRssKiB: "1800000",
    ownerCount: "320",
    allocations: "64",
    copies: "8",
    precisionEscalations: "1",
    relationRetries: "3",
  };
}

function stageEvidence(identity, campaignId, fieldId, id, fractionNumerator = 80) {
  const pairs = Array.from({ length: 7 }, (_, pairIndex) => ({
    pairIndex,
    order: pairIndex % 2 === 0 ? "AB" : "BA",
    rootGapNanoseconds: "100",
    stageGapNanoseconds: {
      "relation-retry": String(fractionNumerator),
      "sparse-hnf-snf-transform": "0",
      "unit-regulator": "0",
      "honesty-generators-final": "0",
    },
    unattributedRemainderGapNanoseconds: String(100 - fractionNumerator),
  }));
  return {
    schema: campaignIndex.STAGE_SCHEMA,
    qualifiedTiming: true,
    campaignId,
    fieldId,
    runId: id,
    candidateCommit: identity.candidateCommit,
    campaignIdentitySha256: runner.canonicalDigest(identity),
    pairs,
  };
}

function createCampaign({ completed = 24, slowdown = 1.5, stageFraction = 80 } = {}) {
  const manifestData = enabledManifestData();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-final-report-campaign-"));
  temporaryDirectories.push(directory);
  const receipts = manifestData.manifest.fields.map((field, index) => {
    const receipt = runner.syntheticReceipt(field, {
      manifestData,
      slowdown,
      status: index < completed ? "complete_matched" : "unsupported_branch",
      referenceSecondsPerCall: 1.25,
      attributedGapFraction: 1,
    });
    receipt.qualifiedTiming = true;
    receipt.runId = runId(index);
    return receipt;
  });
  const preparedKernel = receipts.map((receipt, index) => {
    const filename = path.join(directory, `field-${index}.jsonl`);
    writeReceiptJournal(filename, receipt);
    return {
      fieldId: receipt.case.fieldId,
      runId: receipt.runId,
      path: path.basename(filename),
      sha256: fileHash(filename),
    };
  });
  const first = receipts[0];
  const identity = {
    candidateCommit: first.provenance.commit,
    panelSha256: manifestData.panelSha256,
    qualificationManifestSha256: manifestData.manifestSha256,
    hostSha256: runner.canonicalDigest(first.host),
    toolchainArtifacts: { compiler: "7".repeat(64) },
    sagejsArtifacts: first.provenance.sagejsArtifacts,
    pariArtifacts: first.provenance.pariArtifacts,
  };
  const campaignId = "10000000-0000-4000-8000-000000000001";
  const evidence = stageEvidence(identity, campaignId, receipts[0].case.fieldId,
    runId(100, "5"), stageFraction);
  const stageFilename = path.join(directory, "stage.json");
  fs.writeFileSync(stageFilename, `${JSON.stringify(evidence)}\n`);
  const stageDiagnostics = [{
    fieldId: evidence.fieldId,
    runId: evidence.runId,
    path: path.basename(stageFilename),
    sha256: fileHash(stageFilename),
  }];

  const compactReceipt = runner.syntheticReceipt(manifestData.manifest.fields[0], {
    manifestData,
    slowdown,
    status: "complete_matched",
    tier: "compact-flag-one",
    referenceSecondsPerCall: 1.25,
  });
  compactReceipt.qualifiedTiming = true;
  compactReceipt.runId = runId(200, "6");
  const compactFilename = path.join(directory, "compact-flag-one.jsonl");
  writeReceiptJournal(compactFilename, compactReceipt);
  const compactFlagOne = [{
    fieldId: compactReceipt.case.fieldId,
    runId: compactReceipt.runId,
    path: path.basename(compactFilename),
    sha256: fileHash(compactFilename),
  }];
  const index = {
    schema: "sagejs.pari-class-group/qualification-campaign-index-v1",
    campaignId,
    qualifiedTiming: true,
    createdAt: "2026-09-18T00:00:00.000Z",
    qualificationPolicy: {
      executionEnabled: true,
      reserveOpeningEnabled: true,
      frozenCandidate: true,
    },
    identity,
    journals: { preparedKernel, stageDiagnostics, compactFlagOne },
    resources: resourceMetrics(),
    authoritySha256: "0".repeat(64),
    indexSha256: "0".repeat(64),
  };
  index.authoritySha256 = campaignIndex.authorityDigest(index);
  index.indexSha256 = campaignIndex.indexDigest(index);
  manifestData.manifest.qualificationCampaignAuthoritySha256 = index.authoritySha256;
  const indexPath = path.join(directory, "campaign.json");
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { directory, index, indexPath, manifestData, receipts };
}

function reauthorize(fixture) {
  fixture.index.authoritySha256 = campaignIndex.authorityDigest(fixture.index);
  fixture.index.indexSha256 = campaignIndex.indexDigest(fixture.index);
  fixture.manifestData.manifest.qualificationCampaignAuthoritySha256 =
    fixture.index.authoritySha256;
}

test("authenticated full campaign promotes A and retains mandatory raw evidence", () => {
  const fixture = createCampaign();
  const campaign = campaignIndex.loadCampaignIndex(fixture.indexPath, {
    manifestData: fixture.manifestData,
  });
  const report = reporter.aggregateReceipts(campaign.receipts, {
    manifestData: fixture.manifestData,
    campaign,
  });
  assert.equal(report.outcome, "A");
  assert.equal(report.thresholdOutcome, "A");
  assert.equal(report.qualificationDecisionEligible, true);
  assert.equal(report.campaign.resources.generatedSourceBytes, "61000000");
  assert.equal(report.cases.length, 24);
  assert.equal(report.cases[0].blocks.length, 11);
  assert.equal(report.cases[0].journal.sha256, fixture.index.journals.preparedKernel[0].sha256);
  assert(report.cases[0].peakRssKiB !== null);
  assert(report.cases[0].rawReceipt.provenance.sagejsArtifacts.addon);
});

test("disabled manifest and heterogeneous campaign identity fail closed", () => {
  const fixture = createCampaign();
  assert.throws(() => campaignIndex.loadCampaignIndex(fixture.indexPath),
    /execution is not enabled/);

  const changed = structuredClone(fixture.index);
  changed.identity.candidateCommit = "2".repeat(40);
  changed.authoritySha256 = campaignIndex.authorityDigest(changed);
  changed.indexSha256 = campaignIndex.indexDigest(changed);
  fixture.manifestData.manifest.qualificationCampaignAuthoritySha256 = changed.authoritySha256;
  fs.writeFileSync(fixture.indexPath, `${JSON.stringify(changed)}\n`);
  assert.throws(() => campaignIndex.loadCampaignIndex(fixture.indexPath, {
    manifestData: fixture.manifestData,
  }), /candidate commit differs/);
});

test("loose or partial receipts can show thresholds but cannot publish A or B", () => {
  const fixture = createCampaign();
  const loose = fixture.receipts;
  const full = reporter.aggregateReceipts(loose, { manifestData: fixture.manifestData });
  assert.equal(full.thresholdOutcome, "A");
  assert.equal(full.outcome, "D");
  assert.deepEqual(full.eligibilityFailures, ["no-authenticated-campaign-index"]);

  const partial = reporter.aggregateReceipts(loose.slice(0, 16), {
    manifestData: fixture.manifestData,
    requireFullPopulation: false,
  });
  assert.equal(partial.thresholdOutcome, "B");
  assert.equal(partial.outcome, "D");
  assert.equal(partial.cases.filter(item => item.status === "not_run").length, 8);
});

test("Outcome C is derived from linked raw stage evidence, never the summary scalar", () => {
  const noAttribution = createCampaign({ completed: 1, slowdown: 8, stageFraction: 0 });
  const campaignWithoutAttribution = campaignIndex.loadCampaignIndex(noAttribution.indexPath, {
    manifestData: noAttribution.manifestData,
  });
  const reportWithoutStage = reporter.aggregateReceipts(campaignWithoutAttribution.receipts, {
    manifestData: noAttribution.manifestData,
    campaign: campaignWithoutAttribution,
  });
  assert.equal(noAttribution.receipts[0].summary.attributedGapFraction, 1);
  assert.equal(reportWithoutStage.attributedGapFraction, 0);
  assert.equal(reportWithoutStage.outcome, "D");

  const withStage = createCampaign({ completed: 1, slowdown: 8, stageFraction: 80 });
  const campaign = campaignIndex.loadCampaignIndex(withStage.indexPath, {
    manifestData: withStage.manifestData,
  });
  const report = reporter.aggregateReceipts(campaign.receipts, {
    manifestData: withStage.manifestData,
    campaign,
  });
  assert.equal(report.attributedGapFraction, 0.8);
  assert.equal(report.thresholdOutcome, "C");
  assert.equal(report.outcome, "C");
  assert.equal(report.attributionWitness.rawEvidence.pairs.length, 7);
});

test("forged stage arithmetic and incomplete failure diagnoses are rejected", () => {
  const brokenStage = createCampaign({ completed: 1, slowdown: 8, stageFraction: 80 });
  const stagePath = path.join(brokenStage.directory,
    brokenStage.index.journals.stageDiagnostics[0].path);
  const evidence = JSON.parse(fs.readFileSync(stagePath, "utf8"));
  evidence.pairs[0].unattributedRemainderGapNanoseconds = "19";
  fs.writeFileSync(stagePath, `${JSON.stringify(evidence)}\n`);
  brokenStage.index.journals.stageDiagnostics[0].sha256 =
    fileHash(stagePath);
  reauthorize(brokenStage);
  fs.writeFileSync(brokenStage.indexPath, `${JSON.stringify(brokenStage.index)}\n`);
  assert.throws(() => campaignIndex.loadCampaignIndex(brokenStage.indexPath, {
    manifestData: brokenStage.manifestData,
  }), /do not sum/);

  const missingDiagnosis = createCampaign({ completed: 16, slowdown: 2.5 });
  missingDiagnosis.receipts[16].summary.firstDivergence = null;
  assert.throws(() => reporter.aggregateReceipts(missingDiagnosis.receipts, {
    manifestData: missingDiagnosis.manifestData,
  }), /no first divergence/);
});

test("campaign index rejects duplicate run IDs and missing resource metrics", () => {
  const duplicate = createCampaign();
  duplicate.index.journals.preparedKernel[1].runId =
    duplicate.index.journals.preparedKernel[0].runId;
  reauthorize(duplicate);
  fs.writeFileSync(duplicate.indexPath, `${JSON.stringify(duplicate.index)}\n`);
  assert.throws(() => campaignIndex.loadCampaignIndex(duplicate.indexPath, {
    manifestData: duplicate.manifestData,
  }), /Expected values to be strictly equal|runId/);

  const missingResource = createCampaign();
  delete missingResource.index.resources.objectBytes;
  missingResource.index.indexSha256 = campaignIndex.indexDigest(missingResource.index);
  assert.throws(() => campaignIndex.validateIndexShape(missingResource.index),
    /campaign index schema violation/);
});
