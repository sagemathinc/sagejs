#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const host = require("./row6_phase6_resident_terminal_host.cjs");
const legacy = require("./row6_post1137_terminal_host.cjs");
const legacyUnits = require("./row6_rank2_c5_c6_coordinator.cjs");
const legacyClass = require("./row6_terminal_class_coordinator.cjs");

const PREPARED = "/tmp/row6-prepared-projection.json";
const GATE = "/tmp/sagejs-row6-gate-c-eQS861/owner/" +
  "row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const FACTOR = "/tmp/sagejs-row6-factor-base-hy2P4R/owner/" +
  "row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz";
const ANCESTRY = "/tmp/row6-ancestry.json";

const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));

async function main() {
  const prepared = JSON.parse(fs.readFileSync(process.argv[2] || PREPARED));
  const gate = readGzip(process.argv[3] || GATE);
  const factor = readGzip(process.argv[4] || FACTOR);
  const ancestry = JSON.parse(fs.readFileSync(process.argv[5] || ANCESTRY));
  const resident = await host.prepareResident(prepared, gate, factor, ancestry);
  const invocation = host.prepareInvocation(resident);
  const sample = host.runInvocation(resident, invocation);

  assert.equal(sample.timingEligible, false);
  assert.equal(sample.kernelNanoseconds, null);
  assert.equal(sample.executionBoundary.nativeCallsPerCorrectnessRun, 1);
  assert.equal(sample.executionBoundary.subprocessesInsideClock, false);
  assert.equal(sample.executionBoundary.filesystemInsideClock, false);
  assert.equal(sample.executionBoundary.bufferAllocationInsideClock, false);

  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  for (const callee of ["native_pari_row6_prime_degree_catalog",
    "native_pari_row14_analytic_inverse_hr", "native_pari_row14_post806_terminal"]) {
    assert(core.includes(callee), `${callee} left the generated resident graph`);
  }

  const prior = await legacy.runRow6Post1137TerminalFromOwners(gate, factor, prepared);
  assert.deepEqual(sample.projection.analyticState, prior.analyticState);
  assert.deepEqual(sample.projection.inverseHr, prior.inverseHr);
  assert.deepEqual(sample.projection.postHnfState, prior.postHnfState);
  assert.deepEqual(sample.projection.multipleState, prior.multipleState);
  assert.deepEqual(sample.projection.acceptanceState, prior.acceptanceState);
  assert.deepEqual(sample.projection.reconstructionState, prior.reconstructionState);
  assert.deepEqual(sample.projection.regulator, prior.regulator);
  assert.deepEqual(sample.projection.unitRelations, prior.unitRelations);
  assert.deepEqual(sample.projection.smithState, prior.smithState);
  assert.deepEqual(sample.projection.invariants, prior.invariants);
  assert.equal(sample.projection.classNumber, prior.classNumber);
  assert.deepEqual(sample.projection.terminalState, prior.terminalState);
  const packed = ancestry.state.packedLogProvenance;
  const priorUnits = legacyUnits.composeInMemory(gate, prior, prepared, {
    acceptedArch: ancestry.acceptedArch,
    acceptedSigns: ancestry.acceptedSigns,
    phasePi: ancestry.phasePi,
    acceptedArchSha256: packed.acceptedArchSha256,
    acceptedSignsSha256: packed.acceptedSignsSha256,
    phasePiSha256: packed.phasePiSha256,
  }).owner;
  assert.deepEqual(sample.projection.unitTransform,
    priorUnits.compact.unitTransform);
  assert.deepEqual(sample.projection.unitBridgeTransform,
    priorUnits.compact.bridgeTransform);
  assert.deepEqual(sample.projection.unitGetfuFactor,
    priorUnits.compact.getfuFactor);
  assert.deepEqual(sample.projection.unitCleanLogs,
    priorUnits.compact.cleanLogs);
  assert.deepEqual(sample.projection.unitSignPhases,
    priorUnits.compact.signPhases);
  assert.deepEqual(sample.projection.unitC5State, priorUnits.c5State);
  assert.deepEqual(sample.projection.unitFactorState, priorUnits.factorState);
  assert.deepEqual(sample.projection.unitC6State, priorUnits.c6State);
  // The frozen ancestry receipt predates execution-metadata normalization in
  // these local owner fixtures.  Remove only its optional semantic digests;
  // the legacy owner independently authenticates every mathematical payload.
  const legacyClassAncestry = structuredClone(ancestry);
  delete legacyClassAncestry.state.gateOwnerSha256;
  delete legacyClassAncestry.state.factorOwnerSha256;
  const priorClass = legacyClass.composeInMemory(
    gate, factor, prepared, legacyClassAncestry);
  assert.deepEqual(sample.projection.classActiveRows,
    priorClass.activeFactorRows.map(Number));
  assert.deepEqual(sample.projection.classFactorMap, priorClass.factorMap);
  assert.equal(sample.projection.classState[1],
    priorClass.factorBaseAuthentication.reconstructedPrimeIdeals);
  assert.equal(sample.projection.classState[2],
    priorClass.factorBaseAuthentication.inertPrimeIdeals);
  assert.equal(sample.projection.classState[3],
    priorClass.principalAuthentication.principalEquations);
  assert.equal(sample.projection.classState[4],
    priorClass.principalAuthentication.nonzeroRelationEntries);
  assert.equal(sample.projection.classState[5],
    priorClass.principalAuthentication.idealProducts);
  assert.equal(sample.projection.classState[6],
    priorClass.principalAuthentication.maximumRawExponent);

  // The coordinator factory is correctness-usable but fails closed for a
  // qualification clock while this remains only a terminal source cut.
  const adapter = host.createProcessCoordinatorAdapter(resident);
  assert.equal(adapter.timingEligible, false);
  assert.throws(() => adapter.runSample(), error =>
    error.code === "SAGEJS_PHASE6_INCOMPLETE_RESIDENT_CUT");

  let boundaryMutationsRejected = 0;
  for (const mutate of [
    value => { value.data.prep_polynomial[0] = "2000000000019"; },
    value => { value.authoritySha256 = "0".repeat(64); },
  ]) {
    const changed = structuredClone(prepared); mutate(changed);
    await assert.rejects(() => host.prepareResident(changed, gate, factor, ancestry));
    boundaryMutationsRejected += 1;
  }
  const changedGate = structuredClone(gate);
  changedGate.final.state[7] = 1136;
  await assert.rejects(() => host.prepareResident(prepared, changedGate, factor, ancestry));
  boundaryMutationsRejected += 1;
  const changedAncestry = structuredClone(ancestry);
  changedAncestry.acceptedSigns[0] ^= 1;
  await assert.rejects(() => host.prepareResident(
    prepared, gate, factor, changedAncestry));
  boundaryMutationsRejected += 1;

  const mappingSource = path.join(__dirname,
    "row6_phase6_resident_mapping_obstruction.py");
  const mappingBuilt = await compileKernel({ sourcePath: mappingSource });
  const mappingModule = require(mappingBuilt.modulePath);
  const mappingProjection = mappingModule.row6_mapping_owner_projection;
  for (const implementation of [mappingProjection, mappingProjection.javascript,
    mappingProjection.tagged, mappingProjection.gmp]) {
    assert.equal(implementation({ classNumber: 4n }), 4n);
  }
  assert.throws(() => mappingProjection.gmp({ classNumber: -1n }),
    /outside uint64/);
  const mappingCore = fs.readFileSync(mappingBuilt.coreSourcePath, "utf8");
  assert.match(mappingCore,
    /sagejs_(?:local_tagged_)?owner\.sagejs_field_classNumber/);

  // A changed class ancestry fails inside the same native call graph and
  // cannot poison a fresh invocation.
  const changedClass = host.prepareInvocation(resident);
  const changedPresentation = changedClass.input.class_raw_to_presentation.toArray();
  changedPresentation[0] += 1n;
  changedClass.input.class_raw_to_presentation = resident.fn.createIntegerBuffer(
    changedPresentation.length, 256, changedPresentation);
  const changedClassStatus = resident.fn.gmp(...resident.names.map(
    ([name]) => changedClass.input[name]));
  assert.notEqual(changedClassStatus, 0n);
  boundaryMutationsRejected += 1;

  // Capacity failure happens before publication and cannot poison a fresh
  // invocation.  The root's -1 state is deliberately not a result state.
  const short = host.prepareInvocation(resident);
  short.input.resident_state = resident.fn.createInt64Buffer(13);
  assert.throws(() => resident.fn.gmp(...resident.names.map(([name]) => short.input[name])),
    /short row-6 resident terminal state/);
  const failedState = Array.from(short.input.resident_state, Number);
  assert.deepEqual(failedState, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const recovery = host.runInvocation(resident, host.prepareInvocation(resident));
  assert.deepEqual(recovery.projection, sample.projection);

  // Precision is authenticated at the lifecycle boundary; this is not a
  // mutable post-allocation scalar corridor.
  const changedPrecision = structuredClone(prepared);
  changedPrecision.data.precision = "128";
  await assert.rejects(() => host.prepareResident(
    changedPrecision, gate, factor, ancestry));
  boundaryMutationsRejected += 1;

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-phase6-resident-terminal-check-v1",
    preparedAuthoritySha256: host.PREPARED_AUTHORITY_SHA256,
    compilerCacheKey: resident.built.cacheKey,
    generatedCore: path.relative(process.cwd(), resident.built.coreSourcePath),
    connectedNativeStages: ["prime-degree-catalog", "analytic-inverse-hR",
      "post-HNF-acceptance", "regulator-reconstruction", "Smith-invariants",
      "compact-unit-bridge", "flag-zero-getfu-LARGE",
      "factor-base-authentication", "principal-equation-authentication",
      "class-witness-projection"],
    exactProjection: sample.projection,
    boundaryMutationsRejected,
    capacityFailureRejectedBeforePublication: true,
    freshRecoveryByteIdentical: true,
    differentialAgainstPriorThreeAddonAndCpythonClassAndUnitPaths: true,
    executableClosedMappingAbi: true,
    processCoordinatorAdapterFactory: true,
    timingEligible: false,
    ratioPublished: false,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
