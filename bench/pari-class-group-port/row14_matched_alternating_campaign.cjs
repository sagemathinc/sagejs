"use strict";

// Authentic alternating timing coordinator for development-panel row 14.
//
// The mathematical workers own their clocks.  This coordinator performs CPU
// affinity checks, scheduling, exact-output admission, and receipt publication
// only outside those clocks.  Invoke it under `taskset -c CPU` and `prlimit`.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const host = require("./row14_matched_kernel_clock_host.cjs");
const pari = require("./row14_pari_prepared_timing_adapter.cjs");
const timing = require("./row14_sage_prepared_timing_adapter.cjs");

const SCHEMA =
  "sagejs.pari-class-group/row14-matched-alternating-campaign-v1";
const MINIMUM_PAIRS = 11;
const MINIMUM_ARM_NANOSECONDS = 1_000_000_000n;

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return sha256(JSON.stringify(canonical(value)));
}

function canonicalUnsigned(value, name, { positive = false } = {}) {
  assert.equal(typeof value, "string", `${name} must be a string`);
  assert.match(value, /^(0|[1-9][0-9]*)$/, `${name} must be canonical`);
  const integer = BigInt(value);
  if (positive) assert(integer > 0n, `${name} must be positive`);
  return integer;
}

function parseCpuList(source) {
  assert.equal(typeof source, "string");
  const result = new Set();
  for (const item of source.trim().split(",")) {
    assert.match(item, /^\d+(?:-\d+)?$/, `invalid CPU-list item ${item}`);
    const [firstText, lastText = firstText] = item.split("-");
    const first = Number(firstText), last = Number(lastText);
    assert(Number.isSafeInteger(first) && first >= 0 && last >= first,
      `invalid CPU-list range ${item}`);
    for (let cpu = first; cpu <= last; cpu++) result.add(cpu);
  }
  return [...result].sort((left, right) => left - right);
}

function requireExclusiveCpu(expectedText = process.env.SAGEJS_TIMING_CPU) {
  assert.match(expectedText || "", /^(0|[1-9][0-9]*)$/,
    "set SAGEJS_TIMING_CPU and launch this process under taskset -c CPU");
  const expected = Number(expectedText);
  const status = fs.readFileSync("/proc/self/status", "utf8");
  const match = status.match(/^Cpus_allowed_list:\s*(.+)$/m);
  assert(match, "Linux did not expose Cpus_allowed_list");
  const allowed = parseCpuList(match[1]);
  assert.deepEqual(allowed, [expected],
    `timing process is not exclusively pinned to CPU ${expected}`);
  return { cpu: String(expected), cpusAllowedList: match[1].trim() };
}

function alternatingOrder(pairIndex) {
  assert(Number.isSafeInteger(pairIndex) && pairIndex >= 0);
  return pairIndex % 2 === 0
    ? ["sagejs", "pari", "pari", "sagejs"]
    : ["pari", "sagejs", "sagejs", "pari"];
}

function sageProjection(result) {
  const flat = result.klass.generators.map(String);
  const ideals = Array.from({ length: 2 }, (_, ideal) =>
    Array.from({ length: 4 }, (_, row) =>
      flat.slice(16 * ideal + 4 * row, 16 * ideal + 4 * row + 4)));
  const packed = result.units.archimedeanUnits.map(String);
  return {
    schema: "sagejs.pari-class-group/row14-sage-semantic-projection-v1",
    field: { id: timing.FIELD_ID, polynomialAscending: timing.POLYNOMIAL },
    classGroup: {
      classNumber: String(result.klass.classNumber),
      invariantFactors: result.klass.invariants.map(String).reverse(),
      generatorIdealHnfs: ideals,
    },
    unitGroup: {
      rank: "2",
      regulatorInternalTriplet: result.units.regulator.map(String),
      logEmbeddingInternalTriplets: Array.from({ length: 6 }, (_, index) =>
        packed.slice(7 * index + 1, 7 * index + 4)),
      torsionOrder: "2",
      torsionGeneratorPowerBasis: ["-1", "0", "0", "0"],
      flagZeroStatus: "not_given(LARGE)",
    },
    work: {
      degree: "4", factorBaseSize: "799", classHnfColumns: "3",
      logEmbeddingRows: "3", logEmbeddingColumns: "2",
    },
    rng: {
      algorithm: "pari-xorshift1024star-2.17.4", seed: "1",
      terminalState: result.root.rng.map(String),
    },
    terminalStatus: "pari-correspondence-complete-internal",
  };
}

function median(values) {
  assert(values.length > 0);
  const sorted = values.map(BigInt).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

function validateArm(arm, minimumNanoseconds = MINIMUM_ARM_NANOSECONDS) {
  assert(arm && typeof arm === "object" && !Array.isArray(arm));
  assert.deepEqual(Object.keys(arm).sort(), [
    "exactOutputAdmission", "freshComputationOrdinal", "implementation",
    "kernelNanoseconds", "matchedProjectionSha256", "semanticRecordSha256",
  ].sort());
  assert(["sagejs", "pari"].includes(arm.implementation));
  const duration = canonicalUnsigned(arm.kernelNanoseconds,
    `${arm.implementation} kernel duration`, { positive: true });
  assert(duration >= minimumNanoseconds,
    `${arm.implementation} sample did not reach the minimum duration`);
  canonicalUnsigned(arm.freshComputationOrdinal, "fresh computation ordinal",
    { positive: true });
  assert.match(arm.matchedProjectionSha256, /^[0-9a-f]{64}$/);
  assert.match(arm.semanticRecordSha256, /^[0-9a-f]{64}$/);
  assert.equal(arm.exactOutputAdmission, true);
  return arm;
}

function summarizeArms(pairs) {
  const byImplementation = { sagejs: [], pari: [] };
  for (const pair of pairs) for (const arm of pair.arms) {
    byImplementation[arm.implementation].push(BigInt(arm.kernelNanoseconds));
  }
  const sageMedian = median(byImplementation.sagejs);
  const pariMedian = median(byImplementation.pari);
  return {
    samplesPerImplementation: String(byImplementation.sagejs.length),
    sageMedianNanoseconds: String(sageMedian),
    pariMedianNanoseconds: String(pariMedian),
    medianRatioNumerator: String(sageMedian),
    medianRatioDenominator: String(pariMedian),
    medianRatioDecimal: (Number(sageMedian) / Number(pariMedian)).toFixed(6),
  };
}

function validateReceipt(receipt) {
  assert.equal(receipt.schema, SCHEMA);
  assert(Number.isSafeInteger(receipt.pairCount) &&
    receipt.pairCount >= MINIMUM_PAIRS);
  assert.equal(receipt.schedule, "ABBA/BAAB");
  assert.equal(receipt.pairs.length, receipt.pairCount);
  assert.deepEqual(parseCpuList(receipt.authority.cpusAllowedList),
    [Number(receipt.authority.cpu)]);
  let expectedOrdinal = 1n;
  let projectionHash = null;
  for (const [pairIndex, pair] of receipt.pairs.entries()) {
    assert.equal(pair.pairIndex, pairIndex);
    assert.deepEqual(pair.order, alternatingOrder(pairIndex));
    assert.equal(pair.arms.length, 4);
    for (const [position, arm] of pair.arms.entries()) {
      validateArm(arm);
      assert.equal(arm.implementation, pair.order[position]);
      assert.equal(BigInt(arm.freshComputationOrdinal), expectedOrdinal++);
      projectionHash ??= arm.matchedProjectionSha256;
      assert.equal(arm.matchedProjectionSha256, projectionHash,
        "an arm did not return the matched result");
    }
  }
  assert.equal(receipt.matchedProjectionSha256, projectionHash);
  assert.deepEqual(receipt.summary, summarizeArms(receipt.pairs));
  assert.equal(receipt.row14BoundaryQualified, true);
  assert.equal(receipt.fullPanelQualified, false);
  return receipt;
}

function gitIdentity() {
  const cwd = path.resolve(__dirname, "../..");
  const run = args => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout.trim();
  };
  const status = run(["status", "--porcelain", "--untracked-files=no"]);
  assert.equal(status, "", "timing authority must use a clean tracked tree");
  return { commit: run(["rev-parse", "HEAD"]), trackedTreeClean: true };
}

async function runCampaign({ pairCount = MINIMUM_PAIRS,
  minimumArmNanoseconds = MINIMUM_ARM_NANOSECONDS } = {}) {
  assert.equal(pairCount, MINIMUM_PAIRS,
    "the frozen row-14 campaign requires exactly 11 pairs");
  assert.equal(minimumArmNanoseconds, MINIMUM_ARM_NANOSECONDS,
    "the frozen sample-duration threshold is one second");
  assert.equal(typeof global.gc, "function", "launch Node with --expose-gc");
  const affinity = requireExclusiveCpu();
  const git = gitIdentity();
  const authenticated = timing.authenticatePrepared();
  const resident = await host.prepareResident(authenticated.prepared);
  assert(resident.gateKernels && Object.isFrozen(resident.gateKernels),
    "resident Gate C must expose precompiled frozen handles");
  assert.deepEqual(Object.keys(resident.gateKernels).sort(),
    ["collector", "hnfadd", "hnfspec", "next", "profile"],
    "resident Gate C handle set is incomplete");
  assert.equal(resident.gateKernels.profile, false,
    "matched timing must use non-profiled precompiled Gate-C handles");
  const client = new pari.HelperClient(pari.buildHelper());
  const ready = await client.ready();
  const pairs = [];
  const pendingSage = [];
  let referencePari = null;
  let referenceProjectionHash = null;
  let referencePariSemanticHash = null;
  let ordinal = 0n;
  let previousSageRoot = null;

  async function execute(implementation) {
    global.gc();
    ordinal++;
    if (implementation === "pari") {
      const sample = await client.run("1");
      const projection = timing.commonProjectionFromPari(sample);
      const projectionHash = digest(projection);
      const semanticHash = digest(pari.semanticRecord(sample));
      referencePari ??= sample;
      referenceProjectionHash ??= projectionHash;
      referencePariSemanticHash ??= semanticHash;
      assert.equal(projectionHash, referenceProjectionHash);
      assert.equal(semanticHash, referencePariSemanticHash,
        "PARI semantic output changed across fresh computations");
      while (pendingSage.length) timing.compareWithPari(pendingSage.shift(), sample);
      const arm = {
        implementation, kernelNanoseconds: sample.kernelNanoseconds,
        freshComputationOrdinal: String(ordinal), exactOutputAdmission: true,
        matchedProjectionSha256: projectionHash,
        semanticRecordSha256: semanticHash,
      };
      return validateArm(arm, minimumArmNanoseconds);
    }

    const result = await host.runResident(resident);
    assert.equal(result.executionBoundary.compilationInsideRun, false,
      "Sage.js compiled a Gate-C graph inside the timed run");
    assert.equal(result.executionBoundary.residentHandleCount, 4,
      "Sage.js did not use the complete resident Gate-C handle set");
    assert.deepEqual(result.executionBoundary.residentHandleCacheKeys, [
      resident.gateKernels.collector.built.cacheKey,
      resident.gateKernels.hnfspec.built.cacheKey,
      resident.gateKernels.next.built.cacheKey,
      resident.gateKernels.hnfadd.built.cacheKey,
    ], "Sage.js timed run changed Gate-C native authorities");
    const stageDurations = Object.values(result.stageNanoseconds).map(BigInt);
    assert(stageDurations.length >= 7 && stageDurations.every(value => value > 0n),
      "Sage.js did not execute every resident mathematical stage afresh");
    assert.equal(stageDurations.reduce((sum, value) => sum + value, 0n),
      BigInt(result.kernelNanoseconds),
      "Sage.js fresh-stage clocks do not cover its complete kernel clock");
    assert.notEqual(result.root, previousSageRoot,
      "Sage.js reused a prior result instead of performing fresh computation");
    previousSageRoot = result.root;
    const sage = sageProjection(result);
    if (referencePari) timing.compareWithPari(sage, referencePari);
    else pendingSage.push(sage);
    const projection = timing.commonProjectionFromSage(sage);
    const projectionHash = digest(projection);
    referenceProjectionHash ??= projectionHash;
    assert.equal(projectionHash, referenceProjectionHash);
    const arm = {
      implementation, kernelNanoseconds: result.kernelNanoseconds,
      freshComputationOrdinal: String(ordinal), exactOutputAdmission: true,
      matchedProjectionSha256: projectionHash,
      semanticRecordSha256: digest(sage),
    };
    return validateArm(arm, minimumArmNanoseconds);
  }

  try {
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
      const order = alternatingOrder(pairIndex), arms = [];
      for (const implementation of order) arms.push(await execute(implementation));
      pairs.push({ pairIndex, order, arms });
    }
  } finally {
    await client.close();
  }
  assert(referencePari, "campaign did not execute PARI");
  assert.equal(pendingSage.length, 0, "Sage.js output was not admitted by PARI");
  const receipt = {
    schema: SCHEMA, pairCount, schedule: "ABBA/BAAB",
    authority: {
      platform: process.platform, architecture: process.arch,
      hostname: os.hostname(), cpu: affinity.cpu,
      cpusAllowedList: affinity.cpusAllowedList,
      node: process.version, git,
      pariToolchainSha256: pari.buildHelper().provenance.toolchainSha256,
      preparedAuthoritySha256: authenticated.prepared.authoritySha256,
      gateResidentHandleCacheKeys: [
        resident.gateKernels.collector.built.cacheKey,
        resident.gateKernels.hnfspec.built.cacheKey,
        resident.gateKernels.next.built.cacheKey,
        resident.gateKernels.hnfadd.built.cacheKey,
      ],
      pariPreparationNanoseconds: ready.preparationNanoseconds,
    },
    boundary: {
      input: "authenticated prepared nfinit state",
      output: "flag-zero class generators, unit logs, regulator, torsion, work shape and terminal RNG",
      preparationInsideClock: false, compilationInsideClock: false,
      filesystemInsideClock: false, hashingInsideClock: false,
      replayInsideClock: false, serializationInsideClock: false,
      eachArmFresh: true,
    },
    minimumArmNanoseconds: String(minimumArmNanoseconds),
    matchedProjectionSha256: referenceProjectionHash,
    pairs, summary: summarizeArms(pairs),
    row14BoundaryQualified: true,
    fullPanelQualified: false,
    qualificationScope:
      "one frozen row-14 prepared-field boundary; not the frozen 24-field panel",
  };
  return validateReceipt(receipt);
}

module.exports = {
  MINIMUM_ARM_NANOSECONDS, MINIMUM_PAIRS, SCHEMA, alternatingOrder, digest,
  parseCpuList, requireExclusiveCpu, runCampaign, sageProjection,
  summarizeArms, validateArm, validateReceipt,
};
