"use strict";

// Qualification normalization over the committed row-23 one-call prepared
// root.  This module adds no mathematics and never broadens the timed region.

const assert = require("node:assert/strict");
const root = require("./row23_phase6_prepared_root_host.cjs");

const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row23-phase6-common-projection-v1";
const FIELD_ID = "5.5.1002836007889.1";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "341", "-970", "772", "-141", "-2", "1",
]);

function semanticProjection(result) {
  root.verifyProjection(result);
  assert.equal(result.preparedAuthoritySha256,
    root.PREPARED_AUTHORITY_SHA256);
  return {
    schema: PROJECTION_SCHEMA,
    field: { id: FIELD_ID, polynomialAscending: [...POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: result.classGroup.classNumber,
      invariantFactors: [...result.classGroup.invariantFactors] },
    unitGroup: { rank: String(result.unitGroup.rank), regulatorPresent: true,
      torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

async function prepareResident(inputPath = root.DEFAULT_INPUT, options = {}) {
  return root.preparePrepared(inputPath, options);
}

function runResident(resident) {
  const receipt = root.runPrepared(resident);
  root.verifyPreparedReceipt(receipt);
  return {
    schema: "sagejs.pari-class-group/row23-sage-prepared-sample-v1",
    kernelNanoseconds: receipt.elapsedNanoseconds,
    processMaxRssKiB: String(process.resourceUsage().maxRSS),
    projection: semanticProjection(receipt.result),
    boundary: { nativeCallsInsideClock: 1, compilationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
      authenticationInsideClock: false, projectionInsideClock: false,
      replayInsideClock: false, filesystemInsideClock: false,
      serializationInsideClock: false },
  };
}

module.exports = { FIELD_ID, POLYNOMIAL_ASCENDING, PROJECTION_SCHEMA,
  prepareResident, runResident, semanticProjection };
