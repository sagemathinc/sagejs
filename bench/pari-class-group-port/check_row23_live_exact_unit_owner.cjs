#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const zlib = require("node:zlib");

const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function main() {
  const w0Bytes = fs.readFileSync(W0);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const raw = JSON.parse(w0Bytes);
  const auth = require("./prepared_nf_authentication.cjs");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const hnfHost = require("./row23_first_hnf_host.cjs");
  const acceptanceHost = require("./row23_acceptance_host.cjs");
  const bridgeHost = require("./row23_live_rank4_unit_host.cjs");
  const unitHost = require("./row23_live_unit_owner.cjs");
  const coordinator = require("./row23_live_unit_owner_coordinator.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    outputDirectory: fs.mkdtempSync("/scratch/sagejs-row23-final-unit-factor-") });
  const firstHnf = await hnfHost.runFirstHnf(prepared, factor.owner);
  const acceptance = await acceptanceHost.runAcceptance(prepared, firstHnf);
  const bridge = await bridgeHost.runLiveRank4UnitBridge(firstHnf, acceptance);
  const units = await unitHost.runLiveUnitOwner(prepared, bridge);
  assert.equal(units.status, 0);
  assert.deepEqual(units.state, [0, 20, 0, 4, 13, 3]);
  assert.deepEqual(units.solveState, [0, 5, 4, -222, 4]);
  assert.deepEqual(units.exactNorms, ["-1", "1", "1", "1"]);
  assert.deepEqual(units.exactRealSigns,
    [[-1, -1, -1, 1, 1], [1, 1, 1, -1, -1],
      [-1, -1, -1, -1, 1], [-1, 1, 1, -1, 1]]);
  const owner = coordinator.compose({ prepared, factor, acceptance, bridge, units });
  const receipt = coordinator.publish(owner,
    fs.mkdtempSync("/scratch/sagejs-row23-live-unit-owner-"));
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha(compressed), receipt.compressedSha256);
  const plain = zlib.gunzipSync(compressed);
  assert.deepEqual(coordinator.authenticate(plain, receipt.contentSha256), owner);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);

  const mutation = structuredClone(owner);
  mutation.unitsIntegralBasis[0][0] = "0";
  const mutatedBytes = Buffer.from(`${JSON.stringify(mutation)}\n`);
  assert.throws(() => coordinator.authenticate(mutatedBytes, receipt.contentSha256),
    /digest changed/);
  const stateMutation = structuredClone(owner);
  stateMutation.state[3] = 3;
  const stateBytes = Buffer.from(`${JSON.stringify(stateMutation)}\n`);
  assert.throws(() => coordinator.authenticate(stateBytes, sha(stateBytes)),
    /deep-equal|Expected values/);

  // W0's unit event is inspected only now, after live exact reconstruction,
  // exact unit checks, immutable publication, and mutation rejection.
  const reference = raw.events.find(event => event.event === "fundamental_units");
  assert.equal(reference?.fu?.kind, "vector");
  assert.equal(reference.fu.values.length, 4);
  assert.equal(reference.regulator.mantissa,
    "58120758344776579206426528395464800380047988883988014887510864319728839259159");

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-live-exact-unit-owner-check-v1",
    receipt,
    classNumber: owner.classNumber,
    unitRank: owner.unitRank,
    unitsIntegralBasis: owner.unitsIntegralBasis,
    exactInversesIntegralBasis: owner.exactInversesIntegralBasis,
    exactNorms: owner.exactNorms,
    exactRealSigns: owner.exactRealSigns,
    acceptanceAuthoritySha256: owner.acceptanceAuthoritySha256,
    regulatorAuthoritySha256: owner.regulatorAuthoritySha256,
    state: owner.state,
    solveState: owner.solveState,
    exactUnitsSha256: owner.native.exactUnitsSha256,
    oracleOpenedPostcompute: true,
    mutationsRejected: 2,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
