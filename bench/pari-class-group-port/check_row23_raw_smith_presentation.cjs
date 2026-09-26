#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const PREPARED = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-23-1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154.json";
const PREPARED_SHA256 =
  "1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

function identity(dimension) {
  return Array.from({ length: dimension }, (_, row) =>
    Array.from({ length: dimension }, (_, column) => row === column ? 1n : 0n));
}
function matrix(values, rows, columns) {
  assert.equal(values.length, rows * columns);
  return Array.from({ length: rows }, (_, row) =>
    values.slice(row * columns, (row + 1) * columns).map(BigInt));
}
function flatten(value) { return value.flat().map(String); }
function swapRows(owner, first, second) {
  [owner[first], owner[second]] = [owner[second], owner[first]];
}
function swapColumns(owner, first, second) {
  for (const row of owner) [row[first], row[second]] = [row[second], row[first]];
}
function pairRows(owner, first, second, s, t, bOver, aOver) {
  const left = owner[first].slice(), right = owner[second].slice();
  owner[first] = left.map((value, index) => s * value + t * right[index]);
  owner[second] = left.map((value, index) =>
    -bOver * value + aOver * right[index]);
}
function pairColumns(owner, first, second, s, t, bOver, aOver) {
  const left = owner.map(row => row[first]);
  const right = owner.map(row => row[second]);
  owner.forEach((row, index) => {
    row[first] = s * left[index] + t * right[index];
    row[second] = -bOver * left[index] + aOver * right[index];
  });
}

function replay(proof) {
  const rows = 40, columns = 31;
  const transformed = matrix(proof.W, rows, columns);
  const left = identity(rows), right = identity(columns);
  let determinantCertificates = 0;
  for (const operation of proof.operations) {
    const [kind, first, second] = operation;
    assert(Number.isInteger(first) && first >= 0);
    if (kind === "row_swap") {
      assert(Number.isInteger(second) && second >= 0 && second < rows);
      swapRows(transformed, first, second); swapRows(left, first, second);
    } else if (kind === "column_swap") {
      assert(Number.isInteger(second) && second >= 0 && second < columns);
      swapColumns(transformed, first, second); swapColumns(right, first, second);
    } else if (kind === "row_pair" || kind === "column_pair") {
      const [s, t, bOver, aOver] = operation.slice(3).map(BigInt);
      assert.equal(s * aOver + t * bOver, 1n,
        "pair operation is not unimodular");
      determinantCertificates += 1;
      if (kind === "row_pair") {
        pairRows(transformed, first, second, s, t, bOver, aOver);
        pairRows(left, first, second, s, t, bOver, aOver);
      } else {
        pairColumns(transformed, first, second, s, t, bOver, aOver);
        pairColumns(right, first, second, s, t, bOver, aOver);
      }
    } else if (kind === "row_add") {
      transformed[first] = transformed[first].map((value, index) =>
        value + transformed[second][index]);
      left[first] = left[first].map((value, index) => value + left[second][index]);
    } else if (kind === "row_negate") {
      transformed[first] = transformed[first].map(value => -value);
      left[first] = left[first].map(value => -value);
    } else assert.fail(`unknown Smith operation ${kind}`);
  }
  assert.deepEqual(flatten(left), proof.U);
  assert.deepEqual(flatten(right), proof.V);
  assert.deepEqual(flatten(transformed), proof.D);
  const diagonal = Array.from({ length: columns }, (_, index) =>
    transformed[index][index]);
  assert(diagonal.every(value => value > 0n));
  for (let index = 0; index + 1 < columns; index += 1)
    assert.equal(diagonal[index + 1] % diagonal[index], 0n);
  transformed.forEach((row, rowIndex) => row.forEach((value, columnIndex) =>
    assert.equal(value, rowIndex === columnIndex ? diagonal[rowIndex] : 0n)));
  assert.deepEqual(diagonal.map(String), proof.diagonal);
  return { determinantCertificates, diagonal };
}

async function main() {
  // The immutable corpus item contains prepared field data only: no relation,
  // class-group, unit, or terminal answer is available to the proof producer.
  assert.equal(sha(fs.readFileSync(PREPARED)), PREPARED_SHA256);
  const authentication = require("./prepared_nf_authentication.cjs");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const hnfHost = require("./row23_first_hnf_host.cjs");
  const smithHost = require("./row23_raw_smith_presentation_host.cjs");
  const prepared = JSON.parse(fs.readFileSync(PREPARED));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    factorCoordinator.PREPARED_SHA256);
  const directory = fs.mkdtempSync("/scratch/sagejs-row23-raw-smith-factor-");
  try {
    const factor = await factorCoordinator.run({ prepared,
      preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
      outputDirectory: directory });
    const live = await hnfHost.runFirstHnf(prepared, factor.owner);
    assert.equal(live.status, 0);
    const result = smithHost.buildFromLiveOwner(live);
    assert.equal(result.proof.schema,
      "sagejs.pari-class-group/row23-raw-smith-presentation-v1");
    assert.deepEqual(result.proof.dimensions, { rows: "40", columns: "31" });
    assert.deepEqual(result.proof.provenance, {
      algorithm: "transformation-tracking-rectangular-smith",
      answerInputs: false,
      input: "same-run-retained-hnf-original-owner",
      layout: "row-major",
    });
    const replayed = replay(result.proof);
    // This comparison happens only after input-derived reduction and replay.
    assert.deepEqual(replayed.diagonal.slice(0, 30), Array(30).fill(1n));
    assert.equal(replayed.diagonal[30], 6n);
    assert.equal(result.sha256, sha(result.raw));

    const changed = structuredClone(result.proof);
    changed.W[0] = String(BigInt(changed.W[0]) + 1n);
    assert.throws(() => replay(changed));
    const changedOperation = structuredClone(result.proof);
    const pair = changedOperation.operations.find(value =>
      value[0] === "row_pair" || value[0] === "column_pair");
    pair[3] = String(BigInt(pair[3]) + 1n);
    assert.throws(() => replay(changedOperation), /not unimodular/);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row23-raw-smith-presentation-check-v1",
      proofSha256: result.sha256, proofBytes: result.raw.length,
      relationShape: [40, 31], uShape: [40, 40], vShape: [31, 31],
      dShape: [40, 31], operationCount: result.proof.operations.length,
      determinantCertificates: replayed.determinantCertificates,
      diagonal: replayed.diagonal.map(String), sameRunOwner: true,
      answerInputs: false, independentlyReplayed: true, mutationsRejected: 2,
      timingClaim: false, qualificationClaim: false,
    })}\n`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
