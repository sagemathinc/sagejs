#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const neutralPath = require.resolve("./class_unit_correspondence_result.cjs");
const producerPath = require.resolve("./h1_class_unit_result_producer.cjs");
const wrapperPath = require.resolve("./row0_fresh_prepared_execution.cjs");
const rootsPath = require.resolve("./phase5_development_roots.cjs");
const registryPath = require.resolve("./fresh_prepared_development_registry.cjs");
const realNeutral = require(neutralPath);
const expectedResultSha256 =
  "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
  "sagejs-row0-fresh-prepared-check-"));

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function payload() {
  return {
    field: { definingPolynomialAscending: ["20034", "-20018", "0", "1"],
      degree: "3", id: "pari-2.17.4:x^3-20018*x+20034" },
    classGroup: { classNumber: "1", generatorCount: "0", invariantFactors: [],
      presentationOwner: "class-presentation" },
    unitGroup: { materialization: { coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms", tag: "exact_units" }, rank: "2",
      regulatorOwner: "regulator-enclosure", torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2" },
    terminal: { correspondence_complete: true, public_complete: false,
      status: "pari-correspondence-complete-internal" },
  };
}

class FakeVerifiedResult {
  constructor(value) {
    this.value = structuredClone(value);
    this.raw = Buffer.from(JSON.stringify({ payload: value }));
    this.sha256 = expectedResultSha256;
    // These model producer-local observations which must never escape.
    this.elapsedNs = "99";
    this.maxRssKiB = 123;
  }
  canonicalJSON() { return Buffer.from(this.raw); }
  detachedPayload() { return structuredClone(this.value); }
}

async function main() {
  let next = new FakeVerifiedResult(payload());
  require.cache[neutralPath] = {
    id: neutralPath, filename: neutralPath, loaded: true,
    exports: { ...realNeutral,
      ImmutableClassUnitCorrespondenceResult: FakeVerifiedResult,
      sha256Bytes: () => expectedResultSha256,
      validatePayload() {},
    },
  };
  require.cache[producerPath] = {
    id: producerPath, filename: producerPath, loaded: true,
    exports: { async produceH1ClassUnitResult(fixturePaths) {
      assert.deepEqual(fixturePaths, ["prepared.json", "analytic.json", "kummer.json"]);
      return next;
    } },
  };
  delete require.cache[wrapperPath];
  const wrapper = require(wrapperPath);
  const receipt = await wrapper.runFreshPrepared(
    ["prepared.json", "analytic.json", "kummer.json"], temporary);
  assert.equal(wrapper.isAuthenticFreshReceipt(receipt), true);
  assert.equal(wrapper.isAuthenticFreshReceipt({ ...receipt }), false);
  assert.equal(receipt.verifiedResult, next);
  assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.reserveAccess, false);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
  assert.equal(realNeutral.sha256Bytes(fs.readFileSync(receipt.path)),
    sha256(Buffer.from(JSON.stringify({ payload: payload() }))));
  for (const field of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
    "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"]) {
    assert.equal(Object.hasOwn(receipt, field), false);
  }
  delete require.cache[rootsPath];
  delete require.cache[registryPath];
  const roots = require(rootsPath);
  const registry = require(registryPath);
  const root = roots.developmentRoot(0);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  assert.equal(admitted.result, next);
  assert.equal(registry.verifyFreshExecution(admitted.freshExecution,
    { root, result: next }), admitted.freshExecution);
  assert.throws(() => registry.admitRegisteredFreshReceipt({
    root, receipt: { ...receipt },
  }), /transaction-local brand/);
  assert.throws(() => wrapper.validatePrepared(["prepared.json"]));
  next = new FakeVerifiedResult({ ...payload(), field: {
    ...payload().field, degree: "4",
  } });
  await assert.rejects(() => wrapper.runFreshPrepared(
    ["prepared.json", "analytic.json", "kummer.json"], temporary));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-fresh-prepared-execution-check-v1",
    brandedReceiptAccepted: true,
    copiedReceiptsRejected: 2,
    registryAdmissionAccepted: true,
    malformedPreparedRejected: 1,
    changedTerminalRejected: 1,
    timingFieldsPublished: 0,
    reserveClaimsPublished: 0,
  })}\n`);
}

main().finally(() => {
  delete require.cache[wrapperPath];
  delete require.cache[producerPath];
  delete require.cache[registryPath];
  delete require.cache[rootsPath];
  delete require.cache[neutralPath];
  fs.rmSync(temporary, { recursive: true, force: true });
}).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
