"use strict";

// Untimed row-0 wrapper around the genuine unified prepared-H1 producer.
// Only the canonical verified neutral envelope crosses this boundary.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const auth = require("./prepared_nf_authentication.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const PANEL_INDEX = 0;
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const POLYNOMIAL = Object.freeze(["20034", "-20018", "0", "1"]);
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row0-fresh-prepared-execution-v1";
const EXPECTED_RESULT_SHA256 =
  "dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58";
const PREPARED_AUTHORITY_SHA256 =
  "e02411d4b97fdf92606698198993085b352a0d79e5a66133ac61c601e43dbba9";
const FRESH_RECEIPTS = new WeakSet();

function writeImmutable(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try {
    fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 });
    fs.chmodSync(filename, 0o444);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(filename), bytes,
      "content-addressed row-0 result path contains different bytes");
    fs.chmodSync(filename, 0o444);
  }
}

function validatePrepared(prepared) {
  assert(prepared && typeof prepared === "object" && !Array.isArray(prepared),
    "row-0 requires a normalized prepared-NF object");
  const authority = auth.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-0 corridor");
  return Object.freeze({
    authoritySha256: authority.sha256,
    data: structuredClone(prepared),
  });
}

function exactTerminal(result) {
  assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult,
    "row-0 producer did not return a verified neutral result");
  assert.equal(result.sha256, EXPECTED_RESULT_SHA256,
    "qualified row-0 neutral result digest changed");
  const payload = result.detachedPayload();
  neutral.validatePayload(payload);
  assert.deepEqual(payload.field, {
    definingPolynomialAscending: POLYNOMIAL,
    degree: "3",
    id: FIELD_ID,
  });
  assert.deepEqual(payload.classGroup, {
    classNumber: "1",
    generatorCount: "0",
    invariantFactors: [],
    presentationOwner: "class-presentation",
  });
  assert.deepEqual(payload.unitGroup, {
    materialization: {
      coordinatesOwner: "exact-unit-coordinates",
      normsOwner: "exact-unit-norms",
      tag: "exact_units",
    },
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
  return payload;
}

async function runFreshPrepared(prepared, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  assert(outputDirectory.length > 0);
  const preparedEnvelope = validatePrepared(prepared);
  // Keep compiler/native runtime loading behind the actual row-0 invocation;
  // merely importing the development registry remains a data-only operation.
  const producer = require("./row0_fresh_h1_result_producer.cjs");
  const result = await producer.produceFreshH1ClassUnitResult(
    preparedEnvelope.data);
  const payload = exactTerminal(result);
  const bytes = result.canonicalJSON();
  assert.equal(neutral.sha256Bytes(bytes), result.sha256,
    "row-0 verified envelope bytes changed");
  const filename = path.join(outputDirectory,
    `row0-class-unit-result-${result.sha256}.json`);
  writeImmutable(filename, bytes);
  assert.equal(neutral.sha256Bytes(fs.readFileSync(filename)), result.sha256);
  assert.equal(fs.statSync(filename).mode & 0o222, 0,
    "durable row-0 neutral result is mutable");

  const receipt = {
    schema: RECEIPT_SCHEMA,
    panelIndex: PANEL_INDEX,
    fieldId: FIELD_ID,
    preparedAuthoritySha256: preparedEnvelope.authoritySha256,
    path: filename,
    sha256: result.sha256,
    bytes: bytes.length,
    payloadSha256: neutral.sha256Canonical(payload),
    correspondenceComplete: true,
    publicComplete: false,
    freshPreparedExecution: true,
    retainedRuntimeInputs: false,
    frozenW0RuntimeInput: false,
    qualifiedTiming: false,
    reserveAccess: false,
    runtimeInputs: Object.freeze([
      "authenticated normalized prepared-nf data",
    ]),
  };
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false,
    enumerable: false,
    value: result,
    writable: false,
  });
  Object.freeze(receipt);
  FRESH_RECEIPTS.add(receipt);
  return receipt;
}

module.exports = {
  FIELD_ID,
  EXPECTED_RESULT_SHA256,
  PREPARED_AUTHORITY_SHA256,
  PANEL_INDEX,
  RECEIPT_SCHEMA,
  isAuthenticFreshReceipt(receipt) { return FRESH_RECEIPTS.has(receipt); },
  runFreshPrepared,
  validatePrepared,
};
