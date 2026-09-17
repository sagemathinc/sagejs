#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runner = require("./h1_matched_exclusive_stage_runner.cjs");

function sageOwners() {
  return { finalOwners: { final_state: ["0", "0", "0", "0", "0", "0", "73", "8", "1", "0", "2", "2", "0", "811", "1", "0"], final_invariants: ["0", "0"], final_torsion_order: ["2"], final_torsion_generator: ["-1", "0", "0"], final_regulator: ["1", "2", "3"] }, precisionAuthority: ["0", "5", "2304", "0", "3"] };
}
function pariRecord() {
  return { result: { field: { id: runner.FIELD_ID }, classGroup: { classNumber: "1", invariantFactors: [] }, unitGroupCorrespondence: { rank: "2", logEmbeddingShape: ["3", "2"], regulatorTriplet: ["1", "2", "3"], torsionOrder: "2", torsionGeneratorPowerBasis: ["-1", "0", "0"] }, terminal: { status: "pari-correspondence-complete-internal-h1", correspondenceComplete: true } }, rng: { algorithm: "pari-xorshift1024star-2.17.4", seed: "1", terminalState: Array(66).fill("1") }, work: { schema: "sagejs.pari-class-group/h1-source-work-v1", degree: "3", factorBaseSize: "66", retainedClassRows: "1", logEmbeddingRows: "3", logEmbeddingColumns: "2" } };
}
function rawTrace(implementation, offset = 0n) {
  return runner.SOURCE_STAGES.map((stage, index) => ({ stage, nanoseconds: BigInt(index + 1) + offset }));
}
function rawSageOutput() {
  const visits = runner.NATIVE_STAGE_ORDER.map((stage, index) => ({ ordinal: index + 1, stage, stageIndex: index, nanoseconds: BigInt(index + 1) }));
  return { correspondenceComplete: true, sourceAuthority: sageOwners(), terminalStatus: "pari-correspondence-complete-internal-h1", diagnosticStageTrace: { schema: 1, rootNanoseconds: visits.reduce((sum, visit) => sum + visit.nanoseconds, 0n), failed: false, clockFailed: false, totalsNanoseconds: Object.fromEntries(runner.SOURCE_STAGES.map(stage => [stage, visits.find(visit => visit.stage === stage).nanoseconds])), visits } };
}
function arm(implementation, offset = 0n) {
  const authority = implementation === "sagejs" ? sageOwners() : pariRecord();
  const normalized = implementation === "sagejs" ? runner.normalizeSageAuthority(authority) : runner.normalizePariRecord(authority);
  const raw = rawTrace(implementation, offset); const partitions = runner.durationPartitions(implementation, raw);
  return runner.validateArm({ implementation, rootDurationNanoseconds: String(raw.reduce((sum, item) => sum + item.nanoseconds, 0n)), durationPartitions: partitions, partitionTotalsNanoseconds: Object.fromEntries(raw.map(item => [runner.stageLabel(implementation, item.stage), String(item.nanoseconds)])), normalizedResultSha256: runner.digest(normalized), sourceAuthoritySha256: runner.digest(authority), terminalStatus: "pari-correspondence-complete-internal-h1" });
}
function receipt() {
  const sage = sageOwners(); const pari = pariRecord(); const normalized = runner.normalizeSageAuthority(sage);
  const pairs = Array.from({ length: 7 }, (_, pairIndex) => { const a = arm("sagejs", BigInt(pairIndex + 1)); const b = arm("pari", BigInt(pairIndex)); return { pairIndex, order: pairIndex % 2 ? "BAAB" : "ABBA", arms: pairIndex % 2 ? [b, a, structuredClone(a), structuredClone(b)] : [a, b, structuredClone(b), structuredClone(a)] }; });
  const hash = "a".repeat(64); const config = { function: "root", stages: runner.SOURCE_STAGES, maximumVisits: 32 }; const command = ["node", "runner"];
  const buildProvenance = { vcs: { commit: "b".repeat(40), dirty: false }, sourceSha256: { root: hash, adapter: hash, runner: hash, compiler: hash, cBackend: hash, jsBackend: hash }, sageBuild: { diagnosticStageClock: config, diagnosticStageClockSha256: runner.digest(config), cacheKey: "c".repeat(64), moduleSha256: hash, addonSha256: hash, coreSourceSha256: hash, coreHeaderSha256: hash, manifestSha256: hash }, pariBuild: { archiveSha256: hash, pristineBuch2Sha256: hash, pristineLibrarySha256: hash, instrumentedBuch2Sha256: hash, derivativeLibrarySha256: hash, derivativeExecutableSha256: hash, pristineExecutableSha256: hash }, runtime: { node: process.version, platform: "linux", arch: "x64", osRelease: "test", hostnameSha256: hash, cpuModelsSha256: hash, cpuCount: 1 }, command: { argv: command, sha256: runner.digest(command) } };
  return { schema: "sagejs.pari-class-group/h1-matched-duration-partitions-development-v2", diagnosticOnly: true, qualifiedTiming: false, boundaryQualification: "unqualified-development-host", fieldId: runner.FIELD_ID, seedPolicy: { requestedSeed: "1", sagejsActualRngStateAvailable: false, pariActualRngStateAvailable: true }, inputProvenance: { sourcePath: "/tmp/input.json", fileSha256: runner.FROZEN_INPUT_FILE_SHA256, preparedInputSha256: runner.FROZEN_PREPARED_INPUT_SHA256 }, buildProvenance, authorities: { sagejs: { replayOwners: sage, replayOwnersSha256: runner.digest(sage), normalizedResult: normalized, normalizedResultSha256: runner.digest(normalized), rngAuthority: { available: false }, workAuthority: { sha256: runner.digest(sage) } }, pari: { pristineRecord: pari, pristineRecordSha256: runner.digest(pari), normalizedResult: runner.normalizePariRecord(pari), normalizedResultSha256: runner.digest(runner.normalizePariRecord(pari)), rngAuthority: pari.rng, workAuthority: pari.work }, commonNormalizedResultSha256: runner.digest(normalized) }, warmup: { policy: "one excluded active diagnostic call per persistent prepared implementation", arms: [arm("sagejs"), arm("pari")] }, pairs, summary: runner.deriveSummary(pairs) };
}
function rejected(label, mutate, pattern) { const value = structuredClone(receipt()); mutate(value); assert.throws(() => runner.validateReceipt(value), pattern, label); }
function main() {
  const adapter = fs.readFileSync(path.join(__dirname, "h1_unified_complete_adapter.cjs"), "utf8"); assert.match(adapter, /diagnosticStageTrace\(\)/); assert.match(adapter, /sourceAuthority/);
  runner.sageArm(rawSageOutput());
  const changedTrace = rawSageOutput(); changedTrace.diagnosticStageTrace.visits[1].ordinal = 9;
  assert.throws(() => runner.sageArm(changedTrace), /strictly equal/);
  runner.validateReceipt(receipt());
  rejected("raw Sage owner", value => { value.authorities.sagejs.replayOwners.finalOwners.final_state[8] = "2"; }, /deep-equal|strictly equal/);
  rejected("raw PARI RNG", value => { value.authorities.pari.pristineRecord.rng.terminalState[0] = "2"; }, /deep-equal|strictly equal/);
  rejected("independent normalization", value => { value.authorities.pari.normalizedResult.classGroup.classNumber = "2"; }, /deep-equal/);
  rejected("raw duration", value => { value.pairs[0].arms[0].durationPartitions[0].durationNanoseconds = "99"; }, /strictly equal/);
  rejected("stage namespace", value => { value.pairs[0].arms[0].durationPartitions[0].label = "pari-buch2/relation-retry"; }, /strictly equal/);
  rejected("order", value => { [value.pairs[1].arms[0], value.pairs[1].arms[1]] = [value.pairs[1].arms[1], value.pairs[1].arms[0]]; }, /deep-equal/);
  rejected("command provenance", value => { value.buildProvenance.command.argv.push("--changed"); }, /strictly equal/);
  if (process.argv[2]) runner.validateReceipt(JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8")));
  console.log(JSON.stringify({ schema: "sagejs.pari-class-group/h1-matched-duration-check-v2", actualAuthoritiesIndependent: true, rawTraceMutationsRejected: true, schedule: "ABBA/BAAB", crossImplementationStageComparison: false, qualifiedTiming: false }, null, 2));
}
main();
