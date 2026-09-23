#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const auth = require("./prepared_nf_authentication.cjs");
const transaction = require("./row3_fresh_prepared_transaction.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-03-aae73048ee765ce3.json";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

(async () => {
  const raw = JSON.parse(fs.readFileSync(W0));
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row3-fresh-transaction-"));
  try {
    assert.equal(transaction.isAuthenticFreshReceipt({}), false);
    assert.equal(transaction.isAuthenticFreshReceipt(Object.freeze({
      schema: transaction.SCHEMA, freshPreparedExecution: true,
    })), false);
    const injected = structuredClone(prepared);
    injected.retainedOwner = "/scratch/injected-answer.json";
    assert.throws(() => transaction.validatePrepared(injected));
    const mutated = structuredClone(prepared);
    mutated.prep_polynomial[0] = "20000000043";
    assert.throws(() => transaction.validatePrepared(mutated));

    const receipt = await transaction.runFreshPrepared(prepared, outputDirectory);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert(Object.isFrozen(receipt));
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
    assert.deepEqual(receipt.runtimeInputs,
      ["authenticated normalized prepared-nf data"]);
    assert.equal(receipt.qualifiedTiming, false);
    assert.deepEqual(receipt.classGroup,
      { classNumber: "6", invariantFactors: ["6"] });
    assert.equal(receipt.unitMaterialization, "not_given(LARGE)");
    const durable = fs.readFileSync(receipt.path);
    assert.equal(sha256(durable), receipt.sha256);
    assert.equal(receipt.verifiedResult.sha256, receipt.sha256);
    assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
    assert(durable.equals(receipt.verifiedResult.canonicalJSON()));
    const roots = require("./phase5_development_roots.cjs");
    const registry = require("./fresh_prepared_development_registry.cjs");
    const root = roots.developmentRoot(3);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution, {
      root, result: admitted.result,
    }), admitted.freshExecution);
    assert.throws(() => registry.admitRegisteredFreshReceipt({
      root, receipt: { ...receipt },
    }), /transaction-local brand/);
    const changed = Buffer.from(durable);
    changed[changed.length - 2] ^= 1;
    assert.notEqual(sha256(changed), receipt.sha256);
    const payload = receipt.verifiedResult.detachedPayload();
    assert.equal(payload.classGroup.classNumber, "6");
    assert.deepEqual(payload.classGroup.invariantFactors, ["6"]);
    assert.equal(payload.terminal.correspondence_complete, true);
    assert.equal(payload.terminal.public_complete, false);
    process.stdout.write(`${JSON.stringify({ schema:
      "sagejs.pari-class-group/row3-fresh-prepared-transaction-check-v1",
    freshPreparedExecution: true, correspondenceComplete: true,
    publicComplete: false, frozenW0RuntimeInput: false,
    preparedNfLiveRoot: true, classGroup: receipt.classGroup,
    unitMaterialization: receipt.unitMaterialization,
    durableSha256: receipt.sha256, antiForgeryRejected: 2,
    qualifiedTiming: false })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
