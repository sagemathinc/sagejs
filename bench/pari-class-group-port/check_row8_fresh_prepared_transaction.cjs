#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const transaction = require("./row8_fresh_prepared_transaction.cjs");

assert.throws(() => transaction.publishFreshPreparedRow8({ schema:
  "sagejs.pari-class-group/row8-fresh-prepared-transaction-v1" }),
/same-invocation branded/);
assert.rejects(() => transaction.prepareFreshPreparedRow8({
  authoritySha256: "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01",
  data: {}, injectedAcceptedAnswer: { classNumber: "1" },
}), /authenticated prepared envelope/);

const source = fs.readFileSync(path.join(__dirname,
  "row8_fresh_prepared_transaction.cjs"), "utf8");
assert.doesNotMatch(source, /panel-08-|pristineW0|preparedW0|\/scratch\//);
assert.doesNotMatch(source, /elapsed|timing|reserve/i);

if (!process.argv.includes("--real")) {
  console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
    sourceAudit: true, realRun: false }));
  process.exit(0);
}

const w0 = JSON.parse(fs.readFileSync(
  "/scratch/sagejs-pari-development-panel-a998/panel-08-4184b3a9e86b3cc2.json"));
const authentication = require("./prepared_nf_authentication.cjs");
const prepared = Object.freeze({
  authoritySha256: authentication.authenticatePreparedBundle(w0.prepared).sha256,
  data: authentication.normalizePreparedBundle(w0.prepared),
});

(async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row8-fresh-publication-"));
  try {
    const receipt = await transaction.runFreshPreparedRequest({
      prepared: prepared.data, outputDirectory,
    });
    const result = receipt.verifiedResult;
    assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
    assert.equal(result.sha256, receipt.result.sha256);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);
    assert.deepEqual(receipt.acceptanceActions, [5, 5, 0]);
    assert.equal(receipt.relationCount, 152);
    assert.equal(receipt.classNumber, "1");
    assert.deepEqual(receipt.regulator, [
      "5535521411280883888340490680131024664251778663230538321703", "192", "27"]);
    const roots = require("./phase5_development_roots.cjs");
    const registry = require("./fresh_prepared_development_registry.cjs");
    const root = roots.developmentRoot(8);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution, {
      root, result: admitted.result,
    }), admitted.freshExecution);
    assert.throws(() => registry.admitRegisteredFreshReceipt({
      root, receipt: { ...receipt },
    }), /transaction-local brand/);
    const detached = result.detachedPayload();
    detached.classGroup.classNumber = "2";
    assert.equal(result.detachedPayload().classGroup.classNumber, "1");
    console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
      sourceAudit: true, realRun: true, envelopeSha256: result.sha256,
      mathematicalAuthoritySha256: receipt.result.mathematicalAuthoritySha256,
      acceptanceActions: receipt.acceptanceActions,
      relationCount: receipt.relationCount, regulator: receipt.regulator }));
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
