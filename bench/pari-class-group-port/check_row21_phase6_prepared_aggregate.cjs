#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const aggregate = require("./row21_phase6_prepared_aggregate_host.cjs");
const result = require("./row21_phase6_final_result.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const source = require("./row21_phase6_prepared_aggregate_source.cjs");

function stable(value) { return `${JSON.stringify(value)}\n`; }
function sha(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}
function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}

async function rejectWrongAuthorities() {
  const missing = path.join(os.tmpdir(),
    "sagejs-row21-prepared-authority-does-not-exist.json");
  await assert.rejects(() => result.prepareResident(missing), /ENOENT/);
  const different = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
    "prepared-row-20-20d659df1c66a5faf17fd84f142308ce559ea23c66cdc24a15ac77d9c99c4628.json";
  await assert.rejects(() => result.prepareResident(different),
    /strictEqual|Expected values/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row21-forged-"));
  try {
    const factorHost = require("./row21_phase6_factor_base_host.cjs");
    const forged = JSON.parse(fs.readFileSync(factorHost.DEFAULT_INPUT, "utf8"));
    forged.prep_polynomial[0] = String(BigInt(forged.prep_polynomial[0]) + 1n);
    const filename = path.join(directory, "forged-row21.json");
    fs.writeFileSync(filename, `${JSON.stringify(forged)}\n`);
    await assert.rejects(() => result.prepareResident(filename));
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
  return true;
}

function focused() {
  source.materialize();
  const generated = fs.readFileSync(source.OUTPUT, "utf8");
  const hostSource = fs.readFileSync(require.resolve(
    "./row21_phase6_prepared_aggregate_host.cjs"), "utf8");
  const resultSource = fs.readFileSync(require.resolve(
    "./row21_phase6_final_result.cjs"), "utf8");
  assert.match(generated, /def pari_row21_phase6_prepared_aggregate_root/);
  assert.match(generated, /pari_row21_phase6_unit_root\(/);
  assert.match(generated, /aggregate_state: Int64Buffer/);
  assert.match(hostSource, /authenticatedPreparedInput: true/);
  assert.match(hostSource, /nativeCallsInsideClock: 1/);
  assert.match(resultSource, /prepared-aggregate-state/);
  for (const forbidden of ["live-unit-owner", "final-owner-v2", "answerFixture",
    "retained_owner", "replay_owner"])
    assert.equal(generated.includes(forbidden), false,
      `forbidden generated aggregate token ${forbidden}`);
  assert.throws(() => result.computeCandidate({}), /capability/);
  return {
    schema: "sagejs.pari-class-group/row21-phase6-prepared-aggregate-focused-v1",
    generatedSourceSha256: sha(generated), authenticatedPreparedInput: true,
    nativeCallsInsideClock: 1, retainedAnswerOwnersAsInput: 0,
    retainedReplayOwnersAsInput: 0, capabilityBackedResult: true,
  };
}

async function genuine() {
  const before = process.resourceUsage();
  const suppliedAuthorityRejectionsPassed = await rejectWrongAuthorities();
  const resident = await result.prepareResident();
  const candidate = result.computeCandidate(resident);
  const firstProjection = aggregate.projection(resident);
  const second = aggregate.runInvocation(resident);
  const after = process.resourceUsage();
  assert.deepEqual(second.projection, firstProjection);
  assert.equal(candidate.boundary.authenticatedPreparedInput, true);
  assert.equal(candidate.boundary.nativeCallsInsideClock, 1);
  assert.equal(candidate.boundary.retainedAnswerOwnersAsInput, 0);
  assert.equal(candidate.boundary.retainedReplayOwnersAsInput, 0);
  assert.deepEqual(firstProjection.aggregateState, ["0", "0", "8", "2", "1", "1"]);

  const inspected = result.inspectCandidate(candidate);
  const payload = inspected.payload, owners = ownerMap(payload);
  assert.deepEqual(logical(owners.get("prepared-aggregate-state")),
    firstProjection.aggregateState);
  assert.equal(payload.classGroup.classNumber, "1");
  assert.deepEqual(payload.classGroup.invariantFactors, []);
  assert.equal(payload.unitGroup.rank, "3");
  assert.equal(logical(owners.get("relation-records")).length, 24 * 32);
  assert.equal(logical(owners.get("class-presentation")).length,
    24 * 32 + 24 * 32 + 32 * 32 + 32 * 24 + 1);
  assert.equal(logical(owners.get("exact-unit-coordinates")).length, 15);
  assert.equal(logical(owners.get("exact-unit-inverses")).length, 15);
  assert.deepEqual(logical(owners.get("exact-unit-norms")), ["-1", "-1", "-1"]);
  assert.equal(logical(owners.get("accepted-regulator"))[1], "192");
  assert.deepEqual(logical(owners.get("acceptance-state")), ["2", "0", "0"]);

  const replay = result.replayCandidatePayload(candidate, payload);
  assert.equal(replay.correspondence_complete, true);
  assert.equal(replay.public_complete, false);
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = result.publishCandidate(candidate, publisher);
  assert.deepEqual(published.detachedPayload(), payload);
  const changed = structuredClone(payload);
  ownerMap(changed).get("prepared-aggregate-state").entries[2] = "7";
  assert.throws(() => result.replayCandidatePayload(candidate, changed));
  let metadataMutationsRejected = 0;
  for (const mutate of [
    value => { value.source.pariSourceSha256 = "0".repeat(64); },
    value => { value.honesty.sourcePolicy += "-changed"; },
    value => { value.honesty.outcome = "equal-bound-source-skip"; },
    value => { value.field.id = "5.3.1009349859375.4"; },
  ]) {
    const mutated = structuredClone(payload); mutate(mutated);
    assert.throws(() => result.replayCandidatePayload(candidate, mutated));
    metadataMutationsRejected += 1;
  }

  const sixHundredSeconds = 600_000_000_000n;
  assert(BigInt(candidate.kernelNanoseconds) < sixHundredSeconds);
  assert(BigInt(second.kernelNanoseconds) < sixHundredSeconds);
  const maxRssKiB = Math.max(before.maxRSS, after.maxRSS);
  assert(maxRssKiB < 4 * 1024 * 1024);
  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  for (const forbidden of ["napi_", "PyObject", "child_process", "writeFileSync"])
    assert.equal(core.includes(forbidden), false,
      `forbidden timed-core token ${forbidden}`);
  return {
    genuine: true,
    firstKernelNanoseconds: candidate.kernelNanoseconds,
    secondKernelNanoseconds: second.kernelNanoseconds,
    projectionSha256: sha(stable(firstProjection)),
    envelopeSha256: candidate.envelopeSha256,
    ownerCapabilities: owners.size,
    replaySha256: replay.payloadSha256,
    deterministic: true,
    exactClassReplay: true,
    exactUnitReplay: true,
    regulatorAncestryRetained: true,
    aggregateMutationRejected: true,
    metadataMutationsRejected,
    suppliedAuthorityRejectionsPassed,
    coreSourceSha256: sha(core),
    coreSourceBytes: Buffer.byteLength(core),
    maxRssKiB,
    resourceUsageDelta: {
      userCpuMicros: after.userCPUTime - before.userCPUTime,
      systemCpuMicros: after.systemCPUTime - before.systemCPUTime,
    },
    boundary: candidate.boundary,
    timingQualification: "diagnostic-only; no matched PARI comparison",
    publicComplete: candidate.publicComplete,
  };
}

async function main() {
  const report = focused();
  if (process.argv.includes("--genuine")) Object.assign(report, await genuine());
  process.stdout.write(stable(report));
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
