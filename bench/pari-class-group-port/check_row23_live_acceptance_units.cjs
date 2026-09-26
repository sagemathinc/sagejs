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

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const hnfHost = require("./row23_first_hnf_host.cjs");
  const acceptanceHost = require("./row23_acceptance_host.cjs");
  const unitHost = require("./row23_live_rank4_unit_host.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    outputDirectory: fs.mkdtempSync("/scratch/sagejs-row23-live-units-factor-") });

  const started = process.hrtime.bigint();
  const firstHnf = await hnfHost.runFirstHnf(prepared, factor.owner);
  const acceptance = await acceptanceHost.runAcceptance(prepared, firstHnf);
  const units = await unitHost.runLiveRank4UnitBridge(firstHnf, acceptance);
  const elapsedNanoseconds = process.hrtime.bigint() - started;

  assert.equal(firstHnf.status, 0);
  assert.equal(acceptance.status, 0);
  assert.deepEqual(acceptance.postHnfState, [0, 9, 1]);
  assert.deepEqual(acceptance.multipleState, [0, 0, 252, 2]);
  assert.deepEqual(acceptance.acceptanceState, [2, 0, 0]);
  assert.deepEqual(acceptance.reconstructionState, [0, 5, 244, 4]);
  assert.equal(acceptance.classNumber, "6");
  assert.equal(acceptance.lattice.length, 36);
  assert.deepEqual(units.states.integer, [5, 5, 4, 0, 0]);
  assert.deepEqual(units.states.real, [0, 0]);
  assert.deepEqual(units.states.privateGetfuReal, [0, 0]);
  assert.deepEqual(units.factor,
    ["1", "0", "0", "0", "0", "1", "0", "0",
      "0", "0", "1", "0", "0", "0", "0", "1"]);
  assert.equal(units.terminalStatus,
    "stopped-before-bounded-four-rhs-reconstruction");
  assert.equal(units.boundedGetfuExecuted, false);
  assert.equal(units.candidateAKind, "packed-logarithm-matrix");

  // Frozen W0 opens only after every live stage above has completed. It is an
  // assertion-only oracle, never a runtime source for regulator, lattice, or U.
  const accepted = raw.events.find(event => event.event === "acceptance");
  assert(accepted?.exactR);
  const reference = accepted.exactR;
  assert.equal(acceptance.regulator[1], String(reference.precision));
  assert.equal(acceptance.regulator[2], String(reference.exponent));
  const regulatorDelta = BigInt(acceptance.regulator[0]) - BigInt(reference.mantissa);
  assert(regulatorDelta < 0n ? -regulatorDelta <= 1024n : regulatorDelta <= 1024n);
  assert.equal(accepted.h, acceptance.classNumber);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-live-acceptance-unit-boundary-v1",
    elapsedNanoseconds: String(elapsedNanoseconds),
    qualifiedTiming: false,
    classNumber: acceptance.classNumber,
    regulator: acceptance.regulator,
    referenceRegulatorDelta: String(regulatorDelta),
    lattice: acceptance.lattice,
    analytic: {
      inverseHr: acceptance.analytic.inverseHr,
      state: acceptance.analytic.state,
      catalogState: acceptance.analytic.catalogState,
    },
    unitStates: units.states,
    U: units.U,
    factor: units.factor,
    hashes: units.hashes,
    terminalStatus: units.terminalStatus,
    nextBlocker: units.nextBlocker,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
