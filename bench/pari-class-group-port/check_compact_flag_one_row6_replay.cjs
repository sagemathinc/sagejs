#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const neutral = require("./class_unit_correspondence_result.cjs");
const replay = require("./compact_flag_one_row6_replay.cjs");

const PROGRAM = path.join(__dirname, "compact_flag_one_row6_replay.cjs");
const DEFAULT_OWNER = path.join("/tmp", "sagejs-row6-prepared-complete-owner",
  `row6-prepared-complete-${replay.ENVELOPE_SHA256}.json`);
const OWNER = process.env.ROW6_COMPACT_FLAG_ONE_OWNER || DEFAULT_OWNER;

assert.ok(fs.existsSync(OWNER), `missing retained row 6 owner: ${OWNER}`);
const first = replay.executeRow6CompactReplay({ owner: OWNER });
const second = replay.executeRow6CompactReplay({ owner: OWNER });
assert.deepEqual(first, second);
assert.equal(first.schema, replay.RECEIPT_SCHEMA);
assert.deepEqual(first.execution, { compactReplayExecuted: true,
  pariFlagOneCallExecuted: false, eagerExpansionExecuted: false,
  exactFieldUnitMaterializationExecuted: false, measurements: [] });
assert.deepEqual(first.replay.compactTransformShape, [7, 2]);
assert.deepEqual(first.replay.factoredTransformShape, [1137, 2]);
assert.deepEqual(first.replay.relationMatrixShape, [1130, 1137]);
assert.equal(first.replay.exactZeroProductsChecked, 2260);
assert.equal(first.replay.maximumCompactAbsolute, "289737766830681");
assert.deepEqual(first.replay.unitNorms, ["-1", "-1"]);

const cli = spawnSync(process.execPath, [PROGRAM, "--owner", OWNER], {
  encoding: "utf8", timeout: 120_000,
});
assert.equal(cli.status, 0, cli.stderr);
assert.deepEqual(JSON.parse(cli.stdout), first);
const forbidden = spawnSync(process.execPath,
  [PROGRAM, "--owner", OWNER, "--run", "true"], { encoding: "utf8" });
assert.notEqual(forbidden.status, 0);
assert.match(forbidden.stderr, /usage:/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-compact-replay-"));
try {
  const mutable = path.join(temporary, "mutable.json");
  fs.copyFileSync(OWNER, mutable);
  fs.chmodSync(mutable, 0o644);
  assert.throws(() => replay.executeRow6CompactReplay({ owner: mutable }),
    /immutable mode-0444/);
  const changed = path.join(temporary, "changed.json");
  const changedBytes = fs.readFileSync(OWNER);
  changedBytes[changedBytes.length - 2] ^= 1;
  fs.writeFileSync(changed, changedBytes, { mode: 0o444 });
  assert.throws(() => replay.executeRow6CompactReplay({ owner: changed }),
    /digest changed/);

  const envelopeRaw = fs.readFileSync(OWNER);
  const envelope = JSON.parse(envelopeRaw.toString("ascii"));
  assert.ok(neutral.canonical(envelope).equals(envelopeRaw));
  const factored = structuredClone(envelope.payload);
  factored.storage.find(owner => owner.name === "factored-unit-transform").entries[0] = "1";
  assert.throws(() => replay.replayCompactPayload(factored), /factored transform replay failed/);
  const records = structuredClone(envelope.payload);
  const recordOwner = records.storage.find(owner => owner.name === "raw-relation-records");
  const factoredOwner = records.storage.find(owner => owner.name === "factored-unit-transform");
  const nonzeroRelation = factoredOwner.entries.findIndex(entry => entry !== "0");
  recordOwner.entries[nonzeroRelation * 1130] =
    String(BigInt(recordOwner.entries[nonzeroRelation * 1130]) + 1n);
  assert.throws(() => replay.replayCompactPayload(records), /does not annihilate row/);
  const eager = structuredClone(envelope.payload);
  eager.storage.push({ capacity: "1", encoding: "canonical-decimal-integer",
    entries: ["1"], logicalLength: "1", name: "exact-unit-coordinates", role: "test" });
  assert.throws(() => replay.replayCompactPayload(eager), /eager unit materialization/);
  const materialized = structuredClone(envelope.payload);
  materialized.unitGroup.materialization = { tag: "exact_units", owner: "anything" };
  assert.throws(() => replay.replayCompactPayload(materialized), /compact unit result changed/);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.pari-class-group/compact-flag-one-row6-replay-check-v1",
  owner: OWNER,
  envelopeSha256: replay.ENVELOPE_SHA256,
  repeatedReplay: true,
  cliReplay: true,
  exactZeroProductsChecked: first.replay.exactZeroProductsChecked,
  eagerExpansionExecuted: false,
  mutationsRejected: 6,
})}\n`);
