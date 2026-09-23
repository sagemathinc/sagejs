#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const flint = require("../../packages/flint");
const proofApi = require("./row14_full_raw_smith_ancestry.cjs");
const shape = require("./row14_raw_relation_smith_gap.cjs");

function sparseRows(values, rows, columns) {
  return Array.from({ length: rows }, (_, row) => {
    const answer = [];
    for (let column = 0; column < columns; column += 1) {
      const value = values[row * columns + column];
      if (value !== 0n) answer.push([column, value]);
    }
    return answer;
  });
}

function replayIdentity(U, relation, V, D) {
  const sparseRelation = sparseRows(relation, shape.ROWS, shape.COLUMNS);
  const sparseRight = sparseRows(V, shape.COLUMNS, shape.COLUMNS);
  let checked = 0;
  for (let row = 0; row < shape.ROWS; row += 1) {
    const ur = Array(shape.COLUMNS).fill(0n);
    for (let relationRow = 0; relationRow < shape.ROWS; relationRow += 1) {
      const coefficient = U[row * shape.ROWS + relationRow];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparseRelation[relationRow]) {
        ur[column] += coefficient * value;
      }
    }
    const product = Array(shape.COLUMNS).fill(0n);
    for (let inner = 0; inner < shape.COLUMNS; inner += 1) {
      const coefficient = ur[inner];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparseRight[inner]) {
        product[column] += coefficient * value;
      }
    }
    assert.deepEqual(product,
      D.slice(row * shape.COLUMNS, (row + 1) * shape.COLUMNS),
      `U R V = D row ${row}`);
    checked += shape.COLUMNS;
  }
  return checked;
}

function main(resultPath, ancestryPath) {
  assert(resultPath && ancestryPath,
    "usage: check_row14_full_raw_smith_ancestry.cjs RESULT.json ANCESTRY.json");
  const raw = fs.readFileSync(resultPath);
  const ancestryRaw = fs.readFileSync(ancestryPath);
  const proof = proofApi.buildRow14FullRawSmithAncestry(raw, ancestryRaw);
  const payload = JSON.parse(raw.toString("ascii")).payload;
  const relation = payload.storage.find(owner =>
    owner.name === "raw-relation-records").entries.map(BigInt);
  const U = proof.material.u.map(BigInt);
  const V = proof.material.v.map(BigInt);
  const D = proof.material.d.map(BigInt);
  assert.equal(U.length, shape.ROWS * shape.ROWS);
  assert.equal(V.length, shape.COLUMNS * shape.COLUMNS);
  assert.equal(D.length, shape.ROWS * shape.COLUMNS);

  const identityCells = replayIdentity(U, relation, V, D);
  const detU = flint.matrixDet(flint.zzMatrix(shape.ROWS, shape.ROWS, U));
  const detV = flint.matrixDet(flint.zzMatrix(shape.COLUMNS, shape.COLUMNS, V));
  assert.equal(detU === 1n || detU === -1n, true, "U is not unimodular");
  assert.equal(detV === 1n || detV === -1n, true, "V is not unimodular");
  assert.equal(proof.diagonalFactors.map(BigInt)
    .reduce((product, value) => product * value, 1n), 192n);
  assert.deepEqual(proof.completed, {
    fullDiagonal: true, fullLeftTransform: true,
    fullRightTransform: true, fullSmithIdentity: true,
  });

  const changed = JSON.parse(ancestryRaw);
  changed.rawToTerminal[0] = String(BigInt(changed.rawToTerminal[0]) + 1n);
  const changedProof = proofApi.buildRow14FullRawSmithAncestry(raw, changed);
  const changedU = changedProof.material.u.map(BigInt);
  assert.throws(() => replayIdentity(changedU, relation, V, D));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-full-raw-smith-ancestry-check-v1",
    rawShape: [shape.ROWS, shape.COLUMNS],
    exactIdentityCells: identityCells,
    determinantU: detU.toString(), determinantV: detV.toString(),
    classNumber: proof.classNumber, invariantFactors: proof.invariantFactors,
    sourceMutationRejected: true, materialSha256: proof.materialSha256,
    source: proof.source, fullSmithIdentityProved: true,
    qualifiedTiming: false,
  })}\n`);
}

main(process.argv[2], process.argv[3]);
