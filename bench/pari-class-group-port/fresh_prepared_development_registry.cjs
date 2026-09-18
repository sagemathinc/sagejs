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
const roots = require("./phase5_development_roots.cjs");
const row0 = require("./row0_fresh_prepared_execution.cjs");
const row6 = require("./row6_fresh_prepared_transaction_host.cjs");
const row13 = require("./row13_fresh_prepared_transaction.cjs");
const row14 = require("./row14_fresh_prepared_execution.cjs");

const SCHEMA = "sagejs.pari-class-group/fresh-prepared-development-execution-v1";
const FRESH_EXECUTIONS = new WeakSet();
const RUNNERS = new Map([
  [0, row0],
  [6, row6],
  [13, row13],
  [14, row14],
]);

function registeredRoot(root) {
  assert(root && typeof root === "object" && !Array.isArray(root));
  const registered = roots.developmentRoot(root.panelIndex);
  assert.equal(root, registered, "fresh execution root was not supplied by the registry");
  assert(RUNNERS.has(root.panelIndex),
    `development row ${root.panelIndex} has no registered fresh-prepared runner`);
  return registered;
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
  const receipt = await RUNNERS.get(registered.panelIndex)
    .runFreshPrepared(prepared, outputDirectory);
  return admitRegisteredFreshReceipt({ root: registered, receipt });
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
  verifyFreshExecution,
};
