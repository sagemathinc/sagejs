#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const adapter = require("./row19_class_unit_output_evidence_v2.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

function matrix(entries, rows, columns) {
  return Array.from({ length: rows }, (_, row) =>
    entries.slice(row * columns, (row + 1) * columns).map(BigInt));
}
function multiply(left, right) {
  return left.map(row => right[0].map((_, column) =>
    row.reduce((sum, value, index) => sum + value * right[index][column], 0n)));
}
function strings(value) { return value.map(row => row.map(String)); }
function decodedOwner(raw, name) {
  const envelope = JSON.parse(raw.toString("ascii"));
  const owner = envelope.payload.storage.find(candidate => candidate.name === name);
  assert(owner, `missing retained owner ${name}`);
  return JSON.parse(Buffer.from(owner.entries.map(Number)).toString("ascii"));
}

function main(filename) {
  assert(filename, "usage: check_row19_class_unit_output_evidence_v2.cjs RESULT.json");
  const raw = fs.readFileSync(filename);
  const assessment = adapter.assessRow19OutputEvidence(raw);
  assert.equal(assessment.status, "not-publishable-under-v2");
  assert.equal(assessment.rawRelations.factorBaseCount, "424");
  assert.equal(assessment.rawRelations.relationCount, "430");
  assert.equal(assessment.rawRelations.logColumns, "14");
  const rawEvidence = new Map(assessment.rawRelations.evidence.map(entry => [entry.id, entry]));
  assert.deepEqual(rawEvidence.get("factor-base-ideals").shape, ["424", "9"]);
  assert.deepEqual(rawEvidence.get("relation-matrix").shape, ["430", "424"]);
  assert.deepEqual(rawEvidence.get("principal-generators").shape, ["430", "3"]);
  assert.deepEqual(rawEvidence.get("relation-logs").shape, ["430", "14"]);

  const presentation = decodedOwner(raw, "class-presentation");
  const left = matrix(presentation.matrices.U, 9, 9);
  const middle = matrix(presentation.terminalW, 9, 9);
  const right = matrix(presentation.matrices.Ui, 9, 9);
  const diagonal = matrix(presentation.matrices.D, 9, 9);
  assert.deepEqual(strings(multiply(multiply(left, middle), right)), strings(diagonal));
  assert.equal(diagonal.flatMap((row, index) => row[index] === 1n ? [] : [row[index]])
    .reduce((product, factor) => product * factor, 1n), 39366n);

  assert.deepEqual(assessment.missing.owners, ["raw-smith-diagonal-430x424",
    "raw-smith-left-transform-430x430", "raw-smith-right-transform-424x424"]);
  assert.deepEqual(assessment.missing.capability, ["presentation-not-given-variant"]);
  assert.equal(assessment.completion.phase3Complete, false);
  assert.equal(assessment.completion.phase4Complete, false);
  assert.equal(assessment.completion.phase4MaterialRetained, true);
  assert.equal(assessment.completion.phase5Complete, false);
  assert.equal(assessment.completion.outputBoundaryComplete, false);
  assert.equal(assessment.qualifiedTiming, false);
  assert.throws(() => adapter.buildRow19OutputEvidence(raw),
    /v2-requires-presentation-proof-shaped-like-raw-relation-surface/);

  // Demonstrate the precise shared-schema obstruction: substituting the
  // retained 9-by-9 proof into a 430-by-424 declaration is rejected.
  const ancestry = assessment.retainedAncestry.principalRelationTransform;
  const dependency = { ...ancestry, id: "raw-relation-dependency", kind: "dependency" };
  const incompatible = {
    schema: v2.SCHEMA,
    field: assessment.field,
    source: assessment.source,
    evidence: [...assessment.rawRelations.evidence, ancestry, dependency,
      ...assessment.retainedFinalPresentation.evidence].sort(
        (a, b) => a.id.localeCompare(b.id)),
    relations: { factorBaseCount: "424", factorBaseRef: "factor-base-ideals",
      logColumns: "14", logsRef: "relation-logs",
      principalGeneratorsRef: "principal-generators", relationCount: "430",
      relationMatrixRef: "relation-matrix" },
    presentation: { dependencyRefs: ["raw-relation-dependency"],
      provenanceRefs: ["raw-to-terminal-principal-transform"], variant: "smith_uwvd",
      proof: { dRef: "final-presentation-d", uRef: "final-presentation-u",
        vRef: "final-presentation-ui", wRef: "final-presentation-w" } },
    classGroup: { classNumber: "39366", generators: [], invariantFactors: [] },
    unitGroup: {}, maps: {}, completion: {},
  };
  assert.throws(() => v2.validate(incompatible), /wrong evidence shape/);

  const changed = Buffer.from(raw);
  changed[changed.length - 2] ^= 1;
  assert.throws(() => adapter.assessRow19OutputEvidence(changed),
    adapter.Row19OutputEvidenceFailure);
  const forged = structuredClone(assessment);
  forged.rawRelations.relationCount = "9";
  assert.notEqual(v2.sha256Canonical(forged), v2.sha256Canonical(assessment));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-output-evidence-v2-gap-check-v1",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    assessmentSha256: v2.sha256Canonical(assessment),
    rawRelationShape: [430, 424], principalGeneratorShape: [430, 3],
    rawLogShape: [430, 14], factorBaseIdealShape: [424, 9],
    finalPresentationShape: [9, 9], finalSmithIdentityReplayed: true,
    classNumber: "39366", phase3Complete: false, phase4Complete: false,
    phase4MaterialRetained: true, phase5Complete: false,
    outputBoundaryComplete: false, publishableUnderV2: false,
    missingOwners: assessment.missing.owners,
    missingCapability: assessment.missing.capability,
    incompatibleShapeRejected: true, sourceMutationRejected: true,
    qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
