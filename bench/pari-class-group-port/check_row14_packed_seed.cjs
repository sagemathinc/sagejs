#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const CAPSULE_SHA256 = "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const ROWS = 799, DEGREE = 4, TARGET = 806, CAPACITY = 8110;
const ADDITIONAL = TARGET - ROWS;
const OUTER_NRELID = 4;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function capsule(directory) {
  const run = spawnSync(process.execPath, [
    path.join(__dirname, "row14_initial_capsule_coordinator.cjs"),
    "--pristine-w0", W0, "--pristine-sha256", W0_SHA256,
    "--output-dir", directory,
  ], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.sha256, CAPSULE_SHA256);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha(bytes), CAPSULE_SHA256);
  return JSON.parse(zlib.gunzipSync(bytes));
}

function sparse(value) {
  const offsets = [0n], indices = [], values = [], multipliers = [], sourceNz = [];
  for (const relation of value.initialRelations) {
    assert(relation.entries.length > 0);
    for (const [index, entry] of relation.entries) {
      indices.push(BigInt(index)); values.push(BigInt(entry));
    }
    offsets.push(BigInt(indices.length));
    multipliers.push(BigInt(relation.multiplier));
    sourceNz.push(BigInt(relation.entries[0][0] + 1));
  }
  return { offsets, indices, values, multipliers, sourceNz };
}

function owners(fn) {
  const exact = (length, words = 1) => fn.createIntegerBuffer(length, words);
  return {
    state: exact(6), basis: exact(ROWS * ROWS), records: exact(ROWS * CAPACITY),
    hashes: exact(CAPACITY), metadata: exact(3 * CAPACITY), relation: exact(ROWS),
    scratch: exact(ROWS), generators: exact(DEGREE * CAPACITY),
  };
}

function invoke(fn, backend, packed, owner) {
  return fn[backend](BigInt(ROWS), BigInt(DEGREE), 7n, BigInt(TARGET),
    packed.offsets, packed.indices, packed.values, packed.multipliers, packed.sourceNz,
    owner.state, owner.basis, owner.records, owner.hashes, owner.metadata,
    owner.relation, owner.scratch, owner.generators);
}

function densePrefix(value) {
  const out = Array(ROWS * value.initialRelations.length).fill(0n);
  value.initialRelations.forEach((relation, column) => relation.entries.forEach(
    ([row, entry]) => { out[column * ROWS + row] = BigInt(entry); }));
  return out;
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-packed-seed-"));
  try {
    const value = capsule(temporary);
    assert.equal(value.schema, "sagejs.pari-class-group/row14-initial-capsule-v1");
    assert.equal(value.factorBaseDescriptors.length, ROWS);
    assert.equal(value.initialRelations.length, 42);
    assert.equal(value.capacityEvidence.liveTarget, TARGET);
    assert.equal(value.capacityEvidence.recordReserve, CAPACITY);
    // These are different upstream state machines: relation_state[3] stores
    // target - rows (7), while outer_state[1] stores Nrelid (4).
    assert.equal(ADDITIONAL, 7);
    assert.equal(OUTER_NRELID, 4);
    assert.notEqual(ADDITIONAL, OUTER_NRELID);
    const packed = sparse(value), expected = densePrefix(value);
    const built = await compileKernel({
      sourcePath: path.join(__dirname, "row14_initial_relation_seed.py"),
    });
    const module = require(built.modulePath);
    const fn = module.pari_seed_sparse_owned_relations;
    const seedCount = module.pari_connected_relation_seed_count;
    assert.equal(seedCount.gmp(BigInt(ROWS), 7n, BigInt(TARGET),
      fn.createIntegerBuffer(6, 1)), 0n, "fresh cache rejected");
    const results = [];
    for (const backend of ["gmp", "tagged"]) {
      const owner = owners(fn);
      assert.equal(invoke(fn, backend, packed, owner), 42n);
      assert.deepEqual(owner.state.toArray().map(String),
        ["42", "8110", "757", "7", "0", "806"]);
      assert.equal(seedCount[backend](BigInt(ROWS), 7n, BigInt(TARGET), owner.state), 42n);
      assert.deepEqual(owner.records.toArray().slice(0, expected.length), expected);
      assert.deepEqual(owner.generators.toArray().slice(0, 42 * DEGREE),
        value.initialRelations.flatMap(relation =>
          [BigInt(relation.multiplier), 0n, 0n, 0n]));
      assert.equal(owner.records.wordCapacity, 1);
      assert.equal(owner.records.sizes.byteLength + owner.records.limbs.byteLength,
        12 * ROWS * CAPACITY);
      assert(owner.records.sizes.every(size => Math.abs(size) <= 1));
      results.push({ backend, relationRecordsBytes:
        owner.records.sizes.byteLength + owner.records.limbs.byteLength });
    }

    const short = owners(fn);
    short.records = fn.createIntegerBuffer(ROWS * CAPACITY - 1, 1);
    const snapshots = [short.state, short.basis, short.hashes, short.metadata,
      short.relation, short.scratch, short.generators].map(owner => owner.toArray());
    assert.throws(() => invoke(fn, "gmp", packed, short), /invalid sparse relation seed owners/);
    [short.state, short.basis, short.hashes, short.metadata, short.relation,
      short.scratch, short.generators].forEach((owner, index) =>
      assert.deepEqual(owner.toArray(), snapshots[index]));

    const changed = sparse(value); changed.sourceNz[0] += 1n;
    assert.throws(() => invoke(fn, "gmp", changed, owners(fn)), /nz changed/);
    for (const badState of [[42n, 8109n, 757n, 7n, 0n, 806n],
      [42n, 8110n, 757n, 7n, 1n, 806n], [806n, 8110n, 0n, 0n, 0n, 806n]]) {
      const bad = fn.createIntegerBuffer(6, 1, badState);
      assert.throws(() => seedCount.gmp(BigInt(ROWS), 7n, BigInt(TARGET), bad),
        /invalid connected preseeded relation cache/);
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row14-packed-seed-check-v1",
      capsuleSha256: CAPSULE_SHA256, relations: 42, target: TARGET,
      state: [42, CAPACITY, 757, ADDITIONAL, 0, TARGET],
      outerNrelid: OUTER_NRELID, results,
      freshCacheAccepted: true, malformedPreseedsRejected: 3,
      oneSlotShortRejected: true, mutationRejected: true,
      coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
