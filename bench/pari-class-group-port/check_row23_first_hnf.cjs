#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const vector = owner => (owner.toArray ? owner.toArray() : Array.from(owner)).map(String);
const digest = owner => sha(Buffer.from(JSON.stringify(vector(owner))));

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const host = require("./row23_first_hnf_host.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    outputDirectory: fs.mkdtempSync("/scratch/sagejs-row23-first-hnf-factor-") });
  const start = process.hrtime.bigint();
  const result = await host.runFirstHnf(prepared, factor.owner);
  const elapsedNanoseconds = process.hrtime.bigint() - start;
  assert.equal(result.status, 0);
  assert.deepEqual(result.relationState, ["40", "450", "0", "1", "0", "40"]);
  assert.deepEqual(result.chainState, [3, 0, 0, 40]);
  assert.deepEqual(result.hnfState, [1, 10, 30, 0, 9, 3, 0, 40, 0]);
  assert.deepEqual(result.collectorState.schedule, ["21", "1", "1", "1"]);
  assert.deepEqual(result.collectorState.progress, ["3", "40", "1", "1"]);
  const h = vector(result.values.hnf_result_h);
  const dep = vector(result.values.hnf_result_dep);
  assert.equal(h[0], "6");
  assert(h.slice(1).every(value => value === "0"));
  assert(dep.every(value => value === "0"));

  // W0 is an assertion-only oracle after authentic collection and HNF finish.
  const event = raw.events.find(value => value.event === "hnf");
  assert(event);
  assert.deepEqual([event.relations, event.newRelations, event.precision], [40, 40, 192]);
  assert.deepEqual(event.W, [1, 1]);
  assert.equal(event.exactW.values[0].values[0].value, h[0]);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-first-authentic-hnf-check-v1",
    elapsedNanoseconds: String(elapsedNanoseconds),
    qualifiedTiming: false,
    factorOwnerSha256: factor.ownerSha256,
    ownerBytes: result.ownerBytes,
    relationState: result.relationState,
    chainState: result.chainState,
    hnfState: result.hnfState,
    classInvariant: h[0],
    hnfResultSha256: digest(result.values.hnf_result_h),
    dependencySha256: digest(result.values.hnf_result_dep),
    transformSha256: digest(result.values.hnf_result_b),
    collectorState: result.collectorState,
    rootCoreSha256: sha(fs.readFileSync(result.built.coreSourcePath)),
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
