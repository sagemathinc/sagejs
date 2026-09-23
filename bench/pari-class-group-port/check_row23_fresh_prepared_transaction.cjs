#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const transactionPath = require.resolve("./row23_fresh_prepared_transaction.cjs");
const pipelinePath = require.resolve("./row23_fresh_prepared_pipeline.cjs");
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
  "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
class FakeVerifiedResult {
  constructor() {
    this.sha256 = sha256(Buffer.from("neutral"));
  }
  detachedPayload() {
    return { field: { id: "5.5.1002836007889.1", degree: "5",
      definingPolynomialAscending: ["341", "-970", "772", "-141", "-2", "1"] } };
  }
}
let pipelineCalls = 0;
require.cache[authenticationPath] = { id: authenticationPath,
  filename: authenticationPath, loaded: true,
  exports: { authenticatePreparedNf: () => ({ sha256: PREPARED_SHA256 }) } };
require.cache[neutralPath] = { id: neutralPath, filename: neutralPath, loaded: true,
  exports: { ImmutableClassUnitCorrespondenceResult: FakeVerifiedResult,
    sha256Bytes: sha256,
    sha256Canonical: value => sha256(Buffer.from(JSON.stringify(value))),
    validatePayload: () => {} } };
require.cache[pipelinePath] = { id: pipelinePath, filename: pipelinePath, loaded: true,
  exports: { async runSameInvocation(prepared, directory) {
    pipelineCalls += 1;
    assert.equal(fs.statSync(directory).mode & 0o077, 0);
    assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS);
    return {
      final: { raw: Buffer.from("final-source"), sha256: "1".repeat(64) },
      neutral: { result: new FakeVerifiedResult(), sealed: Buffer.from("neutral"),
        mathematicalAuthoritySha256: "2".repeat(64) },
      summary: { factorOwnerSha256: "3".repeat(64),
        relationOwnerSha256: "4".repeat(64),
        acceptanceOwnerSha256: "5".repeat(64),
        classWitnessOwnerSha256: "6".repeat(64),
        correspondenceOwnerSha256: "7".repeat(64),
        unitOwnerSha256: "8".repeat(64) },
    };
  } } };
delete require.cache[transactionPath];
const transaction = require(transactionPath);

async function main() {
  const prepared = Object.fromEntries(PREPARED_KEYS.map(key => [key, []]));
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row23-fresh-check-"));
  try {
    const receipt = await transaction.runFreshPreparedRequest({ prepared,
      outputDirectory });
    assert.equal(pipelineCalls, 1);
    assert.equal(transaction.verifyFreshPreparedReceipt(receipt), receipt);
    assert.equal(transaction.isAuthenticFreshReceipt(receipt), true);
    assert.throws(() => transaction.verifyFreshPreparedReceipt({ ...receipt }),
      /transaction-local brand/);
    assert.equal(transaction.isAuthenticFreshReceipt({ ...receipt }), false);
    assert(Object.isFrozen(receipt));
    assert(Object.isFrozen(receipt.ownerAuthority));
    assert(receipt.verifiedResult instanceof FakeVerifiedResult);
    assert.equal(Object.keys(receipt).includes("verifiedResult"), false);
    assert.deepEqual(receipt.runtimeInputs,
      ["authenticated normalized prepared-nf data"]);
    assert.equal(receipt.frozenW0RuntimeInput, false);
    assert.equal(receipt.retainedOwnersRuntimeInputs, false);
    assert.equal(receipt.retainedRuntimeInputs, false);
    assert.deepEqual(receipt.result, receipt.neutralResult);
    const roots = require("./phase5_development_roots.cjs");
    const registry = require("./fresh_prepared_development_registry.cjs");
    const root = roots.developmentRoot(23);
    const admitted = registry.admitRegisteredFreshReceipt({ root, receipt });
    assert.equal(admitted.freshExecution.panelIndex, 23);
    assert.equal(registry.verifyFreshExecution(admitted.freshExecution, {
      root, result: admitted.result,
    }), admitted.freshExecution);
    assert.equal(receipt.correspondenceComplete, true);
    assert.equal(receipt.publicComplete, false);
    for (const publication of [receipt.finalSource, receipt.neutralResult]) {
      assert.equal(fs.statSync(publication.path).mode & 0o222, 0);
      assert.equal(fs.readFileSync(publication.path).length, publication.bytes);
    }

    let injectionsRejected = 0;
    for (const injection of [{ factorOwner: {} }, { relationOwner: {} },
      { acceptanceOwner: {} }, { classOwner: {} },
      { correspondenceOwner: {} }, { unitOwner: {} }, { w0Path: "/tmp/W0" }]) {
      await assert.rejects(transaction.runFreshPreparedRequest({ prepared,
        outputDirectory, ...injection }));
      injectionsRejected += 1;
    }
    const changed = structuredClone(prepared);
    changed.unreviewed = [];
    assert.throws(() => transaction.validatePrepared(changed),
      /unreviewed prepared field/);
    assert.equal(pipelineCalls, 1,
      "rejected inputs reached the mathematical pipeline");

    const pipelineSource = fs.readFileSync(pipelinePath, "utf8");
    assert.match(pipelineSource,
      /correspondenceCoordinator\.compose\(/);
    assert.match(pipelineSource,
      /FreshRow23CorrespondenceAuthority/);
    assert.match(pipelineSource,
      /correspondence_authority=c/);
    assert.doesNotMatch(pipelineSource,
      /correspondenceCoordinator\.run\(/);
    assert.doesNotMatch(pipelineSource, /w0Path|panel-23|W0[^:]*fs\.read/);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row23-fresh-prepared-transaction-check-v1",
      syntheticInvocation: true,
      preparedMutationsRejected: 1,
      injectionsRejected,
      transactionLocalBrand: true,
      copiedReceiptRejected: true,
      degreeFiveComposeOnly: true,
      sameRunCorrespondenceAuthority: true,
      w0Opened: false,
      timingClaim: false,
      reserveClaim: false,
    })}\n`);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
