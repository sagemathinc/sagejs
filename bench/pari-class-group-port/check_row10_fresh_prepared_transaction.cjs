#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const transaction = require("./row10_fresh_prepared_transaction.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");

assert.throws(() => transaction.publishFreshPreparedRow10({ schema:
  "sagejs.pari-class-group/row10-fresh-prepared-transaction-v1" }),
/same-invocation branded/);
assert.rejects(() => transaction.prepareFreshPreparedRow10({
  authoritySha256: transaction.PREPARED_AUTHORITY,
  data: {}, injectedAcceptedAnswer: { classNumber: "4" },
}), /authenticated prepared envelope/);

const transactionSource = fs.readFileSync(path.join(__dirname,
  "row10_fresh_prepared_transaction.cjs"), "utf8");
assert.doesNotMatch(transactionSource,
  /panel-10-205|pristineW0|preparedW0|\/scratch\/|require\([^\n]*retained/i);
assert.doesNotMatch(transactionSource, /elapsed|timing|reserve/i);
assert.match(transactionSource, /new WeakSet\(\)/);
const preparedRuntimeSources = [
  "row10_prepared_initial_root_host.cjs",
  "row10_prepared_initial_root.py",
  "row10_prepared_gate_c_host.cjs",
  "row10_fresh_post_hnf.py",
].map(filename => fs.readFileSync(path.join(__dirname, filename), "utf8")).join("\n");
assert.doesNotMatch(preparedRuntimeSources,
  /\/scratch|\bW0\b|panel-14|retained owner|answer-derived path/i);

if (!process.argv.includes("--real")) {
  console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
    sourceAudit: true, realRun: false }));
  process.exit(0);
}

// W0 is used by this differential checker only to obtain the prepared input.
// It is not reachable from the transaction or any same-invocation owner.
const w0 = JSON.parse(fs.readFileSync(
  "/scratch/sagejs-pari-development-panel-a998/panel-10-205cea0cc9446e95.json"));
const authentication = require("./prepared_nf_authentication.cjs");
const prepared = authentication.normalizePreparedBundle(w0);

(async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row10-fresh-publication-"));
  try {
    const receipt = await transaction.runFreshPreparedRequest({
      prepared, outputDirectory,
    });
    const result = receipt.verifiedResult;
    assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
    assert.equal(result.sha256, receipt.result.sha256);
    assert.equal(result.sha256,
      "6ad503376c2cd6a033b129bbb0b41f734459c526b6a4232c19a14bd35f12d400");
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);
    assert.deepEqual(receipt.acceptanceActions, [5, 5, 5, 0]);
    assert.equal(receipt.relationCount, 303);
    assert.equal(receipt.classNumber, "4");
    assert.deepEqual(receipt.invariantFactors, ["2", "2"]);
    assert.deepEqual(receipt.regulator, [
      "3618404972711092908566761403126723494180372471278477576742",
      "192", "33"]);
    const detached = result.detachedPayload();
    assert.deepEqual(detached.classGroup, {
      classNumber: "4", generatorCount: "2", invariantFactors: ["2", "2"],
      presentationOwner: "class-presentation",
    });
    assert.equal(detached.unitGroup.materialization.tag, "not_given");
    assert.equal(detached.unitGroup.materialization.reason, "PRECI");
    detached.classGroup.classNumber = "8";
    assert.equal(result.detachedPayload().classGroup.classNumber, "4");
    const root = roots.developmentRoot(10);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution,
      { root, result: admitted.result }), admitted.freshExecution);
    console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
      sourceAudit: true, realRun: true, registryAdmission: true,
      envelopeSha256: result.sha256,
      mathematicalAuthoritySha256: receipt.result.mathematicalAuthoritySha256,
      acceptanceActions: receipt.acceptanceActions,
      relationCount: receipt.relationCount, classNumber: receipt.classNumber,
      invariantFactors: receipt.invariantFactors, regulator: receipt.regulator }));
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
