"use strict";

// Authenticated row-23 factor owner -> initial rational-relation transaction.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const SOURCE = path.join(HERE, "row23_relation_hnf_frontier.py");
const FACTOR_SCHEMA = "sagejs.pari-class-group/row23-prepared-factor-base-v1";
const FACTOR_OWNER_SHA256 =
  "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439";
const SCHEMA = "sagejs.pari-class-group/row23-initial-relation-frontier-v1";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);

function packedAt(buffer, index) {
  const signedWords = buffer.sizes[index];
  let value = 0n;
  for (let word = Math.abs(signedWords) - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}
function packedSlice(buffer, start, end) {
  return Array.from({ length: end - start }, (_, i) => String(packedAt(buffer, start + i)));
}
function sparse(buffer, rows, columns) {
  const entries = [];
  for (let column = 0; column < columns; column += 1)
    for (let row = 0; row < rows; row += 1) {
      const value = packedAt(buffer, column * rows + row);
      if (value !== 0n) entries.push([column, row, String(value)]);
    }
  return entries;
}
function authenticateFactorOwner(owner) {
  assert.equal(owner.schema, FACTOR_SCHEMA);
  assert.equal(sha(Buffer.from(`${canonical(owner)}\n`)), FACTOR_OWNER_SHA256);
  assert.equal(owner.provenance.frozenAnswerInputs, false);
  assert.equal(owner.bounds.KC, "31");
  assert.equal(owner.bounds.KCZ, "20");
  assert.equal(owner.factorBase.descriptors.length, 31);
  assert.equal(owner.factorBase.ideals.length, 31);
}
function relationInputs(owner) {
  const primes = owner.factorBase.rationalPrimes.map(Number);
  const descriptors = owner.factorBase.descriptors;
  const offsets = [], counts = [], complete = [], ramification = [];
  let cursor = 0;
  for (const prime of primes) {
    const start = cursor;
    let localDegree = 0;
    while (cursor < descriptors.length && Number(descriptors[cursor][0]) === prime) {
      const e = Number(descriptors[cursor][1]), f = Number(descriptors[cursor][2]);
      ramification.push(e); localDegree += e * f; cursor += 1;
    }
    assert(cursor > start, `factor owner has an empty group at ${prime}`);
    offsets.push(start); counts.push(cursor - start);
    complete.push(localDegree === 5 ? 1 : 0);
  }
  assert.equal(cursor, 31);
  return { primes, offsets, counts, complete, ramification };
}

async function run(payload) {
  assert(payload && typeof payload === "object");
  assert.deepEqual(Object.keys(payload).sort(), ["factorOwner", "factorOwnerSha256"]);
  assert.equal(payload.factorOwnerSha256, FACTOR_OWNER_SHA256);
  authenticateFactorOwner(payload.factorOwner);
  const input = relationInputs(payload.factorOwner);
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_row23_initial_relation_frontier;
  assert.equal(fn.nativeAvailable, true);
  const buffer = (length, words = 2, values) =>
    fn.createIntegerBuffer(length, words, values?.map(BigInt));
  const rows = 31, degree = 5, target = 40, capacity = 450;
  const owners = {
    rational_primes: buffer(20, 2, input.primes),
    group_offsets: buffer(20, 2, input.offsets),
    group_counts: buffer(20, 2, input.counts),
    group_complete: buffer(20, 2, input.complete),
    ramification: buffer(rows, 2, input.ramification),
    relation_state: buffer(6), relation_basis: buffer(rows * rows),
    relation_records: buffer(capacity * rows), relation_hashes: buffer(capacity),
    relation_metadata: buffer(capacity * 3), relation: buffer(rows),
    relation_scratch: buffer(rows), relation_generators: buffer(capacity * degree),
    frontier_state: buffer(10),
  };
  const count = Number(fn.gmp(...Object.values(owners)));
  const records = Array.from({ length: count }, (_, column) => ({
    entries: Array.from({ length: rows }, (_, row) =>
      [row, String(packedAt(owners.relation_records, column * rows + row))])
      .filter(([, value]) => value !== "0"),
    sourceNz: String(packedAt(owners.relation_hashes, column)),
    metadata: packedSlice(owners.relation_metadata, 3 * column, 3 * column + 3),
    generator: packedSlice(owners.relation_generators,
      degree * column, degree * column + degree),
  }));
  return {
    schema: SCHEMA,
    authority: { factorOwnerSha256: FACTOR_OWNER_SHA256,
      sourceSha256: sha(fs.readFileSync(SOURCE)),
      coreSha256: sha(fs.readFileSync(built.coreSourcePath)) },
    factor: { rows, groups: 20, rationalPrimes: input.primes.map(String),
      groupOffsets: input.offsets.map(String), groupCounts: input.counts.map(String),
      groupComplete: input.complete.map(String), ramification: input.ramification.map(String),
      livePermutation: payload.factorOwner.factorBase.permutation },
    relations: { frontierState: packedSlice(owners.frontier_state, 0, 10),
      relationState: packedSlice(owners.relation_state, 0, 6),
      basisEntries: sparse(owners.relation_basis, rows, rows), records },
    publication: { initialRelationsComplete: true, collectedRelations: count,
      targetRelations: target, hnfExecuted: false },
    nextBlocker: { source: "unreduced_small_norm.py",
      condition: "degree-five corridor is fixed to the row-21 24-ideal shape",
      requestedShape: { rows: 31, groups: 20, target: 40 } },
    provenance: { frozenAnswerInputs: false,
      accepted: ["authenticated immutable row23 factor-base owner"],
      forbidden: ["W0 column maps", "W0 relation rows", "W0 HNF state"] },
  };
}

module.exports = { FACTOR_OWNER_SHA256, SCHEMA, authenticateFactorOwner, relationInputs, run };
