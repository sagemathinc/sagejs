"use strict";

// Genuine row-13 transaction rooted only in normalized prepared-NF data.
// Intermediate owners remain in memory and are never publication inputs.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const initial = require("./row13_prepared_initial_owner.cjs");
const complete = require("./row13_terminal_transaction_host.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const EXPECTED_PREPARED_AUTHORITY_SHA256 =
  "21e60a11663b021554ca5afcb249e5ca5e7c4b28641ed7e50ed281a7d30254b9";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const FRESH_RECEIPTS = new WeakSet();

function validatePreparedData(preparedData) {
  assert.deepEqual(Object.keys(preparedData).sort(), PREPARED_KEYS,
    "fresh transaction received an unreviewed prepared-NF field");
  const authority = authentication.authenticatePreparedNf(preparedData);
  assert.equal(authority.sha256, EXPECTED_PREPARED_AUTHORITY_SHA256,
    "prepared-NF data is outside the reviewed row-13 corridor");
  return authority;
}

function writeImmutable(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 });
    fs.chmodSync(filename, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(filename), bytes,
      "content-addressed receipt path contains different bytes");
  }
}

async function runFreshPrepared(preparedData, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const authority = validatePreparedData(preparedData);
  const preparedEnvelope = {
    authoritySha256: authority.sha256,
    data: structuredClone(preparedData),
  };
  const root = await initial.computePreparedInitialOwner({
    prepared: preparedEnvelope.data,
    preparedAuthoritySha256: preparedEnvelope.authoritySha256,
  });
  const semanticRootAuthority = complete.semanticRootAuthority(root.owner);
  const withTelemetry = structuredClone(root.owner);
  withTelemetry.execution.elapsedNs = root.telemetry.elapsedNs;
  withTelemetry.execution.maxRssKiB = root.telemetry.maxRssKiB;
  assert.deepEqual(complete.semanticRootAuthority(withTelemetry),
    semanticRootAuthority, "execution telemetry changed semantic authority");
  complete.synthesizeMetadata(preparedEnvelope, withTelemetry);
  let semanticMutationsRejected = 0;
  for (const mutate of [
    (value) => { value.field.polynomial[0] = "-20000000009"; },
    (value) => { value.authority.sourceSha256 = "0".repeat(64); },
    (value) => { value.relations.denseRecords[0] = "1"; },
  ]) {
    const changed = structuredClone(root.owner);
    mutate(changed);
    assert.throws(() => complete.synthesizeMetadata(preparedEnvelope, changed));
    semanticMutationsRejected += 1;
  }
  const downstream = await complete.runPreparedComplete(
    preparedEnvelope, root.owner, outputDirectory);
  const resultBytes = fs.readFileSync(downstream.path);
  assert.equal(neutral.sha256Bytes(resultBytes), downstream.sha256);
  assert.equal(fs.statSync(downstream.path).mode & 0o222, 0);

  const receipt = {
    schema: "sagejs.pari-class-group/row13-fresh-prepared-receipt-v1",
    result: {
      path: downstream.path,
      sha256: downstream.sha256,
      bytes: downstream.bytes,
      mathematicalAuthoritySha256: downstream.mathematicalAuthoritySha256,
    },
    preparedAuthoritySha256: authority.sha256,
    initialRootSemanticAuthority: semanticRootAuthority,
    correspondenceComplete: true,
    publicComplete: false,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    telemetryIdentityNeutral: true,
    semanticMutationsRejected,
    runtimeInputs: ["normalized authenticated prepared-NF data"],
    excludedRuntimeInputs: [
      "prepared-initial owner",
      "Gate-C owner",
      "accepted relation owner",
      "post-1006 answer",
      "class witness owner",
      "unit owner",
      "C7 envelope",
      "W0",
    ],
    relationState: downstream.relationState,
    collectionPasses: downstream.collectionPasses,
    classGroup: downstream.classGroup,
    unitMaterialization: downstream.unitMaterialization,
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`);
  const receiptSha256 = neutral.sha256Bytes(receiptBytes);
  const receiptPath = path.join(outputDirectory,
    `row13-fresh-prepared-receipt-${receiptSha256}.json`);
  writeImmutable(receiptPath, receiptBytes);
  const published = { ...receipt, receipt: {
    path: receiptPath, sha256: receiptSha256, bytes: receiptBytes.length,
  } };
  Object.defineProperty(published, "verifiedResult", {
    configurable: false,
    enumerable: false,
    value: downstream.verifiedResult,
    writable: false,
  });
  FRESH_RECEIPTS.add(published);
  return published;
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function isAuthenticFreshReceipt(receipt) {
  return FRESH_RECEIPTS.has(receipt);
}

module.exports = {
  EXPECTED_PREPARED_AUTHORITY_SHA256,
  isAuthenticFreshReceipt,
  runFreshPrepared,
  runFreshPreparedRequest,
  validatePreparedData,
};
