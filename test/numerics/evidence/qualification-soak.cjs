// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PROFILES,
  THRESHOLDS,
  analyseSession,
  buildEvidence,
  parseArguments,
  theilSenSlope,
  validateSession,
} = require("../../../scripts/numerical-computing/qualification/run-soak.cjs");
const {
  verifyEvidence,
  verifyMatrixSoakArtifactCoherence,
} = require("../../../scripts/numerical-computing/qualification/supplemental-report.cjs");
const {
  expectedSoakEvidence,
} = require("../../../scripts/numerical-computing/qualification/assemble-release-gate.cjs");
const {
  contentId,
  digestPath,
  sha256,
} = require("../../../scripts/numerical-computing/common.cjs");
const {
  memoryIsStable,
} = require("../../../bench/numerical-computing/qualification/soak/session.cjs");

const root = path.resolve(__dirname, "../../..");

function sampleSession(profile = PROFILES.development, overrides = {}) {
  const operationsPerBlock = profile.cycles_per_block * 7;
  const blocks = Math.ceil(profile.minimum_session_operations / operationsPerBlock);
  const operations = blocks * operationsPerBlock;
  return {
    status: "passed",
    elapsed_ms: Math.max(profile.minimum_session_elapsed_ms, 1),
    blocks,
    cycles: blocks * profile.cycles_per_block,
    operations,
    failures: 0,
    maximum_error: 1e-10,
    recovery: {
      budget_status: "maximum_evaluations",
      budget_evaluations: 1,
      cancelled_status: "cancelled",
      cancelled_evaluations: 0,
      callback_status: "callback_error",
      callback_evaluations: 1,
      recovered: true,
      recovery_residual: 4e-16,
    },
    memory_samples: Array.from({ length: blocks + 1 }, (_, index) => ({
      block: index,
      operations: index * operationsPerBlock,
      heap_used_bytes: 20_000_000 + Math.round(300_000 * index / blocks),
      rss_bytes: 80_000_000 + Math.round(400_000 * index / blocks),
      external_bytes: 2_000_000,
      array_buffers_bytes: 100_000,
    })),
    ...overrides,
  };
}

test("soak CLI defaults to the bounded release profile", () => {
  const parsed = parseArguments([
    "--candidate", "a".repeat(40),
    "--artifact", "dist",
    "--output", "build/soak.json",
  ]);
  assert.equal(parsed.profile, "release");
  assert.equal(parsed.requireClean, true);
  assert.throws(
    () => parseArguments(["--candidate", "x", "--artifact", "dist", "--output", "x", "--profile", "forever"]),
    /unsupported --profile/,
  );
  assert.throws(
    () => parseArguments([
      "--candidate", "x", "--artifact", "dist", "--output", "x",
      "--profile", "release", "--profile", "release",
    ]),
    /may appear only once/,
  );
});

test("the bounded 64-cycle corpus check is not mislabeled long-duration", () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(
    root, "bench/numerical-computing/qualification/product.corpus.json",
  ), "utf8"));
  const repeated = corpus.cases.find((item) => item.id === "p8-cross-domain-repeated-stability");
  assert.equal(repeated.campaign.kind, "fixed");
  assert.equal(repeated.campaign.trials, 64);
});

test("four platform soak artifacts must equal the corresponding Node row", () => {
  const platforms = ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"];
  const artifact = (platform) => ({
    name: "sagejs-dist",
    path: "dist",
    sha256: platform.padEnd(64, "a").slice(0, 64),
    content_sha256: platform.padEnd(64, "b").slice(0, 64),
    bytes: 100,
    files: 2,
  });
  const evidence = platforms.map((platform) => ({ value: {
    schema: "sagejs.numerical-soak-evidence/v1",
    platform: { id: platform },
    artifact: { ...artifact(platform), name: undefined },
  } }));
  const receipts = platforms.map((platform) => ({ value: {
    platform: { id: platform },
    runtime: { subject: { kind: "node" } },
    artifacts: [artifact(platform)],
  } }));
  assert.equal(verifyMatrixSoakArtifactCoherence(evidence, receipts), true);
  evidence[0].value.artifact.content_sha256 = "f".repeat(64);
  assert.throws(
    () => verifyMatrixSoakArtifactCoherence(evidence, receipts),
    /different dist/,
  );
});

test("supplemental verifier accepts only the exact release soak contract", () => {
  const candidate = "a".repeat(40);
  const session = sampleSession(PROFILES.release, {
    elapsed_ms: 15_000,
    operations: 448,
  });
  const executable = fs.realpathSync(process.execPath);
  const executableBytes = fs.readFileSync(executable);
  const core = {
    schema: "sagejs.numerical-soak-evidence/v1",
    generated_at: "2026-09-02T00:00:00.000Z",
    status: "passed",
    repository: { commit: candidate, clean: true },
    platform: { id: "linux-x64" },
    collector: digestPath(root, "scripts/numerical-computing/qualification/run-soak.cjs"),
    harness: digestPath(root, "bench/numerical-computing/qualification/soak/session.cjs"),
    tool: {
      path: executable,
      version: process.version,
      sha256: sha256(executableBytes),
      bytes: executableBytes.length,
    },
    artifact: {
      path: "dist",
      sha256: "b".repeat(64),
      content_sha256: "c".repeat(64),
      bytes: 100,
      files: 2,
    },
    profile: "release",
    configuration: PROFILES.release,
    thresholds: THRESHOLDS,
    totals: {
      sessions: 12,
      elapsed_ms: 180_000,
      operations: 5_376,
      failures: 0,
      maximum_error: session.maximum_error,
      parent_heap_slope_bytes_per_session: 0,
      parent_heap_growth_bytes: 0,
    },
    parent_memory_samples: Array.from({ length: 13 }, (_, index) => ({
      session: index,
      heap_used_bytes: 20_000_000,
    })),
    sessions: Array.from({ length: 12 }, (_, index) => ({
      session: index,
      elapsed_ms: session.elapsed_ms,
      blocks: session.blocks,
      cycles: session.cycles,
      operations: session.operations,
      failures: session.failures,
      maximum_error: session.maximum_error,
      recovery: session.recovery,
      memory_samples: session.memory_samples,
      memory: analyseSession(session),
    })),
    scope: {
      claim: "source-bound-repeated-fresh-process-numerical-soak",
      representative_domains: [
        "root", "integration", "linear-solve", "scalar-optimization",
        "explicit-ode", "fft", "descriptive-statistics",
      ],
      fresh_process_per_session: true,
      cancellation_and_recovery_per_session: true,
      garbage_collected_memory_samples: true,
      routine_ci: false,
      bounded: true,
    },
  };
  const evidence = { ...core, id: contentId(core) };
  assert.deepEqual(verifyEvidence(evidence, candidate).claims, [{
    requirement: "four-platform-numerical-soak",
    tokens: ["linux-x64"],
  }]);
  const weakened = structuredClone(evidence);
  weakened.configuration.minimum_total_elapsed_ms = 1;
  delete weakened.id;
  weakened.id = contentId(weakened);
  assert.throws(() => verifyEvidence(weakened, candidate), /release campaign envelope/);
});

test("release assembly requires one soak file per supported platform", (context) => {
  const directory = path.join(root, "build", `soak-layout-${process.pid}`);
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const platform of ["linux-x64", "linux-arm64", "macos-arm64", "windows-x64"]) {
    const platformDirectory = path.join(directory, "platform", platform);
    fs.mkdirSync(platformDirectory, { recursive: true });
    fs.writeFileSync(path.join(platformDirectory, `${platform}-soak.evidence.json`), "{}\n");
  }
  const relative = path.relative(root, directory).split(path.sep).join("/");
  assert.equal(expectedSoakEvidence(relative).length, 4);
  fs.unlinkSync(path.join(directory, "platform", "windows-x64", "windows-x64-soak.evidence.json"));
  assert.throws(() => expectedSoakEvidence(relative), /missing:.*windows-x64/);
});

test("Theil-Sen memory slopes are robust and use the bounded stable tail", () => {
  assert.equal(theilSenSlope([
    { x: 0, y: 5 }, { x: 1, y: 7 }, { x: 2, y: 9 }, { x: 3, y: 200 },
  ], "x", "y"), 33.5);
  const analysis = analyseSession(sampleSession());
  assert.ok(analysis.heap_slope_bytes_per_operation > 0);
  assert.ok(analysis.rss_slope_bytes_per_operation > 0);
  assert.equal(analysis.heap_growth_bytes, 300_000);
  assert.equal(analysis.peak_rss_bytes, 80_400_000);
});

test("a child session cannot stop before its bounded memory tail settles", () => {
  const options = {
    memorySlopeWindowSamples: 6,
    maximumHeapSlopeBytesPerOperation: 32 * 1024,
    maximumRssSlopeBytesPerOperation: 64 * 1024,
  };
  const growing = sampleSession().memory_samples.map((sample, index) => ({
    ...sample,
    rss_bytes: 80_000_000 + index * 10_000_000,
  }));
  assert.equal(memoryIsStable(growing, options), false);
  const settled = [
    ...growing,
    { block: 6, operations: 240, heap_used_bytes: 20_310_000, rss_bytes: 130_100_000 },
    { block: 7, operations: 280, heap_used_bytes: 20_315_000, rss_bytes: 130_050_000 },
    { block: 8, operations: 320, heap_used_bytes: 20_320_000, rss_bytes: 130_125_000 },
    { block: 9, operations: 360, heap_used_bytes: 20_325_000, rss_bytes: 130_075_000 },
    { block: 10, operations: 400, heap_used_bytes: 20_330_000, rss_bytes: 130_150_000 },
    { block: 11, operations: 440, heap_used_bytes: 20_335_000, rss_bytes: 130_100_000 },
  ];
  assert.equal(memoryIsStable(settled, options), true);
});

test("session contract fails closed on correctness, recovery, and memory growth", () => {
  assert.doesNotThrow(() => validateSession(sampleSession(), PROFILES.development, THRESHOLDS));
  assert.throws(
    () => validateSession(sampleSession(PROFILES.development, { failures: 1 }), PROFILES.development, THRESHOLDS),
    /public numerical operation failed/,
  );
  assert.throws(
    () => validateSession(sampleSession(PROFILES.development, {
      recovery: { ...sampleSession().recovery, recovered: false },
    }), PROFILES.development, THRESHOLDS),
    /did not recover/,
  );
  const leaking = sampleSession();
  leaking.memory_samples.at(-1).heap_used_bytes = 200_000_000;
  assert.throws(
    () => validateSession(leaking, PROFILES.development, THRESHOLDS),
    /heap (slope|growth)/,
  );
});

test("development campaign records fresh sessions and exact source bindings", () => {
  const artifact = path.join(root, "build", "qualification-soak-fixture");
  fs.mkdirSync(artifact, { recursive: true });
  fs.writeFileSync(path.join(artifact, "fixture.txt"), "source-bound fixture\n");
  const { execFileSync } = require("node:child_process");
  const candidate = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  let calls = 0;
  const evidence = buildEvidence({
    candidate,
    artifact: path.relative(root, artifact),
    output: "unused",
    profile: "development",
    requireClean: false,
  }, {
    runSession(_artifact, profile) {
      calls += 1;
      return sampleSession(profile);
    },
  });
  assert.equal(calls, PROFILES.development.sessions);
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.totals.sessions, PROFILES.development.sessions);
  assert.equal(evidence.scope.fresh_process_per_session, true);
  assert.equal(evidence.scope.routine_ci, false);
  assert.match(evidence.artifact.content_sha256, /^[0-9a-f]{64}$/);
});
