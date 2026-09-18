#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const neutral = require("./class_unit_correspondence_result.cjs");
const roots = require("./phase5_development_roots.cjs");
const registry = require("./fresh_prepared_development_registry.cjs");
const wrapper = require("./row0_fresh_prepared_execution.cjs");

const CORPUS_MANIFEST = require("./fresh-prepared-corpus-manifest.json");
const EXPECTED_RESULT_SHA256 =
  "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readPrepared(filename) {
  const expected = CORPUS_MANIFEST.rows.find(row => row.panelIndex === 0);
  assert(expected, "fresh prepared corpus lacks row 0");
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.length, expected.preparedJsonBytes);
  assert.equal(sha256(bytes), expected.preparedJsonSha256);
  const prepared = JSON.parse(bytes);
  assert.equal(wrapper.validatePrepared(prepared).authoritySha256,
    expected.preparedAuthoritySha256);
  return { expected, prepared };
}

async function main() {
  assert.equal(process.argv.length, 3,
    "usage: check_row0_fresh_prepared_execution.cjs PREPARED_ROW_0_JSON");
  const preparedPath = path.resolve(process.argv[2]);
  const { expected, prepared } = readPrepared(preparedPath);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row0-genuine-fresh-prepared-check-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const receipt = await wrapper.runFreshPrepared(prepared, temporary);
    assert.equal(wrapper.isAuthenticFreshReceipt(receipt), true);
    assert.equal(wrapper.isAuthenticFreshReceipt({ ...receipt }), false);
    assert.equal(receipt.schema, wrapper.RECEIPT_SCHEMA);
    assert.equal(receipt.panelIndex, 0);
    assert.equal(receipt.preparedAuthoritySha256,
      expected.preparedAuthoritySha256);
    assert.equal(receipt.sha256, EXPECTED_RESULT_SHA256);
    assert.equal(receipt.verifiedResult.sha256, EXPECTED_RESULT_SHA256);
    assert(receipt.verifiedResult instanceof
      neutral.ImmutableClassUnitCorrespondenceResult);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    assert.equal(receipt.freshPreparedExecution, true);
    assert.equal(receipt.retainedRuntimeInputs, false);
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert.equal(receipt.qualifiedTiming, false);
    assert.equal(receipt.reserveAccess, false);
    assert.deepEqual(receipt.runtimeInputs,
      ["authenticated normalized prepared-nf data"]);
    assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
    assert.equal(neutral.sha256Bytes(fs.readFileSync(receipt.path)),
      EXPECTED_RESULT_SHA256);
    for (const field of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
      "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"]) {
      assert.equal(Object.hasOwn(receipt, field), false,
        `correctness receipt leaked ${field}`);
    }

    const root = roots.developmentRoot(0);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(admitted.result, receipt.verifiedResult);
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution,
      { root, result: admitted.result }), admitted.freshExecution);
    assert.equal(admitted.freshExecution.preparedAuthoritySha256,
      expected.preparedAuthoritySha256);
    assert.throws(() => registry.admitRegisteredFreshReceipt({
      root, receipt: { ...receipt },
    }), /transaction-local brand/);

    assert.throws(() => wrapper.validatePrepared([preparedPath]),
      /normalized prepared-NF object/);
    const changed = structuredClone(prepared);
    changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
    assert.throws(() => wrapper.validatePrepared(changed));

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row0-genuine-fresh-prepared-check-v2",
      panelIndex: 0,
      preparedJsonSha256: expected.preparedJsonSha256,
      preparedAuthoritySha256: expected.preparedAuthoritySha256,
      resultSha256: receipt.sha256,
      genuinePreparedObjectOnly: true,
      unifiedH1NativeRootExecutions: 2,
      coldReplays: 2,
      regulatorAuthorities: 2,
      registryAdmissionAccepted: true,
      copiedReceiptRejected: true,
      malformedPreparedRejected: 2,
      timingFieldsPublished: 0,
      reserveClaimsPublished: 0,
      correspondenceComplete: true,
      publicComplete: false,
    })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
