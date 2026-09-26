#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const HERE = __dirname;
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const coordinator = require("./row23_relation_hnf_frontier_coordinator.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const outputDirectory = fs.mkdtempSync("/scratch/sagejs-row23-relation-factor-");
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256, outputDirectory });
  assert.equal(factor.ownerSha256, coordinator.FACTOR_OWNER_SHA256);
  const payload = { factorOwner: factor.owner, factorOwnerSha256: factor.ownerSha256 };
  const first = await coordinator.run(payload);
  const second = await coordinator.run(payload);
  assert.deepEqual(first, second);
  assert.equal(first.schema, coordinator.SCHEMA);
  assert.equal(first.provenance.frozenAnswerInputs, false);
  assert.deepEqual(first.relations.frontierState,
    ["1", "0", "40", "40", "4", "31", "450", "31", "20", "9"]);
  assert.deepEqual(first.relations.relationState, ["0", "450", "31", "9", "0", "40"]);
  assert.equal(first.relations.records.length, 0);
  assert.equal(first.factor.livePermutation.length, 31);
  assert.equal(first.publication.hnfExecuted, false);
  assert(!fs.readFileSync(`${HERE}/row23_relation_hnf_frontier_coordinator.cjs`, "utf8")
    .includes("panel-23-c3077e07c31ac758.json"));

  // Only after two identical live executions may W0 state the expected target.
  const initialized = raw.events.find(value => value.event === "initialized");
  assert(initialized, "row23 frozen trace has no initialized assertion");
  assert.deepEqual([initialized.relations, initialized.target, initialized.need,
    initialized.Nrelid], [0, 40, 40, 4]);
  const changed = structuredClone(factor.owner);
  changed.factorBase.permutation[0] = changed.factorBase.permutation[1];
  await assert.rejects(coordinator.run({ factorOwner: changed,
    factorOwnerSha256: factor.ownerSha256 }), /Expected values to be strictly equal/);
  process.stdout.write(`${JSON.stringify({ schema:
    "sagejs.pari-class-group/row23-initial-relation-frontier-check-v1",
  relationState: first.relations.relationState,
  frontierState: first.relations.frontierState,
  initialRecords: first.relations.records.length,
  basisEntries: first.relations.basisEntries.length,
  factorOwnerSha256: factor.ownerSha256,
  sourceSha256: first.authority.sourceSha256,
  coreSha256: first.authority.coreSha256,
  exactBlocker: first.nextBlocker })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
