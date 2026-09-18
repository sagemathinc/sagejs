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

const PREPARED = "/tmp/row6-prepared-projection.json";
const GATE = "/tmp/sagejs-row6-gate-c-eQS861/owner/" +
  "row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const FACTOR = "/tmp/sagejs-row6-factor-base-hy2P4R/owner/" +
  "row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz";

const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));

async function main() {
  const prepared = JSON.parse(fs.readFileSync(process.argv[2] || PREPARED));
  const gate = readGzip(process.argv[3] || GATE);
  const factor = readGzip(process.argv[4] || FACTOR);
  const resident = await host.prepareResident(prepared, gate, factor);
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
    await assert.rejects(() => host.prepareResident(changed, gate, factor));
    boundaryMutationsRejected += 1;
  }
  const changedGate = structuredClone(gate);
  changedGate.final.state[7] = 1136;
  await assert.rejects(() => host.prepareResident(prepared, changedGate, factor));
  boundaryMutationsRejected += 1;

  const obstruction = path.join(__dirname,
    "row6_phase6_resident_mapping_obstruction.py");
  await assert.rejects(() => compileKernel({ sourcePath: obstruction }), error =>
    /unsupported argument annotation AST_ItemAccess/.test(error.message));

  // Capacity failure happens before publication and cannot poison a fresh
  // invocation.  The root's -1 state is deliberately not a result state.
  const short = host.prepareInvocation(resident);
  short.input.resident_state = resident.fn.createInt64Buffer(5);
  assert.throws(() => resident.fn.gmp(...resident.names.map(([name]) => short.input[name])),
    /short row-6 resident terminal state/);
  const failedState = Array.from(short.input.resident_state, Number);
  assert.deepEqual(failedState, [0, 0, 0, 0, 0]);
  const recovery = host.runInvocation(resident, host.prepareInvocation(resident));
  assert.deepEqual(recovery.projection, sample.projection);

  // Precision is authenticated at the lifecycle boundary; this is not a
  // mutable post-allocation scalar corridor.
  const changedPrecision = structuredClone(prepared);
  changedPrecision.data.precision = "128";
  await assert.rejects(() => host.prepareResident(changedPrecision, gate, factor));
  boundaryMutationsRejected += 1;

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-phase6-resident-terminal-check-v1",
    preparedAuthoritySha256: host.PREPARED_AUTHORITY_SHA256,
    compilerCacheKey: resident.built.cacheKey,
    generatedCore: path.relative(process.cwd(), resident.built.coreSourcePath),
    connectedNativeStages: ["prime-degree-catalog", "analytic-inverse-hR",
      "post-HNF-acceptance", "regulator-reconstruction", "Smith-invariants"],
    exactProjection: sample.projection,
    boundaryMutationsRejected,
    capacityFailureRejectedBeforePublication: true,
    freshRecoveryByteIdentical: true,
    differentialAgainstPriorThreeAddonPath: true,
    executableMappingAbiObstruction: true,
    processCoordinatorAdapterFactory: true,
    timingEligible: false,
    ratioPublished: false,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
