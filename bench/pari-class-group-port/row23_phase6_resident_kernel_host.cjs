"use strict";

// Resident, serialization-free row-23 mathematical cut.  This is deliberately
// separate from the publication/replay transaction: it retains the live native
// owners from relation collection through exact unit reconstruction and returns
// only the ordinary class/unit result state needed at the matched boundary.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
const hnfHost = require("./row23_first_hnf_host.cjs");
const acceptanceHost = require("./row23_acceptance_host.cjs");
const bridgeHost = require("./row23_live_rank4_unit_host.cjs");
const unitHost = require("./row23_live_unit_owner.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-23-1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154.json";
const PREPARED_AUTHORITY_SHA256 =
  "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
const FACTOR_OWNER_SHA256 =
  "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439";
const EXPECTED_UNITS_SHA256 =
  "2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc";

const values = (owner, length = owner.length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length);
const strings = (owner, length = owner.length) =>
  values(owner, length).map(String);
const ownerSha256 = owner => crypto.createHash("sha256")
  .update(`${JSON.stringify(owner)}\n`).digest("hex");

function elapsed(started) {
  return String(process.hrtime.bigint() - started);
}

async function prepareResident(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-23 corridor");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row23-phase6-factor-"));
  try {
    const factor = await factorCoordinator.run({ prepared,
      preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
      outputDirectory: directory });
    assert.equal(factor.ownerSha256, FACTOR_OWNER_SHA256,
      "row-23 factor owner changed");
    return Object.freeze({ authority, prepared: structuredClone(prepared),
      factorOwner: structuredClone(factor.owner),
      factorOwnerSha256: factor.ownerSha256 });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function semanticProjection(live, accepted, bridge, units) {
  assert.deepEqual(live.relationState, ["40", "450", "0", "1", "0", "40"]);
  assert.deepEqual(live.chainState, [3, 0, 0, 40]);
  assert.deepEqual(live.hnfState, [1, 10, 30, 0, 9, 3, 0, 40, 0]);
  const presentation = strings(live.values.hnf_result_h, 1);
  assert.deepEqual(presentation, ["6"], "row-23 terminal presentation changed");
  assert.equal(accepted.classNumber, "6");
  assert.equal(units.status, 0);
  assert.equal(units.exactUnitsSha256, EXPECTED_UNITS_SHA256,
    "row-23 exact units changed");
  assert.deepEqual(units.exactNorms, ["-1", "1", "1", "1"]);
  assert.deepEqual(units.state, [0, 20, 0, 4, 13, 3]);
  assert.deepEqual(units.solveState, [0, 5, 4, -222, 4]);
  assert.equal(bridge.boundedGetfuExecuted, false,
    "legacy bridge status unexpectedly changed");
  return Object.freeze({
    schema: "sagejs.pari-class-group/row23-phase6-resident-projection-v1",
    field: Object.freeze({ id: "5.5.1002836007889.1", degree: "5",
      polynomialAscending: Object.freeze(["341", "-970", "772", "-141", "-2", "1"]) }),
    classGroup: Object.freeze({ classNumber: "6",
      invariantFactors: Object.freeze(["6"]), generatorCount: "1" }),
    unitGroup: Object.freeze({ rank: "4", regulatorPresent: true,
      torsionOrder: "2", exactUnitsSha256: units.exactUnitsSha256,
      exactNorms: Object.freeze(units.exactNorms.slice()) }),
    work: Object.freeze({ relationCount: "40", factorBaseSize: "31",
      hnfState: Object.freeze(live.hnfState.slice()),
      postHnfState: Object.freeze(accepted.postHnfState.slice()),
      rankFourIntegerState: Object.freeze(bridge.states.integer.slice()),
      exactUnitState: Object.freeze(units.state.slice()) }),
    terminalStatus: "pari-correspondence-mathematical-state",
  });
}

async function runResident(resident) {
  assert.equal(authentication.authenticatePreparedNf(resident.prepared).sha256,
    PREPARED_AUTHORITY_SHA256);
  assert.equal(resident.factorOwnerSha256, FACTOR_OWNER_SHA256);
  assert.equal(ownerSha256(resident.factorOwner), FACTOR_OWNER_SHA256,
    "row-23 retained factor owner changed");
  const stageNanoseconds = {};
  let started = process.hrtime.bigint();
  const live = await hnfHost.runFirstHnf(resident.prepared, resident.factorOwner);
  stageNanoseconds.relationHnf = elapsed(started);
  assert.equal(live.status, 0, "row-23 resident relation/HNF failed");

  started = process.hrtime.bigint();
  const accepted = await acceptanceHost.runAcceptance(resident.prepared, live);
  stageNanoseconds.acceptance = elapsed(started);
  assert.equal(accepted.status, 0, "row-23 resident acceptance failed");

  started = process.hrtime.bigint();
  const bridge = await bridgeHost.runLiveRank4UnitBridge(live, accepted);
  stageNanoseconds.rankFourLattice = elapsed(started);
  assert.equal(bridge.status, 0, "row-23 resident rank-four lattice failed");

  started = process.hrtime.bigint();
  const units = await unitHost.runLiveUnitOwner(resident.prepared, bridge);
  stageNanoseconds.exactUnitReconstruction = elapsed(started);
  assert.equal(units.status, 0, "row-23 resident exact-unit reconstruction failed");

  started = process.hrtime.bigint();
  const projection = semanticProjection(live, accepted, bridge, units);
  stageNanoseconds.projection = elapsed(started);
  const inclusiveNanoseconds = Object.values(stageNanoseconds)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const result = {
    schema: "sagejs.pari-class-group/row23-phase6-resident-sample-v1",
    inclusiveNanoseconds: String(inclusiveNanoseconds), stageNanoseconds,
    projection,
    boundary: Object.freeze({ residentProcess: true,
      authenticatedPreparedAndFactorOwners: true,
      intermediateOwnersRetained: true,
      intermediateSerializationInsideRoot: false,
      subprocessesInsideRoot: false,
      cpythonInsideRoot: false,
      finalReplayInsideRoot: false,
      allocationInsideRoot: true,
      compilerCacheLookupInsideRoot: true,
      nativeCallsInsideRoot: 14,
      qualifiedTiming: false }),
  };
  Object.defineProperty(result, "owners", { enumerable: false,
    value: Object.freeze({ live, accepted, bridge, units }) });
  return Object.freeze(result);
}

function verifySample(sample) {
  assert.equal(sample?.schema,
    "sagejs.pari-class-group/row23-phase6-resident-sample-v1");
  assert.equal(sample.boundary.intermediateSerializationInsideRoot, false);
  assert.equal(sample.boundary.cpythonInsideRoot, false);
  assert.equal(sample.boundary.qualifiedTiming, false);
  assert.equal(sample.projection.classGroup.classNumber, "6");
  assert.deepEqual(sample.projection.classGroup.invariantFactors, ["6"]);
  assert.equal(sample.projection.unitGroup.rank, "4");
  assert.equal(sample.projection.unitGroup.exactUnitsSha256,
    EXPECTED_UNITS_SHA256);
  assert(sample.owners?.live?.values?.hnf_result_h,
    "row-23 live HNF owner was not retained");
  assert(sample.owners?.units?.owners?.output_units,
    "row-23 exact unit owner was not retained");
  return sample;
}

module.exports = { DEFAULT_INPUT, EXPECTED_UNITS_SHA256, FACTOR_OWNER_SHA256,
  PREPARED_AUTHORITY_SHA256, prepareResident, runResident, semanticProjection,
  verifySample };
