#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const HERE = __dirname;
const ROOT_SOURCE = path.join(HERE, "pari_unified_complete_h1_root.py");
const ADAPTER_SOURCE = path.join(HERE, "h1_unified_complete_adapter.cjs");
const RESIDENT_SOURCE = path.join(HERE, "resident_generated_class_attempt.py");
const DEFAULT_OUTPUT = path.join(HERE, "h1-matched-exclusive-stage-development-receipt.json");
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const FROZEN_INPUT_FILE_SHA256 = "22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77";
const FROZEN_PREPARED_INPUT_SHA256 = "03a4ac33c173b65168361f3ff612bc45ed7ff793881a8d5181b1c9a0868fe658";
const SOURCE_STAGES = Object.freeze(["relation-retry", "sparse-hnf-snf-transform", "unit-regulator", "honesty-generators-final", "unattributed-remainder"]);
const NATIVE_STAGE_ORDER = Object.freeze(["unattributed-remainder", "relation-retry", "sparse-hnf-snf-transform", "unit-regulator", "honesty-generators-final"]);
const stageLabel = (implementation, stage) => `${implementation === "sagejs" ? "sage-root" : "pari-buch2"}/${stage}`;
const labelsFor = implementation => SOURCE_STAGES.map(stage => stageLabel(implementation, stage));

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function fileSha256(filename) { return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex"); }
function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}
function unsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]{0,29})$/, `${name} is not canonical`);
  const answer = BigInt(value); if (positive) assert(answer > 0n, `${name} must be positive`); return answer;
}
function loadPrepared(filename) {
  const { parseRootParameters, sanitizePreparedInput } = require("./h1_outcome_c_adapter.cjs");
  const raw = JSON.parse(fs.readFileSync(filename, "utf8"));
  const source = fs.readFileSync(RESIDENT_SOURCE, "utf8");
  exactKeys(raw, ["input", "names"], "frozen input");
  assert.deepEqual(raw.names, parseRootParameters(source));
  const preparedInput = sanitizePreparedInput(raw, source).record;
  const answer = { preparedInput, fileSha256: fileSha256(filename), preparedInputSha256: digest(preparedInput) };
  assert.equal(answer.fileSha256, FROZEN_INPUT_FILE_SHA256);
  assert.equal(answer.preparedInputSha256, FROZEN_PREPARED_INPUT_SHA256);
  return answer;
}

function sageTerminalShape(authority) {
  exactKeys(authority, ["finalOwners", "precisionAuthority"], "Sage owner authority");
  const owners = authority.finalOwners;
  for (const name of ["final_state", "final_invariants", "final_torsion_order", "final_torsion_generator", "final_regulator"]) assert(Array.isArray(owners[name]), `missing ${name}`);
  const state = owners.final_state;
  assert.equal(state[0], "0"); assert.equal(state[14], "1");
  const invariantFactors = owners.final_invariants.filter(value => value !== "0");
  assert.equal(invariantFactors.length, 0); assert(owners.final_regulator.some(value => value !== "0"));
  return { fieldId: FIELD_ID, classGroup: { classNumber: state[8], invariantFactors }, unitGroup: { rank: state[10], torsionOrder: owners.final_torsion_order[0], torsionGeneratorPowerBasis: owners.final_torsion_generator.slice(0, 3) }, terminalStatus: "pari-correspondence-complete-internal-h1" };
}
function validatePariRecord(record) {
  exactKeys(record, ["result", "rng", "work"], "PARI record");
  exactKeys(record.rng, ["algorithm", "seed", "terminalState"], "PARI RNG");
  assert.equal(record.rng.algorithm, "pari-xorshift1024star-2.17.4"); assert.equal(record.rng.seed, "1"); assert.equal(record.rng.terminalState.length, 66);
  record.rng.terminalState.forEach((word, index) => unsigned(word, `RNG word ${index}`));
  exactKeys(record.work, ["schema", "degree", "factorBaseSize", "retainedClassRows", "logEmbeddingRows", "logEmbeddingColumns"], "PARI work");
  assert.equal(record.work.schema, "sagejs.pari-class-group/h1-source-work-v1"); assert.equal(record.work.degree, "3"); assert.equal(record.work.factorBaseSize, "66");
  assert.equal(record.result.classGroup.classNumber, "1"); assert.deepEqual(record.result.classGroup.invariantFactors, []);
  const unit = record.result.unitGroupCorrespondence;
  assert.equal(unit.rank, "2"); assert.deepEqual(unit.logEmbeddingShape, ["3", "2"]); assert.equal(unit.regulatorTriplet.length, 3); assert.equal(unit.torsionOrder, "2"); assert.deepEqual(unit.torsionGeneratorPowerBasis, ["-1", "0", "0"]);
  assert.equal(record.result.terminal.correspondenceComplete, true); assert.equal(record.result.terminal.status, "pari-correspondence-complete-internal-h1"); return record;
}
function pariTerminalShape(record) {
  validatePariRecord(record); const result = record.result;
  return { fieldId: result.field.id, classGroup: { classNumber: result.classGroup.classNumber, invariantFactors: result.classGroup.invariantFactors }, unitGroup: { rank: result.unitGroupCorrespondence.rank, torsionOrder: result.unitGroupCorrespondence.torsionOrder, torsionGeneratorPowerBasis: result.unitGroupCorrespondence.torsionGeneratorPowerBasis }, terminalStatus: result.terminal.status };
}

function durationPartitions(implementation, ordered) {
  assert(Array.isArray(ordered) && ordered.length > 0);
  return ordered.map((item, ordinal) => {
    assert(SOURCE_STAGES.includes(item.stage)); const duration = BigInt(item.nanoseconds); assert(duration > 0n);
    return { ordinal, label: stageLabel(implementation, item.stage), sourceStage: item.stage, durationNanoseconds: String(duration) };
  });
}
function validateArm(arm) {
  exactKeys(arm, ["implementation", "rootDurationNanoseconds", "durationPartitions", "partitionTotalsNanoseconds", "terminalShapeSha256", "sourceAuthoritySha256", "terminalStatus"], "duration arm");
  assert(["sagejs", "pari"].includes(arm.implementation));
  const root = unsigned(arm.rootDurationNanoseconds, "root", { positive: true });
  exactKeys(arm.partitionTotalsNanoseconds, labelsFor(arm.implementation), "partition totals");
  const totals = Object.fromEntries(labelsFor(arm.implementation).map(label => [label, 0n])); let sum = 0n; let previous = null;
  arm.durationPartitions.forEach((part, index) => {
    exactKeys(part, ["ordinal", "label", "sourceStage", "durationNanoseconds"], `partition ${index}`); assert.equal(part.ordinal, index); assert.equal(part.label, stageLabel(arm.implementation, part.sourceStage)); assert.notEqual(part.label, previous);
    const duration = unsigned(part.durationNanoseconds, "duration", { positive: true }); totals[part.label] += duration; sum += duration; previous = part.label;
  });
  assert.equal(sum, root);
  for (const label of labelsFor(arm.implementation)) { const claimed = unsigned(arm.partitionTotalsNanoseconds[label], label); assert.equal(claimed, totals[label]); assert(claimed > 0n); }
  assert.match(arm.terminalShapeSha256, /^[0-9a-f]{64}$/); assert.match(arm.sourceAuthoritySha256, /^[0-9a-f]{64}$/); assert.equal(arm.terminalStatus, "pari-correspondence-complete-internal-h1"); return arm;
}
function sageArm(output) {
  assert.equal(output.correspondenceComplete, true);
  const trace = output.diagnosticStageTrace; const terminalShape = sageTerminalShape(output.sourceAuthority);
  exactKeys(trace, ["schema", "rootNanoseconds", "failed", "clockFailed", "totalsNanoseconds", "visits"], "native trace"); assert.equal(trace.schema, 1); assert.equal(trace.failed, false); assert.equal(trace.clockFailed, false); assert.deepEqual(Object.keys(trace.totalsNanoseconds).sort(), [...SOURCE_STAGES].sort());
  trace.visits.forEach((visit, index) => { exactKeys(visit, ["ordinal", "stage", "stageIndex", "nanoseconds"], `visit ${index}`); assert.equal(visit.ordinal, index + 1); assert.equal(visit.stageIndex, NATIVE_STAGE_ORDER.indexOf(visit.stage)); });
  return validateArm({ implementation: "sagejs", rootDurationNanoseconds: String(trace.rootNanoseconds), durationPartitions: durationPartitions("sagejs", trace.visits), partitionTotalsNanoseconds: Object.fromEntries(SOURCE_STAGES.map(stage => [stageLabel("sagejs", stage), String(trace.totalsNanoseconds[stage])])), terminalShapeSha256: digest(terminalShape), sourceAuthoritySha256: digest(output.sourceAuthority), terminalStatus: output.terminalStatus });
}
function pariArm(sample) {
  const record = validatePariRecord(sample.record);
  return validateArm({ implementation: "pari", rootDurationNanoseconds: sample.timing.inclusiveRootNanoseconds, durationPartitions: durationPartitions("pari", sample.timing.orderedSegments), partitionTotalsNanoseconds: Object.fromEntries(SOURCE_STAGES.map(stage => [stageLabel("pari", stage), sample.timing.stageTotalsNanoseconds[stage]])), terminalShapeSha256: digest(pariTerminalShape(record)), sourceAuthoritySha256: digest(record), terminalStatus: record.result.terminal.status });
}
function median(values) { const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); assert(sorted.length > 0 && sorted.length % 2 === 0); return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2n; }
function deriveSummary(pairs) {
  const arms = pairs.flatMap(pair => pair.arms); const grouped = Object.fromEntries(["sagejs", "pari"].map(name => [name, arms.filter(arm => arm.implementation === name)])); const stageMedians = {};
  for (const implementation of ["sagejs", "pari"]) stageMedians[implementation] = Object.fromEntries(labelsFor(implementation).map(label => [label, String(median(grouped[implementation].map(arm => BigInt(arm.partitionTotalsNanoseconds[label]))))]));
  const sage = median(grouped.sagejs.map(arm => BigInt(arm.rootDurationNanoseconds))); const pari = median(grouped.pari.map(arm => BigInt(arm.rootDurationNanoseconds)));
  return { pairCount: pairs.length, samplesPerImplementation: grouped.sagejs.length, implementationStageMediansNanoseconds: stageMedians, rootMediansNanoseconds: { sagejs: String(sage), pari: String(pari) }, rootMedianGapNanoseconds: String(sage - pari), rootMedianRatio: Number(sage) / Number(pari), crossImplementationStageComparison: false, qualifiedTiming: false };
}

function validateAuthorities(authorities) {
  exactKeys(authorities, ["sagejs", "pari", "commonTerminalShapeSha256"], "authorities");
  exactKeys(authorities.sagejs, ["replayOwners", "replayOwnersSha256", "terminalShape", "terminalShapeSha256", "rngAuthority", "workAuthority"], "Sage authority");
  const sage = sageTerminalShape(authorities.sagejs.replayOwners); assert.deepEqual(authorities.sagejs.terminalShape, sage); assert.equal(authorities.sagejs.replayOwnersSha256, digest(authorities.sagejs.replayOwners)); assert.equal(authorities.sagejs.terminalShapeSha256, digest(sage)); assert.equal(authorities.sagejs.rngAuthority.available, false); assert.equal(authorities.sagejs.workAuthority.sha256, authorities.sagejs.replayOwnersSha256);
  exactKeys(authorities.pari, ["pristineRecord", "pristineRecordSha256", "terminalShape", "terminalShapeSha256", "rngAuthority", "workAuthority"], "PARI authority");
  const record = validatePariRecord(authorities.pari.pristineRecord); const pari = pariTerminalShape(record); assert.deepEqual(authorities.pari.terminalShape, pari); assert.equal(authorities.pari.pristineRecordSha256, digest(record)); assert.equal(authorities.pari.terminalShapeSha256, digest(pari)); assert.deepEqual(authorities.pari.rngAuthority, record.rng); assert.deepEqual(authorities.pari.workAuthority, record.work); assert.deepEqual(sage, pari); assert.equal(authorities.commonTerminalShapeSha256, digest(sage)); return authorities;
}
function validateBuildProvenance(build) {
  exactKeys(build, ["vcs", "sourceSha256", "sageBuild", "pariBuild", "runtime", "command"], "build provenance");
  exactKeys(build.vcs, ["commit", "dirty"], "vcs provenance"); assert.match(build.vcs.commit, /^[0-9a-f]{40}$/); assert.equal(build.vcs.dirty, false);
  exactKeys(build.sourceSha256, ["root", "adapter", "runner", "compiler", "cBackend", "jsBackend"], "source provenance");
  exactKeys(build.sageBuild, ["diagnosticStageClock", "diagnosticStageClockSha256", "cacheKey", "moduleSha256", "addonSha256", "coreSourceSha256", "coreHeaderSha256", "manifestSha256"], "Sage build provenance");
  assert.equal(build.sageBuild.diagnosticStageClockSha256, digest(build.sageBuild.diagnosticStageClock)); assert.match(build.sageBuild.cacheKey, /^[0-9a-f]+$/);
  exactKeys(build.pariBuild, ["archiveSha256", "pristineBuch2Sha256", "pristineLibrarySha256", "instrumentedBuch2Sha256", "derivativeLibrarySha256", "derivativeExecutableSha256", "pristineExecutableSha256"], "PARI build provenance");
  for (const group of [build.sourceSha256, build.sageBuild, build.pariBuild]) for (const [key, value] of Object.entries(group)) if (key.endsWith("Sha256") && key !== "diagnosticStageClockSha256") assert.match(value, /^[0-9a-f]{64}$/);
  exactKeys(build.runtime, ["node", "platform", "arch", "osRelease", "hostnameSha256", "cpuModelsSha256", "cpuCount"], "runtime provenance"); assert.equal(build.runtime.platform, "linux"); assert(Number.isInteger(build.runtime.cpuCount) && build.runtime.cpuCount > 0);
  exactKeys(build.command, ["argv", "sha256"], "command provenance"); assert.equal(build.command.sha256, digest(build.command.argv));
}
function validateReceipt(receipt) {
  exactKeys(receipt, ["schema", "diagnosticOnly", "qualifiedTiming", "boundaryQualification", "fieldId", "seedPolicy", "inputProvenance", "buildProvenance", "authorities", "warmup", "pairs", "summary"], "receipt");
  assert.equal(receipt.schema, "sagejs.pari-class-group/h1-matched-duration-partitions-development-v2"); assert.equal(receipt.diagnosticOnly, true); assert.equal(receipt.qualifiedTiming, false); assert.equal(receipt.boundaryQualification, "unqualified-development-host"); assert.equal(receipt.fieldId, FIELD_ID); assert.equal(receipt.seedPolicy.requestedSeed, "1"); assert.equal(receipt.seedPolicy.sagejsActualRngStateAvailable, false); assert.equal(receipt.seedPolicy.pariActualRngStateAvailable, true);
  assert.equal(receipt.inputProvenance.fileSha256, FROZEN_INPUT_FILE_SHA256); assert.equal(receipt.inputProvenance.preparedInputSha256, FROZEN_PREPARED_INPUT_SHA256); validateBuildProvenance(receipt.buildProvenance); validateAuthorities(receipt.authorities);
  assert.equal(receipt.warmup.policy, "one excluded active diagnostic call per persistent prepared implementation; Sage uses preparation replay"); assert.deepEqual(receipt.warmup.arms.map(arm => arm.implementation), ["sagejs", "pari"]); receipt.warmup.arms.forEach(validateArm);
  assert(receipt.pairs.length >= 7 && receipt.pairs.length % 2 === 1);
  receipt.pairs.forEach((pair, index) => { const order = index % 2 ? "BAAB" : "ABBA"; const implementations = order === "ABBA" ? ["sagejs", "pari", "pari", "sagejs"] : ["pari", "sagejs", "sagejs", "pari"]; assert.equal(pair.pairIndex, index); assert.equal(pair.order, order); assert.deepEqual(pair.arms.map(arm => arm.implementation), implementations); pair.arms.forEach(validateArm); });
  for (const arm of [...receipt.warmup.arms, ...receipt.pairs.flatMap(pair => pair.arms)]) { const authority = receipt.authorities[arm.implementation]; assert.equal(arm.terminalShapeSha256, authority.terminalShapeSha256); assert.equal(arm.sourceAuthoritySha256, arm.implementation === "sagejs" ? authority.replayOwnersSha256 : authority.pristineRecordSha256); }
  assert.deepEqual(receipt.summary, deriveSummary(receipt.pairs)); return receipt;
}

async function executeSage(adapter, state, preparedInput, seed) { return sageArm(await adapter.runPreparedH1({ implementation: "sagejs", seed, preparedInput, preparedState: state, switchStage: () => assert.fail("native trace owns timing") })); }
function buildProvenance(sageState, manifest, command) {
  assert.equal(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }), "", "receipt requires clean commit"); const built = sageState.built.built; const config = sageState.built.diagnosticStageClockConfig; const cpu = os.cpus().map(item => item.model); const sha = filename => fileSha256(filename);
  return { vcs: { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: false }, sourceSha256: { root: sha(ROOT_SOURCE), adapter: sha(ADAPTER_SOURCE), runner: sha(__filename), compiler: sha(path.join(HERE, "../../tools/native-kernel/compiler.cjs")), cBackend: sha(path.join(HERE, "../../tools/native-kernel/c-backend.cjs")), jsBackend: sha(path.join(HERE, "../../tools/native-kernel/js-backend.cjs")) }, sageBuild: { diagnosticStageClock: config, diagnosticStageClockSha256: digest(config), cacheKey: built.cacheKey, moduleSha256: sha(built.modulePath), addonSha256: sha(built.addonPath), coreSourceSha256: sha(built.coreSourcePath), coreHeaderSha256: sha(built.coreHeaderPath), manifestSha256: sha(path.join(built.outputPath, "manifest.json")) }, pariBuild: { archiveSha256: manifest.input.archiveSha256, pristineBuch2Sha256: manifest.input.pristineBuch2Sha256, pristineLibrarySha256: manifest.input.pristineLibrarySha256, instrumentedBuch2Sha256: manifest.instrumentedBuch2Sha256, derivativeLibrarySha256: manifest.librarySha256, derivativeExecutableSha256: manifest.executableSha256, pristineExecutableSha256: manifest.pristineExecutableSha256 }, runtime: { node: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(), hostnameSha256: digest(os.hostname()), cpuModelsSha256: digest(cpu), cpuCount: cpu.length }, command: { argv: command, sha256: digest(command) } };
}

async function run({ input, output = DEFAULT_OUTPUT, pairs = 7, seed = "1" }) {
  const adapter = require("./h1_unified_complete_adapter.cjs"); const pariAdapter = require("./pari_h1_outcome_c_adapter.cjs"); const { buildDerivative } = require("./pari_stage_clock_derivative.cjs"); const { DerivativeClient, validateActiveTiming } = require("./pari-stage-clock/run-derivative.cjs");
  assert.equal(process.platform, "linux"); assert.equal(seed, "1"); assert(Number.isInteger(pairs) && pairs >= 7 && pairs % 2 === 1); const loaded = loadPrepared(input);
  const sageState = await adapter.preparePreparedH1({ implementation: "sagejs", seed, preparedInput: loaded.preparedInput, diagnosticStageClock: true }); const pristineState = await pariAdapter.preparePreparedH1({ implementation: "pari", seed, preparedInput: loaded.preparedInput }); const pristineRecord = validatePariRecord(pristineState.replayRecord); const manifest = buildDerivative(); const derivative = new DerivativeClient(manifest); await derivative.ready(); let warmup; const rawPairs = [];
  const runPari = async () => { const sample = await derivative.run("ACTIVE", seed); validateActiveTiming(sample.timing); assert.deepEqual(sample.record, pristineRecord); return pariArm(sample); };
  try {
    const sageReplayWarmup = sageArm({
      correspondenceComplete: true,
      sourceAuthority: sageState.replayAuthority,
      terminalStatus: "pari-correspondence-complete-internal-h1",
      diagnosticStageTrace: sageState.replayDiagnosticStageTrace,
    });
    warmup = { policy: "one excluded active diagnostic call per persistent prepared implementation; Sage uses preparation replay", arms: [sageReplayWarmup, await runPari()] };
    for (let pairIndex = 0; pairIndex < pairs; pairIndex++) { const order = pairIndex % 2 ? ["pari", "sagejs", "sagejs", "pari"] : ["sagejs", "pari", "pari", "sagejs"]; const arms = []; for (const implementation of order) arms.push(implementation === "sagejs" ? await executeSage(adapter, sageState, loaded.preparedInput, seed) : await runPari()); rawPairs.push({ pairIndex, order: pairIndex % 2 ? "BAAB" : "ABBA", arms }); }
  } finally { await derivative.close(); await pariAdapter.closePreparedH1(pristineState); await adapter.closePreparedH1(sageState); }
  const sageShape = sageTerminalShape(sageState.replayAuthority); const pariShape = pariTerminalShape(pristineRecord); assert.deepEqual(sageShape, pariShape); const command = [process.execPath, __filename, "--input", path.resolve(input), "--pairs", String(pairs), "--seed", seed, "--output", path.resolve(output)];
  const receipt = validateReceipt({ schema: "sagejs.pari-class-group/h1-matched-duration-partitions-development-v2", diagnosticOnly: true, qualifiedTiming: false, boundaryQualification: "unqualified-development-host", fieldId: FIELD_ID, seedPolicy: { requestedSeed: seed, sagejsActualRngStateAvailable: false, pariActualRngStateAvailable: true }, inputProvenance: { sourcePath: path.resolve(input), fileSha256: loaded.fileSha256, preparedInputSha256: loaded.preparedInputSha256 }, buildProvenance: buildProvenance(sageState, manifest, command), authorities: { sagejs: { replayOwners: sageState.replayAuthority, replayOwnersSha256: digest(sageState.replayAuthority), terminalShape: sageShape, terminalShapeSha256: digest(sageShape), rngAuthority: { available: false, requestedSeed: seed, policy: "frozen-owner-graph-authenticates-seed-1; no terminal Sage RNG state is emitted" }, workAuthority: { kind: "complete-final-owner-bundle", sha256: digest(sageState.replayAuthority) } }, pari: { pristineRecord, pristineRecordSha256: digest(pristineRecord), terminalShape: pariShape, terminalShapeSha256: digest(pariShape), rngAuthority: pristineRecord.rng, workAuthority: pristineRecord.work }, commonTerminalShapeSha256: digest(sageShape) }, warmup, pairs: rawPairs, summary: deriveSummary(rawPairs) });
  if (output) fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`); return receipt;
}
function parseArguments(argv) { const options = { input: null, output: DEFAULT_OUTPUT, pairs: 7, seed: "1" }; for (let index = 0; index < argv.length; index++) { const item = argv[index]; if (item === "--input") options.input = path.resolve(argv[++index]); else if (item === "--output") options.output = path.resolve(argv[++index]); else if (item === "--pairs") options.pairs = Number(argv[++index]); else if (item === "--seed") options.seed = argv[++index]; else throw new Error(`unknown argument: ${item}`); } assert(options.input); return options; }
module.exports = { FIELD_ID, FROZEN_INPUT_FILE_SHA256, FROZEN_PREPARED_INPUT_SHA256, NATIVE_STAGE_ORDER, SOURCE_STAGES, deriveSummary, digest, durationPartitions, loadPrepared, pariArm, pariTerminalShape, run, sageArm, sageTerminalShape, stageLabel, validateArm, validateAuthorities, validatePariRecord, validateReceipt };
if (require.main === module) run(parseArguments(process.argv.slice(2))).then(receipt => process.stdout.write(`${JSON.stringify(receipt.summary)}\n`)).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
