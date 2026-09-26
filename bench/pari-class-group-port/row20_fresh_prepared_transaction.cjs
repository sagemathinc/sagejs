"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const pipeline = require("./row20_fresh_prepared_pipeline.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const SCHEMA = "sagejs.pari-class-group/row20-fresh-prepared-receipt-v1";
const PREPARED_AUTHORITY_SHA256 =
  "15ecf1209df2e48bd8a9e5ad75bc6dac0598d513bc6a06b7712ccfc255febbc6";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const RECEIPTS = new WeakSet();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validatePrepared(prepared) {
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared));
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS,
    "row-20 transaction received an unreviewed prepared field");
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-20 corridor");
  return authority;
}

function writeImmutable(directory, bytes) {
  fs.mkdirSync(directory, { recursive: true });
  const digest = sha(bytes);
  const destination = path.join(directory,
    `row20-fresh-neutral-result-${digest}.json`);
  try {
    fs.writeFileSync(destination, bytes, { flag: "wx", mode: 0o400 });
    fs.chmodSync(destination, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert(fs.readFileSync(destination).equals(bytes),
      "immutable row-20 result publication conflicts");
  }
  return { path: destination, sha256: digest, bytes: bytes.length };
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const authority = validatePrepared(prepared);
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row20-fresh-prepared-"));
  fs.chmodSync(privateDirectory, 0o700);
  try {
    const completed = await pipeline.runSameInvocation(
      structuredClone(prepared), privateDirectory);
    assert(completed.result instanceof
      neutral.ImmutableClassUnitCorrespondenceResult);
    const publication = writeImmutable(outputDirectory, completed.raw);
    const receipt = {
      schema: SCHEMA,
      preparedAuthoritySha256: authority.sha256,
      freshPreparedExecution: true,
      retainedRuntimeInputs: false,
      retainedOwnersRuntimeInputs: false,
      frozenW0RuntimeInput: false,
      correspondenceComplete: true,
      publicComplete: false,
      runtimeInputs: ["authenticated normalized prepared-nf data"],
      excludedRuntimeInputs: ["factor owner", "relation/HNF owner",
        "acceptance owner", "unit owner", "retained C7 owner", "W0"],
      ownerAuthority: completed.ancestry,
      mathematicalAuthoritySha256: completed.mathematicalAuthoritySha256,
      result: publication,
      classGroup: { classNumber: completed.summary.classNumber,
        invariantFactors: completed.summary.invariantFactors },
      exactUnitCount: completed.summary.exactUnitCount,
      torsionOrder: completed.summary.torsionOrder,
      hnfState: completed.summary.hnfState,
    };
    Object.defineProperty(receipt, "verifiedResult", {
      configurable: false,
      enumerable: false,
      value: completed.result,
      writable: false,
    });
    deepFreeze(receipt);
    RECEIPTS.add(receipt);
    return receipt;
  } finally {
    fs.rmSync(privateDirectory, { recursive: true, force: true });
  }
}

async function runFreshPreparedRequest(request) {
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.deepEqual(Object.keys(request).sort(), ["outputDirectory", "prepared"]);
  return runFreshPrepared(request.prepared, request.outputDirectory);
}

function verifyFreshPreparedReceipt(receipt) {
  assert(RECEIPTS.has(receipt),
    "row-20 receipt lacks the transaction-local brand");
  assert(Object.isFrozen(receipt), "row-20 fresh receipt is mutable");
  assert(receipt.verifiedResult instanceof
    neutral.ImmutableClassUnitCorrespondenceResult);
  return receipt;
}

function isAuthenticFreshReceipt(receipt) {
  return RECEIPTS.has(receipt);
}

module.exports = { PREPARED_AUTHORITY_SHA256, SCHEMA,
  isAuthenticFreshReceipt, runFreshPrepared, runFreshPreparedRequest,
  validatePrepared, verifyFreshPreparedReceipt };
