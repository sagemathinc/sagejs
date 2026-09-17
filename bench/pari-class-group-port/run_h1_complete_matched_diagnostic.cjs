#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  runMatchedDiagnostic,
  validateReceipt,
} = require("./h1_complete_matched_diagnostic.cjs");
const {
  NAMED_STAGES,
  RESIDUAL_STAGE,
} = require("./h1_exclusive_stage_timing.cjs");
const {
  parseRootParameters,
  sanitizePreparedInput,
} = require("./h1_outcome_c_adapter.cjs");
const adapter = require("./h1_unified_complete_adapter.cjs");

const HERE = __dirname;
const ROOT_SOURCE = path.join(HERE, "pari_unified_complete_h1_root.py");
const RESIDENT_SOURCE = path.join(HERE, "resident_generated_class_attempt.py");
const ADAPTER_SOURCE = path.join(HERE, "h1_unified_complete_adapter.cjs");
const PARI_ADAPTER_SOURCE = path.join(HERE, "pari_h1_outcome_c_adapter.c");

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function parseArguments(argv) {
  const answer = { input: null, output: null, pairs: 7, seed: "1" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--input") answer.input = path.resolve(argv[++index]);
    else if (item === "--output") answer.output = path.resolve(argv[++index]);
    else if (item === "--pairs") answer.pairs = Number(argv[++index]);
    else if (item === "--seed") answer.seed = argv[++index];
    else throw new Error(`unknown argument: ${item}`);
  }
  assert(answer.input, "--input <sanitized-owner-input.json> is required");
  assert(Number.isInteger(answer.pairs) && answer.pairs >= 7);
  assert.match(answer.seed, /^(0|[1-9][0-9]*)$/);
  return answer;
}

function loadPrepared(filename) {
  const raw = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.deepEqual(Object.keys(raw).sort(), ["input", "names"]);
  const residentSource = fs.readFileSync(RESIDENT_SOURCE, "utf8");
  assert.deepEqual(raw.names, parseRootParameters(residentSource));
  return sanitizePreparedInput(raw, residentSource).record;
}

function stageObject(value) {
  return Object.fromEntries(
    [...NAMED_STAGES, RESIDUAL_STAGE].map(stage => [stage, value(stage)]),
  );
}

async function executeArm(request) {
  const preparedState = await adapter.preparePreparedH1({
    implementation: request.implementation,
    seed: request.seed,
    preparedInput: request.preparedInput,
  });
  let output, end;
  const start = process.hrtime.bigint();
  try {
    output = await adapter.runPreparedH1({
      implementation: request.implementation,
      seed: request.seed,
      preparedInput: request.preparedInput,
      preparedState,
      switchStage(stage) {
        assert.equal(stage, RESIDUAL_STAGE,
          "the monolithic unified root cannot claim an internal stage hook");
      },
    });
  } finally {
    end = process.hrtime.bigint();
    // Closing the prepared PARI helper is process lifecycle work and remains
    // outside the prepared bnfinit0 root boundary.
    await adapter.closePreparedH1(preparedState);
  }
  assert.equal(output.correspondenceComplete, true);
  const elapsed = end - start;
  assert(elapsed > 0n);
  const rootNanoseconds = String(elapsed);
  return {
    repetitions: 1,
    preparedInputSha256: request.preparedInputSha256,
    rootNanoseconds,
    segments: [{
      ordinal: 0,
      stage: RESIDUAL_STAGE,
      startNanoseconds: "0",
      endNanoseconds: rootNanoseconds,
    }],
    stageTotalsNanoseconds: stageObject(stage =>
      stage === RESIDUAL_STAGE ? rootNanoseconds : "0"),
    stageHooks: Object.fromEntries(NAMED_STAGES.map(stage => [stage, false])),
    stageCounters: Object.fromEntries(NAMED_STAGES.map(stage => [stage, {}])),
    resultDigest: adapter.digest(output.result),
    replayDigest: adapter.digest(output.replay),
    rngDigest: adapter.digest(output.rng),
    workDigest: adapter.digest(output.work),
    terminalStatus: output.terminalStatus,
  };
}

async function run(options) {
  assert.equal(process.platform, "linux", "real H1 timing is Linux-only");
  const preparedInput = loadPrepared(options.input);
  const diagnosticReceipt = await runMatchedDiagnostic({
    preparedInput,
    seed: options.seed,
    pairCount: options.pairs,
    executeArm,
  });
  validateReceipt(diagnosticReceipt);
  const receipt = {
    schema: "sagejs.pari-class-group/real-complete-h1-matched-run-v1",
    diagnosticOnly: true,
    qualifiedTiming: false,
    finalTimingRun: false,
    boundaryQualification: "unqualified-development-host",
    stageAttribution: {
      sagejsInternalHooksAvailable: false,
      pariInternalHooksAvailable: false,
      reason: "the unified Sage.js root and authentic PARI bnfinit0 adapter are monolithic",
    },
    provenance: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      rootSourceSha256: sha256File(ROOT_SOURCE),
      adapterSourceSha256: sha256File(ADAPTER_SOURCE),
      pariAdapterSourceSha256: sha256File(PARI_ADAPTER_SOURCE),
      preparedOwnerInputSha256: sha256File(options.input),
    },
    diagnosticReceipt,
  };
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  return receipt;
}

async function main(argv = process.argv.slice(2)) {
  const receipt = await run(parseArguments(argv));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

module.exports = { executeArm, loadPrepared, parseArguments, run };

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
