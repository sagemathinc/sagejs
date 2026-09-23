#!/usr/bin/env node
"use strict";

// Linux-only compiler-campaign diagnostic for the authentic prepared H1 root.
// Compilation, input decoding, owner construction, and validation are outside
// each sample. The root algorithm and output projection are unchanged.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const adapter = require("./h1_unified_complete_adapter.cjs");
const { loadPrepared } = require("./run_h1_complete_matched_diagnostic.cjs");

function parse(argv) {
  const result = { input: null, samples: 7, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") result.input = path.resolve(argv[++index]);
    else if (argv[index] === "--samples") result.samples = Number(argv[++index]);
    else if (argv[index] === "--output") result.output = path.resolve(argv[++index]);
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  assert(result.input, "--input is required");
  assert(Number.isInteger(result.samples) && result.samples >= 1);
  return result;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function json(value) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item);
}

async function run(options) {
  assert.equal(process.platform, "linux");
  const preparedInput = loadPrepared(options.input);
  const state = await adapter.preparePreparedH1({
    implementation: "sagejs", seed: "1", preparedInput,
    diagnosticStageClock: true,
  });
  const samples = [];
  const allocationSamples = [];
  const allocationAddonPath = process.env.SAGEJS_ALLOCATION_COUNTER_ADDON;
  if (allocationAddonPath) {
    const allocationAddon = require(path.resolve(allocationAddonPath));
    const original = state.built.fn.gmp;
    state.built.fn.gmp = (...args) => {
      const result = allocationAddon.measure(() => original(...args));
      const counters = allocationAddon.data();
      assert.equal(counters[10], 0n, "allocation counter overflow");
      allocationSamples.push(counters.map(String));
      return result;
    };
  }
  try {
    for (let index = 0; index < options.samples; index += 1) {
      const start = process.hrtime.bigint();
      const result = await adapter.runPreparedH1({
        implementation: "sagejs", seed: "1", preparedInput,
        preparedState: state,
        switchStage() {},
      });
      const end = process.hrtime.bigint();
      assert.equal(result.correspondenceComplete, true);
      assert.equal(adapter.digest(result.sourceAuthority),
        state.replayAuthoritySha256);
      samples.push({
        nanoseconds: String(end - start),
        authoritySha256: adapter.digest(result.sourceAuthority),
        diagnosticStageTrace: result.diagnosticStageTrace,
      });
    }
  } finally {
    await adapter.closePreparedH1(state);
  }
  const milliseconds = samples.map(sample => Number(sample.nanoseconds) / 1e6);
  const stages = Object.keys(samples[0].diagnosticStageTrace.totalsNanoseconds);
  const stageMedianMilliseconds = Object.fromEntries(stages.map(stage => [
    stage,
    median(samples.map(sample =>
      Number(sample.diagnosticStageTrace.totalsNanoseconds[stage]) / 1e6)),
  ]));
  const built = state.built.built;
  const root = built.ir.functions.find(
    fn => fn.name === "pari_unified_complete_h1_root");
  const report = {
    schema: "sagejs.pari-class-group/h1-resident-exact-lifetime-v1",
    diagnosticOnly: true,
    qualifiedTiming: false,
    compilerCampaign: "resident-exact-lifetime-1",
    input: { path: options.input, sha256: sha256(options.input) },
    build: {
      modulePath: built.modulePath,
      corePath: built.coreSourcePath,
      rootScratch: root.analysis.residentExactScratch,
    },
    authoritySha256: state.replayAuthoritySha256,
    ...(allocationAddonPath === undefined ? {} : {
      allocationBoundary: "Calling-thread malloc/calloc/realloc/free calls " +
        "strictly during the synchronous generated GMP root callback; input " +
        "construction, output validation and digesting are excluded.",
      allocationCounterNames: [
        "mallocCalls", "callocCalls", "reallocCalls", "freeCalls",
        "mallocRequestedBytes", "callocRequestedBytes",
        "reallocRequestedBytes", "freeNullCalls", "reallocNullCalls",
        "callocSizeOverflowCalls", "counterOverflow",
      ],
      allocationSamples,
    }),
    samples,
    medianMilliseconds: median(milliseconds),
    stageMedianMilliseconds,
  };
  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output,
      `${JSON.stringify(report, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item, 2)}\n`);
  }
  return report;
}

if (require.main === module) {
  run(parse(process.argv.slice(2))).then(report => {
    process.stdout.write(`${json(report)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { median, parse, run };
