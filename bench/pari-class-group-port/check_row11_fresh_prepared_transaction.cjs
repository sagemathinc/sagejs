#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const neutral = require("./class_unit_correspondence_result.cjs");
const transaction = require("./row11_fresh_prepared_transaction.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const roots = require("./phase5_development_roots.cjs");

assert.throws(() => transaction.publishFreshPreparedRow11({ schema:
  "sagejs.pari-class-group/row11-fresh-prepared-transaction-v1" }),
/same-invocation branded/);
assert.rejects(() => transaction.prepareFreshPreparedRow11({
  authoritySha256: transaction.PREPARED_AUTHORITY,
  data: {}, injectedAcceptedAnswer: { classNumber: "4" },
}), /authenticated prepared envelope/);
assert.rejects(() => transaction.runFreshPreparedRequest({ prepared: {},
  outputDirectory: "/tmp", acceptedAnswer: "4" }), /Expected values to be strictly deep-equal/);

const localRuntime = [
  "row11_fresh_prepared_transaction.cjs",
  "row11_prepared_initial_host.cjs",
  "row11_prepared_initial_root.py",
  "row11_prepared_gate_c_host.cjs",
  "row11_fresh_post_hnf.py",
  "row11_fresh_live_trace.cjs",
  "row11_fresh_transform_host.cjs",
  "row11_fresh_rank2_c5_c6.py",
].map(filename => fs.readFileSync(path.join(__dirname, filename), "utf8")).join("\n");
assert.doesNotMatch(localRuntime,
  /\/scratch\/|panel-11-ce2bfa|readFileSync\([^)]*(?:W0|pristine)|retainedOwners?RuntimeInputs:\s*true/i);
const transactionSource = fs.readFileSync(path.join(__dirname,
  "row11_fresh_prepared_transaction.cjs"), "utf8");
assert.doesNotMatch(transactionSource, /elapsed|timing|reserve/i);
assert.match(transactionSource, /new WeakSet\(\)/);

if (!process.argv.includes("--real")) {
  console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
    sourceAudit: true, realRun: false }));
  process.exit(0);
}

// This differential checker alone reads the frozen trace to recover the
// normalized prepared input and, after publication, compare final invariants.
const w0 = JSON.parse(fs.readFileSync(
  "/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json"));
const authentication = require("./prepared_nf_authentication.cjs");
const prepared = authentication.normalizePreparedBundle(w0);

(async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row11-fresh-publication-"));
  try {
    const receipt = await transaction.runFreshPreparedRequest({ prepared,
      outputDirectory });
    const result = receipt.verifiedResult;
    assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
    assert.equal(result.sha256, receipt.result.sha256);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);
    assert.deepEqual(receipt.acceptanceActions, [5, 0]);
    assert.deepEqual(receipt.hnfStates.map(value => value[7]), [427, 428, 430]);
    assert.equal(receipt.relationCount, 430);
    assert.equal(receipt.exactRelationsReplayed, 430);
    assert.equal(receipt.classNumber, "4");
    assert.deepEqual(receipt.invariantFactors, ["2", "2"]);
    assert.deepEqual(receipt.regulator, [
      "3312459349406852470715008030762890377736385282279907980094",
      "192", "38"]);
    assert.deepEqual(receipt.classWitnessFactorCounts, [333, 330]);
    assert.deepEqual(receipt.unitFactorCounts, [330, 330]);
    assert.equal(receipt.c6Status, 2); assert.equal(receipt.c6Reason, "LARGE");
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert.deepEqual(receipt.runtimeInputs,
      ["authenticated normalized prepared-NF data"]);
    const detached = result.detachedPayload();
    assert.deepEqual(detached.classGroup, { classNumber: "4", generatorCount: "2",
      invariantFactors: ["2", "2"], presentationOwner: "class-presentation" });
    assert.equal(detached.unitGroup.materialization.tag, "not_given");
    assert.equal(detached.unitGroup.materialization.reason, "LARGE");
    detached.classGroup.classNumber = "8";
    assert.equal(result.detachedPayload().classGroup.classNumber, "4");
    const root = roots.developmentRoot(11);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution,
      { root, result: admitted.result }), admitted.freshExecution);
    const terminal = w0.events.findLast(value => value.event === "result");
    assert.equal(receipt.classNumber, terminal.classNumber);
    assert.deepEqual(receipt.invariantFactors, terminal.invariants);
    console.log(JSON.stringify({ antiForgery: true, injectionRejected: true,
      sourceAudit: true, realRun: true, registryAdmission: true,
      envelopeSha256: result.sha256,
      mathematicalAuthoritySha256: receipt.result.mathematicalAuthoritySha256,
      acceptanceActions: receipt.acceptanceActions,
      hnfColumns: receipt.hnfStates.map(value => value[7]),
      relationCount: receipt.relationCount,
      exactRelationsReplayed: receipt.exactRelationsReplayed,
      classNumber: receipt.classNumber, invariantFactors: receipt.invariantFactors,
      classWitnessFactorCounts: receipt.classWitnessFactorCounts,
      unitFactorCounts: receipt.unitFactorCounts, regulator: receipt.regulator,
      c6Status: receipt.c6Status, c6Reason: receipt.c6Reason }));
  } finally { fs.rmSync(outputDirectory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
