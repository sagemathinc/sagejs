"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readReceiptJournal, validateManifest, validateReceipt } =
  require("./run_class_unit_qualification.cjs");
const { isValidatedCampaign, loadCampaignIndex } =
  require("./qualification_campaign_index.cjs");

function geometricMean(values) {
  if (values.length === 0) return null;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function nearestRankPercentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function determineThresholdOutcome({ completed, total, geometricMeanSlowdown, p95Slowdown,
  rankTwoStrata, secondsScaleCount, attributedGapFraction }) {
  if (completed === total && total === 24 && geometricMeanSlowdown <= 2 && p95Slowdown <= 5) {
    return "A";
  }
  if (completed >= 16 && rankTwoStrata.has("real-cubic") && rankTwoStrata.has("mixed-quartic") &&
      secondsScaleCount >= 4 && geometricMeanSlowdown <= 3) {
    return "B";
  }
  if (completed >= 1 && attributedGapFraction !== null && attributedGapFraction >= 0.8) return "C";
  return "D";
}

function assertFailureDiagnosis(receipt) {
  if (receipt.summary.completionStatus === "complete_matched") return;
  assert.equal(typeof receipt.summary.firstDivergence, "string",
    `failed field ${receipt.case.fieldId} has no first divergence`);
  assert(receipt.summary.firstDivergence.length > 0,
    `failed field ${receipt.case.fieldId} has an empty first divergence`);
  assert.equal(typeof receipt.summary.failureDetail, "string");
  assert(receipt.summary.failureDetail.length > 0,
    `failed field ${receipt.case.fieldId} has no diagnosis`);
}

function campaignAttribution(campaign) {
  if (!campaign) return { fraction: null, witness: null };
  const witnesses = campaign.stageDiagnostics.filter(item =>
    item.attributedGapFraction !== null);
  if (witnesses.length === 0) return { fraction: null, witness: null };
  const witness = [...witnesses].sort((left, right) =>
    right.attributedGapFraction - left.attributedGapFraction)[0];
  return {
    fraction: witness.attributedGapFraction,
    witness: {
      fieldId: witness.evidence.fieldId,
      runId: witness.evidence.runId,
      attributedGapFraction: witness.attributedGapFraction,
      explainedGapNanoseconds: witness.explainedGapNanoseconds,
      positiveRootGapNanoseconds: witness.positiveRootGapNanoseconds,
      journal: witness.reference,
      rawEvidence: witness.evidence,
    },
  };
}

function armEvidence(receipt) {
  const arms = receipt.blocks.flatMap(block => block.arms);
  const peakRssKiB = arms.length
    ? arms.reduce((maximum, arm) => BigInt(arm.peakRssKiB) > maximum
      ? BigInt(arm.peakRssKiB) : maximum, 0n).toString()
    : null;
  const pairedSlowdownSamples = receipt.summary.completionStatus === "complete_matched"
    ? receipt.blocks.map(block => {
      const perCall = implementation => {
        const selected = block.arms.filter(arm => arm.implementation === implementation);
        return selected.reduce((sum, arm) =>
          sum + Number(BigInt(arm.wallNanoseconds)) / arm.repetitions, 0) / selected.length;
      };
      return perCall("sagejs") / perCall("pari");
    })
    : [];
  const slowdownSpread = pairedSlowdownSamples.length ? {
    minimum: Math.min(...pairedSlowdownSamples),
    p25: nearestRankPercentile(pairedSlowdownSamples, 0.25),
    median: nearestRankPercentile(pairedSlowdownSamples, 0.5),
    p75: nearestRankPercentile(pairedSlowdownSamples, 0.75),
    maximum: Math.max(...pairedSlowdownSamples),
  } : null;
  return { peakRssKiB, blocks: receipt.blocks, pairedSlowdownSamples, slowdownSpread };
}

function aggregateReceipts(receipts, {
  manifestData = validateManifest(),
  requireFullPopulation = true,
  requireQualified = true,
  campaign = null,
} = {}) {
  const population = receipts.filter(receipt =>
    receipt.case.boundary === "prepared-kernel" && receipt.case.tier === "flag-zero");
  const campaignValidated = campaign !== null && isValidatedCampaign(campaign);
  if (campaign !== null) {
    assert(campaignValidated, "campaign was not loaded through the campaign-index validator");
    assert.strictEqual(receipts, campaign.receipts,
      "final promotion must use receipts loaded from the campaign index");
  }
  const byId = new Map();
  for (const receipt of population) {
    validateReceipt(receipt, { manifestData, requireQualified });
    assertFailureDiagnosis(receipt);
    assert(!byId.has(receipt.case.fieldId), `duplicate prepared flag-zero receipt: ${receipt.case.fieldId}`);
    byId.set(receipt.case.fieldId, receipt);
  }
  const frozenIds = manifestData.manifest.fields.map(field => field.id);
  for (const id of byId.keys()) assert(frozenIds.includes(id), `field outside frozen population: ${id}`);
  if (requireFullPopulation) {
    assert.equal(byId.size, 24, "final report requires exactly 24 prepared flag-zero cases");
    assert.deepEqual([...byId.keys()].sort(), [...frozenIds].sort(),
      "final population differs from frozen panel");
  }

  const campaignReferences = campaignValidated
    ? new Map(campaign.prepared.map(item => [item.receipt.case.fieldId, item.reference]))
    : new Map();
  const cases = manifestData.manifest.fields.map(field => {
    const receipt = byId.get(field.id);
    if (!receipt) return {
      fieldId: field.id, role: field.role, stratum: field.stratum,
      status: "not_run", journal: null, rawReceipt: null,
    };
    const raw = armEvidence(receipt);
    return {
      fieldId: field.id,
      role: field.role,
      stratum: field.stratum,
      status: receipt.summary.completionStatus,
      fieldSlowdown: receipt.summary.fieldSlowdown,
      referenceSecondsPerCall: receipt.summary.referenceSecondsPerCall,
      failureClass: receipt.summary.failureClass,
      failureDetail: receipt.summary.failureDetail,
      firstDivergence: receipt.summary.firstDivergence,
      runId: receipt.runId,
      qualifiedTiming: receipt.qualifiedTiming,
      journal: campaignReferences.get(field.id) ?? null,
      provenance: receipt.provenance,
      peakRssKiB: raw.peakRssKiB,
      pairedSlowdownSamples: raw.pairedSlowdownSamples,
      slowdownSpread: raw.slowdownSpread,
      blocks: raw.blocks,
      rawReceipt: receipt,
    };
  });
  const matched = cases.filter(item => item.status === "complete_matched");
  const slowdowns = matched.map(item => item.fieldSlowdown);
  const geometricMeanSlowdown = geometricMean(slowdowns);
  const p95Slowdown = nearestRankPercentile(slowdowns, 0.95);
  const slowdownDistribution = slowdowns.length ? {
    minimum: Math.min(...slowdowns),
    p25: nearestRankPercentile(slowdowns, 0.25),
    median: nearestRankPercentile(slowdowns, 0.5),
    p75: nearestRankPercentile(slowdowns, 0.75),
    p95: p95Slowdown,
    maximum: Math.max(...slowdowns),
  } : null;
  const rankTwoStrata = new Set(matched.map(item => item.stratum)
    .filter(stratum => ["real-cubic", "mixed-quartic"].includes(stratum)));
  const secondsScaleCount = matched.filter(item => item.referenceSecondsPerCall > 1).length;
  const attribution = campaignAttribution(campaignValidated ? campaign : null);
  const failureCounts = Object.fromEntries([...new Set(cases.map(item => item.status))]
    .sort().map(status => [status, cases.filter(item => item.status === status).length]));
  const thresholdOutcome = determineThresholdOutcome({
    completed: matched.length,
    total: 24,
    geometricMeanSlowdown: geometricMeanSlowdown ?? Infinity,
    p95Slowdown: p95Slowdown ?? Infinity,
    rankTwoStrata,
    secondsScaleCount,
    attributedGapFraction: attribution.fraction,
  });
  const qualificationDecisionEligible = campaignValidated && requireQualified &&
    requireFullPopulation && byId.size === 24;
  const eligibilityFailures = [];
  if (!campaignValidated) eligibilityFailures.push("no-authenticated-campaign-index");
  if (!requireQualified) eligibilityFailures.push("unqualified-receipts-allowed");
  if (!requireFullPopulation || byId.size !== 24) eligibilityFailures.push("incomplete-frozen-population");
  return {
    schema: 2,
    population: 24,
    received: byId.size,
    completedMatched: matched.length,
    completionRate: matched.length / 24,
    timingPopulation: matched.length,
    geometricMeanSlowdown,
    p95Slowdown,
    slowdownDistribution,
    secondsScaleCompleted: secondsScaleCount,
    rankTwoStrataCompleted: [...rankTwoStrata].sort(),
    attributedGapFraction: attribution.fraction,
    attributionWitness: attribution.witness,
    failureCounts,
    thresholdOutcome,
    qualificationDecisionEligible,
    eligibilityFailures,
    outcome: qualificationDecisionEligible ? thresholdOutcome : "D",
    campaign: campaignValidated ? {
      campaignId: campaign.index.campaignId,
      indexPath: campaign.indexPath,
      indexSha256: campaign.index.indexSha256,
      indexFileSha256: campaign.indexFileSha256,
      identity: campaign.index.identity,
      resources: campaign.index.resources,
      stageDiagnostics: campaign.stageDiagnostics.map(item => ({
        journal: item.reference,
        attributedGapFraction: item.attributedGapFraction,
        positiveRootGapNanoseconds: item.positiveRootGapNanoseconds,
        explainedGapNanoseconds: item.explainedGapNanoseconds,
        rawEvidence: item.evidence,
      })),
      compactFlagOne: campaign.compactFlagOne.map(item => ({
        journal: item.reference,
        rawReceipt: item.receipt,
      })),
    } : null,
    cases,
    note: "GM and p95 include completed matched pairs only; coverage denominator is always 24 and failures receive no timing imputation. A/B/C promotion additionally requires one authenticated, enabled, full-population campaign index.",
  };
}

function reportMarkdown(report) {
  const percent = (100 * report.completionRate).toFixed(1);
  const number = value => value === null ? "not available" : value.toFixed(4);
  const rows = report.cases.map(item =>
    `| ${item.fieldId} | ${item.role} | ${item.status} | ${item.fieldSlowdown ?? "—"} | ${item.failureClass ?? "—"} | ${item.journal?.path ?? "—"} |`);
  return [
    "# PARI class-unit qualification report",
    "",
    `Outcome: **${report.outcome}**`,
    `Threshold result before evidence eligibility: **${report.thresholdOutcome}**.`,
    `Final-decision eligible: ${report.qualificationDecisionEligible}.`,
    "",
    `Completion: ${report.completedMatched}/24 (${percent}%).`,
    `Geometric-mean slowdown: ${number(report.geometricMeanSlowdown)}.`,
    `Nearest-rank p95 slowdown: ${number(report.p95Slowdown)}.`,
    `Fresh PARI 2.17.4 cases above one second: ${report.secondsScaleCompleted}.`,
    `Derived stage attribution: ${number(report.attributedGapFraction)}.`,
    "",
    report.note,
    "",
    "| Field | Role | Status | Slowdown | Failure taxonomy | Raw journal |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...rows,
    "",
  ].join("\n");
}

function readReceipt(filename, manifestData) {
  if (filename.endsWith(".jsonl")) {
    return readReceiptJournal(filename, { manifestData, requireQualified: true });
  }
  return validateReceipt(JSON.parse(fs.readFileSync(filename, "utf8")), {
    manifestData, requireQualified: true,
  });
}

function main(argv = process.argv.slice(2)) {
  const markdown = argv.includes("--markdown");
  const allowPartial = argv.includes("--allow-partial");
  const campaignIndexPosition = argv.indexOf("--campaign-index");
  const manifestData = validateManifest();
  let report;
  if (campaignIndexPosition !== -1) {
    assert.equal(allowPartial, false, "campaign-index reports cannot be partial");
    const indexFilename = argv[campaignIndexPosition + 1];
    assert(indexFilename && !indexFilename.startsWith("--"), "--campaign-index requires a filename");
    const extra = argv.filter((arg, index) =>
      !arg.startsWith("--") && index !== campaignIndexPosition + 1);
    assert.equal(extra.length, 0, "campaign-index mode does not accept loose receipts");
    const campaign = loadCampaignIndex(path.resolve(indexFilename), { manifestData });
    report = aggregateReceipts(campaign.receipts, { manifestData, campaign });
  } else {
    const filenames = argv.filter(arg => !arg.startsWith("--"));
    assert(filenames.length > 0,
      "usage: node report_class_unit_qualification.cjs [--markdown] [--allow-partial] RECEIPT...\n       node report_class_unit_qualification.cjs [--markdown] --campaign-index INDEX.json");
    const receipts = filenames.map(filename => readReceipt(path.resolve(filename), manifestData));
    report = aggregateReceipts(receipts, {
      manifestData, requireFullPopulation: !allowPartial, requireQualified: true,
    });
  }
  console.log(markdown ? reportMarkdown(report) : JSON.stringify(report, null, 2));
}

module.exports = {
  aggregateReceipts,
  campaignAttribution,
  determineThresholdOutcome,
  geometricMean,
  main,
  nearestRankPercentile,
  reportMarkdown,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
