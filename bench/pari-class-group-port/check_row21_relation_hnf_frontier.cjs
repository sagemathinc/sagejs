#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

function readOwner(file) {
  const compressed = fs.readFileSync(file);
  assert.equal(fs.statSync(file).mode & 0o777, 0o444);
  const plain = zlib.gunzipSync(compressed);
  return { owner: JSON.parse(plain), ownerSha256: sha(plain) };
}
function sourceRecord(record, index) {
  return {
    entries: record.R.values.map((value, row) => [row, value])
      .filter(([, value]) => value !== "0"),
    sourceNz: String(record.nz),
    metadata: [String(index + 1), String(record.origin), String(record.automorphism)],
    generator: [record.m.value, "0", "0", "0", "0"],
  };
}

async function main() {
  const [factorPath, w0Path] = process.argv.slice(2);
  assert(factorPath && w0Path,
    "usage: check_row21_relation_hnf_frontier.cjs FACTOR_OWNER.json.gz W0.json");
  const factor = readOwner(factorPath);
  const coordinator = require("./row21_relation_hnf_frontier_coordinator.cjs");
  assert.equal(factor.ownerSha256, coordinator.FACTOR_OWNER_SHA256);

  // W0 is deliberately unopened until both authentic publications finish.
  const first = await coordinator.run({ factorOwner: factor.owner,
    factorOwnerSha256: factor.ownerSha256,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-relation-a-")) });
  const second = await coordinator.run({ factorOwner: factor.owner,
    factorOwnerSha256: factor.ownerSha256,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-relation-b-")) });
  assert.equal(first.ownerSha256, second.ownerSha256);
  assert.deepEqual(first.owner, second.owner);
  assert.equal(first.owner.publication.collectedRelations, 5);
  assert.equal(first.owner.publication.targetRelations, 32);
  assert.equal(first.owner.publication.hnfExecuted, false);
  assert.equal(first.owner.provenance.frozenAnswerInputs, false);

  // Frozen data is a postcompute differential oracle only.
  const w0Bytes = fs.readFileSync(w0Path);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const raw = JSON.parse(w0Bytes);
  const initialized = raw.events.find(event => event.event === "initialized");
  assert(initialized);
  assert.deepEqual(first.owner.relations.frontierState.slice(1, 6),
    [initialized.relations, initialized.target, initialized.need,
      initialized.Nrelid, initialized.missing].map(String));
  assert.deepEqual(first.owner.relations.records,
    initialized.relationRecords.map(sourceRecord));

  const mutations = [];
  for (const [label, mutate, pattern] of [
    ["digest", value => { value.factorOwnerSha256 = "0".repeat(64); },
      /Expected values to be strictly equal/],
    ["descriptor", value => { value.factorOwner.factorBase.descriptors[0][1] = "2"; },
      /7784eef|Expected values to be strictly equal/],
  ]) {
    const payload = { factorOwner: structuredClone(factor.owner),
      factorOwnerSha256: factor.ownerSha256,
      outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), `row21-bad-${label}-`)) };
    mutate(payload);
    await assert.rejects(coordinator.run(payload), pattern);
    assert.deepEqual(fs.readdirSync(payload.outputDirectory), []);
    mutations.push(label);
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-relation-hnf-frontier-check-v1",
    ownerSha256: first.ownerSha256,
    compressedSha256: first.compressedSha256,
    factorOwnerSha256: factor.ownerSha256,
    frontierState: first.owner.relations.frontierState,
    relationState: first.owner.relations.relationState,
    exactInitialRelationMatches: initialized.relationRecords.length,
    basisEntries: first.owner.relations.basisEntries.length,
    mutationsRejected: mutations,
    nextBlocker: first.owner.nextBlocker,
    sourceSha256: first.owner.authority.sourceSha256,
    coreSha256: first.owner.authority.coreSha256,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
