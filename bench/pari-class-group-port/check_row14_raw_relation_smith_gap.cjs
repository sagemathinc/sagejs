#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const proofApi = require("./row14_raw_relation_smith_gap.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

function main(filename) {
  assert(filename, "usage: check_row14_raw_relation_smith_gap.cjs RESULT.json");
  const raw = fs.readFileSync(filename);
  const payload = JSON.parse(raw.toString("ascii")).payload;
  const proof = proofApi.buildRow14RawSmithGap(raw);
  const relation = payload.storage.find(owner =>
    owner.name === "raw-relation-records").entries.map(BigInt);
  const U = proof.material.retainedLeftRows.map(BigInt);
  const V = proof.material.v.map(BigInt);
  const D = proof.material.d.map(BigInt);

  // Independently replay every emitted row of the partial full-size identity.
  // Raw relations are sparse; after cancellation the retained HNF rows are
  // sparse too, but this checker deliberately performs the complete exact
  // multiplication for all 10*799 output cells.
  const sparse = Array.from({ length: proofApi.ROWS }, (_, row) => {
    const answer = [];
    for (let column = 0; column < proofApi.COLUMNS; column += 1) {
      const value = relation[row * proofApi.COLUMNS + column];
      if (value !== 0n) answer.push([column, value]);
    }
    return answer;
  });
  const finalRows = proof.retainedFinalRowIndices.map(Number);
  for (let partialRow = 0; partialRow < finalRows.length; partialRow += 1) {
    const ur = Array(proofApi.COLUMNS).fill(0n);
    for (let relationRow = 0; relationRow < proofApi.ROWS; relationRow += 1) {
      const coefficient = U[partialRow * proofApi.ROWS + relationRow];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparse[relationRow])
        ur[column] += coefficient * value;
    }
    const product = Array(proofApi.COLUMNS).fill(0n);
    for (let inner = 0; inner < proofApi.COLUMNS; inner += 1) {
      if (ur[inner] === 0n) continue;
      for (let column = 0; column < proofApi.COLUMNS; column += 1) {
        const value = V[inner * proofApi.COLUMNS + column];
        if (value !== 0n) product[column] += ur[inner] * value;
      }
    }
    const finalRow = finalRows[partialRow];
    assert.deepEqual(product,
      D.slice(finalRow * proofApi.COLUMNS,
        (finalRow + 1) * proofApi.COLUMNS),
      `retained U R V = D row ${finalRow}`);
  }

  assert.deepEqual(proof.diagonalFactors.slice(-3), ["1", "8", "24"]);
  assert.equal(proof.diagonalFactors.length, 799);
  assert.equal(proof.diagonalFactors.map(BigInt)
    .reduce((product, value) => product * value, 1n), 192n);
  assert.equal(proof.material.v.length, 799 * 799);
  assert.equal(proof.material.d.length, 806 * 799);
  assert.equal(proof.material.retainedLeftRows.length, 10 * 806);
  for (const name of ["d", "retainedLeftRows", "v"])
    assert.equal(output.sha256Canonical(proof.material[name]),
      proof.materialSha256[name]);
  assert.equal(proof.status, "missing-left-tail-ancestry");
  assert.deepEqual(proof.missing.finalRowRange, ["0", "795"]);
  assert.equal(proof.missing.coefficients, "641576");
  assert.equal(proof.completed.fullDiagonal, true);
  assert.equal(proof.completed.fullRightTransform, true);
  assert.equal(proof.completed.fullLeftTransform, false);
  assert.equal(proof.completed.fullSmithIdentity, false);

  const changed = Buffer.from(raw); changed[changed.length - 2] ^= 1;
  assert.throws(() => proofApi.buildRow14RawSmithGap(changed));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-raw-smith-gap-check-v1",
    sourceSha256: proof.source.correspondenceResultSha256,
    rawShape: [806, 799], fullRightTransformReconstructed: true,
    fullDiagonalReconstructed: true, retainedLeftRowsReplayed: 10,
    retainedIdentityCellsReplayed: 10 * 799,
    missingLeftRows: 796, missingLeftCoefficients: 641576,
    smallestGap: proof.missing.smallestGap,
    fullSmithIdentityProved: false, sourceMutationRejected: true,
    materialSha256: proof.materialSha256, qualifiedTiming: false,
  })}\n`);
}

main(process.argv[2]);
