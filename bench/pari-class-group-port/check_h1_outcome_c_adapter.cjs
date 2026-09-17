#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  NONZERO_PREPARED_OWNERS,
  SENTINEL_OWNERS,
  integrationEdge,
  parseRootParameters,
  runOutcomeCDiagnostic,
  sanitizePreparedInput,
  validateAdapterReceipt,
} = require("./h1_outcome_c_adapter.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const sourceText = fs.readFileSync(sourcePath, "utf8");
const names = parseRootParameters(sourceText);

function zeroValue(kind) {
  if (kind.endsWith("Buffer")) return [];
  if (kind === "bool") return false;
  if (kind === "float") return 0;
  return "0";
}

const input = Object.fromEntries(names.map(([name, kind]) => [name, zeroValue(kind)]));
for (const [name, kind] of names) {
  if (!NONZERO_PREPARED_OWNERS.has(name)) continue;
  input[name] = kind.endsWith("Buffer")
    ? (kind === "Float64Buffer" ? [1.25] : ["1"])
    : (kind === "float" ? 1.25 : kind === "bool" ? true : "1");
}
for (const [name, value] of Object.entries(SENTINEL_OWNERS)) input[name] = value;
const rawPreparedInput = { names, input };
const sanitized = sanitizePreparedInput(rawPreparedInput, sourceText);
assert.equal(sanitized.metadata.parameterCount, 351);
assert.equal(sanitized.record.fieldId, "pari-2.17.4:x^3-20018*x+20034");
assert(sanitized.metadata.nonzeroOwners.includes("prep_polynomial"));
assert(sanitized.metadata.nonzeroOwners.includes("accept_inverse_hr"));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-h1-outcome-c-adapter-"));
const adapterPath = path.join(temp, "adapter.cjs");
fs.writeFileSync(adapterPath, String.raw`
"use strict";
const crypto = require("node:crypto");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
module.exports.runPreparedH1 = async ({ seed, preparedInput, switchStage }) => {
  if (preparedInput.schema !== "sagejs.pari-class-group/sanitized-prepared-h1-v1") {
    throw new Error("unsanitized prepared input");
  }
  switchStage("relation-retry");
  switchStage("sparse-hnf-snf-transform");
  switchStage("unit-regulator");
  switchStage("honesty-generators-final");
  const result = { field: preparedInput.fieldId, classNumber: "1", units: 2 };
  return {
    correspondenceComplete: true,
    result,
    replay: {
      status: "cold-replay-authenticated",
      resultSha256: digest(result),
      authoritySha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    rng: { seed, terminal: "00000001" },
    work: { relations: "73", retries: "1", hnf: "8" },
    terminalStatus: "pari-correspondence-complete-internal-h1",
  };
};
`);

const provenance = {
  commit: "f0d3cfe24d58e46492635fd20c6a24dd5e0c0772",
  dirty: false,
  rootSourceSha256: "0".repeat(64),
  sageGeneratedSha256: "1".repeat(64),
  sageObjectSha256: "2".repeat(64),
  pariLibrarySha256: "3".repeat(64),
  pariExecutableSha256: "4".repeat(64),
};
const receipt = runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText: sourceText,
  sagejsWorker: { adapterPath, selfTestClockStep: 100 },
  pariWorker: { adapterPath, selfTestClockStep: 60 },
  provenance,
  repetitions: { sagejs: 1, pari: 1 },
  pairCount: 7,
  seed: "1",
  workerMode: "self-test",
});
assert.equal(validateAdapterReceipt(receipt), receipt);
assert.equal(receipt.diagnosticReceipt.pairs.length, 7);
assert.deepEqual(
  receipt.diagnosticReceipt.pairs.map(pair => pair.order),
  ["AB", "BA", "AB", "BA", "AB", "BA", "AB"],
);
assert.equal(
  receipt.diagnosticReceipt.summary.attributedGapFraction,
  4 / 7,
);
assert.equal(receipt.attributionDerived, true);
assert.equal(receipt.finalTimingRun, false);
assert.equal(receipt.qualifiedTiming, false);
for (const pair of receipt.diagnosticReceipt.pairs) {
  const [left, right] = pair.arms;
  for (const key of ["resultDigest", "replayDigest", "rngDigest", "workDigest"]) {
    assert.equal(left[key], right[key]);
  }
}

// Sanitization accepts writable output owners only when they are empty/zero.
const leaked = structuredClone(rawPreparedInput);
leaked.input.class_number = ["1"];
assert.throws(
  () => sanitizePreparedInput(leaked, sourceText),
  /leaks non-prepared result data/,
);
const extraEnvelope = { ...rawPreparedInput, expected: { classNumber: 1 } };
assert.throws(
  () => sanitizePreparedInput(extraEnvelope, sourceText),
  /unexpected fields/,
);
const badSentinel = structuredClone(rawPreparedInput);
badSentinel.input.accept_inverse_hr = ["1", "2", "3"];
assert.throws(
  () => sanitizePreparedInput(badSentinel, sourceText),
  /sentinel changed/,
);

// Workers cannot assert or suggest attribution; the protocol rejects every
// output field not authenticated by the coordinator.
const assertingAdapter = path.join(temp, "asserting-adapter.cjs");
fs.writeFileSync(assertingAdapter, fs.readFileSync(adapterPath, "utf8").toString()
  .replace("terminalStatus: \"pari-correspondence-complete-internal-h1\",",
    "terminalStatus: \"pari-correspondence-complete-internal-h1\", attributedGapFraction: 1,"));
assert.throws(() => runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText: sourceText,
  sagejsWorker: { adapterPath: assertingAdapter, selfTestClockStep: 100 },
  pariWorker: { adapterPath, selfTestClockStep: 60 },
  provenance,
  pairCount: 7,
  workerMode: "self-test",
}), /unexpected fields/);

// A candidate-only worker is not permitted to create a timing receipt.
const incompleteAdapter = path.join(temp, "incomplete-adapter.cjs");
fs.writeFileSync(incompleteAdapter, fs.readFileSync(adapterPath, "utf8").toString()
  .replace("correspondenceComplete: true", "correspondenceComplete: false"));
assert.throws(() => runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText: sourceText,
  sagejsWorker: { adapterPath: incompleteAdapter, selfTestClockStep: 100 },
  pariWorker: { adapterPath, selfTestClockStep: 60 },
  provenance,
  pairCount: 7,
  workerMode: "self-test",
}), /refuses a candidate-only/);

// A replay record must bind the returned result, not merely assert that a
// separate replay happened.
const forgedReplayAdapter = path.join(temp, "forged-replay-adapter.cjs");
fs.writeFileSync(forgedReplayAdapter, fs.readFileSync(adapterPath, "utf8").toString()
  .replace("resultSha256: digest(result)", `resultSha256: "${"b".repeat(64)}"`));
assert.throws(() => runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText: sourceText,
  sagejsWorker: { adapterPath: forgedReplayAdapter, selfTestClockStep: 100 },
  pariWorker: { adapterPath, selfTestClockStep: 60 },
  provenance,
  pairCount: 7,
  workerMode: "self-test",
}), /cold replay is not bound/);

const candidateStatusAdapter = path.join(temp, "candidate-status-adapter.cjs");
fs.writeFileSync(candidateStatusAdapter, fs.readFileSync(adapterPath, "utf8").toString()
  .replace("pari-correspondence-complete-internal-h1", "candidate-accepted-h1"));
assert.throws(() => runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText: sourceText,
  sagejsWorker: { adapterPath: candidateStatusAdapter, selfTestClockStep: 100 },
  pariWorker: { adapterPath, selfTestClockStep: 60 },
  provenance,
  pairCount: 7,
  workerMode: "self-test",
}), /requires the audited correspondence-complete terminal status/);

const edge = integrationEdge();
assert.equal(edge.baseCommit, "f0d3cfe24d58e46492635fd20c6a24dd5e0c0772");
assert.equal(edge.timedPreparedCandidateAvailable, true);
assert.equal(edge.timedPreparedFinalResultAvailable, false);

console.log(JSON.stringify({
  schema: "sagejs.pari-class-group/h1-outcome-c-adapter-check-v1",
  baseCommit: edge.baseCommit,
  parameterCount: sanitized.metadata.parameterCount,
  pairCount: receipt.diagnosticReceipt.pairs.length,
  alternatingOrders: receipt.diagnosticReceipt.pairs.map(pair => pair.order),
  authenticatedDigests: receipt.authenticatedDigests,
  attributedGapFraction: receipt.diagnosticReceipt.summary.attributedGapFraction,
  attributionSource: "coordinator-derived",
  workerMode: receipt.workerMode,
  finalTimingRun: false,
  firstMissingEdge: edge.firstMissingEdge,
}, null, 2));
