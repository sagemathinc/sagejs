"use strict";

// Exact admission boundary for genuine prepared-input development executions.
//
// An enumerable `freshPreparedExecution: true` claim is never authority.  The
// field-specific transaction must return the same in-process object branded by
// its private WeakSet, including the non-enumerable replay-verified neutral
// result.  This registry then issues a second private brand tied to the frozen
// Phase-5 root.  Copies and deserialized receipts fail both boundaries.

const assert = require("node:assert/strict");
const fs = require("node:fs");

const neutral = require("./class_unit_correspondence_result.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const roots = require("./phase5_development_roots.cjs");
const preparedManifest = require("./fresh-prepared-corpus-manifest.json");
const row0 = require("./row0_fresh_prepared_execution.cjs");
const row1 = require("./row1_fresh_prepared_transaction.cjs");
const row3 = require("./row3_fresh_prepared_transaction.cjs");
const row4 = require("./row4_fresh_prepared_transaction.cjs");
const row6 = require("./row6_fresh_prepared_transaction_host.cjs");
const row8 = require("./row8_fresh_prepared_transaction.cjs");
const row10 = require("./row10_fresh_prepared_transaction.cjs");
const row11 = require("./row11_fresh_prepared_transaction.cjs");
const row13 = require("./row13_fresh_prepared_transaction.cjs");
const row14 = require("./row14_fresh_prepared_execution.cjs");
const row16 = require("./row16_fresh_prepared_transaction.cjs");
const row18 = require("./row18_fresh_prepared_transaction.cjs");
const row19 = require("./row19_fresh_prepared_transaction.cjs");
const row20 = require("./row20_fresh_prepared_transaction.cjs");
const row21 = require("./row21_fresh_prepared_transaction.cjs");
const row23 = require("./row23_fresh_prepared_transaction.cjs");

const SCHEMA = "sagejs.pari-class-group/fresh-prepared-development-execution-v1";
const FRESH_EXECUTIONS = new WeakSet();
const RUNNERS = new Map([
  [0, row0],
  [1, row1],
  [3, row3],
  [4, row4],
  [6, row6],
  [8, row8],
  [10, row10],
  [11, row11],
  [13, row13],
  [14, row14],
  [16, row16],
  [18, row18],
  [19, row19],
  [20, row20],
  [21, row21],
  [23, row23],
]);
const EXPECTED_PREPARED = new Map(preparedManifest.rows.map(row => [
  row.panelIndex,
  Object.freeze({
    authoritySha256: row.preparedAuthoritySha256,
    jsonSha256: row.preparedJsonSha256,
  }),
]));
const NORMALIZED_PREPARED_KEYS = Object.freeze(
  [...preparedManifest.normalizedPreparedKeys].sort());

assert.deepEqual([...RUNNERS.keys()], roots.DEVELOPMENT_ROOTS.map(root => root.panelIndex),
  "fresh-prepared runner population differs from the development population");
assert.deepEqual([...EXPECTED_PREPARED.keys()], [...RUNNERS.keys()],
  "prepared authority population differs from the runner population");

function registeredRoot(root) {
  assert(root && typeof root === "object" && !Array.isArray(root));
  const registered = roots.developmentRoot(root.panelIndex);
  assert.equal(root, registered, "fresh execution root was not supplied by the registry");
  assert(RUNNERS.has(root.panelIndex),
    `development row ${root.panelIndex} has no registered fresh-prepared runner`);
  return registered;
}

/**
 * Authenticate a raw normalized prepared object for one registered runner.
 *
 * This is deliberately the same public input shape consumed by
 * `runRegisteredFreshPrepared`: no private envelope, filename, corpus record,
 * output, or answer-bearing fixture is admitted.  The exact normalized key
 * set rejects added answer fields, `authenticatePreparedNf` verifies the
 * mathematical prepared-NF relationships, and the frozen per-row digest binds
 * that authority to the selected runner.
 */
function validateRegisteredFreshPrepared({ root, prepared }) {
  const registered = registeredRoot(root);
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared),
    "fresh prepared input must be a raw normalized object");
  assert.deepEqual(Object.keys(prepared).sort(), NORMALIZED_PREPARED_KEYS,
    "fresh prepared input has an unreviewed or missing normalized key");
  const authority = authentication.authenticatePreparedNf(prepared);
  const expected = EXPECTED_PREPARED.get(registered.panelIndex);
  assert.equal(authority.sha256, expected.authoritySha256,
    `prepared authority does not match registered row ${registered.panelIndex}`);
  return Object.freeze({
    panelIndex: registered.panelIndex,
    fieldId: registered.manifestFieldId,
    internalFieldId: registered.internalFieldId,
    degree: authority.degree,
    signature: Object.freeze([...authority.signature]),
    preparedAuthoritySha256: authority.sha256,
    preparedJsonSha256: expected.jsonSha256,
  });
}

function validateDurableResult(receipt, result) {
  assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult,
    "fresh transaction did not retain its replay-verified neutral result");
  assert.equal(result.sha256, receipt.sha256 || receipt.result?.sha256,
    "fresh receipt and verified result digests differ");
  const filename = receipt.path || receipt.result?.path;
  assert.equal(typeof filename, "string");
  const bytes = fs.readFileSync(filename);
  assert.equal(neutral.sha256Bytes(bytes), result.sha256,
    "fresh durable result changed after verification");
  assert.equal(fs.statSync(filename).mode & 0o222, 0,
    "fresh durable result is mutable");
}

function validateFreshClaims(receipt, runner) {
  assert.equal(runner.isAuthenticFreshReceipt(receipt), true,
    "fresh receipt lacks its transaction-local brand");
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  for (const key of ["elapsedNs", "stageElapsedNs", "maxRssKiB",
    "kernelNanoseconds", "wallNanoseconds", "threadCpuNanoseconds"])
    assert.equal(Object.hasOwn(receipt, key), false,
      `fresh correctness receipt leaked timing field ${key}`);
}

function admitRegisteredFreshReceipt({ root, receipt }) {
  const registered = registeredRoot(root);
  const runner = RUNNERS.get(registered.panelIndex);
  validateFreshClaims(receipt, runner);
  const result = receipt.verifiedResult;
  validateDurableResult(receipt, result);
  const normalized = roots.normalizeVerifiedDevelopmentRoot({
    panelIndex: registered.panelIndex,
    result,
    sourceMetadata: {
      fieldId: registered.internalFieldId,
      correspondenceComplete: true,
      publicComplete: false,
    },
  });
  const payloadSha256 = neutral.sha256Canonical(result.detachedPayload());
  const replay = Object.freeze({
    schema: `${SCHEMA}-detached-replay`,
    fieldId: registered.internalFieldId,
    resultSha256: result.sha256,
    payloadSha256,
    correspondenceComplete: true,
    publicComplete: false,
  });
  const freshExecution = Object.freeze({
    schema: SCHEMA,
    panelIndex: registered.panelIndex,
    fieldId: registered.manifestFieldId,
    internalFieldId: registered.internalFieldId,
    resultSha256: result.sha256,
    payloadSha256,
    preparedAuthoritySha256: receipt.preparedAuthoritySha256 ||
      receipt.semanticAuthority?.preparedAuthoritySha256 || null,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    qualifiedTiming: false,
  });
  FRESH_EXECUTIONS.add(freshExecution);
  return Object.freeze({
    result: normalized.result,
    replay,
    sourceMetadata: normalized.sourceMetadata,
    freshExecution,
  });
}

async function runRegisteredFreshPrepared({ root, prepared, outputDirectory }) {
  const registered = registeredRoot(root);
  assert.equal(typeof outputDirectory, "string");
  const compatibility = validateRegisteredFreshPrepared({
    root: registered,
    prepared,
  });
  const receipt = await RUNNERS.get(registered.panelIndex)
    .runFreshPrepared(prepared, outputDirectory);
  const admitted = admitRegisteredFreshReceipt({ root: registered, receipt });
  assert.equal(admitted.freshExecution.preparedAuthoritySha256,
    compatibility.preparedAuthoritySha256,
  "fresh runner used a different prepared authority than registry admission");
  return admitted;
}

function verifyFreshExecution(freshExecution, { root, result }) {
  const registered = registeredRoot(root);
  assert.equal(FRESH_EXECUTIONS.has(freshExecution), true,
    "fresh execution receipt lacks the registry-local brand");
  assert.equal(freshExecution.panelIndex, registered.panelIndex);
  assert.equal(freshExecution.fieldId, registered.manifestFieldId);
  assert.equal(freshExecution.internalFieldId, registered.internalFieldId);
  assert.equal(freshExecution.resultSha256, result.sha256);
  assert.equal(freshExecution.qualifiedTiming, false);
  return freshExecution;
}

module.exports = {
  SCHEMA,
  admitRegisteredFreshReceipt,
  runRegisteredFreshPrepared,
  validateRegisteredFreshPrepared,
  verifyFreshExecution,
};
