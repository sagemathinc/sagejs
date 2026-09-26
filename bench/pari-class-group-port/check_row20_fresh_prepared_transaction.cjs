#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const transactionPath = require.resolve("./row20_fresh_prepared_transaction.cjs");
const pipelinePath = require.resolve("./row20_fresh_prepared_pipeline.cjs");
const authenticationPath = require.resolve("./prepared_nf_authentication.cjs");
const neutralPath = require.resolve("./class_unit_correspondence_result.cjs");

const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const PREPARED_SHA256 =
  "15ecf1209df2e48bd8a9e5ad75bc6dac0598d513bc6a06b7712ccfc255febbc6";
const W0_SHA256 =
  "6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

async function focused() {
  class FakeVerifiedResult {}
  let pipelineCalls = 0;
  require.cache[authenticationPath] = { id: authenticationPath,
    filename: authenticationPath, loaded: true,
    exports: { authenticatePreparedNf: () => ({ sha256: PREPARED_SHA256 }) } };
  require.cache[neutralPath] = { id: neutralPath, filename: neutralPath,
    loaded: true,
    exports: { ImmutableClassUnitCorrespondenceResult: FakeVerifiedResult } };
  require.cache[pipelinePath] = { id: pipelinePath, filename: pipelinePath,
    loaded: true, exports: { async runSameInvocation(prepared, directory) {
      pipelineCalls += 1;
      assert.equal(fs.statSync(directory).mode & 0o077, 0);
      assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS);
      return { ancestry: { freshInputSha256: "1".repeat(64) },
        mathematicalAuthoritySha256: "2".repeat(64),
        raw: Buffer.from("neutral-row20"), result: new FakeVerifiedResult(),
        summary: { classNumber: "1", exactUnitCount: 2, hnfState: [0, 7, 1],
          invariantFactors: [], torsionOrder: "2" } };
    } } };
  delete require.cache[transactionPath];
  const transaction = require(transactionPath);
  const prepared = Object.fromEntries(PREPARED_KEYS.map(key => [key, []]));
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row20-focused-"));
  try {
    const receipt = await transaction.runFreshPreparedRequest({ prepared,
      outputDirectory });
    assert.equal(pipelineCalls, 1);
    assert.equal(transaction.verifyFreshPreparedReceipt(receipt), receipt);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert.throws(() => transaction.verifyFreshPreparedReceipt({ ...receipt }),
      /transaction-local brand/);
    assert(Object.isFrozen(receipt));
    assert(Object.isFrozen(receipt.ownerAuthority));
    assert(receipt.verifiedResult instanceof FakeVerifiedResult);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.deepEqual(receipt.runtimeInputs,
      ["authenticated normalized prepared-nf data"]);
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert.equal(receipt.retainedOwnersRuntimeInputs, false);
    assert.deepEqual(receipt.classGroup,
      { classNumber: "1", invariantFactors: [] });
    assert.equal(receipt.exactUnitCount, 2);
    assert.equal(receipt.torsionOrder, "2");
    assert.equal(fs.statSync(receipt.result.path).mode & 0o222, 0);
    assert.equal(sha256(fs.readFileSync(receipt.result.path)),
      receipt.result.sha256);

    let injectionsRejected = 0;
    for (const injection of [{ factorOwner: {} }, { hnfOwner: {} },
      { acceptanceOwner: {} }, { unitOwner: {} }, { closureOwner: {} },
      { w0Path: "/tmp/W0" }]) {
      await assert.rejects(transaction.runFreshPreparedRequest({ prepared,
        outputDirectory, ...injection }));
      injectionsRejected += 1;
    }
    const changed = structuredClone(prepared);
    changed.retainedOwner = {};
    assert.throws(() => transaction.validatePrepared(changed), /unreviewed/);
    assert.equal(pipelineCalls, 1, "rejected inputs reached the pipeline");

    const source = fs.readFileSync(pipelinePath, "utf8");
    assert.doesNotMatch(source, /panel-20|w0Path|W0[^:]*fs\.read/);
    assert.doesNotMatch(source, /qualifiedTiming|reserveClaim/);
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row20-fresh-prepared-focused-check-v1",
      syntheticInvocation: true, injectionsRejected,
      preparedMutationsRejected: 1, transactionLocalBrand: true,
      copiedReceiptRejected: true, w0Opened: false,
      timingClaim: false, reserveClaim: false,
    })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

async function genuine(preparedPath, outputDirectory, oraclePath) {
  const transaction = require(transactionPath);
  const neutral = require(neutralPath);
  const registry = require("./fresh_prepared_development_registry.cjs");
  const roots = require("./phase5_development_roots.cjs");
  const prepared = JSON.parse(fs.readFileSync(preparedPath, "utf8"));
  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prep_polynomial[0] = "-13"; },
    value => { value.prep_index = "9"; },
    value => { value.n = 6; },
    value => { value.retainedOwner = {}; },
  ]) {
    const changed = structuredClone(prepared);
    mutate(changed);
    assert.throws(() => transaction.validatePrepared(changed));
    preparedMutationsRejected += 1;
  }
  const receipt = await transaction.runFreshPreparedRequest({ prepared,
    outputDirectory });
  transaction.verifyFreshPreparedReceipt(receipt);
  assert(receipt.verifiedResult instanceof
    neutral.ImmutableClassUnitCorrespondenceResult);
  assert.deepEqual(receipt.classGroup,
    { classNumber: "1", invariantFactors: [] });
  assert.equal(receipt.exactUnitCount, 2);
  assert.equal(receipt.torsionOrder, "2");
  assert.deepEqual(receipt.hnfState, [0, 7, 7, 0, 7, 4, 0, 14, 0]);
  assert.equal(sha256(fs.readFileSync(receipt.result.path)),
    receipt.result.sha256);
  assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
  const root = roots.developmentRoot(20);
  const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
  assert.equal(admitted.result.sha256, receipt.result.sha256);
  assert.equal(admitted.sourceMetadata.fieldId, root.internalFieldId);
  assert.equal(registry.verifyFreshExecution(
    admitted.freshExecution, { root, result: admitted.result }),
  admitted.freshExecution);
  assert.throws(() => registry.admitRegisteredFreshReceipt({
    root, receipt: { ...receipt },
  }));

  // Deliberately after publication: W0 can diagnose the independently produced
  // result, but can never supply an owner or a runtime input to the transaction.
  let postPublicationOracle = null;
  if (oraclePath) {
    const oracleBytes = fs.readFileSync(oraclePath);
    assert.equal(sha256(oracleBytes), W0_SHA256);
    postPublicationOracle = { sha256: W0_SHA256, openedAfterPublication: true };
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row20-fresh-prepared-genuine-check-v1",
    preparedAuthoritySha256: receipt.preparedAuthoritySha256,
    mathematicalAuthoritySha256: receipt.mathematicalAuthoritySha256,
    result: receipt.result, classGroup: receipt.classGroup,
    exactUnitCount: receipt.exactUnitCount, torsionOrder: receipt.torsionOrder,
    hnfState: receipt.hnfState, correspondenceComplete: true,
    publicComplete: false, freshPreparedExecution: true,
    frozenW0RuntimeInput: false, postPublicationOracle,
    registryAdmission: true,
    preparedMutationsRejected,
    timingClaim: false, reserveClaim: false,
  })}\n`);
}

if (process.argv[2] === "--genuine") {
  assert(process.argv[3] && process.argv[4],
    "usage: check ... --genuine PREPARED OUTPUT [ORACLE_W0]");
  genuine(process.argv[3], process.argv[4], process.argv[5]).catch(error => {
    console.error(error.stack || error); process.exitCode = 1;
  });
} else {
  focused().catch(error => { console.error(error.stack || error);
    process.exitCode = 1; });
}
