#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const adapter = require("./row14_class_unit_output_evidence_v2.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

function owners(raw) {
  const payload = JSON.parse(raw.toString("ascii")).payload;
  return new Map(payload.storage.map(owner => [owner.name,
    owner.entries.map(BigInt)]));
}
function replayComposite(map) {
  const relation = map.get("raw-relation-records");
  const transform = map.get("raw-to-presentation-transform");
  const presentation = map.get("class-presentation");
  const factor = map.get("factor-map");
  let checked = 0;
  for (let terminal = 0; terminal < 3; terminal += 1) {
    for (let row = 0; row < 799; row += 1) {
      let left = 0n;
      for (let raw = 0; raw < 806; raw += 1)
        left += transform[terminal * 806 + raw] * relation[raw * 799 + row];
      let right = 0n;
      for (let column = 0; column < 3; column += 1)
        right += presentation[terminal * 3 + column] *
          factor[column * 799 + row];
      assert.equal(left, right, `T R = P F failed at (${terminal},${row})`);
      checked += 1;
    }
  }
  const determinant = presentation[0] *
    (presentation[4] * presentation[8] - presentation[5] * presentation[7]) -
    presentation[1] *
    (presentation[3] * presentation[8] - presentation[5] * presentation[6]) +
    presentation[2] *
    (presentation[3] * presentation[7] - presentation[4] * presentation[6]);
  assert.equal(determinant < 0n ? -determinant : determinant, 192n);
  return checked;
}

function main(filename) {
  assert(filename, "usage: check_row14_class_unit_output_evidence_v2.cjs RESULT.json");
  const raw = fs.readFileSync(filename);
  const assessment = adapter.assessRow14OutputEvidence(raw);
  assert.equal(assessment.status, "not-publishable-under-v2");
  assert.deepEqual(assessment.rawRelations.evidence.map(entry => entry.shape),
    [["799", "16"], ["806", "4"], ["806", "21"], ["806", "799"]]);
  assert.equal(assessment.retainedCompositePresentation.equation, "T R = P F");
  const checkedCells = replayComposite(owners(raw));
  assert.equal(checkedCells, 3 * 799);
  assert.equal(assessment.completion.phase3Complete, false);
  assert.equal(assessment.completion.phase4Complete, false);
  assert.equal(assessment.completion.phase5Complete, false);
  assert.equal(assessment.completion.outputBoundaryComplete, false);
  for (const map of Object.values(assessment.maps)) assert.equal(map.ready, false);
  assert.deepEqual(assessment.missing.owners, ["raw-smith-diagonal-806x799",
    "raw-smith-left-transform-806x806", "raw-smith-right-transform-799x799"]);
  assert.throws(() => adapter.buildRow14OutputEvidence(raw),
    /presentation-proof-shaped-like-the-raw-relation-surface/);

  const incompatible = {
    schema: v2.SCHEMA, field: assessment.field, source: assessment.source,
    evidence: [...assessment.rawRelations.evidence,
      ...assessment.retainedCompositePresentation.evidence].sort(
      (a, b) => a.id.localeCompare(b.id)),
    relations: { factorBaseCount: "799", factorBaseRef: "factor-base-ideals",
      logColumns: "21", logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators", relationCount: "806",
      relationMatrixRef: "relation-matrix" },
    presentation: { dependencyRefs: ["factor-projection"], provenanceRefs: [],
      variant: "smith_uwvd", proof: { dRef: "terminal-presentation",
        uRef: "raw-to-presentation", vRef: "factor-projection",
        wRef: "relation-matrix" } },
    classGroup: {}, unitGroup: {}, maps: {}, completion: {},
  };
  assert.throws(() => v2.validate(incompatible), /evidence kind|wrong evidence shape/);
  const changed = Buffer.from(raw);
  changed[changed.length - 2] ^= 1;
  assert.throws(() => adapter.assessRow14OutputEvidence(changed),
    adapter.Row14OutputEvidenceFailure);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-output-evidence-v2-gap-check-v1",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    assessmentSha256: v2.sha256Canonical(assessment),
    rawRelationShape: [806, 799], factorBaseIdealShape: [799, 16],
    principalGeneratorShape: [806, 4], rawLogShape: [806, 21],
    compositeIdentity: "T(3x806) R(806x799) = P(3x3) F(3x799)",
    compositeCellsReplayed: checkedCells, classNumber: "192",
    publishableUnderV2: false, phase3Complete: false, phase4Complete: false,
    phase5Complete: false, outputBoundaryComplete: false,
    generalMapsReady: false, incompatibleShapeRejected: true,
    sourceMutationRejected: true, qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
