"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  readReceiptJournal,
  validateManifest,
  validateReceipt,
} = require("./run_class_unit_qualification.cjs");

function geometricMean(values) {
  if (values.length === 0) return null;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function nearestRankPercentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function determineOutcome({ completed, total, geometricMeanSlowdown, p95Slowdown,
  rankTwoStrata, secondsScaleCount, attributedGapFraction }) {
  if (completed === total && total === 24 && geometricMeanSlowdown <= 2 && p95Slowdown <= 5) {
    return "A";
  }
  if (completed >= 16 && rankTwoStrata.has("real-cubic") && rankTwoStrata.has("mixed-quartic") &&
      secondsScaleCount >= 4 && geometricMeanSlowdown <= 3) {
    return "B";
  }
  if (completed >= 1 && attributedGapFraction >= 0.8) return "C";
  return "D";
}

function aggregateReceipts(receipts, {
  manifestData = validateManifest(),
  requireFullPopulation = true,
  requireQualified = true,
} = {}) {
  const population = receipts.filter(receipt =>
    receipt.case.boundary === "prepared-kernel" && receipt.case.tier === "flag-zero");
  const byId = new Map();
  for (const receipt of population) {
    validateReceipt(receipt, { manifestData, requireQualified });
    assert(!byId.has(receipt.case.fieldId), `duplicate prepared flag-zero receipt: ${receipt.case.fieldId}`);
    byId.set(receipt.case.fieldId, receipt);
  }
  const frozenIds = manifestData.manifest.fields.map(field => field.id);
  for (const id of byId.keys()) assert(frozenIds.includes(id), `field outside frozen population: ${id}`);
  if (requireFullPopulation) {
    assert.equal(byId.size, 24, "final report requires exactly 24 prepared flag-zero cases");
    assert.deepEqual([...byId.keys()].sort(), [...frozenIds].sort(), "final population differs from frozen panel");
  }

  const cases = manifestData.manifest.fields.map(field => {
    const receipt = byId.get(field.id);
    if (!receipt) return { fieldId: field.id, role: field.role, stratum: field.stratum, status: "not_run" };
    return {
      fieldId: field.id,
      role: field.role,
      stratum: field.stratum,
      status: receipt.summary.completionStatus,
      fieldSlowdown: receipt.summary.fieldSlowdown,
      referenceSecondsPerCall: receipt.summary.referenceSecondsPerCall,
      attributedGapFraction: receipt.summary.attributedGapFraction,
      failureClass: receipt.summary.failureClass,
      failureDetail: receipt.summary.failureDetail,
      firstDivergence: receipt.summary.firstDivergence,
      runId: receipt.runId,
    };
  });
  const matched = cases.filter(item => item.status === "complete_matched");
  const slowdowns = matched.map(item => item.fieldSlowdown);
  const geometricMeanSlowdown = geometricMean(slowdowns);
  const p95Slowdown = nearestRankPercentile(slowdowns, 0.95);
  const rankTwoStrata = new Set(matched.map(item => item.stratum)
    .filter(stratum => ["real-cubic", "mixed-quartic"].includes(stratum)));
  const secondsScaleCount = matched.filter(item => item.referenceSecondsPerCall > 1).length;
  const attributionValues = matched.map(item => item.attributedGapFraction)
    .filter(value => value !== null);
  const attributedGapFraction = attributionValues.length ? Math.min(...attributionValues) : 0;
  const failureCounts = Object.fromEntries([...new Set(cases.map(item => item.status))]
    .sort().map(status => [status, cases.filter(item => item.status === status).length]));
  const outcome = determineOutcome({
    completed: matched.length,
    total: 24,
    geometricMeanSlowdown: geometricMeanSlowdown ?? Infinity,
    p95Slowdown: p95Slowdown ?? Infinity,
    rankTwoStrata,
    secondsScaleCount,
    attributedGapFraction,
  });
  return {
    schema: 1,
    population: 24,
    received: byId.size,
    completedMatched: matched.length,
    completionRate: matched.length / 24,
    timingPopulation: matched.length,
    geometricMeanSlowdown,
    p95Slowdown,
    secondsScaleCompleted: secondsScaleCount,
    rankTwoStrataCompleted: [...rankTwoStrata].sort(),
    attributedGapFraction,
    failureCounts,
    outcome,
    cases,
    note: "GM and p95 include completed matched pairs only; coverage denominator is always 24 and failures receive no timing imputation.",
  };
}

function reportMarkdown(report) {
  const percent = (100 * report.completionRate).toFixed(1);
  const number = value => value === null ? "not available" : value.toFixed(4);
  const rows = report.cases.map(item =>
    `| ${item.fieldId} | ${item.role} | ${item.status} | ${item.fieldSlowdown ?? "—"} | ${item.failureClass ?? "—"} |`);
  return [
    "# PARI class-unit qualification report",
    "",
    `Outcome: **${report.outcome}**`,
    "",
    `Completion: ${report.completedMatched}/24 (${percent}%).`,
    `Geometric-mean slowdown: ${number(report.geometricMeanSlowdown)}.`,
    `Nearest-rank p95 slowdown: ${number(report.p95Slowdown)}.`,
    `Fresh PARI 2.17.4 cases above one second: ${report.secondsScaleCompleted}.`,
    "",
    report.note,
    "",
    "| Field | Role | Status | Slowdown | Failure taxonomy |",
    "| --- | --- | --- | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}

function readReceipt(filename, manifestData) {
  if (filename.endsWith(".jsonl")) return readReceiptJournal(filename, { manifestData });
  return validateReceipt(JSON.parse(fs.readFileSync(filename, "utf8")), { manifestData });
}

function main(argv = process.argv.slice(2)) {
  const markdown = argv.includes("--markdown");
  const allowPartial = argv.includes("--allow-partial");
  const filenames = argv.filter(arg => !arg.startsWith("--"));
  assert(filenames.length > 0,
    "usage: node report_class_unit_qualification.cjs [--markdown] [--allow-partial] RECEIPT...");
  const manifestData = validateManifest();
  const receipts = filenames.map(filename => readReceipt(path.resolve(filename), manifestData));
  const report = aggregateReceipts(receipts, { manifestData, requireFullPopulation: !allowPartial });
  console.log(markdown ? reportMarkdown(report) : JSON.stringify(report, null, 2));
}

module.exports = {
  aggregateReceipts,
  determineOutcome,
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
