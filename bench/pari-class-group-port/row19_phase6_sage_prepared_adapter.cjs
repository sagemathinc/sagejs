"use strict";

// Qualification normalization over the row-19 one-call prepared aggregate.
// Allocation, authentication, compilation and semantic projection remain
// outside the measured invocation. A resident is deliberately single-use:
// the aggregate mutates its live owners and has no hidden reset path.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const aggregate = require("./row19_phase6_prepared_aggregate_host.cjs");
const authentication = require("./prepared_nf_authentication.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-19-ca58db0bc082112bf2922e3f5f4cf99fbaad71825a5650f6c32a29b3b8db6cdf.json";
const FIELD_ID = "3.1.1086061775432017340256300.107";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "-51050867718180330", "0", "0", "1",
]);
const PREPARED_AUTHORITY_SHA256 =
  "1b3e3f6f97701556492edfe8576bf1337537096bb4d5eda357d7f92fc2fa5c35";
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row19-phase6-common-projection-v1";
const CONSUMED = new WeakSet();

function semanticProjection(result) {
  assert.equal(result.schema,
    "sagejs.pari-class-group/row19-prepared-aggregate-result-v1");
  assert.equal(result.panelIndex, 19);
  assert.equal(result.fieldId, FIELD_ID);
  assert.equal(result.preparedAuthoritySha256, PREPARED_AUTHORITY_SHA256);
  assert.equal(result.classNumber, "39366");
  assert.deepEqual(result.invariants,
    ["6", "3", "3", "3", "3", "3", "3", "3", "3"]);
  assert.deepEqual(result.terminalAcceptanceState, [2, 0, 0]);
  assert.deepEqual(result.classState,
    [0, 0, 9, 0, 2, 0, 0, 243, 0, 0, 9, 243]);
  assert.deepEqual(result.unitState,
    [0, 430, 6, 1, 352, 20, 1, 1, 192, 1]);
  assert.equal(result.correspondenceComplete, true);
  assert.equal(result.nativeCallsInsideTimedBoundary, 1);
  return {
    schema: PROJECTION_SCHEMA,
    field: { id: FIELD_ID,
      polynomialAscending: [...POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "39366",
      invariantFactors: ["3", "3", "3", "3", "3", "3", "3", "3", "6"],
      generatorCount: "9" },
    unitGroup: { rank: "1", regulatorPresent: true, torsionOrder: "2" },
    completionMode: "flag-zero-class-and-unit-result",
  };
}

async function prepareResident(inputPath = DEFAULT_INPUT, options = {}) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-19 corridor");
  return aggregate.prepare(prepared, options);
}

function runResident(resident) {
  assert(!CONSUMED.has(resident),
    "row-19 prepared aggregate residents are single-use");
  CONSUMED.add(resident);
  const started = process.hrtime.bigint();
  const live = aggregate.invokeNative(resident);
  const kernelNanoseconds = String(process.hrtime.bigint() - started);
  const result = aggregate.projectNative(live);
  const terminalState = aggregate.liveOwners(result).factor_random_state
    .toArray().map(String);
  assert.equal(terminalState.length, 66);
  return {
    schema: "sagejs.pari-class-group/row19-sage-prepared-sample-v1",
    kernelNanoseconds,
    processMaxRssKiB: String(process.resourceUsage().maxRSS),
    projection: semanticProjection(result),
    rng: { algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState },
    provenance: { preparedAuthoritySha256: resident.authoritySha256,
      nativeCacheKey: resident.built.cacheKey },
    boundary: { nativeCallsInsideClock: 1, compilationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
      authenticationInsideClock: false, projectionInsideClock: false,
      replayInsideClock: false, filesystemInsideClock: false,
      serializationInsideClock: false, residentSingleUse: true },
  };
}

module.exports = { DEFAULT_INPUT, FIELD_ID, POLYNOMIAL_ASCENDING,
  PREPARED_AUTHORITY_SHA256, PROJECTION_SCHEMA, prepareResident, runResident,
  semanticProjection };
