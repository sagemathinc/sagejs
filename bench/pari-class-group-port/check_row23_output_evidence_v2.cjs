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
const expectedSource =
  "fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318";
const expectedNeutral =
  "5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c";
const brand = Symbol("fresh-row23-receipt");
require.cache[transactionPath] = { id: transactionPath, filename: transactionPath,
  loaded: true, exports: { verifyFreshPreparedReceipt(receipt) {
    assert.equal(receipt?.brand, brand, "unbranded receipt reached adapter");
    return receipt;
  } } };
delete require.cache[adapterPath];
const adapter = require(adapterPath);

const sourceRaw = zlib.gunzipSync(fs.readFileSync(path.resolve(artifact)));
const retained = JSON.parse(sourceRaw.toString("ascii")).payload;
const receipt = Object.freeze({ brand, correspondenceComplete: true,
  finalSource: Object.freeze({ sha256: expectedSource }), freshPreparedExecution: true,
  neutralResult: Object.freeze({ sha256: expectedNeutral }), publicComplete: false });
const result = adapter.buildRow23OutputEvidenceGap(sourceRaw, receipt);
const assessment = result.assessment;
const evidence = new Map(assessment.evidence.map(entry => [entry.id, entry]));

assert.equal(result.sha256, v2.sha256Canonical(assessment));
assert.equal(result.sha256, adapter.ASSESSMENT_SHA256);
assert(result.bytes.equals(v2.canonical(assessment)));
assert.deepEqual(adapter.parseRow23OutputEvidenceGap(result.bytes), assessment);
assert.equal(assessment.publishableAsV2, false);
assert.equal(assessment.actualRelations.factorBaseCount, "31");
assert.equal(assessment.actualRelations.relationCount, "40");
assert.equal(assessment.actualRelations.logs.ready, false);
assert.equal(assessment.completion.phase3Complete, false);
assert.equal(assessment.completion.phase4Complete, true);
assert.equal(assessment.completion.phase5Complete, false);
assert.equal(assessment.completion.outputBoundaryComplete, false);
assert.deepEqual(Object.values(assessment.maps).map(map => map.ready),
  [false, false, false]);
assert.throws(() => v2.validate(assessment), /payload fields must be exactly/,
  "gap assessment was accidentally publishable as v2");

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
assert.deepEqual(assessment.v2Gap.requiredPresentationShapes, {
  d: ["40", "31"], u: ["40", "40"], v: ["31", "31"], w: ["40", "31"],
});

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
for (const changed of [
  { ...receipt, brand, neutralResult: { sha256: "0".repeat(64) } },
  { ...receipt, brand, finalSource: { sha256: "0".repeat(64) } },
]) {
  assert.throws(() => adapter.buildRow23OutputEvidenceGap(sourceRaw, changed),
    /detached/);
  mutationsRejected += 1;
}
for (const mutate of [
  value => { value.publishableAsV2 = true; },
  value => { value.actualRelations.relationCount = "1"; },
  value => { value.completion.phase5Complete = true; },
  value => { value.v2Gap.requiredPresentationShapes.w = ["1", "1"]; },
]) {
  const changed = structuredClone(assessment);
  mutate(changed);
  assert.throws(() => adapter.parseRow23OutputEvidenceGap(v2.canonical(changed)),
    /authority changed/);
  mutationsRejected += 1;
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/row23-output-evidence-v2-gap-check-v1",
  sourceSha256: expectedSource, assessmentSha256: result.sha256,
  actualRelationShape: [40, 31], retainedTerminalPresentationShape: [1, 1],
  exactUnitsReplayed: 4, publishableAsV2: false, phase5Complete: false,
  outputBoundaryComplete: false, mutationsRejected, timingClaim: false,
  qualificationClaim: false,
})}\n`);
