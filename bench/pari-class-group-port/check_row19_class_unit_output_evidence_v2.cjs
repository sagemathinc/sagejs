#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const adapter = require("./row19_class_unit_output_evidence_v2.cjs");
const proofApi = require("./row19_raw_relation_smith_proof.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

function owner(payload, name) {
  const result = payload.storage.find(candidate => candidate.name === name);
  assert(result, `missing retained owner ${name}`);
  return result.entries;
}
function decoded(payload, name) {
  return JSON.parse(Buffer.from(owner(payload, name).map(Number)).toString("ascii"));
}
function digest(value) { return v2.sha256Canonical(value); }

function main(filename) {
  assert(filename, "usage: check_row19_class_unit_output_evidence_v2.cjs RESULT.json");
  const raw = fs.readFileSync(filename);
  const payload = adapter.authenticateRow19Correspondence(raw);
  const output = adapter.buildRow19OutputEvidence(raw);
  v2.validate(output);
  assert.deepEqual(v2.parseCanonical(v2.canonical(output)), output);
  const evidence = new Map(output.evidence.map(entry => [entry.id, entry]));

  assert.equal(output.completion.phase3Complete, true);
  assert.equal(output.completion.phase4Complete, true);
  assert.equal(output.completion.phase5Complete, true);
  assert.equal(output.completion.outputBoundaryComplete, true);
  assert.deepEqual(output.completion.missing, []);
  assert.equal(output.relations.relationCount, "430");
  assert.equal(output.relations.factorBaseCount, "424");
  assert.equal(output.presentation.variant, "smith_uwvd");

  // Recompute every raw relation hash directly from the immutable result.
  const factorBase = decoded(payload, "factor-base");
  const relations = owner(payload, "relation-records");
  assert.equal(evidence.get("factor-base-ideals").sha256,
    digest(factorBase.idealHnfs));
  assert.equal(evidence.get("relation-matrix").sha256, digest(relations));
  assert.equal(evidence.get("raw-smith-w").sha256, digest(relations));
  assert.equal(evidence.get("principal-generators").sha256,
    digest(owner(payload, "relation-generators")));
  assert.equal(evidence.get("relation-logs").sha256,
    digest(owner(payload, "relation-logs")));

  // Independently reconstruct the raw Smith proof, authenticate its hashes,
  // and replay U R V = D on all 430*424 output cells.  Sparse raw relation
  // rows keep this exact replay bounded.
  const proof = proofApi.buildRow19RawRelationSmithProof(raw);
  assert.equal(evidence.get("raw-smith-u").sha256, proof.materialSha256.u);
  assert.equal(evidence.get("raw-smith-v").sha256, proof.materialSha256.v);
  assert.equal(evidence.get("raw-smith-d").sha256, proof.materialSha256.d);
  const sparse = Array.from({ length: proofApi.ROWS }, (_, row) => {
    const answer = [];
    for (let column = 0; column < proofApi.COLUMNS; column += 1) {
      const value = BigInt(relations[row * proofApi.COLUMNS + column]);
      if (value !== 0n) answer.push([column, value]);
    }
    return answer;
  });
  const fullU = proof.material.u.map(BigInt);
  const fullV = proof.material.v.map(BigInt);
  const fullD = proof.material.d.map(BigInt);
  for (let row = 0; row < proofApi.ROWS; row += 1) {
    const ur = Array(proofApi.COLUMNS).fill(0n);
    for (let relation = 0; relation < proofApi.ROWS; relation += 1) {
      const coefficient = fullU[row * proofApi.ROWS + relation];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparse[relation])
        ur[column] += coefficient * value;
    }
    const product = Array(proofApi.COLUMNS).fill(0n);
    for (let inner = 0; inner < proofApi.COLUMNS; inner += 1) {
      if (ur[inner] === 0n) continue;
      for (let column = 0; column < proofApi.COLUMNS; column += 1) {
        const value = fullV[inner * proofApi.COLUMNS + column];
        if (value !== 0n) product[column] += ur[inner] * value;
      }
    }
    assert.deepEqual(product,
      fullD.slice(row * proofApi.COLUMNS, (row + 1) * proofApi.COLUMNS),
      `raw Smith product row ${row}`);
  }
  assert.equal(proof.diagonalFactors.map(BigInt)
    .reduce((product, value) => product * value, 1n), 39366n);
  const mapMaterials = adapter.row19MapMaterials(proof);
  for (const name of ["combine", "factor", "reduce"]) {
    assert.equal(output.maps[name].ready, true);
    assert.deepEqual(output.maps[name].missing, []);
    assert.deepEqual(output.maps[name].evidenceRefs, [`${name}-map`]);
    assert.equal(evidence.get(`${name}-map`).sha256, digest(mapMaterials[name]));
  }

  // Independently bind the published class and unit evidence to source
  // owners rather than trusting their metadata.
  const ideals = owner(payload, "class-generator-ideals");
  const witnesses = decoded(payload, "class-order-witnesses");
  const classOrder = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  for (let index = 0; index < 9; index += 1) {
    const retainedIndex = classOrder[index];
    assert.equal(evidence.get(`class-ideal-${index}`).sha256,
      digest(ideals.slice(retainedIndex * 9, retainedIndex * 9 + 9)));
    assert.equal(evidence.get(`class-witness-${index}`).sha256,
      digest(witnesses[retainedIndex]));
  }
  const compactUnit = decoded(payload, "compact-fundamental-unit");
  const regulator = decoded(payload, "regulator-enclosure");
  assert.equal(evidence.get("unit-relation-transform").sha256,
    digest(compactUnit.relationExponents));
  assert.equal(evidence.get("regulator-enclosure").sha256,
    digest(regulator.regulator));
  assert.equal(evidence.get("torsion-generator").sha256,
    digest(owner(payload, "torsion-generator")));

  const assessment = adapter.assessRow19OutputEvidence(raw);
  assert.equal(assessment.status, "valid-v2-complete-output-boundary");
  assert.equal(assessment.completion.phase3Complete, true);
  assert.equal(assessment.completion.phase4Complete, true);
  assert.equal(assessment.completion.phase5Complete, true);
  assert.deepEqual(assessment.missing.owners, []);
  assert.deepEqual(assessment.missing.capability, []);
  assert.equal(assessment.outputEvidenceSha256, digest(output));

  const changed = Buffer.from(raw);
  changed[changed.length - 2] ^= 1;
  assert.throws(() => adapter.buildRow19OutputEvidence(changed),
    adapter.Row19OutputEvidenceFailure);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-output-evidence-v2-check-v2",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    outputEvidenceSha256: digest(output),
    assessmentSha256: digest(assessment),
    rawRelationShape: [430, 424], rawSmithLeftShape: [430, 430],
    rawSmithRightShape: [424, 424], rawSmithDiagonalShape: [430, 424],
    fullRawSmithIdentityReplayed: true, classNumber: "39366",
    phase3Complete: true, phase4Complete: true, phase5Complete: true,
    outputBoundaryComplete: true, publishableUnderV2: true,
    remainingMissing: output.completion.missing,
    sourceMutationRejected: true, qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
