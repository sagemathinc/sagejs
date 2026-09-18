"use strict";

// Untimed, in-process authority for one genuine row-14 prepared execution.
//
// The strict host remains responsible for all mathematics and for publishing
// the neutral result.  This adapter deliberately does not forward its clocks,
// RSS observations, temporary paths, or stage diagnostics.  A module-local
// brand prevents callers from promoting a reconstructed JSON object to fresh
// execution evidence.

const assert = require("node:assert/strict");
const fs = require("node:fs");

const neutral = require("./class_unit_correspondence_result.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const strict = require("./row14_strict_prepared_complete_host.cjs");

const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row14-fresh-prepared-execution-v1";
const PANEL_INDEX = 14;
const FIELD_ID =
  "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const POLYNOMIAL = Object.freeze(["-200000002", "-200000002", "0", "0", "1"]);
const EXPECTED_FINAL_SHA256 = strict.EXPECTED_FINAL_SHA256;
const brandedReceipts = new WeakSet();

function frozen(value) {
  if (Array.isArray(value)) value.forEach(frozen);
  else if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(frozen);
  }
  return Object.freeze(value);
}

function terminalProjection(payload) {
  assert.equal(payload.field.id, FIELD_ID);
  assert.equal(payload.field.degree, "4");
  assert.deepEqual(payload.field.definingPolynomialAscending, POLYNOMIAL);
  assert.deepEqual(payload.classGroup, {
    classNumber: "192",
    generatorCount: "2",
    invariantFactors: ["8", "24"],
    presentationOwner: "class-presentation",
  });
  assert.deepEqual(payload.unitGroup, {
    materialization: { precisionBits: "192", reason: "LARGE", tag: "not_given" },
    rank: "2",
    regulatorOwner: "regulator-enclosure",
    torsionGeneratorOwner: "torsion-generator",
    torsionOrder: "2",
  });
  assert.deepEqual(payload.terminal, {
    correspondence_complete: true,
    public_complete: false,
    status: "pari-correspondence-complete-internal",
  });
  return {
    classGroup: {
      classNumber: payload.classGroup.classNumber,
      invariantFactors: [...payload.classGroup.invariantFactors],
    },
    fieldId: payload.field.id,
    unitGroup: {
      materialization: "not_given(LARGE)",
      rank: payload.unitGroup.rank,
      torsionOrder: payload.unitGroup.torsionOrder,
    },
  };
}

function verifyPublishedResult(result) {
  assert(result && typeof result === "object" && !Array.isArray(result));
  assert.equal(result.sha256, EXPECTED_FINAL_SHA256,
    "strict row-14 result digest changed");
  assert.equal(result.correspondenceComplete, true);
  assert.equal(result.publicComplete, false);
  assert(result.verifiedResult instanceof
    neutral.ImmutableClassUnitCorrespondenceResult,
  "strict row-14 transaction did not retain its verified neutral result");
  assert.equal(result.verifiedResult.sha256, result.sha256);
  assert.match(result.mathematicalAuthoritySha256, /^[0-9a-f]{64}$/);
  const bytes = fs.readFileSync(result.path);
  assert.equal(bytes.length, result.bytes);
  assert.equal(neutral.sha256Bytes(bytes), result.sha256,
    "published row-14 result bytes changed");
  assert.equal(fs.statSync(result.path).mode & 0o222, 0,
    "published row-14 result is mutable");
  const envelope = JSON.parse(bytes);
  assert.deepEqual(Object.keys(envelope).sort(),
    ["payload", "payloadSha256", "schema"]);
  assert.equal(envelope.schema, neutral.ENVELOPE_SCHEMA);
  assert.equal(envelope.payloadSha256, neutral.sha256Canonical(envelope.payload),
    "published row-14 payload digest changed");
  return {
    envelopeSha256: result.sha256,
    mathematicalAuthoritySha256: result.mathematicalAuthoritySha256,
    payloadSha256: envelope.payloadSha256,
    terminal: terminalProjection(envelope.payload),
  };
}

function validateReceiptShape(receipt) {
  assert.deepEqual(Object.keys(receipt).sort(), [
    "bytes", "correspondenceComplete", "fieldId", "freshPreparedExecution",
    "frozenW0RuntimeInput",
    "mathematicalAuthoritySha256", "panelIndex", "path",
    "preparedAuthoritySha256", "publicComplete", "qualifiedTiming", "reserveAccess",
    "resultEnvelopeSha256",
    "resultPayloadSha256", "retainedRuntimeInputs", "runtimeInputs", "schema",
    "sha256", "terminal",
  ]);
  assert.equal(receipt.schema, RECEIPT_SCHEMA);
  assert.equal(receipt.panelIndex, PANEL_INDEX);
  assert.equal(receipt.fieldId, FIELD_ID);
  assert.match(receipt.preparedAuthoritySha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.resultEnvelopeSha256, EXPECTED_FINAL_SHA256);
  assert.equal(receipt.sha256, EXPECTED_FINAL_SHA256);
  assert.equal(typeof receipt.path, "string");
  assert(Number.isSafeInteger(receipt.bytes) && receipt.bytes > 0);
  assert.match(receipt.resultPayloadSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.mathematicalAuthoritySha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.retainedRuntimeInputs, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.reserveAccess, false);
  assert.deepEqual(receipt.runtimeInputs,
    ["authenticated neutral prepared-nf projection"]);
  assert.deepEqual(receipt.terminal, {
    classGroup: { classNumber: "192", invariantFactors: ["8", "24"] },
    fieldId: FIELD_ID,
    unitGroup: { materialization: "not_given(LARGE)", rank: "2", torsionOrder: "2" },
  });
  return receipt;
}

function verifyFreshPreparedReceipt(receipt) {
  assert(brandedReceipts.has(receipt),
    "row-14 fresh-prepared receipt lacks the live execution brand");
  assert(Object.isFrozen(receipt), "row-14 fresh-prepared receipt is mutable");
  return validateReceiptShape(receipt);
}

function validatePrepared(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, strict.EXPECTED_AUTHORITY_SHA256,
    "prepared-nf projection is outside the reviewed row-14 corridor");
  return authority;
}

async function runFreshPreparedExecution(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  // The public aggregate boundary accepts only the common normalized prepared
  // object.  The authority envelope is a private adapter detail: callers may
  // neither supply nor substitute its digest.
  const preparedAuthority = validatePrepared(prepared);
  const preparedEnvelope = {
    authoritySha256: preparedAuthority.sha256,
    data: structuredClone(prepared),
  };
  strict.validateStrictPrepared(preparedEnvelope);
  const result = await strict.runStrictPreparedComplete(
    preparedEnvelope, outputDirectory);
  const published = verifyPublishedResult(result);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    panelIndex: PANEL_INDEX,
    fieldId: FIELD_ID,
    preparedAuthoritySha256: preparedAuthority.sha256,
    path: result.path,
    sha256: result.sha256,
    bytes: result.bytes,
    resultEnvelopeSha256: published.envelopeSha256,
    resultPayloadSha256: published.payloadSha256,
    mathematicalAuthoritySha256: published.mathematicalAuthoritySha256,
    terminal: published.terminal,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    correspondenceComplete: true,
    publicComplete: false,
    qualifiedTiming: false,
    reserveAccess: false,
    runtimeInputs: ["authenticated neutral prepared-nf projection"],
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false,
    enumerable: false,
    value: result.verifiedResult,
    writable: false,
  });
  frozen(receipt);
  brandedReceipts.add(receipt);
  return verifyFreshPreparedReceipt(receipt);
}

module.exports = {
  FIELD_ID,
  PANEL_INDEX,
  RECEIPT_SCHEMA,
  isAuthenticFreshReceipt(receipt) { return brandedReceipts.has(receipt); },
  runFreshPrepared: runFreshPreparedExecution,
  runFreshPreparedExecution,
  validatePrepared,
  verifyFreshPreparedReceipt,
};
