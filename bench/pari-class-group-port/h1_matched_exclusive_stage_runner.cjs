#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const HERE = __dirname;
const ROOT_SOURCE = path.join(HERE, "pari_unified_complete_h1_root.py");
const ADAPTER_SOURCE = path.join(HERE, "h1_unified_complete_adapter.cjs");
const RESIDENT_SOURCE = path.join(HERE, "resident_generated_class_attempt.py");
const DEFAULT_OUTPUT = path.join(
  HERE,
  "h1-matched-exclusive-stage-development-receipt.json",
);
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const FROZEN_INPUT_FILE_SHA256 =
  "22a997866388571cd3c12e1a3ea5c5cc3a7fe89217b253bb0e779007f6fe9b77";
const FROZEN_PREPARED_INPUT_SHA256 =
  "03a4ac33c173b65168361f3ff612bc45ed7ff793881a8d5181b1c9a0868fe658";
const STAGES = Object.freeze([
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
  "unattributed-remainder",
]);
const MATCHED_KEYS = Object.freeze([
  "resultDigest", "replayDigest", "rngDigest", "workDigest",
]);

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value))).digest("hex");
}

function fileSha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${name} has unexpected fields`);
}

function unsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a decimal string`);
  assert.match(value, /^(0|[1-9][0-9]{0,29})$/, `${name} is not canonical`);
  const answer = BigInt(value);
  if (positive) assert(answer > 0n, `${name} must be positive`);
  return answer;
}

function loadPrepared(filename) {
  const {
    parseRootParameters,
    sanitizePreparedInput,
  } = require("./h1_outcome_c_adapter.cjs");
  const raw = JSON.parse(fs.readFileSync(filename, "utf8"));
  exactKeys(raw, ["input", "names"], "frozen prepared owner input");
  const source = fs.readFileSync(RESIDENT_SOURCE, "utf8");
  assert.deepEqual(raw.names, parseRootParameters(source));
  const preparedInput = sanitizePreparedInput(raw, source).record;
  const answer = {
    preparedInput,
    fileSha256: fileSha256(filename),
    preparedInputSha256: digest(preparedInput),
  };
  assert.equal(answer.fileSha256, FROZEN_INPUT_FILE_SHA256,
    "input file is not the frozen 351-owner fixture");
  assert.equal(answer.preparedInputSha256, FROZEN_PREPARED_INPUT_SHA256,
    "sanitized prepared input does not match the frozen fixture");
  return answer;
}

function segmentsFromDurations(ordered) {
  let cursor = 0n;
  return ordered.map((item, ordinal) => {
    assert(STAGES.includes(item.stage), `unknown stage ${item.stage}`);
    const duration = typeof item.nanoseconds === "bigint"
      ? item.nanoseconds : unsigned(String(item.nanoseconds), "segment duration");
    assert(duration > 0n, "ordered stage segment must be positive");
    const start = cursor;
    cursor += duration;
    return {
      ordinal,
      stage: item.stage,
      startNanoseconds: String(start),
      endNanoseconds: String(cursor),
    };
  });
}

function totalsFromSegments(segments) {
  const totals = Object.fromEntries(STAGES.map(stage => [stage, 0n]));
  let cursor = 0n;
  for (const [ordinal, segment] of segments.entries()) {
    exactKeys(segment, [
      "ordinal", "stage", "startNanoseconds", "endNanoseconds",
    ], `segment ${ordinal}`);
    assert.equal(segment.ordinal, ordinal, "segment ordinals are not contiguous");
    assert(STAGES.includes(segment.stage), "segment has unknown stage");
    const start = unsigned(segment.startNanoseconds, "segment start");
    const end = unsigned(segment.endNanoseconds, "segment end", { positive: true });
    assert.equal(start, cursor, "segments overlap or leave a gap");
    assert(end > start, "segment duration must be positive");
    totals[segment.stage] += end - start;
    cursor = end;
  }
  return { totals, root: cursor };
}

function validateExclusiveArm(arm) {
  exactKeys(arm, [
    "implementation", "rootNanoseconds", "segments", "stageTotalsNanoseconds",
    ...MATCHED_KEYS, "sourceAuthorityDigest", "terminalStatus",
  ], "exclusive arm");
  assert(["sagejs", "pari"].includes(arm.implementation));
  const root = unsigned(arm.rootNanoseconds, "root", { positive: true });
  const reconstructed = totalsFromSegments(arm.segments);
  assert.equal(reconstructed.root, root, "segments do not cover the root");
  exactKeys(arm.stageTotalsNanoseconds, STAGES, "stage totals");
  let total = 0n;
  for (const stage of STAGES) {
    const claimed = unsigned(arm.stageTotalsNanoseconds[stage], `${stage} total`);
    assert.equal(claimed, reconstructed.totals[stage], `${stage} total mismatch`);
    assert(claimed > 0n, `${stage} was not visited`);
    total += claimed;
  }
  assert.equal(total, root, "stage totals do not conserve the root");
  for (const key of MATCHED_KEYS) assert.match(arm[key], /^[0-9a-f]{64}$/);
  assert.match(arm.sourceAuthorityDigest, /^[0-9a-f]{64}$/);
  assert.equal(arm.terminalStatus, "pari-correspondence-complete-internal-h1");
  return arm;
}

function matchedDigests(records) {
  return {
    resultDigest: digest(records.result),
    replayDigest: digest(records.replay),
    rngDigest: digest(records.rng),
    workDigest: digest(records.work),
  };
}

function sageArm(output) {
  assert.equal(output.correspondenceComplete, true);
  const trace = output.diagnosticStageTrace;
  exactKeys(trace, [
    "schema", "rootNanoseconds", "failed", "clockFailed",
    "totalsNanoseconds", "visits",
  ], "native diagnostic stage trace");
  assert.equal(trace.schema, 1);
  assert.equal(trace.failed, false);
  assert.equal(trace.clockFailed, false);
  assert.deepEqual(Object.keys(trace.totalsNanoseconds).sort(), [...STAGES].sort());
  trace.visits.forEach((visit, index) => {
    exactKeys(visit, ["ordinal", "stage", "stageIndex", "nanoseconds"],
      `native visit ${index}`);
    assert.equal(visit.ordinal, index + 1, "native visit ordinals are not contiguous");
    assert.equal(visit.stageIndex, [
      "unattributed-remainder", "relation-retry",
      "sparse-hnf-snf-transform", "unit-regulator",
      "honesty-generators-final",
    ].indexOf(visit.stage), "native visit stage index changed");
  });
  const segments = segmentsFromDurations(trace.visits);
  const stageTotalsNanoseconds = Object.fromEntries(
    STAGES.map(stage => [stage, String(trace.totalsNanoseconds[stage])]),
  );
  return validateExclusiveArm({
    implementation: "sagejs",
    rootNanoseconds: String(trace.rootNanoseconds),
    segments,
    stageTotalsNanoseconds,
    ...matchedDigests(output),
    sourceAuthorityDigest: output.replay.authoritySha256,
    terminalStatus: output.terminalStatus,
  });
}

function validatePariRecord(record) {
  exactKeys(record, ["result", "rng", "work"], "PARI exact record");
  assert.equal(record.result.classGroup.classNumber, "1");
  assert.deepEqual(record.result.classGroup.invariantFactors, []);
  assert.equal(record.result.unitGroupCorrespondence.rank, "2");
  assert.equal(record.rng.algorithm, "pari-xorshift1024star-2.17.4");
  assert.equal(record.rng.seed, "1");
  assert.equal(record.rng.terminalState.length, 66);
  assert.equal(record.work.factorBaseSize, "66");
  return record;
}

function pariArm(sample, matched) {
  assert.equal(sample.timing.schema,
    "sagejs.pari-class-group/pari-stage-clock-sample-v2");
  assert.equal(sample.timing.clockEnabled, true);
  assert.equal(sample.timing.monotonic, true);
  assert.equal(sample.timing.orderedSegmentsComplete, true);
  assert.deepEqual(Object.keys(sample.timing.stageTotalsNanoseconds), STAGES);
  validatePariRecord(sample.record);
  const segments = segmentsFromDurations(sample.timing.orderedSegments);
  return validateExclusiveArm({
    implementation: "pari",
    rootNanoseconds: sample.timing.inclusiveRootNanoseconds,
    segments,
    stageTotalsNanoseconds: sample.timing.stageTotalsNanoseconds,
    ...matchedDigests(matched),
    sourceAuthorityDigest: digest(sample.record),
    terminalStatus: matched.terminalStatus,
  });
}

function medianBigInt(values) {
  assert(values.length > 0 && values.length % 2 === 1,
    "development medians require an odd sample count");
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[
    Math.floor(values.length / 2)
  ];
}

function deriveSummary(pairs) {
  const byImplementation = { sagejs: [], pari: [] };
  for (const pair of pairs) {
    for (const arm of pair.arms) byImplementation[arm.implementation].push(arm);
  }
  const stageMediansNanoseconds = {};
  for (const stage of [...STAGES, "complete-root"]) {
    const value = (arm) => BigInt(stage === "complete-root"
      ? arm.rootNanoseconds : arm.stageTotalsNanoseconds[stage]);
    const sagejs = medianBigInt(byImplementation.sagejs.map(value));
    const pari = medianBigInt(byImplementation.pari.map(value));
    stageMediansNanoseconds[stage] = {
      sagejs: String(sagejs),
      pari: String(pari),
      gap: String(sagejs - pari),
      ratio: Number(sagejs) / Number(pari),
    };
  }
  const positive = STAGES.map(stage => BigInt(stageMediansNanoseconds[stage].gap))
    .map(value => value > 0n ? value : 0n);
  const namedPositive = positive.slice(0, 4).reduce((sum, value) => sum + value, 0n);
  const allPositive = positive.reduce((sum, value) => sum + value, 0n);
  return {
    pairCount: pairs.length,
    stageMediansNanoseconds,
    namedPositiveGapFraction: allPositive > 0n
      ? Number(namedPositive) / Number(allPositive) : null,
    qualifiedTiming: false,
  };
}

function validateReceipt(receipt) {
  exactKeys(receipt, [
    "schema", "diagnosticOnly", "qualifiedTiming", "boundaryQualification",
    "fieldId", "seed", "inputProvenance", "buildProvenance",
    "matchedAuthority", "pairs", "summary",
  ], "matched exclusive receipt");
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/h1-matched-exclusive-stage-development-v1");
  assert.equal(receipt.diagnosticOnly, true);
  assert.equal(receipt.qualifiedTiming, false);
  assert.equal(receipt.boundaryQualification, "unqualified-development-host");
  assert.equal(receipt.fieldId, FIELD_ID);
  assert.equal(receipt.seed, "1");
  exactKeys(receipt.inputProvenance, [
    "sourcePath", "fileSha256", "preparedInputSha256",
  ], "input provenance");
  assert.equal(path.isAbsolute(receipt.inputProvenance.sourcePath), true);
  assert.equal(receipt.inputProvenance.fileSha256, FROZEN_INPUT_FILE_SHA256);
  assert.equal(
    receipt.inputProvenance.preparedInputSha256,
    FROZEN_PREPARED_INPUT_SHA256,
  );
  exactKeys(receipt.buildProvenance, [
    "commit", "dirty", "node", "platform", "rootSourceSha256",
    "adapterSourceSha256", "pariArchiveSha256", "pariPristineLibrarySha256",
    "pariInstrumentedSourceSha256", "pariDerivativeLibrarySha256",
    "pariDerivativeExecutableSha256",
  ], "build provenance");
  assert.match(receipt.buildProvenance.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof receipt.buildProvenance.dirty, "boolean");
  assert.match(receipt.buildProvenance.node, /^v[0-9]+\./);
  assert.match(receipt.buildProvenance.platform, /^linux-/);
  for (const key of Object.keys(receipt.buildProvenance).filter(
    key => key.endsWith("Sha256"),
  )) assert.match(receipt.buildProvenance[key], /^[0-9a-f]{64}$/);
  exactKeys(receipt.matchedAuthority, MATCHED_KEYS, "matched authority");
  assert(Array.isArray(receipt.pairs) && receipt.pairs.length >= 7);
  assert(receipt.pairs.length % 2 === 1);
  let reference = null;
  for (const [pairIndex, pair] of receipt.pairs.entries()) {
    exactKeys(pair, ["pairIndex", "order", "arms"], `pair ${pairIndex}`);
    assert.equal(pair.pairIndex, pairIndex);
    assert.equal(pair.order, pairIndex % 2 === 0 ? "AB" : "BA");
    assert.equal(pair.arms.length, 2);
    const expected = pair.order === "AB" ? ["sagejs", "pari"] : ["pari", "sagejs"];
    assert.deepEqual(pair.arms.map(arm => arm.implementation), expected);
    pair.arms.forEach(validateExclusiveArm);
    for (const key of MATCHED_KEYS) {
      assert.equal(pair.arms[0][key], pair.arms[1][key], `matched ${key} differs`);
      if (reference) assert.equal(pair.arms[0][key], reference[key], `${key} drifted`);
    }
    reference ??= Object.fromEntries(MATCHED_KEYS.map(key => [key, pair.arms[0][key]]));
  }
  assert.deepEqual(receipt.matchedAuthority, reference);
  assert.deepEqual(receipt.summary, deriveSummary(receipt.pairs));
  return receipt;
}

async function pristineRecord(seed, preparedInput) {
  const pariAdapter = require("./pari_h1_outcome_c_adapter.cjs");
  const state = await pariAdapter.preparePreparedH1({
    implementation: "pari", seed, preparedInput,
  });
  try {
    return validatePariRecord(state.replayRecord);
  } finally {
    await pariAdapter.closePreparedH1(state);
  }
}

async function executeSage(adapter, seed, preparedInput) {
  const state = await adapter.preparePreparedH1({
    implementation: "sagejs", seed, preparedInput,
    diagnosticStageClock: true,
  });
  try {
    return sageArm(await adapter.runPreparedH1({
      implementation: "sagejs", seed, preparedInput, preparedState: state,
      switchStage: () => assert.fail("native diagnostic trace must own stage timing"),
    }));
  } finally {
    await adapter.closePreparedH1(state);
  }
}

async function run({ input, output = DEFAULT_OUTPUT, pairs = 7, seed = "1" }) {
  const adapter = require("./h1_unified_complete_adapter.cjs");
  const { buildDerivative } = require("./pari_stage_clock_derivative.cjs");
  const {
    DerivativeClient,
    validateActiveTiming,
  } = require("./pari-stage-clock/run-derivative.cjs");
  assert.equal(process.platform, "linux", "matched stage diagnostic is Linux-only");
  assert.equal(seed, "1", "frozen owner graph authenticates only seed 1");
  assert(Number.isInteger(pairs) && pairs >= 7 && pairs % 2 === 1);
  const loaded = loadPrepared(input);
  const authorityRecord = await pristineRecord(seed, loaded.preparedInput);
  const matched = adapter.matchedRecords({ seed, preparedInput: loaded.preparedInput });
  const manifest = buildDerivative();
  const derivative = new DerivativeClient(manifest);
  await derivative.ready();
  const rawPairs = [];
  try {
    for (let pairIndex = 0; pairIndex < pairs; pairIndex += 1) {
      const order = pairIndex % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"];
      const arms = [];
      for (const implementation of order) {
        if (implementation === "sagejs") {
          arms.push(await executeSage(
            adapter, seed, structuredClone(loaded.preparedInput),
          ));
        } else {
          const sample = await derivative.run("ACTIVE", seed);
          assert.deepEqual(sample.record, authorityRecord,
            "instrumented PARI result/work/RNG differs from pristine cold replay");
          validateActiveTiming(sample.timing);
          arms.push(pariArm(sample, matched));
        }
      }
      rawPairs.push({
        pairIndex,
        order: pairIndex % 2 === 0 ? "AB" : "BA",
        arms,
      });
    }
  } finally {
    await derivative.close();
  }
  const buildProvenance = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "",
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    rootSourceSha256: fileSha256(ROOT_SOURCE),
    adapterSourceSha256: fileSha256(ADAPTER_SOURCE),
    pariArchiveSha256: manifest.input.archiveSha256,
    pariPristineLibrarySha256: manifest.input.pristineLibrarySha256,
    pariInstrumentedSourceSha256: manifest.instrumentedBuch2Sha256,
    pariDerivativeLibrarySha256: manifest.librarySha256,
    pariDerivativeExecutableSha256: manifest.executableSha256,
  };
  const receipt = validateReceipt({
    schema: "sagejs.pari-class-group/h1-matched-exclusive-stage-development-v1",
    diagnosticOnly: true,
    qualifiedTiming: false,
    boundaryQualification: "unqualified-development-host",
    fieldId: FIELD_ID,
    seed,
    inputProvenance: {
      sourcePath: path.resolve(input),
      fileSha256: loaded.fileSha256,
      preparedInputSha256: loaded.preparedInputSha256,
    },
    buildProvenance,
    matchedAuthority: matchedDigests(matched),
    pairs: rawPairs,
    summary: deriveSummary(rawPairs),
  });
  if (output) fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function parseArguments(argv) {
  const options = { input: null, output: DEFAULT_OUTPUT, pairs: 7, seed: "1" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--input") options.input = path.resolve(argv[++index]);
    else if (item === "--output") options.output = path.resolve(argv[++index]);
    else if (item === "--pairs") options.pairs = Number(argv[++index]);
    else if (item === "--seed") options.seed = argv[++index];
    else throw new Error(`unknown argument: ${item}`);
  }
  assert(options.input, "--input <frozen-inputs.json> is required");
  return options;
}

module.exports = {
  FROZEN_INPUT_FILE_SHA256,
  FROZEN_PREPARED_INPUT_SHA256,
  MATCHED_KEYS,
  STAGES,
  FIELD_ID,
  deriveSummary,
  digest,
  loadPrepared,
  pariArm,
  parseArguments,
  run,
  sageArm,
  segmentsFromDurations,
  validateExclusiveArm,
  validateReceipt,
};

if (require.main === module) {
  run(parseArguments(process.argv.slice(2))).then(receipt => {
    process.stdout.write(`${JSON.stringify(receipt.summary)}\n`);
  }).catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
