#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const host = require("./row6_phase6_whole_prepared_host.cjs");
const source = require("./row6_phase6_whole_prepared_source.cjs");

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function integerAt(owner, index) {
  const signedWords = owner.sizes[index], words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + owner.limbs[index * owner.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function digestOwner(owner, count, start = 0) {
  const hash = crypto.createHash("sha256");
  hash.update("[");
  for (let index = 0; index < count; index += 1) {
    if (index) hash.update(",");
    hash.update(JSON.stringify(integerAt(owner, start + index).toString()));
  }
  hash.update("]");
  return hash.digest("hex");
}

async function main() {
  const generatedBytes = Buffer.from(source.generate(), "utf8");
  const sourceBytes = fs.readFileSync(host.SOURCE);
  assert(sourceBytes.equals(generatedBytes),
    "whole-prepared generated source is stale");
  const sourceFreshness = Object.freeze({
    sourceSha256: sha(sourceBytes),
    generatedSha256: sha(generatedBytes),
    byteForByteFresh: true,
  });
  const payload = JSON.parse(fs.readFileSync(
    process.argv[2] || "/tmp/row6-gate-payload.json", "utf8"));
  assert.equal(host.prepare.length, 1);
  assert.equal(host.createProcessCoordinatorAdapter.length, 1);
  const publicHost = fs.readFileSync(
    path.join(__dirname, "row6_phase6_whole_prepared_host.cjs"), "utf8");
  assert(!/\bfactorOwner\b|\binitialOwner\b/.test(publicHost),
    "serialized factor/relation owner leaked into public host source");
  await assert.rejects(() => host.prepare(payload.prepared, payload.factorOwner),
    /forbidden at the prepared-only boundary/);
  await assert.rejects(() => host.prepare({ ...payload.prepared,
    factorOwner: payload.factorOwner }), /accepts only the prepared-number-field/);
  const resident = await host.prepare(payload.prepared);
  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  for (const callee of ["native_pari_row6_phase6_gate_prefix_root",
    "native_pari_row6_phase6_resident_terminal_root"])
    assert(core.includes(callee), `missing direct native callee ${callee}`);

  const result = host.run(resident);
  const replay = Object.freeze({
    relations: digestOwner(resident.gate.prefix.initial.relation_records,
      1130 * 1137),
    logs: digestOwner(resident.gate.collector.log_embeddings, 21 * 1137),
    h: digestOwner(resident.gate.append2.result_h, 4),
    c: digestOwner(resident.gate.append2.result_c, 21 * 1137),
    rawToUnitKernel: digestOwner(resident.gate.ancestry.raw_to_all, 7 * 1137),
    rawToPresentation: digestOwner(resident.gate.ancestry.raw_to_all,
      2 * 1137, 7 * 1137),
  });
  assert.deepEqual(replay, {
    relations: "2e3b35e24e74052a74c07ef69ae880ae5851225f87a31b7c97f32ea102d944df",
    logs: "7621bb00dbec3637ca1fd64aa07a82a604a95292e9e04e96fed9ef2a7b5bf03a",
    h: "8eceed23fcee317f80fa7ab35446e7729865c88de6e99653edfc54f8c5ed4737",
    c: "7e5425fd516a7cf7f4d8c8cb0704ad1a674c07be40cad482d25a0167134727a2",
    rawToUnitKernel:
      "80c6f56bbd1b46bd99efa54bd438229571d40295e9c1493c1545f338c12ff0f4",
    rawToPresentation:
      "bb82abc1ef9212e640c019b3ef9106b332881d89cff88b5ad599029522da7014",
  });
  assert.equal(result.terminalProjection.classNumber, "4");
  assert.deepEqual(result.terminalProjection.invariants, ["2", "2"]);
  assert.deepEqual(result.terminalProjection.unitState,
    [0, 0, 0, 2, 0, 7, 2, 192]);
  assert.deepEqual(result.terminalProjection.classState,
    [0, 1130, 0, 1137, 7116, 7819, 5, 1092, 1094, 3, 7, 2]);
  assert.throws(() => host.run(resident), /fresh (?:publication|state) owner/);

  const changed = structuredClone(payload.prepared);
  changed.data.prep_polynomial[0] = "2000000000019";
  await assert.rejects(() => host.prepare(changed));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-phase6-whole-prepared-check-v1",
    compilerCacheKey: resident.built.cacheKey,
    sourceFreshness,
    connectedNativeStages: ["prepared-factor-base", "initial-relations",
      "14-relation-passes", "initial-HNF", "two-HNF-continuations",
      "column-ancestry", "analytic-inverse-hR", "post-HNF-acceptance",
      "Smith-invariants", "rank-two-units", "factor-base-authentication",
      "principal-equation-authentication", "class-witness-projection"],
    exactReplaySha256: replay,
    exactGateProjection: result.gateProjection,
    exactTerminalProjection: result.terminalProjection,
    nativeCallsPerCorrectnessRun: 1,
    subprocessesInsideRun: 0,
    filesystemBoundariesInsideRun: 0,
    mappingBoundariesInsideRun: 0,
    hostCopiesBetweenConnectedNativeStages: 0,
    postCallOutputInspectionAndProjectionCopiesOutsideNativeExecutionBoundary: true,
    replayWithoutFreshOwnersRejected: true,
    preparedMutationRejected: true,
    preparedOnlyBoundary: true,
    factorRelationOwnersForbidden: true,
    answerDerivedCapacityFixturesForbidden: true,
    reviewedLayoutSchema: host.ROW6_PREPARED_LAYOUT.schema,
    completeClassAndUnits: true,
    timingEligible: false,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
