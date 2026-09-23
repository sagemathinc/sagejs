#!/usr/bin/env node
// Derive compact, reviewable medians from a raw benchmark receipt.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , receiptArgument, outputArgument, hostContext] = process.argv;
if (!receiptArgument || !outputArgument || !["quiet", "overlapping"].includes(hostContext)) {
  console.error("usage: node summarize-receipt.mjs RECEIPT OUTPUT quiet|overlapping");
  process.exit(2);
}

const receiptPath = path.resolve(receiptArgument);
const bytes = await readFile(receiptPath);
const receipt = JSON.parse(bytes);
if (receipt.schema !== "sagejs.rust-class-group/benchmark-receipt-v1") {
  throw new Error("unsupported receipt schema");
}
if (receipt.status !== "passed" || receipt.failures.length !== 0) {
  throw new Error("only a passed, failure-free receipt can be summarized");
}

function median(values) {
  const sorted = values.map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)].toString();
}

const fields = {};
for (const [fieldId, fieldSummary] of Object.entries(receipt.summary)) {
  fields[fieldId] = {};
  for (const armId of ["rust", "pari"]) {
    const samples = receipt.samples.filter(
      (sample) => sample.fieldId === fieldId && sample.armId === armId,
    );
    if (samples.length !== receipt.schedule.samplesPerArm) {
      throw new Error(`${fieldId}/${armId} has the wrong retained sample count`);
    }
    const stageNames = Object.keys(samples[0].stageTimingsNanoseconds).sort();
    fields[fieldId][armId] = {
      retainedSamples: samples.length,
      medianKernelNanoseconds: median(samples.map((sample) => sample.adapterNanoseconds)),
      medianWallNanoseconds: median(samples.map((sample) => sample.wallNanoseconds)),
      maximumPeakRssKiB: fieldSummary[armId].maximumPeakRssKiB,
      exactResult: samples[0].result,
      exactResultSha256: fieldSummary[armId].exactResultFingerprints[0],
      medianStageTimingsNanoseconds: Object.fromEntries(
        stageNames.map((name) => [
          name,
          median(samples.map((sample) => sample.stageTimingsNanoseconds[name])),
        ]),
      ),
    };
  }
  if (fields[fieldId].rust.exactResultSha256 !== fields[fieldId].pari.exactResultSha256) {
    throw new Error(`${fieldId} has mismatched exact result fingerprints`);
  }
  fields[fieldId].rustToPariMedianKernelRatio =
    Number(fields[fieldId].rust.medianKernelNanoseconds) /
    Number(fields[fieldId].pari.medianKernelNanoseconds);
}

const summary = {
  schema: "sagejs.rust-class-group/prepared-benchmark-summary-v1",
  classification:
    hostContext === "quiet"
      ? "quiet-host-development-comparison"
      : "functional-smoke-not-qualified-timing",
  headlineEligible: false,
  qualificationCaveat:
    "Prepared-field conditional class-and-unit comparison; not a Sage.js public-call comparison. Repository state was an active development worktree.",
  boundary: receipt.boundary,
  rawReceipt: path.basename(receiptPath),
  rawReceiptSha256: createHash("sha256").update(bytes).digest("hex"),
  configSha256: receipt.configSha256,
  environment: receipt.environment,
  fields,
};
await writeFile(path.resolve(outputArgument), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ output: path.resolve(outputArgument), fields: Object.keys(fields) }));
