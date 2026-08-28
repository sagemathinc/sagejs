#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const {
  attachIdentity,
  verifyDocumentIdentity,
} = require("../../tools/optimizer-development/common.cjs");
const {
  requireCurrentBuild,
} = require("../../tools/optimizer-development/workloads.cjs");
const {
  PROFILE_SOURCE,
  STANDARD_POINTS,
  STANDARD_SAMPLES,
  STANDARD_WARMUPS,
  createRunner,
  independentOracles,
} = require("./arrow-field.cjs");

const SCHEMA = "sagejs.campaign1-arrow-compiler-promotion-evidence/v1";
const PASS = "math.closed-transactional-rectangular-binary64-dataflow.v1";
const LOWERING = "v8.closed-transactional-rectangular-binary64-dataflow.v1";
const ORDER = Object.freeze(["AB", "BA", "BA", "AB"]);

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function distribution(values) {
  return {
    unit: "nanoseconds",
    samples: values,
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

async function pairedComparison({ phase, samples, baseline, candidate, expected }) {
  const rawPairs = [];
  for (let index = 0; index < samples; index += 1) {
    const order = ORDER[index % ORDER.length];
    let baselineResult;
    let candidateResult;
    if (order === "AB") {
      baselineResult = await baseline();
      candidateResult = await candidate();
    } else {
      candidateResult = await candidate();
      baselineResult = await baseline();
    }
    for (const result of [baselineResult, candidateResult]) {
      assert.equal(result.completeDigest, expected.completeDigest);
      assert.equal(result.traceDigest, expected.traceDigest);
    }
    rawPairs.push({
      index,
      order,
      baselineNanoseconds: baselineResult.nanoseconds,
      candidateNanoseconds: candidateResult.nanoseconds,
      baselineCompleteOutputDigest: baselineResult.completeDigest,
      candidateCompleteOutputDigest: candidateResult.completeDigest,
      baselineTraceDigest: baselineResult.traceDigest,
      candidateTraceDigest: candidateResult.traceDigest,
    });
  }
  const baselineSamples = rawPairs.map((pair) => pair.baselineNanoseconds);
  const candidateSamples = rawPairs.map((pair) => pair.candidateNanoseconds);
  const deltas = rawPairs.map(
    (pair) => pair.baselineNanoseconds - pair.candidateNanoseconds,
  );
  return {
    phase,
    measurementScope: "complete-public-construction-and-lowering-call",
    inclusive: true,
    rawPairs,
    baseline: distribution(baselineSamples),
    candidate: distribution(candidateSamples),
    pairedDelta: distribution(deltas),
    positivePairs: deltas.filter((value) => value > 0).length,
    medianRatioBaselineOverCandidate:
      median(baselineSamples) / median(candidateSamples),
  };
}

async function workerMain(variant) {
  if (variant !== "baseline" && variant !== "candidate") {
    throw new Error(`unknown arrow compiler evidence worker ${variant}`);
  }
  const root = path.resolve(__dirname, "../..");
  const profileSource = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
  const runner = await createRunner(root, profileSource, "O2");
  const input = readline.createInterface({ input: process.stdin });
  process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
  try {
    for await (const line of input) {
      const request = JSON.parse(line);
      if (request.action === "close") break;
      try {
        const value = request.action === "guard"
          ? runner.guardAudit()
          : runner.measure(request.kind, "baseline", request.points);
        process.stdout.write(`${JSON.stringify({ id: request.id, value })}\n`);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({
          id: request.id,
          error: String(error?.stack ?? error),
        })}\n`);
      }
    }
  } finally {
    runner.close();
  }
}

function createSubprocessRunner(root, variant) {
  const cacheRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `sagejs-arrow-compiler-${variant}-`),
  );
  const environment = {
    ...process.env,
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
    SAGEJS_NATIVE_DISABLE: "1",
    SAGEJS_OPT_LEVEL: "O2",
    SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: path.join(cacheRoot, "precompiled"),
    XDG_CACHE_HOME: path.join(cacheRoot, "xdg"),
  };
  if (variant === "baseline") environment.SAGEJS_OPT_DISABLE = PASS;
  else delete environment.SAGEJS_OPT_DISABLE;
  const child = spawn(process.execPath, [__filename, `--worker=${variant}`], {
    cwd: root,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let nextId = 1;
  let stderr = "";
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const response = JSON.parse(line);
    if (response.ready === true) {
      readyResolve();
      return;
    }
    const promise = pending.get(response.id);
    if (!promise) return;
    pending.delete(response.id);
    if (response.error) promise.reject(new Error(response.error));
    else promise.resolve(response.value);
  });
  child.once("exit", (code) => {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
    if (code !== 0) {
      readyReject(new Error(stderr || `worker ${variant} exited ${code}`));
    }
    for (const promise of pending.values()) {
      promise.reject(new Error(stderr || `worker ${variant} exited ${code}`));
    }
    pending.clear();
  });
  const request = async (payload) => {
    await ready;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    });
  };
  return {
    measure(kind, points) {
      return request({ action: "measure", kind, points });
    },
    guardAudit() {
      return request({ action: "guard" });
    },
    async close() {
      await ready;
      child.stdin.end(`${JSON.stringify({ action: "close" })}\n`);
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

function validateComparison(
  label,
  comparison,
  expectedDigest,
  samples,
  requireSeparation,
) {
  assert.equal(comparison.rawPairs.length, samples, `${label} sample count`);
  if (requireSeparation) {
    assert.equal(comparison.positivePairs, samples, `${label} separation`);
  }
  for (const pair of comparison.rawPairs) {
    assert.equal(pair.baselineCompleteOutputDigest, expectedDigest);
    assert.equal(pair.candidateCompleteOutputDigest, expectedDigest);
  }
}

function validateReport(report) {
  assert.equal(report.schema, SCHEMA);
  verifyDocumentIdentity("arrow compiler promotion evidence", report);
  assert.equal(report.intervention.category, "compiler");
  assert.equal(report.intervention.passId, PASS);
  assert.equal(report.intervention.loweringId, LOWERING);
  assert.equal(report.productionRouteClaim, "compiler-selected-v8");
  validateComparison(
    "representative",
    report.comparisons.representativeVector,
    report.oracles.vector.completeDigest,
    report.protocol.samples,
    report.promotable,
  );
  validateComparison(
    "heldout",
    report.comparisons.heldoutSlope,
    report.oracles.slope.completeDigest,
    report.protocol.samples,
    report.promotable,
  );
  assert.equal(report.guardAudit.acceptedVectorExact, true);
  assert.equal(report.guardAudit.hypotIdentityFallbackExact, true);
  assert.ok(report.guardAudit.hypotReplacementCalls > 0);
  assert.equal(report.guardAudit.transactionalPublication, true);
  return report;
}

async function runPromotionEvidence({
  root = path.resolve(__dirname, "../.."),
  points = STANDARD_POINTS,
  samples = STANDARD_SAMPLES,
  warmups = STANDARD_WARMUPS,
  allowUnverifiedBuild = false,
} = {}) {
  const standard = points === STANDARD_POINTS && samples === STANDARD_SAMPLES &&
    warmups === STANDARD_WARMUPS;
  if (!standard && !allowUnverifiedBuild) {
    throw new Error("nonstandard compiler evidence must be an explicit smoke run");
  }
  if (standard && allowUnverifiedBuild) {
    throw new Error("standard compiler evidence cannot use an unverified build");
  }
  const buildAuthentication = allowUnverifiedBuild
    ? { status: "not-authenticated", promotable: false }
    : { status: "authenticated-current-clean-build", ...requireCurrentBuild(root) };
  const oracles = independentOracles(root, points).cpython;
  const baseline = createSubprocessRunner(root, "baseline");
  const candidate = createSubprocessRunner(root, "candidate");
  try {
    for (let index = 0; index < warmups; index += 1) {
      for (const kind of ["vector", "slope"]) {
        await baseline.measure(kind, points);
        await candidate.measure(kind, points);
      }
    }
    const comparisons = {
      representativeVector: await pairedComparison({
        phase: "representative-vector-complete-public-pass-disabled-vs-selected",
        samples,
        baseline: () => baseline.measure("vector", points),
        candidate: () => candidate.measure("vector", points),
        expected: oracles.vector,
      }),
      heldoutSlope: await pairedComparison({
        phase: "heldout-slope-complete-public-pass-disabled-vs-selected",
        samples,
        baseline: () => baseline.measure("slope", points),
        candidate: () => candidate.measure("slope", points),
        expected: oracles.slope,
      }),
    };
    const completeSeparation = Object.values(comparisons).every(
      (comparison) => comparison.positivePairs === samples,
    );
    const promotable = Boolean(
      buildAuthentication.promotable && standard && completeSeparation,
    );
    const payload = {
      generatedAt: new Date().toISOString(),
      status: promotable
        ? "standard-current-build-compiler-evidence"
        : standard
          ? "standard-current-build-insufficient-separation"
        : "development-smoke-non-promotable",
      promotable,
      buildAuthentication,
      host: {
        platform: process.platform,
        architecture: process.arch,
        runtime: "node",
        runtimeVersion: process.version,
        engine: "v8",
        engineVersion: process.versions.v8,
      },
      intervention: {
        category: "compiler",
        passId: PASS,
        loweringId: LOWERING,
        sourceTransparent: true,
        sourceChanges: [],
      },
      productionRouteClaim: "compiler-selected-v8",
      protocol: {
        points,
        samples,
        warmups,
        order: "repeating AB,BA,BA,AB",
        baselineOptimizationLevel: "O2",
        candidateOptimizationLevel: "O2",
        baselineDisabledPasses: [PASS],
        candidateDisabledPasses: [],
        lazyModuleCompilation: "exact-current-source-with-precompiled-cache-disabled",
        nativeDisabled: true,
        completePublicCall: true,
      },
      oracles: {
        vector: oracles.vector,
        slope: oracles.slope,
      },
      comparisons,
      guardAudit: await candidate.guardAudit(),
      semanticBoundary: {
        selectedScope: "field_layers._arrow_segments fused outer loop",
        preflight: "all intrinsic, list-brand, descriptor, shape, strict-float, pivot, and capacity guards precede allocation and interrupt polling",
        fallback: "the original enumerate loop executes once over the original live-ins",
        publication: "two private lists replace the fresh source outputs only after complete success",
        interruption: "both represented source-loop backedges retain the compiler interrupt cadence when catchable",
      },
    };
    return validateReport(attachIdentity(SCHEMA, payload));
  } finally {
    await candidate.close();
    await baseline.close();
  }
}

function parseArguments(argv) {
  const options = { smoke: false, output: null };
  for (const argument of argv) {
    if (argument === "--smoke") options.smoke = true;
    else if (argument.startsWith("--output=")) options.output = argument.slice(9);
    else throw new Error(`unknown arrow compiler evidence argument ${argument}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const report = await runPromotionEvidence(options.smoke
    ? { points: 5, samples: 1, warmups: 1, allowUnverifiedBuild: true }
    : {});
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output);
  else process.stdout.write(output);
}

if (require.main === module) {
  const worker = process.argv.find((argument) => argument.startsWith("--worker="));
  const invocation = worker
    ? workerMain(worker.slice("--worker=".length))
    : main();
  invocation.catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { SCHEMA, runPromotionEvidence, validateReport };
