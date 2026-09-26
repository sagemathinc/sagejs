#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");
const transaction = require("./row1_fresh_prepared_transaction.cjs");

const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";

(async () => {
  const bundle = JSON.parse(fs.readFileSync(process.argv[2] || DEFAULT_W0));
  const prepared = authentication.normalizePreparedBundle(bundle);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row1-fresh-transaction-"));
  try {
    assert.equal(transaction.isAuthenticFreshReceipt({}), false);
    assert.equal(transaction.isAuthenticFreshReceipt(Object.freeze({
      schema: transaction.SCHEMA, freshPreparedExecution: true,
    })), false);
    assert.throws(() => new neutral.ImmutableClassUnitCorrespondenceResult());

    const injected = structuredClone(prepared);
    injected.verifiedResult = { classNumber: "3" };
    assert.throws(() => transaction.validatePrepared(injected));
    const mutated = structuredClone(prepared);
    mutated.prep_polynomial[0] = "20019";
    assert.throws(() => transaction.validatePrepared(mutated));
    await assert.rejects(transaction.runFreshPreparedRequest({
      prepared, outputDirectory, retainedW0: DEFAULT_W0,
    }));

    const receipt = await transaction.runFreshPrepared(prepared, outputDirectory);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert(Object.isFrozen(receipt));
    assert(Object.isFrozen(receipt.result));
    assert(receipt.verifiedResult instanceof
      neutral.ImmutableClassUnitCorrespondenceResult);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.equal(receipt.freshPreparedExecution, true);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    assert.equal(receipt.retainedRuntimeInputs, false);
    assert.equal(receipt.retainedOwnersRuntimeInputs, false);
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert.equal(receipt.preparedNfLiveRoot, true);
    assert.equal(receipt.qualifiedTiming, false);
    assert.deepEqual(receipt.classGroup,
      { classNumber: "3", invariantFactors: ["3"] });
    assert.equal(receipt.exactUnitCount, 2);
    assert.equal(receipt.torsionOrder, "2");
    assert.equal(receipt.relationCount, 58);

    const root = roots.developmentRoot(1);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(admitted.result.sha256, receipt.result.sha256);
    assert.equal(admitted.sourceMetadata.fieldId, root.internalFieldId);
    assert.equal(admitted.freshExecution.freshPreparedExecution, true);
    assert.equal(registry.verifyFreshExecution(
      admitted.freshExecution, { root, result: admitted.result }),
    admitted.freshExecution);
    assert.throws(() => registry.admitRegisteredFreshReceipt({
      root, receipt: { ...receipt },
    }));

    const durable = fs.readFileSync(receipt.result.path);
    assert(durable.equals(receipt.verifiedResult.canonicalJSON()));
    assert.equal(neutral.sha256Bytes(durable), receipt.result.sha256);
    assert.equal(receipt.verifiedResult.sha256, receipt.result.sha256);
    assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);
    const payload = receipt.verifiedResult.detachedPayload();
    assert.equal(payload.classGroup.classNumber, "3");
    assert.deepEqual(payload.classGroup.invariantFactors, ["3"]);
    assert.equal(payload.unitGroup.materialization.tag, "exact_units");
    assert.equal(payload.terminal.correspondence_complete, true);
    assert.equal(payload.terminal.public_complete, false);
    payload.classGroup.classNumber = "1";
    assert.equal(receipt.verifiedResult.detachedPayload().classGroup.classNumber, "3");
    const changed = Buffer.from(durable);
    changed[changed.length - 2] ^= 1;
    assert.notEqual(neutral.sha256Bytes(changed), receipt.result.sha256);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row1-fresh-prepared-transaction-check-v1",
      ok: true,
      freshPreparedExecution: true,
      correspondenceComplete: true,
      publicComplete: false,
      frozenW0RuntimeInput: false,
      preparedNfLiveRoot: true,
      classGroup: receipt.classGroup,
      exactUnitCount: receipt.exactUnitCount,
      torsionOrder: receipt.torsionOrder,
      durableSha256: receipt.result.sha256,
      registryAdmission: true,
      antiForgeryRejected: 5,
      qualifiedTiming: false,
    })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
