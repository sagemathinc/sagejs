#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const adapter = require("./row21_output_evidence_v2_adapter.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

const DEFAULT_SOURCE =
  "/scratch/sagejs-row21-final-owner-v2/" +
  "row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz";

function readSource(filename) {
  const raw = fs.readFileSync(filename);
  return filename.endsWith(".gz") ? zlib.gunzipSync(raw) : raw;
}

function clone(value) {
  return structuredClone(value);
}

function rejected(payload, mutate, pattern) {
  const changed = clone(payload);
  mutate(changed);
  assert.throws(() => output.validate(changed), pattern);
}

function main() {
  const sourcePath = path.resolve(process.argv[2] || DEFAULT_SOURCE);
  const sourceRaw = readSource(sourcePath);
  const payload = adapter.buildRow21OutputEvidenceV2(sourceRaw);
  assert.equal(output.validate(payload), payload);
  const canonical = output.canonical(payload);
  assert.deepEqual(output.parseCanonical(canonical), payload);

  assert.equal(payload.classGroup.classNumber, "1");
  assert.deepEqual(payload.classGroup.invariantFactors, []);
  assert.equal(payload.relations.factorBaseCount, "24");
  assert.equal(payload.relations.relationCount, "32");
  assert.equal(payload.unitGroup.rank, "3");
  assert.equal(payload.unitGroup.exactUnits.units.length, 3);
  assert.equal(payload.unitGroup.regulator.kind, "pari_packed_accepted");
  assert.equal(payload.completion.correspondenceComplete, true);
  assert.equal(payload.completion.freshCorrespondence, true);
  assert.equal(payload.completion.phase5Complete, true);
  assert.equal(payload.completion.outputBoundaryComplete, false);
  assert.equal(payload.source.correspondenceResultSha256,
    adapter.CORRESPONDENCE_RESULT_SHA256);
  assert.equal(payload.maps.factor.ready, false);
  assert.equal(payload.maps.reduce.ready, false);
  assert.equal(payload.maps.combine.ready, false);

  const source = JSON.parse(sourceRaw).payload;
  const byId = new Map(payload.evidence.map(entry => [entry.id, entry]));
  assert.equal(byId.get("relation-matrix").sha256,
    output.sha256Canonical(source.relations.recordsColumnMajor));
  assert.equal(byId.get("principal-generators").sha256,
    output.sha256Canonical(source.relations.generators));
  assert.equal(byId.get("regulator-packed").sha256,
    output.sha256Canonical(source.regulator.value));
  assert.equal(byId.get("torsion-generator").sha256,
    output.sha256Canonical(source.units.torsion.generator));
  for (let index = 0; index < 3; index += 1) {
    assert.equal(byId.get(`unit-${index + 1}-coordinates`).sha256,
      output.sha256Canonical(source.units.fundamental.coordinates.slice(
        index * 5, (index + 1) * 5)));
  }

  const changedSource = Buffer.from(sourceRaw);
  changedSource[changedSource.length - 2] ^= 1;
  assert.throws(() => adapter.buildRow21OutputEvidenceV2(changedSource),
    /reviewed identity/);
  rejected(payload, value => {
    value.completion.outputBoundaryComplete = true;
    value.completion.missing = [];
  }, /lacks map material/);
  rejected(payload, value => {
    value.maps.factor.ready = true;
    value.maps.factor.missing = [];
  }, /must not be empty/);
  rejected(payload, value => {
    value.unitGroup.regulator.kind = "rigorous_enclosure";
  }, /fields must be exactly/);
  rejected(payload, value => {
    value.unitGroup.exactUnits.units.pop();
  }, /count differs/);
  rejected(payload, value => {
    value.presentation.proof.identityRef = "presentation-dependency";
  }, /evidence kind/);
  rejected(payload, value => {
    value.evidence.find(entry => entry.id === "relation-matrix").shape =
      ["24", "32"];
  }, /wrong evidence shape/);
  rejected(payload, value => {
    value.completion.freshCorrespondence = false;
  }, /not fresh/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-output-evidence-v2-check-v1",
    sourceSha256: adapter.SOURCE_SHA256,
    outputEvidenceSha256: output.sha256Canonical(payload),
    evidenceEntries: payload.evidence.length,
    exactUnits: payload.unitGroup.exactUnits.units.length,
    outputBoundaryComplete: payload.completion.outputBoundaryComplete,
    missing: payload.completion.missing,
    adversarialMutationsRejected: 8,
    timingClaim: false,
    publicClaim: false,
    qualificationClaim: false,
  }, null, 2)}\n`);
}

main();
