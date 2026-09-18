#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const adapter = require("./row0_class_unit_output_evidence_v2.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

function sourceOwner(source, name) {
  const value = source.storage.find(owner => owner.name === name);
  assert(value, `missing source owner ${name}`);
  assert.equal(value.logicalLength, String(value.entries.length));
  return value.entries;
}
function decode(entries) {
  return JSON.parse(Buffer.from(entries.map(Number)).toString("ascii"));
}
function determinant3(entries) {
  const [a, b, c] = entries.map(BigInt);
  const m = [[a, -20034n * c, -20034n * b],
    [b, a + 20018n * c, 20018n * b - 20034n * c],
    [c, b, a + 20018n * c]];
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function replayColdOwners(source) {
  const owners = Object.fromEntries(source.storage
    .filter(owner => owner.name.startsWith("replay-"))
    .map(owner => [owner.name.slice(7), owner.entries]));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row0-v2-gap-"));
  try {
    const filename = path.join(temporary, "owners.json");
    fs.writeFileSync(filename, JSON.stringify(owners));
    const child = spawnSync("python3", [path.join(__dirname,
      "check_unified_h1_terminal_snapshot.py"), filename], {
      cwd: path.resolve(__dirname, "../.."), encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024, timeout: 900_000,
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function main(filename) {
  assert(filename,
    "usage: check_row0_class_unit_output_evidence_v2.cjs ROW0_RESULT.json");
  const raw = fs.readFileSync(path.resolve(filename));
  const built = adapter.buildRow0OutputEvidenceGapAssessment(raw);
  const { assessment, sourcePayload: source } = built;
  assert.deepEqual(JSON.parse(output.canonical(assessment).toString("ascii")),
    assessment);
  assert.equal(assessment.schema, adapter.ASSESSMENT_SCHEMA);
  assert.equal(assessment.v2Payload, null);

  const evidence = new Map(assessment.authenticatedEvidence.map(entry =>
    [entry.id, entry]));
  assert.equal(evidence.get("factor-base-ideals").sha256,
    output.sha256Canonical(sourceOwner(source, "replay-packet_ideals")));
  assert.equal(evidence.get("relation-matrix").sha256,
    output.sha256Canonical(sourceOwner(source, "replay-relation_records")));
  assert.equal(evidence.get("principal-generators").sha256,
    output.sha256Canonical(sourceOwner(source, "replay-generators")));
  assert.equal(evidence.get("relation-logs").sha256,
    output.sha256Canonical(sourceOwner(source, "replay-log_embeddings")));
  assert.equal(evidence.get("terminal-presentation").shape.join("x"), "8x8");
  assert.equal(evidence.get("terminal-relation-to-presentation").shape.join("x"),
    "15x8");
  assert.deepEqual(assessment.presentationGap.requiredRightInverseShape,
    ["66", "73"]);
  assert.notDeepEqual(evidence.get("terminal-presentation").shape,
    assessment.presentationGap.requiredIdentityShape);

  const exact = sourceOwner(source, "exact-unit-coordinates");
  const norms = sourceOwner(source, "exact-unit-norms");
  for (let index = 0; index < 2; index += 1) {
    const coordinates = exact.slice(3 * index, 3 * index + 3);
    assert.equal(determinant3(coordinates), BigInt(norms[index]));
    assert.equal(evidence.get(`unit-${index + 1}-coordinates`).sha256,
      output.sha256Canonical(coordinates));
  }
  assert.deepEqual(sourceOwner(source, "torsion-generator"), ["-1", "0", "0"]);
  const regulator = decode(sourceOwner(source, "regulator-rigorous-authority"));
  assert.equal(regulator.evidence.live_regulator_contained, true);
  assert.equal(regulator.evidence.regulator_enclosure.rigorous, true);
  assert.equal(regulator.evidence.regulator_enclosure.full_rank_certified, true);
  assert.deepEqual(regulator.evidence.packed_log_matches, Array(6).fill(true));

  const replay = replayColdOwners(source);
  assert.equal(replay.actualUnifiedPublication, true);
  assert.equal(replay.relations, 73);
  assert.equal(replay.factorBase, 66);
  assert.equal(replay.exactUnits, 2);
  assert.equal(assessment.completion.correspondenceComplete, true);
  assert.equal(assessment.completion.freshCorrespondence, true);
  assert.equal(assessment.completion.phase3Complete, false);
  assert.equal(assessment.completion.phase4Complete, false);
  assert.equal(assessment.completion.phase5Complete, false);
  assert.equal(assessment.completion.outputBoundaryComplete, false);
  assert.deepEqual(Object.values(assessment.maps).map(value => value.ready),
    [false, false, false]);

  // A changed source must not produce even a gap assessment.  The assessment
  // itself must also remain structurally incapable of v2 validation.
  const changedRaw = Buffer.from(raw);
  changedRaw[changedRaw.length - 2] ^= 1;
  assert.throws(() => adapter.buildRow0OutputEvidenceGapAssessment(changedRaw),
    adapter.Row0OutputEvidenceFailure);
  assert.throws(() => output.validate(assessment), /fields must be exactly/);
  const changed = structuredClone(assessment);
  changed.completion.phase3Complete = true;
  changed.completion.phase5Complete = true;
  changed.completion.outputBoundaryComplete = true;
  changed.v2Payload = {};
  assert.notEqual(output.sha256Canonical(changed), output.sha256Canonical(assessment));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-output-evidence-v2-gap-check-v1",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    assessmentSha256: output.sha256Canonical(assessment),
    factorBaseCount: 66, relations: 73, classNumberCandidate: "1",
    exactUnitsReplayed: 2, rigorousRegulatorReplayed: true,
    coldOwnerReplay: true, phase3Complete: false, phase4Complete: false,
    phase5Complete: false, outputBoundaryComplete: false, mapFamiliesReady: 0,
    dimensionCompatiblePresentationProof: false, v2PayloadProduced: false,
    timingClaim: false, publicClaim: false, qualificationClaim: false,
    mutationsRejected: 3,
  })}\n`);
}

main(process.argv[2]);
