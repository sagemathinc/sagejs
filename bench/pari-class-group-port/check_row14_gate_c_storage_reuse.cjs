#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gate = require("./row14_prepared_gate_c_host.cjs");
const buffers = require("../../tools/native-kernel/thin-cache-loader.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "hnfadd.py");
const ROWS = 799, PLACES = 3;

function signature() {
  const text = fs.readFileSync(SOURCE, "utf8");
  const match = text.match(/def pari_hnfadd\(([\s\S]*?)\n\)/);
  assert(match);
  return match[1].trim().split("\n").map(line =>
    line.trim().replace(/,$/, "").split(": "));
}

function api() {
  return { names: signature(), fn: {
    createIntegerBuffer: buffers.createIntegerBuffer,
    createInt64Buffer: buffers.createInt64Buffer,
  } };
}

function sequence(length, salt, wide = false) {
  return Array.from({ length }, (_, index) => {
    let value = BigInt((index*17 + salt) % 97 - 48);
    if (wide && index % 31 === 0) value *= (1n << 80n) + 19n;
    return value;
  });
}

function inputs(state, newColumns) {
  const hRows = state[0], bColumns = state[2], totalColumns = state[7];
  const lig = ROWS-bColumns, depRows = lig-hRows;
  return {
    h: sequence(hRows*hRows, 1, true), dep: sequence(depRows*hRows, 2, true),
    b: sequence(lig*bColumns, 3, true), logs: sequence(7*PLACES*totalColumns, 4, true),
    perm: Array.from({ length: ROWS }, (_, index) => BigInt(index+1)),
    new_relations: sequence(ROWS*newColumns, 5),
    new_logs: sequence(7*PLACES*newColumns, 6, true),
  };
}

function expectPrefix(owner, expected) {
  const actual = owner.toArray ? owner.toArray() : Array.from(owner);
  assert.deepEqual(actual.slice(0, expected.length), expected);
  assert(actual.slice(expected.length).every(value => value === 0n));
}

function rejects(action, pattern) {
  assert.throws(action, pattern);
  return 1;
}

function main() {
  assert.equal(process.cwd(), ROOT);
  const append = api();
  const storage = gate.createHnfaddTransactionStorage(append);
  assert.equal(storage.ownerConstructions, 39);
  assert.equal(storage.integerBuffers, 32);
  assert.equal(storage.int64Buffers, 7);
  assert.equal(storage.elements, 110205);
  assert.equal(storage.bytes, 14146540);

  let transactions = 0;
  for (const shape of gate.APPEND_SHAPES) {
    // Poison both physical representations.  A transaction reset must make
    // every non-input logical value zero without constructing a zero Array.
    for (const [name, owner] of Object.entries(storage.values)) {
      if (typeof owner === "bigint") continue;
      if (owner instanceof BigInt64Array) owner.fill(91n);
      else {
        owner.sizes.fill(1);
        for (let index = 0; index < owner.length; index += 1)
          owner.limbs[index*owner.wordCapacity] = 91n;
      }
      assert(name.length > 0);
    }
    const explicit = inputs(shape.oldState, shape.newColumns);
    const prepared = gate.prepareHnfaddTransaction(storage, append,
      shape.oldState, shape.newColumns, explicit);
    for (const [name, expected] of Object.entries(explicit))
      expectPrefix(prepared.values[name], expected);
    for (const [name, owner] of Object.entries(prepared.values)) {
      if (Object.hasOwn(explicit, name) || typeof owner === "bigint") continue;
      const actual = owner.toArray ? owner.toArray() : Array.from(owner);
      assert(actual.every(value => value === 0n), `${name} retained stale logical data`);
    }
    transactions += 1;
  }
  assert.equal(storage.resets, 3);

  let rejectedMutations = 0;
  const first = gate.APPEND_SHAPES[0], valid = inputs(first.oldState, first.newColumns);
  rejectedMutations += rejects(() => gate.prepareHnfaddTransaction(
    gate.createHnfaddTransactionStorage(append), append,
    [...first.oldState.slice(0, 8), 1], first.newColumns, valid), /unreviewed/);
  rejectedMutations += rejects(() => gate.prepareHnfaddTransaction(
    gate.createHnfaddTransactionStorage(append), append,
    first.oldState, 1, valid), /unreviewed/);
  for (const name of ["h", "dep", "b", "logs", "perm", "new_relations", "new_logs"]) {
    const mutation = { ...valid, [name]: valid[name].slice(1) };
    rejectedMutations += rejects(() => gate.prepareHnfaddTransaction(
      gate.createHnfaddTransactionStorage(append), append,
      first.oldState, first.newColumns, mutation), /noncanonical logical prefix/);
  }
  const shortStorage = gate.createHnfaddTransactionStorage(append);
  shortStorage.capacities = { ...shortStorage.capacities, result_c: 1 };
  rejectedMutations += rejects(() => gate.prepareHnfaddTransaction(shortStorage,
    append, first.oldState, first.newColumns, valid), /short reusable capacity/);
  const wideInt64 = { ...valid, new_relations: valid.new_relations.slice() };
  wideInt64.new_relations[0] = 1n << 63n;
  rejectedMutations += rejects(() => gate.prepareHnfaddTransaction(
    gate.createHnfaddTransactionStorage(append), append,
    first.oldState, first.newColumns, wideInt64), /outside signed int64/);

  const cv = {
    search_ideals: buffers.createIntegerBuffer(ROWS, 1),
    outer_perm: buffers.createIntegerBuffer(ROWS, 1),
    relation_state: buffers.createIntegerBuffer(6, 1),
    log_completed: buffers.createIntegerBuffer(1, 1),
    outer_state: buffers.createInt64Buffer(19), schedule: buffers.createInt64Buffer(4),
  };
  const control = gate.createContinuationControlStorage(append, cv);
  assert.equal(control.ownerConstructions, 2);
  assert.strictEqual(control.search, cv.search_ideals);
  assert.strictEqual(control.outerPerm, cv.outer_perm);
  assert.strictEqual(control.outer, cv.outer_state);
  assert.strictEqual(control.cache, cv.relation_state);
  assert.strictEqual(control.schedule, cv.schedule);
  assert.strictEqual(control.completed, cv.log_completed);
  const badCv = { ...cv, relation_state: buffers.createIntegerBuffer(5, 1) };
  rejectedMutations += rejects(() =>
    gate.createContinuationControlStorage(append, badCv), /5 !== 6/);

  const legacyOwnerConstructions = 7*14 + 3*39;
  const reusedOwnerConstructions = control.ownerConstructions + storage.ownerConstructions;
  assert.equal(legacyOwnerConstructions, 215);
  assert.equal(reusedOwnerConstructions, 41);
  assert.equal(rejectedMutations, 12);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row14-gate-c-storage-reuse-check-v1",
    authenticatedShapes: gate.APPEND_SHAPES,
    hnfaddTransactions: transactions,
    storage: { elements: storage.elements, bytes: storage.bytes,
      integerBuffers: storage.integerBuffers, int64Buffers: storage.int64Buffers },
    allocationCounts: { legacyOwnerConstructions, reusedOwnerConstructions,
      removedOwnerConstructions: legacyOwnerConstructions-reusedOwnerConstructions,
      legacyZeroArrays: 96, reusedZeroArrays: 0 },
    exactPrefixReplay: true, staleLogicalStateRejected: true,
    rejectedMutations,
  }, null, 2));
}

main();
