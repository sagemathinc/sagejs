#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const artifact = process.argv[2];
assert(artifact, "usage: check_row23_output_evidence_v2.cjs ROW23-FINAL.json.gz");

const transactionPath = require.resolve("./row23_fresh_prepared_transaction.cjs");
const adapterPath = require.resolve("./row23_output_evidence_v2.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");
const liveEvidenceHost = require("./row23_logs_supported_maps_owner.cjs");
const expectedSource =
  "fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318";
const expectedNeutral =
  "5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c";
const preparedPath = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-23-1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154.json";
const brand = Symbol("fresh-row23-receipt");
require.cache[transactionPath] = { id: transactionPath, filename: transactionPath,
  loaded: true, exports: { verifyFreshPreparedReceipt(receipt) {
    assert.equal(receipt?.brand, brand, "unbranded receipt reached adapter");
    return receipt;
  } } };
delete require.cache[adapterPath];
const adapter = require(adapterPath);

async function main() {
const sourceRaw = zlib.gunzipSync(fs.readFileSync(path.resolve(artifact)));
const prepared = JSON.parse(fs.readFileSync(preparedPath));
const retained = JSON.parse(sourceRaw.toString("ascii")).payload;
const receipt = Object.freeze({ brand, correspondenceComplete: true,
  finalSource: Object.freeze({ sha256: expectedSource }), freshPreparedExecution: true,
  neutralResult: Object.freeze({ sha256: expectedNeutral }), publicComplete: false });
// Produce the rectangular proof from the immutable prepared-only input and
// same-run relation/HNF owners.  The output adapter does not trust the
// producer: it independently replays all primitive operations below its own
// authenticated boundary.
const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
const hnfHost = require("./row23_first_hnf_host.cjs");
const smithHost = require("./row23_raw_smith_presentation_host.cjs");
const directory = fs.mkdtempSync("/scratch/sagejs-row23-v2-smith-");
let rawSmith, liveEvidence;
try {
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    outputDirectory: directory });
  const live = await hnfHost.runFirstHnf(prepared, factor.owner);
  assert.equal(live.status, 0);
  rawSmith = smithHost.buildFromLiveOwner(live);
  liveEvidence = await liveEvidenceHost.buildFromLiveOwner(live, factor.owner,
    rawSmith.proof, retained);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
assert.equal(rawSmith.sha256, adapter.RAW_SMITH_SHA256);
const result = adapter.buildRow23OutputEvidenceGap(sourceRaw, receipt,
  rawSmith.raw, liveEvidence);
const assessment = result.assessment;
const evidence = new Map(assessment.evidence.map(entry => [entry.id, entry]));

assert.equal(result.sha256, v2.sha256Canonical(assessment));
assert.equal(result.sha256, adapter.ASSESSMENT_SHA256);
assert(result.bytes.equals(v2.canonical(assessment)));
assert.deepEqual(adapter.parseRow23OutputEvidenceGap(result.bytes), assessment);
assert.equal(assessment.relations.factorBaseCount, "31");
assert.equal(assessment.relations.relationCount, "40");
assert.equal(assessment.relations.logColumns, "35");
assert.equal(assessment.completion.phase3Complete, true);
assert.equal(assessment.completion.phase4Complete, true);
assert.equal(assessment.completion.phase5Complete, true);
assert.equal(assessment.completion.outputBoundaryComplete, true);
assert.deepEqual(Object.values(assessment.maps).map(map => map.ready),
  [true, true, true]);
assert.equal(v2.validate(assessment), assessment);

assert.equal(evidence.get("actual-factor-base").sha256,
  v2.sha256Canonical(retained.factorBase.ideals));
assert.equal(evidence.get("actual-principal-generators").sha256,
  v2.sha256Canonical(retained.relations.principalGenerators));
assert.equal(evidence.get("actual-relation-matrix-column-major").sha256,
  v2.sha256Canonical(retained.relations.recordsColumnMajor));
assert.deepEqual(evidence.get("actual-relation-matrix-column-major").shape,
  ["40", "31"]);

const terminal = retained.classGroup.presentation;
for (const [id, value] of [
  ["terminal-presentation-u", terminal.matrices.U],
  ["terminal-presentation-w", terminal.W],
  ["terminal-presentation-v", terminal.matrices.V],
  ["terminal-presentation-d", terminal.matrices.D],
]) assert.equal(evidence.get(id).sha256, v2.sha256Canonical(value));
assert.equal((BigInt(terminal.matrices.U[0]) * BigInt(terminal.W[0]) *
  BigInt(terminal.matrices.V[0])).toString(), terminal.matrices.D[0]);
const rawPresentation = assessment.presentation.proof;
for (const [id, value] of [
  [rawPresentation.uRef, rawSmith.proof.U],
  [rawPresentation.wRef, rawSmith.proof.W],
  [rawPresentation.vRef, rawSmith.proof.V],
  [rawPresentation.dRef, rawSmith.proof.D],
]) assert.equal(evidence.get(id).sha256, v2.sha256Canonical(value));
assert.equal(evidence.get(assessment.presentation.provenanceRefs[0]).kind,
  "provenance");
assert.deepEqual(rawSmith.proof.W, retained.relations.recordsColumnMajor);
assert.equal(evidence.get("actual-relation-log-matrix").sha256,
  v2.sha256Canonical(liveEvidence.logs));
assert.deepEqual(evidence.get("actual-relation-log-matrix").shape, ["40", "35"]);
assert.equal(liveEvidence.externalPariRuntime, false);
assert.deepEqual(liveEvidence.mapReceipt.maps,
  { combine: true, factor: true, reduce: true });
assert.throws(() => adapter.buildRow23OutputEvidenceGap(sourceRaw, receipt,
  rawSmith.raw, structuredClone(liveEvidence)), /same-process authority/);

for (let index = 0; index < 4; index += 1) {
  const coordinates = retained.units.fundamental.coordinates.slice(5 * index,
    5 * index + 5);
  const transform = retained.units.fundamental.compact.unitTransform.slice(
    9 * index, 9 * index + 9);
  const logs = retained.units.fundamental.compact.outputPackedLogs.slice(
    35 * index, 35 * index + 35);
  assert.equal(evidence.get(`unit-${index}-coordinates`).sha256,
    v2.sha256Canonical(coordinates));
  assert.equal(evidence.get(`unit-${index}-transform`).sha256,
    v2.sha256Canonical(transform));
  assert.equal(evidence.get(`unit-${index}-log`).sha256, v2.sha256Canonical(logs));
  assert.equal(evidence.get(`unit-${index}-norm`).sha256,
    v2.sha256Canonical(retained.units.fundamental.norms[index]));
  assert(["-1", "1"].includes(retained.units.fundamental.norms[index]));
}

let mutationsRejected = 0;
const changedSource = Buffer.from(sourceRaw);
changedSource[changedSource.length - 2] ^= 1;
assert.throws(() => adapter.buildRow23OutputEvidenceGap(changedSource, receipt),
  /authority|canonical/);
mutationsRejected += 1;
const copiedReceipt = { ...receipt };
delete copiedReceipt.brand;
assert.throws(() => adapter.buildRow23OutputEvidenceGap(sourceRaw, copiedReceipt),
  /unbranded receipt/);
mutationsRejected += 1;
for (const mutate of [
  value => { value.relations.relationCount = "1"; },
  value => { value.completion.phase5Complete = false; },
  value => { value.maps.factor.ready = false; },
  value => { value.presentation.proof.wRef = "absent"; },
]) {
  const changed = structuredClone(assessment);
  mutate(changed);
  assert.throws(() => adapter.parseRow23OutputEvidenceGap(v2.canonical(changed)),
    /changed|absent|wrong|unready|completion|evidence|must not be empty/);
  mutationsRejected += 1;
}

const changedProof = structuredClone(rawSmith.proof);
changedProof.operations[0][0] = "unsupported";
assert.throws(() => adapter.buildRow23OutputEvidenceGap(sourceRaw, receipt,
  v2.canonical(changedProof), liveEvidence), /authority changed/);
mutationsRejected += 1;
const changedProofAuthority = Buffer.from(rawSmith.raw);
changedProofAuthority[changedProofAuthority.length - 2] ^= 1;
assert.throws(() => adapter.buildRow23OutputEvidenceGap(sourceRaw, receipt,
  changedProofAuthority, liveEvidence), /authority changed/);
mutationsRejected += 1;

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/row23-output-evidence-v2-check-v2",
  sourceSha256: expectedSource, assessmentSha256: result.sha256,
  rawSmithSha256: rawSmith.sha256,
  actualRelationShape: [40, 31], retainedTerminalPresentationShape: [1, 1],
  rawPresentationShape: [40, 31], rawSmithOperations:
    rawSmith.proof.operations.length, phase3Complete: true,
  exactUnitsReplayed: 4, publishableAsV2: true, phase5Complete: true,
  outputBoundaryComplete: true, relationLogShape: [40, 35],
  nativeMapProbes: liveEvidence.native.length,
  mutationsRejected, timingClaim: false,
  qualificationClaim: false,
})}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
