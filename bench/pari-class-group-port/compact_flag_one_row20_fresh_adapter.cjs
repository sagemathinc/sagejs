"use strict";

// Untimed bridge from the genuine row-20 prepared-input transaction to the
// already captured pristine PARI 2.17.4 flag-one authority.  This module does
// not accept retained Sage owners and does not execute or report timing.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const transaction = require("./row20_fresh_prepared_transaction.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const compact = require("./compact_flag_one_row20_adapter.cjs");

const SCHEMA =
  "sagejs.pari-class-group/compact-flag-one-row20-fresh-match-v1";
const RECEIPTS = new WeakSet();

function validateCurrentPopulation() {
  const manifest = JSON.parse(fs.readFileSync(compact.MANIFEST_PATH, "utf8"));
  assert.equal(manifest.schema,
    "sagejs.pari-class-group/compact-flag-one-manifest-v1");
  assert.equal(manifest.targetPariVersion, "2.17.4");
  assert.deepEqual(manifest.execution, { enabled: false,
    timingEnabled: false, finalRunEnabled: false,
    reserveOpeningEnabled: false });
  const qualification = JSON.parse(fs.readFileSync(path.join(__dirname,
    "class-unit-qualification-manifest.json"), "utf8"));
  const panel = JSON.parse(fs.readFileSync(path.join(__dirname,
    "panel.json"), "utf8"));
  const derived = qualification.fields.filter(
    field => field.role === "additional-development");
  assert.deepEqual(derived.map(field => field.panelIndex),
    manifest.derivation.panelIndices);
  assert.equal(manifest.fields.length, 12);
  for (const [index, field] of manifest.fields.entries()) {
    const qualified = derived[index];
    const row = panel.rows[field.panelIndex];
    assert.equal(qualified.id, field.id);
    assert.deepEqual(field, { panelIndex: qualified.panelIndex, id: row.id,
      stratum: row.stratum, degree: row.degree, signature: row.signature,
      polynomialSha256: row.polynomial_sha256 });
  }
  return manifest;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function projectFreshReceipt(receipt, {
  pariAuthority = path.join(__dirname,
    "pristine-row20-flag-one-authority.json"),
} = {}) {
  transaction.verifyFreshPreparedReceipt(receipt);
  assert(receipt.verifiedResult instanceof
    neutral.ImmutableClassUnitCorrespondenceResult,
  "row-20 fresh result has the wrong private result type");
  assert.equal(receipt.freshPreparedExecution, true);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.retainedOwnersRuntimeInputs, false);
  assert.equal(receipt.correspondenceComplete, true);
  const payload = receipt.verifiedResult.detachedPayload();
  neutral.validatePayload(payload);
  assert.equal(payload.field.id, "5.1.1000000.1");
  assert.equal(payload.unitGroup.materialization.tag, "exact_units");
  assert.equal(receipt.exactUnitCount, 2);

  // Validate the current hash-bound manifest and its unchanged compact
  // population before projecting the fresh result.
  const manifest = validateCurrentPopulation();
  const pari = compact.validatePristinePariAuthority(
    pariAuthority, manifest);
  const output = compact.commonOutput(payload);
  const outputDigest = compact.canonicalDigest(output);
  assert.equal(outputDigest, manifest.commonOutput.row20Sha256,
    "fresh Sage row-20 projection changed");
  assert.equal(outputDigest, pari.outputDigest,
    "fresh Sage and pristine PARI flag-one projections disagree");

  const matched = {
    schema: SCHEMA,
    diagnosticOnly: true,
    qualifiedTiming: false,
    tier: "compact-flag-one",
    fieldId: payload.field.id,
    execution: {
      sageFreshPreparedExecution: true,
      sageRetainedOwnerAdmission: false,
      pariFreshFlagOneAuthorityCaptured: true,
      pariCallExecutedThisInvocation: false,
      eagerExpansionAddedByAdapter: false,
      measurements: [],
      historicalSourcePinsCurrent: true,
    },
    authorities: {
      sagePreparedAuthoritySha256: receipt.preparedAuthoritySha256,
      sageMathematicalAuthoritySha256:
        receipt.mathematicalAuthoritySha256,
      sageResultSha256: receipt.result.sha256,
      pariAuthoritySha256: compact.PARI_AUTHORITY_SHA256,
    },
    output,
    outputDigest,
  };
  Object.defineProperty(matched, "freshReceipt", {
    configurable: false,
    enumerable: false,
    value: receipt,
    writable: false,
  });
  deepFreeze(matched);
  RECEIPTS.add(matched);
  return matched;
}

async function runFreshMatched({ prepared, outputDirectory,
  pariAuthority } = {}) {
  const receipt = await transaction.runFreshPrepared(prepared,
    outputDirectory);
  return projectFreshReceipt(receipt, { pariAuthority });
}

function verifyFreshMatched(receipt) {
  assert(RECEIPTS.has(receipt),
    "row-20 compact match lacks the adapter-local brand");
  assert(Object.isFrozen(receipt));
  transaction.verifyFreshPreparedReceipt(receipt.freshReceipt);
  return receipt;
}

module.exports = { SCHEMA, projectFreshReceipt, runFreshMatched,
  validateCurrentPopulation, verifyFreshMatched };
