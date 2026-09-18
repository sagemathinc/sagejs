#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const adapter = require("./row14_class_unit_output_evidence_v2.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const RESULT = "/scratch/sagejs-row14-fresh-registry-7wM3U3/" +
  "row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json";
const ANCESTRY = "/scratch/row14-full-ancestry-20260918-v2.json";
const METADATA = "/tmp/row14-factor-metadata-transposed-tau.json";

function main(resultPath = RESULT, ancestryPath = ANCESTRY,
    metadataPath = METADATA) {
  const raw = fs.readFileSync(resultPath);
  const ancestry = fs.readFileSync(ancestryPath);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const output = adapter.buildRow14OutputEvidence(raw, ancestry, metadata);
  v2.validate(output);
  const assessment = adapter.assessRow14OutputEvidence(raw, ancestry, metadata);
  assert.equal(assessment.status, "valid-v2-complete-output-boundary");
  assert.deepEqual(output.completion, {
    correspondenceComplete: true, freshCorrespondence: true, missing: [],
    outputBoundaryComplete: true, phase3Complete: true,
    phase4Complete: true, phase5Complete: true,
  });
  assert.deepEqual(output.maps, {
    combine: { evidenceRefs: ["combine-map"], missing: [], ready: true },
    factor: { evidenceRefs: ["factor-map"], missing: [], ready: true },
    reduce: { evidenceRefs: ["reduce-map"], missing: [], ready: true },
  });
  assert.deepEqual(output.presentation.proof, {
    dRef: "raw-smith-d", uRef: "raw-smith-u",
    vRef: "raw-smith-v", wRef: "raw-smith-w",
  });
  assert.deepEqual(assessment.rawSmithPresentation.shapes, {
    d: ["806", "799"], u: ["806", "806"], v: ["799", "799"],
  });
  assert.equal(assessment.rawSmithPresentation.diagonalFactors.length, 799);
  assert.deepEqual(assessment.rawSmithPresentation.diagonalFactors.slice(-3),
    ["1", "8", "24"]);
  assert.deepEqual(assessment.missing,
    { owners: [], capability: [], maps: [], reason: "none" });

  const changedAncestry = JSON.parse(ancestry);
  changedAncestry.rawToTerminal[0] =
    String(BigInt(changedAncestry.rawToTerminal[0]) + 1n);
  assert.throws(
    () => adapter.buildRow14OutputEvidence(raw, changedAncestry, metadata),
    /full raw Smith identity is absent/);
  const badMetadata = structuredClone(metadata);
  badMetadata.metadata.authority.preparedAuthoritySha256 = "0".repeat(64);
  assert.throws(() => adapter.buildRow14OutputEvidence(raw, ancestry, badMetadata),
    /factor metadata authority/);
  assert.throws(() => adapter.buildRow14OutputEvidence(raw),
    /full ancestry and prepared factor metadata/);
  const changedRaw = Buffer.from(raw);
  changedRaw[changedRaw.length - 2] ^= 1;
  assert.throws(() => adapter.assessRow14OutputEvidence(changedRaw),
    adapter.Row14OutputEvidenceFailure);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-output-evidence-v2-check-v2",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    outputEvidenceSha256: v2.sha256Canonical(output),
    assessmentSha256: v2.sha256Canonical(assessment),
    rawRelationShape: [806, 799], fullSmithIdentity: "U R V = D",
    classNumber: "192", phase3Complete: true, phase4Complete: true,
    phase5Complete: true, outputBoundaryComplete: true,
    generalSupportedMapsReady: true, sourceMutationsRejected: true,
    qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2], process.argv[3], process.argv[4]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
