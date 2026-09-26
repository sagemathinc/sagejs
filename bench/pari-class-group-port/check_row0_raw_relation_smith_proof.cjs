#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const proofModule = require("./row0_raw_relation_smith_proof.cjs");
const sha = values => crypto.createHash("sha256")
  .update(values.join("\n")).digest("hex");

function matrix(values, rows, columns) {
  assert.equal(values.length, rows * columns);
  return Array.from({ length: rows }, (_, row) =>
    values.slice(row * columns, (row + 1) * columns).map(BigInt));
}
function transpose(value) {
  return Array.from({ length: value[0].length }, (_, column) =>
    value.map(row => row[column]));
}
function multiply(left, right) {
  const columns = transpose(right);
  return left.map(row => columns.map(column =>
    row.reduce((sum, value, index) => sum + value * column[index], 0n)));
}
function flatten(value) { return value.flat().map(String); }
function determinantBareiss(source) {
  const matrix = source.map(row => row.slice());
  const size = matrix.length;
  let sign = 1n, previous = 1n;
  for (let pivot = 0; pivot + 1 < size; pivot += 1) {
    let selected = pivot;
    while (selected < size && matrix[selected][pivot] === 0n) selected += 1;
    assert(selected < size, "transform is singular");
    if (selected !== pivot) {
      [matrix[pivot], matrix[selected]] = [matrix[selected], matrix[pivot]];
      sign = -sign;
    }
    const divisor = matrix[pivot][pivot];
    for (let row = pivot + 1; row < size; row += 1) {
      for (let column = pivot + 1; column < size; column += 1) {
        const numerator = matrix[row][column] * divisor -
          matrix[row][pivot] * matrix[pivot][column];
        assert.equal(numerator % previous, 0n, "nonexact Bareiss division");
        matrix[row][column] = numerator / previous;
      }
      matrix[row][pivot] = 0n;
    }
    previous = divisor;
  }
  return sign * matrix[size - 1][size - 1];
}

function main(filename) {
  assert(filename,
    "usage: check_row0_raw_relation_smith_proof.cjs ROW0_OWNER_CAPTURE.json");
  const capture = JSON.parse(fs.readFileSync(filename));
  assert.equal(capture.honestyInput.relation_state[0], "73");
  const owners = capture.copiedOwners;
  const proof = proofModule.buildRow0RawRelationSmithProof(owners);
  assert.equal(proof.schema, proofModule.SCHEMA);
  assert.deepEqual(proof.dimensions, {
    d: ["73", "66"], r: ["73", "66"], u: ["73", "73"], v: ["66", "66"],
  });
  assert.deepEqual(proof.provenance, {
    algorithm: "retained-cleanup-and-active-hnf-transform-expansion",
    answerInputs: false,
    input: "same-run-retained-raw-relation-and-hnf-ancestry",
  });
  assert.equal(proof.source.relationMatrixSha256, sha(owners.relation_records));
  assert.equal(proof.source.cleanupTransformSha256, sha(owners.hnf_transform));
  assert.equal(proof.source.activeHnfTransformSha256,
    sha(owners.hnf_hnf_transform));
  assert.equal(proof.source.fullHnfSha256, sha(owners.hnf_full_h));

  // The relation owner is column-major 66-by-73, exactly row-major after
  // transposition to the claimed 73-by-66 R.
  const relation = matrix(owners.relation_records, 73, 66);
  const left = matrix(proof.material.u, 73, 73);
  const right = matrix(proof.material.v, 66, 66);
  const diagonal = matrix(proof.material.d, 73, 66);
  assert.deepEqual(flatten(multiply(multiply(left, relation), right)),
    flatten(diagonal), "independent U R V replay failed");
  diagonal.forEach((row, rowIndex) => row.forEach((value, columnIndex) =>
    assert.equal(value, rowIndex === columnIndex ? 1n : 0n)));
  assert.deepEqual(proof.diagonalFactors, Array(66).fill("1"));
  assert.equal(proof.classNumber, "1");
  assert.deepEqual(proof.invariantFactors, []);

  // Independent fraction-free determinants certify that the two published
  // transformations are unimodular, not merely matrices satisfying one
  // product identity on this input.
  const leftDeterminant = determinantBareiss(left);
  const rightDeterminant = determinantBareiss(right);
  assert.equal(leftDeterminant * leftDeterminant, 1n);
  assert.equal(rightDeterminant * rightDeterminant, 1n);
  assert.equal(proof.materialSha256.u, sha(proof.material.u));
  assert.equal(proof.materialSha256.v, sha(proof.material.v));
  assert.equal(proof.materialSha256.d, sha(proof.material.d));

  const changed = structuredClone(proof);
  changed.material.u[0] = String(BigInt(changed.material.u[0]) + 1n);
  assert.notDeepEqual(flatten(multiply(multiply(
    matrix(changed.material.u, 73, 73), relation), right)), flatten(diagonal));
  const changedOwner = structuredClone(owners);
  changedOwner.hnf_full_h[0] = String(BigInt(changedOwner.hnf_full_h[0]) + 1n);
  assert.throws(() => proofModule.buildRow0RawRelationSmithProof(changedOwner),
    proofModule.Row0RawSmithFailure);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-raw-relation-smith-proof-check-v1",
    relationShape: [73, 66], uShape: [73, 73], vShape: [66, 66],
    dShape: [73, 66], identity: "U R V = D",
    leftDeterminant: String(leftDeterminant),
    rightDeterminant: String(rightDeterminant),
    factorOrder: proof.ancestry.factorOrder,
    activeFactorRows: proof.ancestry.activeFactorRows,
    exactIndependentReplay: true, transformsUnimodular: true,
    sameRunRetainedAncestry: true, answerInputs: false,
    classNumber: proof.classNumber, invariantFactors: proof.invariantFactors,
    mutationsRejected: 2, timingClaim: false, qualificationClaim: false,
  })}\n`);
}

main(process.argv[2]);
