#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PHASE0 =
  "/scratch/sagejs-runtime/pari-class-group-phase0-44807189a/qualification-manifest.json";
const DEFAULT_AGGREGATE =
  "/scratch/fresh-prepared-development-aggregate-v1-20260918.json";
const PHASE0_SHA256 =
  "8e0c44d0c480fe8580025f7e337b72fa7023d03a7dbb60f0ddf3aa7cf5a91a27";
const AGGREGATE_FILE_SHA256 =
  "7c8b9ca9cf8db44a7a1860c0a702c3d6bceb73af2578a85b665d848f2604471e";
const AGGREGATE_CANONICAL_SHA256 =
  "8eb14e33dff10ea7c9e99e7c619d8b4cc43dc2cbf18c7bda1f10fe1523be041c";

const TRACKED_EVIDENCE = [
  "agents/pari-class-group-end-to-end-native-plan.md",
  "agents/pari-class-group-e2e-resource-ledger.md",
  "agents/pari-class-group-current-freeze-audit.md",
  "agents/fresh-prepared-16-row-aggregate-gate-audit.md",
  "agents/pari-class-group-phase6-qualification-readiness-audit-2026-09-18.md",
  "bench/pari-class-group-port/arena-reuse-allocation-counts-20260915.json",
  "bench/pari-class-group-port/high_precision_packed_probe_result.json",
  "bench/pari-class-group-port/stage_g1_direct_result_evidence.json",
  "bench/pari-class-group-port/stage_g2_direct_result_evidence.json",
  "bench/pari-class-group-port/stage_h_guarded_direct_result.json",
];

const FOCUSED_SIZE_EVIDENCE = TRACKED_EVIDENCE.filter((name) =>
  name.endsWith(".json"),
);
const SIZE_KEYS = new Set([
  "coreBytes",
  "privateCoreBytes",
  "generatedCoreBytes",
  "adapterBytes",
  "objectBytes",
  "objectTextBytes",
  "addonBytes",
  "elfTextBytes",
  "linkedAddonBytes",
  "linkedElfTextBytes",
  "ownerBytes",
  "resetSnapshotBytes",
  "arenaBytes",
  "buildMilliseconds",
  "setupMilliseconds",
]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function trackedBytes(commit, name) {
  return execFileSync("git", ["show", `${commit}:${name}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const out = { phase0: DEFAULT_PHASE0, aggregate: DEFAULT_AGGREGATE };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    assert.ok(flag === "--phase0-manifest" || flag === "--aggregate", `unknown argument ${flag}`);
    assert.ok(i + 1 < argv.length, `missing value for ${flag}`);
    out[flag === "--phase0-manifest" ? "phase0" : "aggregate"] = argv[++i];
  }
  return out;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function groupArtifacts(entries) {
  const groups = new Map();
  for (const entry of entries) {
    assert.equal(typeof entry.bytes, "number");
    const extension = path.extname(entry.path).slice(1) || "none";
    const group = groups.get(extension) || { extension, count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += entry.bytes;
    groups.set(extension, group);
  }
  return [...groups.values()].sort((a, b) => a.extension.localeCompare(b.extension));
}

function extractMetricObjects(value, jsonPath = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => extractMetricObjects(item, `${jsonPath}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const metrics = {};
  for (const key of SIZE_KEYS) {
    if (typeof value[key] === "number") metrics[key] = value[key];
  }
  if (Object.keys(metrics).length) {
    const identities = {};
    for (const key of [
      "backend",
      "coreSha256",
      "objectSha256",
      "addonSha256",
      "sourceSha256",
      "qualifiedTiming",
    ]) {
      if (value[key] !== undefined) identities[key] = value[key];
    }
    found.push({ jsonPath, ...identities, metrics });
  }
  for (const [key, item] of Object.entries(value)) {
    extractMetricObjects(item, `${jsonPath}.${key}`, found);
  }
  return found;
}

function absenceStatus(name, evidence) {
  return { status: "unknown", reason: name, evidence };
}

function collect(options = {}) {
  const phase0Path = options.phase0 || DEFAULT_PHASE0;
  const aggregatePath = options.aggregate || DEFAULT_AGGREGATE;
  const commit = git("rev-parse", "HEAD^{commit}");
  const tree = git("rev-parse", "HEAD^{tree}");

  const tracked = {};
  const trackedData = {};
  for (const name of TRACKED_EVIDENCE) {
    const bytes = trackedBytes(commit, name);
    tracked[name] = { bytes: bytes.length, sha256: sha256(bytes) };
    trackedData[name] = bytes;
  }
  const plan = trackedData[TRACKED_EVIDENCE[0]].toString("utf8");
  for (const text of [
    "224 aggregate active-agent hours",
    "240 aggregate local build/validation CPU-hours",
    "48 controlled timing-host CPU-hours",
    "24 CPU-hours on a high-memory stress host",
    "one project-scoped `/scratch` directory capped at 100 GiB",
    "at most 512 MiB of committed/archived evidence",
  ]) {
    assert.ok(plan.includes(text), `plan budget text missing: ${text}`);
  }

  const phase0Bytes = fs.readFileSync(phase0Path);
  assert.equal(sha256(phase0Bytes), PHASE0_SHA256, "Phase-0 manifest identity changed");
  const phase0 = JSON.parse(phase0Bytes);
  assert.equal(phase0.schema, "sagejs.pari-class-group/phase0-single-commit-qualification-v1");
  assert.equal(phase0.qualification.commit, "44807189a4eb8f8c58d9f46519ab9e60dde21a99");
  assert.equal(phase0.qualification.tree, "19625ced91963a784813f98917cd5a3d41d872f1");
  assert.equal(phase0.stages.length, 25);
  assert.equal(phase0.build.authorizedStressTier.result, "pass");
  assert.equal(phase0.resourceLedger.sha256,
    "18c0af1ccdb5a713478e85f60061cb2f543e90a9598e4b34744f3843894be519");

  const aggregateBytes = fs.readFileSync(aggregatePath);
  assert.equal(sha256(aggregateBytes), AGGREGATE_FILE_SHA256, "aggregate receipt identity changed");
  const aggregate = JSON.parse(aggregateBytes);
  const { aggregateSha256, ...aggregateBody } = aggregate;
  assert.equal(sha256(Buffer.from(canonical(aggregateBody))), AGGREGATE_CANONICAL_SHA256);
  assert.equal(aggregateSha256, AGGREGATE_CANONICAL_SHA256);
  assert.equal(aggregate.count, 16);
  assert.deepEqual(aggregate.rows.map((row) => row.panelIndex),
    [0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23]);
  assert.equal(aggregate.correspondenceComplete, true);
  assert.equal(aggregate.qualifiedTiming, false);
  const resourceKeys = new Set([
    "elapsedMilliseconds", "cpuMilliseconds", "peakRssKiB", "ownerBytes",
    "generatedSourceBytes", "objectBytes", "compileMilliseconds",
  ]);
  for (const row of aggregate.rows) {
    for (const key of Object.keys(row)) {
      assert.ok(!resourceKeys.has(key), `aggregate row unexpectedly carries ${key}`);
    }
  }

  const stageWallMilliseconds = phase0.stages.map((stage) => stage.runnerElapsedMilliseconds);
  const stageRssKib = phase0.stages.map((stage) => Number(stage.peakPrimaryProcessGroupRssKib));
  const nativeKernelObjects = phase0.build.nativeKernelObjects;
  const outputBindings = phase0.build.authorizedStressTier.receipt.outputBindings.filter(
    (entry) => entry.kind === "file",
  );
  const phase0Cores = phase0.stages
    .filter((stage) => typeof stage.ownerAndResultSummary?.coreBytes === "number")
    .map((stage) => ({ stage: stage.stage, coreBytes: stage.ownerAndResultSummary.coreBytes }));

  const focusedArtifacts = FOCUSED_SIZE_EVIDENCE.map((name) => {
    const parsed = JSON.parse(trackedData[name].toString("utf8"));
    return {
      path: name,
      sha256: tracked[name].sha256,
      observations: extractMetricObjects(parsed),
    };
  });
  const arena = JSON.parse(
    trackedData["bench/pari-class-group-port/arena-reuse-allocation-counts-20260915.json"],
  ).probeReport;
  const packed = JSON.parse(
    trackedData["bench/pari-class-group-port/high_precision_packed_probe_result.json"],
  );
  const packedBuilds = packed.results
    .map((result, index) => ({
      resultIndex: index,
      backend: result.backend,
      buildMilliseconds: result.buildMilliseconds ?? null,
      coreBytes: result.coreBytes,
      addonBytes: result.addonBytes,
    }))
    .filter((entry) => entry.buildMilliseconds !== null);

  const body = {
    schema: "sagejs.pari-class-group/phase6-resource-ledger-v1",
    scope: {
      classification: "development evidence; not final qualification",
      candidateCommit: commit,
      candidateTree: tree,
      aggregateRows: aggregate.rows.map((row) => row.panelIndex),
      qualificationRowsRequired: 24,
      aggregateQualifiedTiming: aggregate.qualifiedTiming,
    },
    evidence: {
      trackedAtCandidateCommit: tracked,
      phase0Manifest: { path: phase0Path, bytes: phase0Bytes.length, sha256: PHASE0_SHA256 },
      freshPreparedAggregate: {
        path: aggregatePath,
        bytes: aggregateBytes.length,
        fileSha256: AGGREGATE_FILE_SHA256,
        canonicalSha256: AGGREGATE_CANONICAL_SHA256,
      },
    },
    budgets: {
      activeAgentHours: {
        ceiling: 224,
        consumed: absenceStatus(
          "no authoritative cumulative active-agent-hour log exists",
          "agents/pari-class-group-e2e-resource-ledger.md",
        ),
      },
      localBuildValidationCpuHours: {
        ceiling: 240,
        consumed: absenceStatus(
          "elapsed build/stage times are not aggregate CPU accounting",
          "Phase-0 manifest plus historical resource ledger",
        ),
      },
      controlledTimingHostCpuHours: {
        ceiling: 48,
        consumed: absenceStatus(
          "no qualified timing-host CPU ledger exists",
          "agents/pari-class-group-phase6-qualification-readiness-audit-2026-09-18.md",
        ),
      },
      optionalHighMemoryCpuHours: {
        ceiling: 24,
        consumed: absenceStatus(
          "no authoritative high-memory-host accounting exists",
          "agents/pari-class-group-e2e-resource-ledger.md",
        ),
      },
      projectScratchGiB: { ceiling: 100, historicalHighWater: { status: "unknown" } },
      committedArchivedEvidenceMiB: { ceiling: 512, consumed: { status: "unknown" } },
    },
    phase0HistoricalMeteredBuild: {
      commit: phase0.qualification.commit,
      normalAttempt: phase0.build.normalTierAttempt,
      successfulAttempt: {
        result: phase0.build.authorizedStressTier.result,
        limitSeconds: phase0.build.authorizedStressTier.limitSeconds,
        runnerWallSeconds: phase0.build.authorizedStressTier.wallSeconds,
        buildReceiptDurationMilliseconds:
          phase0.build.authorizedStressTier.receipt.durationMilliseconds,
        cpuTime: { status: "unknown" },
        peakRss: { status: "unknown" },
      },
      outputBindings: {
        count: outputBindings.length,
        bytes: sum(outputBindings.map((entry) => entry.bytes)),
        byExtension: groupArtifacts(outputBindings),
      },
      nativeKernelObjects: {
        count: nativeKernelObjects.length,
        bytes: sum(nativeKernelObjects.map((entry) => entry.bytes)),
        byExtension: groupArtifacts(nativeKernelObjects),
        caveat: "Manifest naming retained: .cjs/.json/.node outputs are not generated C source or relocatable object files.",
      },
      generatedCoreCByStage: {
        observations: phase0Cores,
        sumBytesNotUnique: sum(phase0Cores.map((entry) => entry.coreBytes)),
        caveat: "Stage core sizes are observations, not a unique-artifact inventory; summing may double-count identical generated sources.",
      },
    },
    phase0HistoricalRuntime: {
      stages: phase0.stages.length,
      serialRunnerWallMilliseconds: sum(stageWallMilliseconds),
      sampledPeakPrimaryProcessGroupRssKib: Math.max(...stageRssKib),
      rssScope: phase0.resourceLedger.rssCaveat,
      cpuTime: { status: "unknown" },
      compilerOwnerLogicalLiveHighWaterBytes: { status: "unknown" },
      wholeDescendantProcessPeakRssKib: { status: "unknown" },
    },
    focusedHistoricalArtifactObservations: focusedArtifacts,
    focusedHistoricalBuildTimes: {
      highPrecisionPackedResults: packedBuilds,
      arenaProbeSetupMilliseconds: arena.setupMilliseconds,
      arenaSetupClassification:
        "setup time only; it excludes timed execution but is not identified as compiler-only build time",
    },
    ownerAndProcessMemorySeparation: {
      compilerOwnerLogicalCapacityEvidence: {
        bytes: arena.ownerBytes,
        resetSnapshotBytes: arena.resetSnapshotBytes,
        arenaBytes: arena.arenaBytes,
        source:
          "bench/pari-class-group-port/arena-reuse-allocation-counts-20260915.json $.probeReport",
        classification:
          "diagnostic logical/capacity accounting; not a measured live high-water and not RSS",
      },
      processRssEvidence: {
        peakKib: Math.max(...stageRssKib),
        source: "Phase-0 25-stage sampled primary-process-group maximum",
        classification:
          "historical one-second sample; not whole-descendant peak RSS and not current-candidate RSS",
      },
      matchedPariPeakRssKib: { status: "unknown" },
      practicalSentinelRssTargetKib: {
        status: "unknown",
        formula: "max(512 MiB, 5 * matched PARI peak RSS)",
      },
      hardAddressSpaceCapBytes: 4294967296,
    },
    currentSixteenRowAggregate: {
      fileSha256: AGGREGATE_FILE_SHA256,
      canonicalSha256: aggregate.aggregateSha256,
      rows: aggregate.rows.length,
      correspondenceComplete: aggregate.correspondenceComplete,
      publicComplete: aggregate.publicComplete,
      qualifiedTiming: aggregate.qualifiedTiming,
      resourceTelemetry: {
        status: "absent-by-contract",
        metrics: [
          "wall/cpu time", "process RSS", "compiler-owner live bytes",
          "generated source/object size", "compile time", "allocation/copy counts",
        ],
      },
    },
    currentCandidateUnknowns: [
      "clean current-candidate build wall and CPU time",
      "clean current-candidate build descendant peak RSS",
      "current generated C/text/object/module unique-artifact inventory",
      "current compiler-owner logical/live high-water bytes",
      "current whole-process and descendant-tree peak RSS",
      "current allocation, copy, physical-capacity, and arena high-water counters",
      "matched PARI peak RSS and derived practical sentinel target",
      "aggregate active-agent, local CPU, timing-host CPU, and stress-host CPU consumption",
      "historical scratch and committed-evidence high-water totals",
    ],
    finalQualificationMustAdd: [
      "one clean candidate commit/tree and toolchain-bound build receipt",
      "generated-source, relocatable-object, text, and linked-module hashes and byte sizes",
      "build wall time, CPU time, and descendant peak RSS",
      "24-field resource telemetry under the normal 600-second/4-GiB/no-swap envelope",
      "compiler-owner logical/live high-water separately from whole-process peak RSS",
      "owner/allocation/copy counts, logical/physical capacities, arena high-water, precision/retry/work counters",
      "matched PARI peak RSS and the max(512 MiB, 5x PARI RSS) sentinel evaluation",
      "quiet pinned-core qualified raw pairs and timing-host CPU accounting",
      "complete archived-evidence and project-scratch inventory against their caps",
    ],
  };
  return { ...body, ledgerSha256: sha256(Buffer.from(canonical(body))) };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(collect(parseArgs(process.argv.slice(2)), null, 2))}\n`);
}

module.exports = { collect, canonical, sha256, parseArgs };
