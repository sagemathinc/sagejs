#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { buildDerivative } = require("../pari_stage_clock_derivative.cjs");

const STAGES = [
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
  "unattributed-remainder",
];

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function median(values) {
  assert(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function comparableAuthorityRecord(record, variant) {
  if (variant === "h1") return record;
  assert.equal(variant, "row14", `unknown derivative variant ${variant}`);
  assert.equal(record.schema,
    "sagejs.pari-class-group/row14-pari-prepared-sample-v1");
  // The row-14 authority serializer also reports its own clocks and process
  // high-water RSS.  Those observations must vary and are not mathematical
  // work.  Exact active/inactive/pristine identity covers only result, source
  // work, and terminal RNG state, just as the H1 authority record does.
  return { result: record.result, work: record.work, rng: record.rng };
}

class DerivativeClient {
  constructor(manifest, { pristine = false } = {}) {
    this.lines = [];
    this.waiters = [];
    this.stderr = "";
    this.closed = false;
    this.buffer = "";
    this.child = spawn(
      pristine ? manifest.pristineExecutable : manifest.executable,
      [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: "C",
        LC_ALL: "C",
        LD_LIBRARY_PATH: [
          pristine ? manifest.pristineObjectDirectory : manifest.objectDirectory,
          process.env.LD_LIBRARY_PATH,
        ].filter(Boolean).join(":"),
      },
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(line);
        else this.lines.push(line);
      }
    });
    this.exit = new Promise(resolve => this.child.once("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(`stage-clock helper exited (${code ?? signal}): ${this.stderr}`);
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }

  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, this.stderr || "stage-clock helper is closed");
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async ready() {
    const line = await this.nextLine();
    assert(line.startsWith("READY "), line);
    const record = JSON.parse(line.slice(6));
    assert.equal(record.stageClockSchema, 2);
    assert.deepEqual(record.pariVersion, ["2", "17", "4"]);
    return record;
  }

  async run(mode, seed = "1") {
    assert(["ACTIVE", "INACTIVE", "PRISTINE"].includes(mode));
    assert.match(seed, /^(0|[1-9][0-9]*)$/);
    const helperMode = mode === "PRISTINE" ? "INACTIVE" : mode;
    this.child.stdin.write(`RUN ${helperMode} ${seed}\n`);
    const record = JSON.parse(await this.nextLine());
    const timing = JSON.parse(await this.nextLine());
    assert.equal(timing.clockEnabled, mode === "ACTIVE");
    return { record, timing };
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end("CLOSE\n");
    const result = await this.exit;
    assert.equal(result.signal, null);
    assert.equal(result.code, 0, this.stderr);
  }
}

function validateActiveTiming(timing) {
  assert.equal(timing.schema, "sagejs.pari-class-group/pari-stage-clock-sample-v2");
  assert.equal(timing.clockEnabled, true);
  assert.equal(timing.monotonic, true);
  assert.deepEqual(Object.keys(timing.stageTotalsNanoseconds), STAGES);
  assert.deepEqual(Object.keys(timing.stageVisits), STAGES);
  assert.equal(timing.orderedSegmentsComplete, true);
  assert(Array.isArray(timing.orderedSegments));
  assert(timing.orderedSegments.length > 0);
  const totals = STAGES.map(stage => BigInt(timing.stageTotalsNanoseconds[stage]));
  const root = BigInt(timing.inclusiveRootNanoseconds);
  assert(root > 0n);
  assert.equal(totals.reduce((sum, value) => sum + value, 0n), root);
  assert(root <= BigInt(timing.kernelNanoseconds));
  for (const stage of STAGES) assert(BigInt(timing.stageVisits[stage]) > 0n, `${stage} unvisited`);
  const reconstructedTotals = Object.fromEntries(STAGES.map(stage => [stage, 0n]));
  const reconstructedVisits = Object.fromEntries(STAGES.map(stage => [stage, 0n]));
  let segmentTotal = 0n;
  let previousStage = null;
  for (const segment of timing.orderedSegments) {
    assert.deepEqual(Object.keys(segment), ["stage", "nanoseconds"]);
    assert(STAGES.includes(segment.stage), `unknown ordered stage ${segment.stage}`);
    assert.notEqual(segment.stage, previousStage, "adjacent ordered stages were not coalesced");
    const duration = BigInt(segment.nanoseconds);
    assert(duration >= 0n);
    reconstructedTotals[segment.stage] += duration;
    reconstructedVisits[segment.stage]++;
    segmentTotal += duration;
    previousStage = segment.stage;
  }
  assert.equal(segmentTotal, root);
  for (const stage of STAGES) {
    assert.equal(reconstructedTotals[stage].toString(), timing.stageTotalsNanoseconds[stage]);
    assert.equal(reconstructedVisits[stage].toString(), timing.stageVisits[stage]);
  }
  // Precision/retry makes the important interleaving visible.  These visits
  // prevent a nested one-shot timer from masquerading as exclusive leaves.
  assert(BigInt(timing.stageVisits["unit-regulator"]) > 1n);
  assert(BigInt(timing.stageVisits["honesty-generators-final"]) > 1n);
  assert(BigInt(timing.stageVisits["unattributed-remainder"]) > 1n);
}

function validateInactiveTiming(timing) {
  assert.equal(timing.clockEnabled, false);
  assert.equal(timing.inclusiveRootNanoseconds, "0");
  assert.equal(timing.orderedSegmentsComplete, true);
  assert.deepEqual(timing.orderedSegments, []);
  for (const stage of STAGES) assert.equal(timing.stageTotalsNanoseconds[stage], "0");
}

async function runCampaign({
  pairs = 1,
  repetitions = 1,
  seed = "1",
  enforcePerturbationGate = false,
  variant = "h1",
} = {}) {
  assert(Number.isSafeInteger(pairs) && pairs >= 1);
  assert(Number.isSafeInteger(repetitions) && repetitions >= 1);
  if (enforcePerturbationGate) assert(pairs >= 11, "gate requires at least 11 pairs");
  const manifest = buildDerivative({ variant });
  const clients = {
    ACTIVE: new DerivativeClient(manifest),
    INACTIVE: new DerivativeClient(manifest),
    PRISTINE: new DerivativeClient(manifest, { pristine: true }),
  };
  await Promise.all(Object.values(clients).map(client => client.ready()));
  const rawPairs = [];
  let authorityRecord = null;
  try {
    for (let pairIndex = 0; pairIndex < pairs; pairIndex++) {
      const order = pairIndex % 2 === 0
        ? ["ACTIVE", "PRISTINE", "PRISTINE", "ACTIVE"]
        : ["PRISTINE", "ACTIVE", "ACTIVE", "PRISTINE"];
      const arms = [];
      for (const mode of order) {
        let kernelNanoseconds = 0n;
        let stageTotals = Object.fromEntries(STAGES.map(stage => [stage, 0n]));
        const samples = [];
        for (let repetition = 0; repetition < repetitions; repetition++) {
          const sample = await clients[mode].run(mode, seed);
          const comparable = comparableAuthorityRecord(sample.record, variant);
          if (authorityRecord === null) authorityRecord = comparable;
          else assert.deepEqual(comparable, authorityRecord, "result/work/RNG changed");
          if (mode === "ACTIVE") validateActiveTiming(sample.timing);
          else validateInactiveTiming(sample.timing);
          kernelNanoseconds += BigInt(sample.timing.kernelNanoseconds);
          for (const stage of STAGES) {
            stageTotals[stage] += BigInt(sample.timing.stageTotalsNanoseconds[stage]);
          }
          samples.push(sample.timing);
        }
        arms.push({
          mode,
          kernelNanoseconds: kernelNanoseconds.toString(),
          stageTotalsNanoseconds: Object.fromEntries(
            STAGES.map(stage => [stage, stageTotals[stage].toString()]),
          ),
          samples,
        });
      }
      let inactiveKernelNanoseconds = 0n;
      const inactiveSamples = [];
      for (let repetition = 0; repetition < repetitions; repetition++) {
        const sample = await clients.INACTIVE.run("INACTIVE", seed);
        assert.deepEqual(comparableAuthorityRecord(sample.record, variant), authorityRecord,
          "inactive hook result/work/RNG changed");
        validateInactiveTiming(sample.timing);
        inactiveKernelNanoseconds += BigInt(sample.timing.kernelNanoseconds);
        inactiveSamples.push(sample.timing);
      }
      rawPairs.push({
        pairIndex,
        order,
        arms,
        inactiveHookControl: {
          mode: "INACTIVE",
          kernelNanoseconds: inactiveKernelNanoseconds.toString(),
          samples: inactiveSamples,
        },
      });
    }
  } finally {
    await Promise.all(Object.values(clients).map(client => client.close()));
  }

  const ratios = [];
  const inactiveRatios = [];
  for (const pair of rawPairs) {
    const byMode = { ACTIVE: 0n, PRISTINE: 0n };
    for (const arm of pair.arms) byMode[arm.mode] += BigInt(arm.kernelNanoseconds);
    const active = Number(byMode.ACTIVE);
    const pristine = Number(byMode.PRISTINE);
    ratios.push(active / pristine);
    inactiveRatios.push(
      Number(BigInt(pair.inactiveHookControl.kernelNanoseconds) * 2n) / pristine,
    );
    if (enforcePerturbationGate) {
      assert(byMode.ACTIVE >= 1_000_000_000n, "active pair did not exceed one second");
      assert(byMode.PRISTINE >= 1_000_000_000n, "pristine pair did not exceed one second");
      assert(
        BigInt(pair.inactiveHookControl.kernelNanoseconds) >= 1_000_000_000n,
        "inactive pair control did not exceed one second",
      );
    }
  }
  const medianRatio = median(ratios);
  const perturbationFraction = medianRatio - 1;
  const medianInactiveOverPristine = median(inactiveRatios);
  if (enforcePerturbationGate) {
    assert(perturbationFraction <= 0.02, `stage clock perturbs kernel by ${perturbationFraction}`);
  }
  return {
    schema: "sagejs.pari-class-group/pari-stage-clock-campaign-v2",
    qualifiedTiming: false,
    qualificationCaveat:
      "This runner enforces protocol and the <=2% gate when requested, but only the timing coordinator may qualify a quiet-host run.",
    build: {
      buildId: manifest.buildId,
      archiveSha256: manifest.input.archiveSha256,
      pristineBuch2Sha256: manifest.input.pristineBuch2Sha256,
      pristineLibrarySha256: manifest.input.pristineLibrarySha256,
      instrumentedBuch2Sha256: manifest.instrumentedBuch2Sha256,
      librarySha256: manifest.librarySha256,
      executableSha256: manifest.executableSha256,
      pristineExecutableSha256: manifest.pristineExecutableSha256,
    },
    boundary: "prepared nfinit outside; complete bnfinit0(nf,0) inside",
    variant,
    seed,
    pairs,
    repetitions,
    exactRecordSha256: digest(authorityRecord),
    exactRecord: authorityRecord,
    medianActiveOverPristine: medianRatio,
    medianInactiveOverPristine,
    medianPerturbationFraction: perturbationFraction,
    perturbationGate: {
      thresholdFraction: 0.02,
      minimumPairs: 11,
      order: "alternating ABBA/BAAB",
      minimumKernelNanosecondsPerModePerPair: "1000000000",
      modes: ["ACTIVE", "INACTIVE", "PRISTINE"],
      evaluated: enforcePerturbationGate,
      passed: enforcePerturbationGate ? true : null,
    },
    rawPairs,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--enforce-perturbation-gate") options.enforcePerturbationGate = true;
    else if (["--pairs", "--repetitions", "--seed", "--variant"].includes(arg)) {
      assert(index + 1 < argv.length, `${arg} needs a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = ["--seed", "--variant"].includes(arg)
        ? argv[++index] : Number(argv[++index]);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (require.main === module) {
  runCampaign(parseArguments(process.argv.slice(2))).then(receipt => {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }).catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DerivativeClient,
  STAGES,
  comparableAuthorityRecord,
  runCampaign,
  validateActiveTiming,
  validateInactiveTiming,
};
