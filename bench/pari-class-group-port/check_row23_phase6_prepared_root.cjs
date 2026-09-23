#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");

const emitter = require("./row23_phase6_prepared_emitter.cjs");
const host = require("./row23_phase6_prepared_root_host.cjs");

async function main() {
  const generated = emitter.emitPreparedSource();
  assert.equal(generated, fs.readFileSync(emitter.writePreparedSource(), "utf8"),
    "row-23 prepared-root generation is not deterministic");
  assert.doesNotMatch(generated, /factorOwner|frozenAnswer|serializedOwner/);
  assert.match(generated,
    /status = pari_row23_phase6_prepared_factor_root\(/);
  assert.match(generated,
    /status = pari_row23_phase6_aggregate_root\(/);
  assert.match(generated, /factor_base_state\[6\]/,
    "live factor-product result is not connected to relation admission");

  const resident = await host.preparePrepared();
  host.assertNoRetainedAnswer(resident);
  const receipt = host.runPrepared(resident);
  host.verifyPreparedReceipt(receipt);
  assert.deepEqual(host.replayPreparedResult(receipt), receipt.result);
  assert.throws(() => host.verifyPreparedReceipt({ ...receipt }),
    /replay capability/);
  assert.equal(Object.keys(receipt).includes("resident"), false,
    "live owners escaped through the public receipt");
  assert.equal(receipt.boundary.nativeCallsInsideClock, 1);
  assert.equal(receipt.boundary.factorOwnerRuntimeInput, false);
  assert.equal(receipt.boundary.retainedAnswerRuntimeInput, false);
  assert.equal(receipt.result.preparedAuthoritySha256,
    host.PREPARED_AUTHORITY_SHA256);
  assert.equal(receipt.result.classGroup.classNumber, "6");
  assert.deepEqual(receipt.result.classGroup.invariantFactors, ["6"]);
  assert.equal(receipt.result.unitGroup.rank, 4);
  assert.equal(receipt.result.unitGroup.unitsSha256,
    host.EXPECTED_UNITS_SHA256);

  // Reset is outside the clock and restores only authenticated prepared data,
  // constants, and empty capacities.  It must erase every computed answer.
  resident.reset.forEach(reset => reset());
  host.assertNoRetainedAnswer(resident);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-phase6-prepared-root-check-v1",
    preparedAuthoritySha256: receipt.preparedAuthoritySha256,
    sourcePath: resident.sourcePath,
    cacheKey: resident.built.cacheKey,
    modulePath: resident.built.modulePath,
    elapsedNanoseconds: receipt.elapsedNanoseconds,
    ownerBytes: receipt.ownerBytes,
    oneTimedNativeCall: true,
    factorOwnerRuntimeInput: false,
    retainedAnswerRuntimeInput: false,
    capabilityReplay: true,
    copiedReceiptRejected: true,
    exactFactorProjection: receipt.result.factor,
    classGroup: receipt.result.classGroup,
    unitGroup: { rank: receipt.result.unitGroup.rank,
      unitsSha256: receipt.result.unitGroup.unitsSha256,
      norms: receipt.result.unitGroup.norms },
    work: receipt.result.work,
  })}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
