#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const neutralPath = require.resolve("./class_unit_correspondence_result.cjs");
const authenticationPath = require.resolve("./prepared_nf_authentication.cjs");
const strictPath = require.resolve("./row14_strict_prepared_complete_host.cjs");
const adapterPath = require.resolve("./row14_fresh_prepared_execution.cjs");
const realNeutral = require(neutralPath);
const finalSha256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";
const preparedSha256 =
  "6c8ac1e7e6a47a486de92cd180f9524a1be132d8fe1f7ccbd822166e77d4da92";
const mathematicalAuthoritySha256 = "a".repeat(64);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
  "sagejs-row14-fresh-receipt-check-"));

async function main() {
  const payload = {
    field: {
      definingPolynomialAscending: ["-200000002", "-200000002", "0", "0", "1"],
      degree: "4",
      id: "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413",
    },
    classGroup: {
      classNumber: "192", generatorCount: "2", invariantFactors: ["8", "24"],
      presentationOwner: "class-presentation",
    },
    unitGroup: {
      materialization: { precisionBits: "192", reason: "LARGE", tag: "not_given" },
      rank: "2", regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator", torsionOrder: "2",
    },
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
  };
  const envelope = {
    schema: realNeutral.ENVELOPE_SCHEMA,
    payloadSha256: realNeutral.sha256Canonical(payload),
    payload,
  };
  const bytes = Buffer.from(JSON.stringify(envelope));
  const filename = path.join(temporary, "result.json");
  fs.writeFileSync(filename, bytes, { mode: 0o444 });
  fs.chmodSync(filename, 0o444);

  class FakeVerifiedResult {
    constructor(sha256) { this.sha256 = sha256; Object.freeze(this); }
  }
  const verifiedResult = new FakeVerifiedResult(finalSha256);
  const prepared = { normalizedPreparedObject: true };
  require.cache[authenticationPath] = {
    id: authenticationPath, filename: authenticationPath, loaded: true,
    exports: {
      authenticatePreparedNf(value) {
        assert.equal(value, prepared,
          "row-14 adapter did not authenticate the caller's raw object");
        return { sha256: preparedSha256 };
      },
    },
  };
  require.cache[neutralPath] = {
    id: neutralPath, filename: neutralPath, loaded: true,
    exports: { ...realNeutral,
      ImmutableClassUnitCorrespondenceResult: FakeVerifiedResult,
      sha256Bytes: () => finalSha256 },
  };
  require.cache[strictPath] = {
    id: strictPath, filename: strictPath, loaded: true,
    exports: {
      EXPECTED_AUTHORITY_SHA256: preparedSha256,
      EXPECTED_FINAL_SHA256: finalSha256,
      validateStrictPrepared(preparedEnvelope) {
        assert.deepEqual(Object.keys(preparedEnvelope).sort(),
          ["authoritySha256", "data"]);
        assert.equal(preparedEnvelope.authoritySha256, preparedSha256);
        assert.deepEqual(preparedEnvelope.data, prepared);
        assert.notEqual(preparedEnvelope.data, prepared,
          "row-14 private authority envelope retained caller ownership");
        return { sha256: preparedSha256 };
      },
      async runStrictPreparedComplete(preparedEnvelope) {
        assert.equal(preparedEnvelope.authoritySha256, preparedSha256);
        return {
          path: filename, bytes: bytes.length, sha256: finalSha256,
          mathematicalAuthoritySha256, correspondenceComplete: true,
          publicComplete: false, verifiedResult,
          // These fields model the real strict host and must not escape.
          elapsedNs: "123", mathematicalElapsedNs: "100", maxRssKiB: 999,
          stageElapsedNs: { gateC: "100" }, reserveCandidate: "forbidden",
        };
      },
    },
  };
  delete require.cache[adapterPath];
  const adapter = require(adapterPath);
  assert.equal(adapter.validatePrepared(prepared).sha256, preparedSha256);
  const receipt = await adapter.runFreshPreparedExecution(prepared, temporary);
  assert.equal(adapter.verifyFreshPreparedReceipt(receipt), receipt);
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.reserveAccess, false);
  assert.equal(receipt.resultEnvelopeSha256, finalSha256);
  assert.equal(receipt.preparedAuthoritySha256, preparedSha256);
  assert.equal(receipt.mathematicalAuthoritySha256,
    mathematicalAuthoritySha256);
  assert.equal(receipt.verifiedResult, verifiedResult);
  assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
  for (const forbidden of ["elapsedNs", "mathematicalElapsedNs",
    "maxRssKiB", "stageElapsedNs", "reserveCandidate"]) {
    assert.equal(Object.hasOwn(receipt, forbidden), false,
      `strict-only field escaped: ${forbidden}`);
  }
  assert(Object.isFrozen(receipt));
  assert(Object.isFrozen(receipt.terminal));
  assert.throws(() => adapter.verifyFreshPreparedReceipt(
    structuredClone(receipt)), /live execution brand/);
  assert.throws(() => adapter.verifyFreshPreparedReceipt({ ...receipt }),
    /live execution brand/);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-fresh-prepared-execution-check-v1",
    brandedReceiptAccepted: true,
    copiedReceiptsRejected: 2,
    timingFieldsPublished: 0,
    reserveClaimsPublished: 0,
  })}\n`);
}

main().finally(() => {
  delete require.cache[adapterPath];
  delete require.cache[strictPath];
  delete require.cache[authenticationPath];
  delete require.cache[neutralPath];
  fs.rmSync(temporary, { recursive: true, force: true });
}).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
