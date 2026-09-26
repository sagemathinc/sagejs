"use strict";

// Qualification normalization over the committed row-21 capability-backed
// final result. The single native call remains inside computeCandidate();
// exact class/unit replay and every projection below happen after its clock.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const aggregateSource = require("./row21_phase6_prepared_aggregate_source.cjs");
const factor = require("./row21_phase6_factor_base_host.cjs");
const finalResult = require("./row21_phase6_final_result.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const FIELD_ID = "5.3.1009349859375.3";
const POLYNOMIAL_ASCENDING = Object.freeze([
  "36", "930", "-305", "-90", "0", "1",
]);
const PREPARED_AUTHORITY_SHA256 = factor.AUTHORITY;
const PROJECTION_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-common-group-structure-projection-v2";
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row21-phase6-common-group-structure-replay-v1";

const sha256Bytes = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sha256File = filename => sha256Bytes(fs.readFileSync(filename));
const logical = owner => owner.entries.slice(0, Number(owner.logicalLength));

function ownersByName(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function semanticProjection(payload) {
  const owners = ownersByName(payload);
  assert.equal(payload.field.id, FIELD_ID);
  assert.deepEqual(payload.field.definingPolynomialAscending,
    [...POLYNOMIAL_ASCENDING]);
  assert.deepEqual(payload.classGroup, {
    classNumber: "1", generatorCount: "0", invariantFactors: [],
    presentationOwner: "class-presentation",
  });
  assert.equal(payload.unitGroup.rank, "3");
  assert.equal(payload.unitGroup.torsionOrder, "2");
  const units = logical(owners.get("exact-unit-coordinates"));
  const inverses = logical(owners.get("exact-unit-inverses"));
  const norms = logical(owners.get("exact-unit-norms"));
  const regulator = logical(owners.get("accepted-regulator"));
  assert.equal(units.length, 15);
  assert.equal(inverses.length, 15);
  assert(units.some(value => value !== "0"), "exact units are all zero");
  assert(inverses.some(value => value !== "0"), "exact inverses are all zero");
  assert.deepEqual(norms, ["-1", "-1", "-1"]);
  assert.equal(regulator.length, 3);
  assert.notEqual(regulator[0], "0", "accepted regulator is zero");
  return {
    schema: PROJECTION_SCHEMA,
    scope: "exact-abstract-class-and-unit-structure",
    field: { id: FIELD_ID,
      polynomialAscending: [...POLYNOMIAL_ASCENDING] },
    classGroup: { classNumber: "1", invariantFactors: [],
      generatorCount: "0" },
    unitGroup: { rank: "3", torsionOrder: "2" },
    regulatorEvidence: "nonzero-only-not-equal-value",
    completionMode: "flag-zero-class-and-unit-result",
  };
}

function replayProjection(payload, replay) {
  assert.equal(replay.schema, finalResult.REPLAY_SCHEMA);
  assert.equal(replay.fieldId, FIELD_ID);
  assert.equal(replay.correspondence_complete, true);
  assert.equal(replay.public_complete, false);
  assert.equal(replay.payloadSha256, neutral.sha256Canonical(payload));
  const projection = semanticProjection(payload);
  return {
    schema: REPLAY_SCHEMA,
    scope: projection.scope,
    fieldId: replay.fieldId,
    classNumber: payload.classGroup.classNumber,
    invariantFactors: [...payload.classGroup.invariantFactors],
    generatorCount: payload.classGroup.generatorCount,
    unitRank: payload.unitGroup.rank,
    torsionOrder: payload.unitGroup.torsionOrder,
    regulatorNonzero: true,
  };
}

async function prepareResident(inputPath = factor.DEFAULT_INPUT) {
  const resident = await finalResult.prepareResident(inputPath);
  assert(resident.acceptance.connected.prefix.prepared,
    "row-21 prepared owner disappeared after authentication");
  return resident;
}

function runResident(resident) {
  const candidate = finalResult.computeCandidate(resident);
  const inspected = finalResult.inspectCandidate(candidate);
  const payload = inspected.payload;
  const replay = finalResult.replayCandidatePayload(candidate, payload);
  const projection = semanticProjection(payload);
  const ownerMap = ownersByName(payload);
  const units = logical(ownerMap.get("exact-unit-coordinates"));
  const inverses = logical(ownerMap.get("exact-unit-inverses"));
  const regulator = logical(ownerMap.get("accepted-regulator"));
  const relationRecords = logical(ownerMap.get("relation-records"));
  assert.equal(candidate.boundary.nativeCallsInsideClock, 1);
  assert.equal(relationRecords.length % 24, 0);
  return {
    schema: "sagejs.pari-class-group/row21-sage-prepared-sample-v2",
    kernelNanoseconds: candidate.kernelNanoseconds,
    processMaxRssKiB: String(process.resourceUsage().maxRSS),
    projection,
    replay: replayProjection(payload, replay),
    observedCounters: {
      classGenerators: payload.classGroup.generatorCount,
      classNumber: payload.classGroup.classNumber,
      degree: payload.field.degree,
      exactFundamentalUnits: String(units.length / 5),
      unitRank: payload.unitGroup.rank,
    },
    resourceCounters: {
      mathematicalCalls: String(candidate.boundary.nativeCallsInsideClock),
    },
    exactSageEvidence: {
      payloadSha256: replay.payloadSha256,
      mathematicalAuthoritySha256: replay.mathematicalAuthoritySha256,
      exactUnitCoordinatesSha256: neutral.sha256Canonical(units),
      exactUnitInversesSha256: neutral.sha256Canonical(inverses),
      acceptedRegulatorSha256: neutral.sha256Canonical(regulator),
      exactUnitWitnessCount: String(units.length / 5),
      exactCapabilityReplay: true,
    },
    provenance: {
      preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
      nativeCacheKey: resident.built.cacheKey,
      aggregateComposerSha256: sha256File(require.resolve(
        "./row21_phase6_prepared_aggregate_source.cjs")),
      generatedAggregateSha256: sha256File(aggregateSource.OUTPUT),
      generatedCoreSha256: sha256File(resident.built.coreSourcePath),
      nativeAddonSha256: sha256File(resident.built.addonPath),
      nativeModuleWrapperSha256: sha256File(resident.built.modulePath),
    },
    boundary: { ...candidate.boundary, compilationInsideClock: false,
      authenticationInsideClock: false, projectionInsideClock: false,
      replayInsideClock: false, resetRecipeComplete: true },
  };
}

module.exports = { FIELD_ID, POLYNOMIAL_ASCENDING,
  PREPARED_AUTHORITY_SHA256, PROJECTION_SCHEMA, REPLAY_SCHEMA,
  prepareResident, replayProjection, runResident, semanticProjection };
