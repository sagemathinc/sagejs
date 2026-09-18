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
const proofApi = require("./row0_raw_relation_smith_proof.cjs");
const saturationApi = require("./check_row0_unit_saturation_evidence.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

function sourceOwner(source, name) {
  const value = source.storage.find(owner => owner.name === name);
  assert(value, `missing source owner ${name}`);
  assert.equal(value.logicalLength, String(value.entries.length));
  return value.entries;
}
function decode(entries) {
  return JSON.parse(Buffer.from(entries.map(Number)).toString("ascii"));
}
function digest(value) { return v2.sha256Canonical(value); }
function determinant3(entries) {
  const [a, b, c] = entries.map(BigInt);
  const matrix = [[a, -20034n * c, -20034n * b],
    [b, a + 20018n * c, 20018n * b - 20034n * c],
    [c, b, a + 20018n * c]];
  return matrix[0][0] *
      (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
    matrix[0][1] *
      (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
    matrix[0][2] *
      (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
}
function replayColdOwners(source) {
  const owners = Object.fromEntries(source.storage
    .filter(owner => owner.name.startsWith("replay-"))
    .map(owner => [owner.name.slice(7), owner.entries]));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row0-v2-"));
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
function replayRawSmith(proof, relations) {
  const rows = proofApi.RELATIONS, columns = proofApi.FACTORS;
  const sparse = Array.from({ length: rows }, (_, row) => {
    const answer = [];
    for (let column = 0; column < columns; column += 1) {
      const value = BigInt(relations[row * columns + column]);
      if (value !== 0n) answer.push([column, value]);
    }
    return answer;
  });
  const left = proof.material.u.map(BigInt);
  const right = proof.material.v.map(BigInt);
  const diagonal = proof.material.d.map(BigInt);
  let checked = 0;
  for (let row = 0; row < rows; row += 1) {
    const ur = Array(columns).fill(0n);
    for (let relation = 0; relation < rows; relation += 1) {
      const coefficient = left[row * rows + relation];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparse[relation])
        ur[column] += coefficient * value;
    }
    const product = Array(columns).fill(0n);
    for (let inner = 0; inner < columns; inner += 1) {
      if (ur[inner] === 0n) continue;
      for (let column = 0; column < columns; column += 1) {
        const value = right[inner * columns + column];
        if (value !== 0n) product[column] += ur[inner] * value;
      }
    }
    assert.deepEqual(product,
      diagonal.slice(row * columns, (row + 1) * columns),
      `raw Smith product row ${row}`);
    checked += columns;
  }
  return checked;
}

function main(filename) {
  assert(filename,
    "usage: check_row0_class_unit_output_evidence_v2.cjs ROW0_RESULT.json");
  const raw = fs.readFileSync(path.resolve(filename));
  const source = adapter.authenticateRow0Correspondence(raw);
  const saturation = saturationApi.buildAndColdReplay(filename);
  const output = adapter.buildRow0OutputEvidence(raw, saturation);
  v2.validate(output);
  assert.deepEqual(v2.parseCanonical(v2.canonical(output)), output);
  const evidence = new Map(output.evidence.map(entry => [entry.id, entry]));

  assert.equal(output.presentation.variant, "smith_uwvd");
  assert.equal(output.completion.phase3Complete, true);
  assert.equal(output.completion.phase4Complete, true);
  assert.equal(output.completion.phase5Complete, true);
  assert.equal(output.completion.outputBoundaryComplete, false);
  assert(!output.completion.missing.includes(
    "independent-unit-saturation-certificate"));
  assert(output.completion.missing.includes("proved-factor-base-bound"));
  assert.deepEqual(Object.values(output.maps).map(value => value.ready),
    [true, true, true]);

  const relations = sourceOwner(source, "replay-relation_records");
  const proof = proofApi.buildRow0RawRelationSmithProof({
    relation_records: relations,
    hnf_transform: sourceOwner(source, "replay-hnf_transform"),
    hnf_matbnew: sourceOwner(source, "replay-hnf_matbnew"),
    hnf_hnf_transform: sourceOwner(source, "replay-hnf_hnf_transform"),
    hnf_full_h: sourceOwner(source, "replay-hnf_full_h"),
  });
  assert.equal(evidence.get("factor-base-ideals").sha256,
    digest(sourceOwner(source, "replay-packet_ideals")));
  assert.equal(evidence.get("relation-matrix").sha256, digest(relations));
  assert.equal(evidence.get("raw-smith-w").sha256, digest(relations));
  assert.equal(evidence.get("raw-smith-u").sha256, digest(proof.material.u));
  assert.equal(evidence.get("raw-smith-v").sha256, digest(proof.material.v));
  assert.equal(evidence.get("raw-smith-d").sha256, digest(proof.material.d));
  const mapMaterials = adapter.row0MapMaterials(proof);
  for (const name of ["combine", "factor", "reduce"]) {
    assert.deepEqual(output.maps[name], {
      evidenceRefs: [`${name}-map`], missing: [], ready: true,
    });
    assert.equal(evidence.get(`${name}-map`).sha256,
      digest(mapMaterials[name]));
  }
  const smithCells = replayRawSmith(proof, relations);
  assert.deepEqual(proof.diagonalFactors, Array(66).fill("1"));
  assert.equal(proof.material.u.slice(66 * 73).length, 7 * 73);

  const exact = sourceOwner(source, "exact-unit-coordinates");
  const norms = sourceOwner(source, "exact-unit-norms");
  for (let index = 0; index < 2; index += 1) {
    const coordinates = exact.slice(3 * index, 3 * index + 3);
    assert.equal(determinant3(coordinates), BigInt(norms[index]));
    assert.equal(evidence.get(`unit-${index}-coordinates`).sha256,
      digest(coordinates));
    assert.equal(evidence.get(`unit-${index}-norm`).sha256,
      digest(norms[index]));
  }
  assert.deepEqual(sourceOwner(source, "torsion-generator"), ["-1", "0", "0"]);
  assert.equal(evidence.get("unit-saturation-index-one").sha256,
    digest(saturation));
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

  const assessment = adapter.assessRow0OutputEvidence(raw, saturation);
  assert.equal(assessment.status, "valid-v2-incomplete-output-boundary");
  assert.equal(assessment.completion.phase3Complete, true);
  assert.equal(assessment.completion.phase4Complete, true);
  assert.equal(assessment.completion.phase4MaterialRetained, true);
  assert.equal(assessment.completion.phase5Complete, true);
  assert.deepEqual(assessment.missing.capability,
    ["proved-factor-base-bound"]);
  assert.equal(assessment.outputEvidenceSha256, digest(output));

  const changedRaw = Buffer.from(raw);
  changedRaw[changedRaw.length - 2] ^= 1;
  assert.throws(() => adapter.buildRow0OutputEvidence(changedRaw, saturation),
    adapter.Row0OutputEvidenceFailure);
  const changedSaturation = structuredClone(saturation);
  changedSaturation.conclusion.unique_index = "2";
  assert.throws(() => adapter.buildRow0OutputEvidence(raw, changedSaturation),
    adapter.Row0OutputEvidenceFailure);
  const changed = structuredClone(output);
  changed.completion.outputBoundaryComplete = true;
  assert.throws(() => v2.validate(changed), /missing list|map material/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-output-evidence-v2-check-v3",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    outputEvidenceSha256: digest(output), assessmentSha256: digest(assessment),
    rawRelationShape: [73, 66], rawSmithLeftShape: [73, 73],
    rawSmithRightShape: [66, 66], rawSmithDiagonalShape: [73, 66],
    rawSmithCellsReplayed: smithCells, classNumber: "1",
    exactUnitsReplayed: 2, rigorousRegulatorReplayed: true,
    coldOwnerReplay: true, phase3Complete: true, phase4Complete: true,
    phase4MaterialRetained: true, phase5Complete: true,
    outputBoundaryComplete: false, publishableUnderV2: true,
    sourceMutationRejected: true, saturationMutationRejected: true,
    inflatedCompletionRejected: true,
    qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
