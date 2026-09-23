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
const neutral = require("./class_unit_correspondence_result.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");
const transaction = require("./row4_fresh_prepared_transaction.cjs");

const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-04-beb19c9584069e83.json";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

(async () => {
  const source = path.resolve(process.argv[2] || DEFAULT_W0);
  const bundle = JSON.parse(fs.readFileSync(source));
  const prepared = auth.normalizePreparedBundle(bundle);
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row4-fresh-transaction-"));
  try {
    assert.equal(transaction.isAuthenticFreshReceipt({}), false);
    assert.equal(transaction.isAuthenticFreshReceipt(Object.freeze({
      schema: transaction.SCHEMA, freshPreparedExecution: true,
    })), false);
    const injected = structuredClone(prepared);
    injected.retainedOwner = "/scratch/injected-answer.json";
    assert.throws(() => transaction.validatePrepared(injected));
    const changedPolynomial = structuredClone(prepared);
    changedPolynomial.prep_polynomial[0] = "20000000019";
    assert.throws(() => transaction.validatePrepared(changedPolynomial));

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
      { classNumber: "2", invariantFactors: ["2"] });
    assert.equal(receipt.relationCount, 567);
    assert.equal(receipt.compactUnitCount, 2);
    assert.deepEqual(receipt.unitNorms, ["-1", "1"]);
    assert.equal(receipt.torsionOrder, "2");
    const root = roots.developmentRoot(4);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(admitted.result.sha256, receipt.sha256);
    assert.equal(registry.verifyFreshExecution(
      admitted.freshExecution, { root, result: admitted.result }),
    admitted.freshExecution);
    assert.throws(() => registry.admitRegisteredFreshReceipt({
      root, receipt: { ...receipt },
    }));
    const durable = fs.readFileSync(receipt.path);
    assert.equal(sha256(durable), receipt.sha256);
    assert.equal(receipt.verifiedResult.sha256, receipt.sha256);
    assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
    assert(durable.equals(receipt.verifiedResult.canonicalJSON()));
    const payload = receipt.verifiedResult.detachedPayload();
    assert.equal(payload.classGroup.classNumber, "2");
    assert.deepEqual(payload.classGroup.invariantFactors, ["2"]);
    assert.equal(payload.terminal.correspondence_complete, true);
    assert.equal(payload.terminal.public_complete, false);
    const owners = Object.fromEntries(payload.storage.map(owner =>
      [owner.name, owner.entries]));
    assert.equal(owners["raw-relations"].length, 560 * 567);
    assert.equal(owners["factor-base-ideals"].length, 560 * 9);
    assert.equal(owners["class-order-relation-indices"].length, 397);
    assert.equal(owners["unit-raw-provenance"].length, 2 * 567);
    assert.deepEqual(owners["unit-norms"], ["-1", "1"]);
    const copied = structuredClone(payload);
    copied.classGroup.classNumber = "1";
    assert.notEqual(neutral.sha256Canonical(copied),
      neutral.sha256Canonical(payload));
    const damaged = Buffer.from(durable);
    damaged[damaged.length - 2] ^= 1;
    assert.notEqual(sha256(damaged), receipt.sha256);
    process.stdout.write(`${JSON.stringify({ schema:
      "sagejs.pari-class-group/row4-fresh-prepared-transaction-check-v1",
    freshPreparedExecution: true, correspondenceComplete: true,
    publicComplete: false, frozenW0RuntimeInput: false,
    preparedNfLiveRoot: true, classGroup: receipt.classGroup,
    relationCount: receipt.relationCount, compactUnitCount: 2,
    unitNorms: receipt.unitNorms, torsionOrder: receipt.torsionOrder,
    registryAdmission: true,
    durableSha256: receipt.sha256, antiForgeryRejected: 4,
    qualifiedTiming: false })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
