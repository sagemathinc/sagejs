#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const proofApi = require("./row19_raw_relation_smith_proof.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

function decoded(payload, name) {
  const owner = payload.storage.find(candidate => candidate.name === name);
  return JSON.parse(Buffer.from(owner.entries.map(Number)).toString("ascii"));
}

function main(filename) {
  assert(filename, "usage: check_row19_raw_relation_smith_proof.cjs RESULT.json");
  const raw = fs.readFileSync(filename);
  const envelope = JSON.parse(raw.toString("ascii"));
  const payload = envelope.payload;
  const proof = proofApi.buildRow19RawRelationSmithProof(raw);
  const R = payload.storage.find(owner => owner.name === "relation-records")
    .entries.map(BigInt);
  const Tt = payload.storage.find(owner => owner.name === "principal-relation-transform")
    .entries.map(BigInt);
  const terminal = decoded(payload, "terminal-hnf-state");
  const permutation = terminal.perm.map(value => Number(value) - 1);
  const expectedW = terminal.W.map(BigInt), expectedB = terminal.B.map(BigInt);

  // Independently replay T^t R P^t.  Raw relation rows are sparse, so this is
  // exact without paying for a misleading cubic dense multiplication.
  const sparse = Array.from({ length: proofApi.ROWS }, (_, relation) => {
    const answer = [];
    for (let column = 0; column < proofApi.COLUMNS; column += 1) {
      const value = R[relation * proofApi.COLUMNS + column];
      if (value !== 0n) answer.push([column, value]);
    }
    return answer;
  });
  const logical = Array(proofApi.ROWS * proofApi.COLUMNS).fill(0n);
  for (let row = 0; row < proofApi.ROWS; row += 1) {
    for (let relation = 0; relation < proofApi.ROWS; relation += 1) {
      const coefficient = Tt[row * proofApi.ROWS + relation];
      if (coefficient === 0n) continue;
      for (const [rawColumn, value] of sparse[relation]) {
        const logicalColumn = permutation.indexOf(rawColumn);
        logical[row * proofApi.COLUMNS + logicalColumn] += coefficient * value;
      }
    }
  }
  for (let row = 0; row < proofApi.ROWS; row += 1) {
    for (let column = 0; column < proofApi.COLUMNS; column += 1) {
      let expected = 0n;
      if (row >= proofApi.KERNEL && row < proofApi.KERNEL + proofApi.CLASS &&
          column < proofApi.CLASS)
        expected = expectedW[(row - proofApi.KERNEL) * proofApi.CLASS + column];
      else if (row >= proofApi.KERNEL + proofApi.CLASS) {
        const tail = row - proofApi.KERNEL - proofApi.CLASS;
        if (column < proofApi.CLASS)
          expected = expectedB[tail * proofApi.CLASS + column];
        else if (column - proofApi.CLASS === tail) expected = 1n;
      }
      assert.equal(logical[row * proofApi.COLUMNS + column], expected,
        `retained ancestry cell ${row},${column}`);
    }
  }

  // Replay the small exact Smith identity used in the expansion.  The block
  // formulas in the producer then clear every B cell and permute [D,I,0] to
  // the normalized full diagonal represented by the emitted matrices.
  const presentation = decoded(payload, "class-presentation");
  const m = name => presentation.matrices[name].map(BigInt);
  const multiply = (a, b) => Array.from({ length: 81 }, (_, flat) => {
    const row = Math.floor(flat / 9), column = flat % 9;
    let value = 0n;
    for (let inner = 0; inner < 9; inner += 1)
      value += a[row * 9 + inner] * b[inner * 9 + column];
    return value;
  });
  // Stored matrices are column-major. Their flat arrays denote transposes in
  // this row-major replay, so Vflat * Wflat * Uflat = Dflat.
  assert.deepEqual(multiply(multiply(m("V"), presentation.terminalW.map(BigInt)),
    m("U")), m("D"));
  assert.equal(proof.material.u.length, 430 * 430);
  assert.equal(proof.material.v.length, 424 * 424);
  assert.equal(proof.material.d.length, 430 * 424);
  assert.equal(proof.diagonalFactors.slice(0, 415).every(value => value === "1"), true);
  assert.deepEqual(proof.diagonalFactors.slice(415),
    ["3", "3", "3", "3", "3", "3", "3", "3", "6"]);
  assert.equal(proof.diagonalFactors.map(BigInt)
    .reduce((product, value) => product * value, 1n), 39366n);
  for (const name of ["d", "u", "v"])
    assert.equal(output.sha256Canonical(proof.material[name]), proof.materialSha256[name]);

  // Finally multiply the emitted full-size matrices themselves. U*R is very
  // sparse after the retained HNF ancestry, so exact sparse multiplication by
  // V checks all 430*424 cells without a cubic dense detour.
  const fullU = proof.material.u.map(BigInt);
  const fullV = proof.material.v.map(BigInt);
  const fullD = proof.material.d.map(BigInt);
  for (let row = 0; row < proofApi.ROWS; row += 1) {
    const ur = Array(proofApi.COLUMNS).fill(0n);
    for (let relation = 0; relation < proofApi.ROWS; relation += 1) {
      const coefficient = fullU[row * proofApi.ROWS + relation];
      if (coefficient === 0n) continue;
      for (const [column, value] of sparse[relation]) ur[column] += coefficient * value;
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
      `full Smith product row ${row}`);
  }

  const changed = Buffer.from(raw); changed[changed.length - 2] ^= 1;
  assert.throws(() => proofApi.buildRow19RawRelationSmithProof(changed));
  process.stdout.write(`${JSON.stringify({ schema:
    "sagejs.pari-class-group/row19-raw-relation-smith-proof-check-v1",
  sourceSha256: proof.source.correspondenceResultSha256,
  rawShape: [430, 424], leftShape: [430, 430], rightShape: [424, 424],
  retainedAncestryReplayed: true, smallSmithIdentityReplayed: true,
  fullBlockSmithIdentityProved: true, emittedFullIdentityReplayed: true,
  classNumber: "39366",
  invariantFactors: proof.invariantFactors, materialSha256: proof.materialSha256,
  sourceMutationRejected: true, qualifiedTiming: false })}\n`);
}

main(process.argv[2]);
