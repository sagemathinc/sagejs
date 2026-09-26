#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
//
// Paired coordinator for the fused H1 matched flag-zero boundary. Workers own
// their clocks: `kernelNs` must enclose exactly one already-built native/root
// call, while allocation, fixture loading, evidence hashing and serialization
// occur outside that interval. This file intentionally does not compile the
// giant root in its default or self-test modes.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const WORKER_SCHEMA = "sagejs.pari-class-group/h1-matched-flag-zero-worker-v1";
const RECEIPT_SCHEMA = "sagejs.pari-class-group/h1-matched-flag-zero-paired-v1";
const BOUNDARY = "prepared H1 through one compact p192 PRECI publication";
const FIELD = "x^3-20018*x+20034";
const RELATION_SHA = "b0c647186a5fed5317c7135ccf16623a930631382ad7963e12af4ded2db7259a";
const COMPACT_SHA = "80cec2acce5b95ec48beff67b800410eedb5e580e25029aa79d4d63dc40b1c2d";
const ROOT = ["0", "1", "3", "192", "1", "0", "0", "7", "73", "8", "0", "1"];
const GETFU = ["3", "10", "-186", "0", "1923", "0", "0", "1"];
const COUNTERS = Object.freeze({
  C1: "333", C2: "333", KC: "66", KCZ: "48", KCZ2: "48",
  accepted_relations: "73", catalog_entries: "1230",
  decomposition_calls: "48", degree_groups: "1833", descriptors: "66",
  factor_attempts: "96", factor_slots: "2270", initial_relations: "12",
  random_relations: "0", small_elements: "1046", subfactor_trials: "4",
  visited_ideals: "16",
});
const BASELINE_GAP_NS = 931341545n;
const TARGET_REMOVED_NS = 745073236n;
const PAIRS = 7;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function commandFromFile(filename) {
  const command = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert(Array.isArray(command) && command.length >= 1);
  assert(command.every((part) => typeof part === "string" && part.length > 0));
  return command;
}

function runWorker(command) {
  const started = process.hrtime.bigint();
  const answer = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1" },
  });
  const wallNs = process.hrtime.bigint() - started;
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  const lines = answer.stdout.trim().split("\n").filter(Boolean);
  assert(lines.length >= 1, "worker emitted no receipt");
  const receipt = JSON.parse(lines.at(-1));
  validateWorker(receipt);
  return { ...receipt, externalWallNs: wallNs.toString() };
}

function validateWorker(receipt) {
  assert.equal(receipt.schema, WORKER_SCHEMA);
  assert(["sagejs", "pari-2.17.4"].includes(receipt.implementation));
  assert.equal(receipt.boundary, BOUNDARY);
  assert.equal(receipt.field, FIELD);
  assert.equal(receipt.relationPrefixSha256, RELATION_SHA);
  assert.equal(receipt.compactSha256, COMPACT_SHA);
  assert.match(receipt.ownerEvidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.terminalRngSha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.status, "not_given(PRECI)");
  assert.equal(receipt.precisionBits, "192");
  assert.equal(receipt.getfuAttempts, "1");
  assert.equal(receipt.precisionRetries, "0");
  assert.equal(receipt.strongerExactSuffixCalls, "0");
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.nativeCalls, "1");
  assert.equal(receipt.evidenceInsideClock, false);
  assert.deepEqual(receipt.counters, COUNTERS);
  assert.deepEqual(receipt.root, ROOT);
  assert.deepEqual(receipt.getfuState, GETFU);
  assert.match(receipt.peakRssKiB, /^[1-9][0-9]*$/);
  assert(BigInt(receipt.peakRssKiB) > 0n);
  assert(receipt.artifactIdentity && typeof receipt.artifactIdentity === "object");
  assert(BigInt(receipt.kernelNs) > 0n);
  return receipt;
}

function median(values) {
  const sorted = values.map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return sorted[Math.floor(sorted.length / 2)];
}

function mad(values) {
  const center = median(values);
  return median(values.map((value) => {
    const delta = BigInt(value) - center;
    return delta < 0n ? -delta : delta;
  }));
}

function paired(sageCommand, pariCommand) {
  const pairs = [];
  for (let index = 0; index < PAIRS; index += 1) {
    const order = index % 2 === 0 ? ["sagejs", "pari"] : ["pari", "sagejs"];
    const arms = [];
    for (const implementation of order) {
      arms.push(runWorker(implementation === "sagejs" ? sageCommand : pariCommand));
    }
    const sage = arms.find((arm) => arm.implementation === "sagejs");
    const pari = arms.find((arm) => arm.implementation === "pari-2.17.4");
    assert(sage && pari);
    for (const key of [
      "boundary", "field", "relationPrefixSha256", "ownerEvidenceSha256",
      "compactSha256", "terminalRngSha256", "counters", "root", "getfuState",
      "status", "precisionBits", "getfuAttempts",
      "precisionRetries", "strongerExactSuffixCalls", "publicComplete",
    ]) assert.deepEqual(sage[key], pari[key], `pair ${index} disagrees on ${key}`);
    pairs.push({ index, order: order.join("-then-"), arms });
  }
  const sageMedian = median(pairs.map((pair) =>
    pair.arms.find((arm) => arm.implementation === "sagejs").kernelNs));
  const pariMedian = median(pairs.map((pair) =>
    pair.arms.find((arm) => arm.implementation === "pari-2.17.4").kernelNs));
  const sageSamples = pairs.map((pair) =>
    pair.arms.find((arm) => arm.implementation === "sagejs"));
  const pariSamples = pairs.map((pair) =>
    pair.arms.find((arm) => arm.implementation === "pari-2.17.4"));
  for (const samples of [sageSamples, pariSamples]) {
    for (const sample of samples.slice(1)) {
      assert.deepEqual(sample.artifactIdentity, samples[0].artifactIdentity,
        `${sample.implementation} artifact identity changed during series`);
    }
  }
  const matchedGap = sageMedian > pariMedian ? sageMedian - pariMedian : 0n;
  const removed = BASELINE_GAP_NS > matchedGap ? BASELINE_GAP_NS - matchedGap : 0n;
  return {
    schema: RECEIPT_SCHEMA,
    qualified: true,
    pairCount: PAIRS,
    schedule: "alternating AB/BA, Sage.js first in pair zero",
    workerCommands: {
      sagejsSha256: sha256(JSON.stringify(sageCommand)),
      pariSha256: sha256(JSON.stringify(pariCommand)),
    },
    pairs,
    summary: {
      sageMedianNs: sageMedian.toString(),
      pariMedianNs: pariMedian.toString(),
      sageMadNs: mad(sageSamples.map((sample) => sample.kernelNs)).toString(),
      pariMadNs: mad(pariSamples.map((sample) => sample.kernelNs)).toString(),
      sagePeakRssKiB: sageSamples.reduce((value, sample) =>
        BigInt(sample.peakRssKiB) > value ? BigInt(sample.peakRssKiB) : value, 0n).toString(),
      pariPeakRssKiB: pariSamples.reduce((value, sample) =>
        BigInt(sample.peakRssKiB) > value ? BigInt(sample.peakRssKiB) : value, 0n).toString(),
      matchedGapNs: matchedGap.toString(),
      frozenBaselineGapNs: BASELINE_GAP_NS.toString(),
      removedGapNs: removed.toString(),
      frozenTargetRemovedNs: TARGET_REMOVED_NS.toString(),
      outcomeCPass: removed >= TARGET_REMOVED_NS,
    },
    artifactIdentities: {
      sagejs: sageSamples[0].artifactIdentity,
      pari: pariSamples[0].artifactIdentity,
    },
  };
}

function fakeWorker(implementation, kernelNs) {
  const common = {
    schema: WORKER_SCHEMA,
    implementation: implementation === "sagejs" ? "sagejs" : "pari-2.17.4",
    boundary: BOUNDARY,
    field: FIELD,
    relationPrefixSha256: RELATION_SHA,
    compactSha256: COMPACT_SHA,
    ownerEvidenceSha256: "1".repeat(64),
    terminalRngSha256: "2".repeat(64),
    status: "not_given(PRECI)",
    precisionBits: "192",
    getfuAttempts: "1",
    precisionRetries: "0",
    strongerExactSuffixCalls: "0",
    publicComplete: false,
    nativeCalls: "1",
    evidenceInsideClock: false,
    counters: COUNTERS,
    root: ROOT,
    getfuState: GETFU,
    peakRssKiB: implementation === "sagejs" ? "100" : "50",
    artifactIdentity: { fixture: implementation },
    kernelNs: String(kernelNs),
  };
  process.stdout.write(`${JSON.stringify(common)}\n`);
}

function selfTest() {
  const command = [process.execPath, __filename];
  const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "sagejs-fused-paired-"));
  const sagePath = path.join(temp, "sage.json");
  const pariPath = path.join(temp, "pari.json");
  fs.writeFileSync(sagePath, JSON.stringify([...command, "--fake", "sagejs", "100000000"]));
  fs.writeFileSync(pariPath, JSON.stringify([...command, "--fake", "pari", "8000000"]));
  const receipt = paired(commandFromFile(sagePath), commandFromFile(pariPath));
  assert.equal(receipt.pairs.length, 7);
  assert.deepEqual(receipt.pairs.map((pair) => pair.order), [
    "sagejs-then-pari", "pari-then-sagejs", "sagejs-then-pari",
    "pari-then-sagejs", "sagejs-then-pari", "pari-then-sagejs",
    "sagejs-then-pari",
  ]);
  assert.equal(receipt.summary.removedGapNs, "839341545");
  assert.equal(receipt.summary.outcomeCPass, true);
  return receipt;
}

function design() {
  return {
    schema: "sagejs.pari-class-group/h1-matched-flag-zero-timing-design-v1",
    qualified: false,
    pairCount: PAIRS,
    schedule: "alternating AB/BA",
    clocks: "worker-reported kernel interval around one prebuilt native call",
    excluded: ["allocation", "fixture loading", "evidence hashing", "serialization", "compilation"],
    requiredAgreement: [
      "canonical relation prefix", "logical owner evidence", "terminal RNG",
      "p192 PRECI status", "one getfu", "zero retries", "zero exact suffix",
    ],
    threshold: {
      baselineGapNs: BASELINE_GAP_NS.toString(),
      removedGapTargetNs: TARGET_REMOVED_NS.toString(),
    },
    usage: `${path.basename(__filename)} --paired sage-command.json pari-command.json`,
  };
}

const args = process.argv.slice(2);
if (args[0] === "--fake") fakeWorker(args[1], args[2]);
else if (args[0] === "--self-test") process.stdout.write(`${JSON.stringify(selfTest())}\n`);
else if (args[0] === "--paired") {
  assert.equal(args.length, 3, "--paired needs Sage.js and PARI command JSON files");
  process.stdout.write(`${JSON.stringify(canonical(paired(
    commandFromFile(args[1]), commandFromFile(args[2]),
  )))}\n`);
} else {
  assert.equal(args.length, 0, "unknown arguments");
  process.stdout.write(`${JSON.stringify(design())}\n`);
}
