// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  materializePlan,
  planStages,
  plans,
} = require("../scripts/run-test-plan.cjs");
const {
  refreshBuildReceiptAfterNative,
  inspectSourceBuildReceipt,
  validateBuildReceipt,
  workspaceFingerprint,
  artifactInputsFingerprint,
  outputBindings,
  outputWitnesses,
} = require("../scripts/build-receipt.cjs");
const {
  estimateRemaining,
  longestFirst,
  formatDuration,
  parseRunnerOptions,
  partition,
  queueEtaMilliseconds,
  rememberTiming,
  runFileQueue,
  scheduledEtaMilliseconds,
} = require("../scripts/run-test-tier.cjs");
const {
  buildJobs,
  nativeKernelJobs,
  runBufferedCommand,
} = require("../scripts/build-parallelism.cjs");
const packageScripts = require("../package.json").scripts;
const {
  buildLazyNumericalReactors,
} = require("../scripts/build.cjs");

test("test durations are rendered for humans", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(65_000), "1m 05s");
  assert.equal(formatDuration(3_720_000), "1h 02m");
});

test("test files are divided into stable fail-fast batches", () => {
  assert.deepEqual(partition([1, 2, 3, 4, 5], 2), [
    [1, 2],
    [3, 4],
    [5],
  ]);
  assert.equal(
    estimateRemaining({
      elapsed: 4_000,
      completed: 2,
      total: 6,
      historical: 30_000,
    }),
    8_000,
  );
});

test("runner UX options are not forwarded to node:test", () => {
  assert.deepEqual(
    parseRunnerOptions(
      ["--batch-size", "7", "--heartbeat-seconds=3", "--test-name-pattern=matrix"],
      {},
    ),
    {
      concurrency: 7,
      heartbeatSeconds: 3,
      runnerArguments: ["--test-name-pattern=matrix"],
    },
  );
});

test("routine validation is bounded and full validation remains exhaustive", () => {
  const routineScripts = plans.routine.map((phase) => phase[1]);
  const fullScripts = plans.full.map((phase) => phase[1]);
  assert.equal(routineScripts.includes("test:integration"), false);
  assert.equal(routineScripts.includes("test:native"), false);
  assert.equal(routineScripts[0], "merge:check");
  assert.equal(plans.ci[0][1], "merge:check");
  assert.equal(fullScripts.includes("test:integration:run"), true);
  assert.equal(fullScripts.includes("test:native:correctness:run"), true);
  assert.equal(fullScripts.includes("test:native:performance:run"), true);
  assert.ok(plans.routine.length < plans.full.length);
  assert.equal(routineScripts.includes("build:check"), true);
  assert.equal(plans.ci.map((phase) => phase[1]).includes("build:check"), false);
});

test("the integration tier prepares its declared multiprocessing modules", () => {
  assert.match(packageScripts["test:integration"], /python:precompile:run/);
  assert.match(packageScripts["test:integration"], /test:integration:run/);
});

test("routine validation describes whether build work is reused", () => {
  const reused = materializePlan("routine", { current: true });
  const stale = materializePlan("routine", { current: false });
  assert.deepEqual(reused[1], [
    "Build readiness (reuse current successful build)",
    "build:check",
    1,
    plans.routine[1][3],
  ]);
  assert.deepEqual(stale[1], [
    "Build readiness (rebuild required)",
    "build:check",
    300,
    plans.routine[1][3],
  ]);
});

test("test files use learned longest-first scheduling and a bounded ETA", () => {
  const learned = { slow: 9_000, medium: 4_000, fast: 1_000 };
  assert.deepEqual(
    longestFirst(["fast", "unknown", "slow", "medium"], learned, 2_000),
    ["slow", "medium", "unknown", "fast"],
  );
  assert.equal(
    queueEtaMilliseconds(["slow", "medium", "fast"], learned, 2_000, 2),
    7_000,
  );
  rememberTiming(learned, "fast", 2_000);
  assert.equal(learned.fast, 1_300);
  assert.equal(
    scheduledEtaMilliseconds({
      active: new Map([["overdue", 1_000]]),
      concurrency: 2,
      fallback: 1_000,
      learned: { overdue: 2_000, queued: 4_000 },
      pending: ["queued"],
      now: 5_000,
    }),
    4_000,
  );
});

test("a failing file cancels active siblings and leaves later files unstarted", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-test-queue-"));
  context.after(() => require("node:fs").rmSync(directory, { recursive: true }));
  const slowMarker = join(directory, "slow-ran");
  const lateMarker = join(directory, "late-ran");
  const failing = join(directory, "fail.cjs");
  const slow = join(directory, "slow.cjs");
  const late = join(directory, "late.cjs");
  writeFileSync(
    failing,
    'require("node:test")("fail", () => { throw new Error("expected"); });\n',
  );
  writeFileSync(
    slow,
    `require("node:test")("slow", async () => { await new Promise((resolve) => setTimeout(resolve, 5000)); require("node:fs").writeFileSync(${JSON.stringify(slowMarker)}, "yes"); });\n`,
  );
  writeFileSync(
    late,
    `require("node:test")("late", () => require("node:fs").writeFileSync(${JSON.stringify(lateMarker)}, "yes"));\n`,
  );
  const status = await runFileQueue({
    concurrency: 2,
    fallbackMilliseconds: 1,
    files: [late, slow, failing],
    heartbeatMilliseconds: 60_000,
    learned: { [failing]: 10_000, [slow]: 9_000, [late]: 1 },
    replayFailure: false,
    runnerArguments: [],
    tier: "scheduler-test",
  });
  assert.notEqual(status, 0);
  assert.equal(existsSync(slowMarker), false);
  assert.equal(existsSync(lateMarker), false);
});

test("aborted process trees escalate when a child ignores graceful termination", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const child = runBufferedCommand(
    process.execPath,
    [
      "-e",
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
    ],
    {
      signal: controller.signal,
      terminationGraceMilliseconds: 100,
    },
  );
  setTimeout(() => controller.abort(), 100);
  const result = await child;
  assert.notEqual(result.status, 0);
  assert.ok(Date.now() - started < 2_000);
});

test("validation stages preserve build barriers and expose parallel work", () => {
  const stages = planStages(plans.routine);
  assert.deepEqual(stages.slice(0, 3).map((entries) => entries.length), [1, 1, 1]);
  assert.ok(stages.at(-1).length > 1);
  const startup = plans.routine.find((phase) => phase[1] === "test:startup:run");
  assert.equal(startup[3].exclusive, true);
  const docs = plans.full.find((phase) => phase[1] === "docs:verify");
  assert.equal(docs[3].exclusive, true);
});

test("build scheduling defaults are bounded and independently configurable", () => {
  assert.equal(buildJobs({ SAGEJS_BUILD_JOBS: "6" }), 6);
  assert.equal(
    nativeKernelJobs({
      SAGEJS_BUILD_JOBS: "8",
      SAGEJS_NATIVE_KERNEL_JOBS: "3",
    }),
    3,
  );
  assert.throws(() => buildJobs({ SAGEJS_BUILD_JOBS: "0" }), /positive integer/);
});

test("build receipts require identical inputs and every output witness", (context) => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-build-witness-"));
  context.after(() => require("node:fs").rmSync(root, { recursive: true }));
  for (const name of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
    mkdirSync(join(root, "dist", name), { recursive: true });
  }
  for (const name of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) {
    writeFileSync(join(root, "dist", name), "built\n");
  }
  const identity = { source: "same", node: "same", artifactInputsSha256: "a".repeat(64) };
  const receipt = {
    schema: "sagejs.build-receipt/v3",
    completedAt: "2026-08-20T00:00:00.000Z",
    durationMilliseconds: 12,
    identity,
    outputs: outputWitnesses(root, identity),
    outputBindings: outputBindings(root, outputWitnesses(root, identity)),
  };
  assert.equal(validateBuildReceipt(receipt, identity, root).current, true);
  assert.deepEqual(
    validateBuildReceipt(receipt, { ...identity, source: "changed" }, root),
    { current: false, reason: "build inputs changed" },
  );
  assert.match(
    validateBuildReceipt({ ...receipt, outputs: ["definitely-missing"] }, identity, root)
      .reason,
    /witness contract/,
  );
});

test("routine builds skip optional numerical reactors without a prepared toolchain", async () => {
  let ran = false;
  let builtAdapters = false;
  const summary = await buildLazyNumericalReactors({
    environment: {},
    buildAdapters: () => { builtAdapters = true; },
    inspect: () => ({ ready: false }),
    runCommand: async () => { ran = true; },
  });
  assert.equal(ran, false);
  assert.equal(builtAdapters, true);
  assert.match(summary, /Skipped optional numerical reactors/);
});

test("required numerical builds fail closed without a provider", async () => {
  await assert.rejects(
    buildLazyNumericalReactors({
      environment: { SAGEJS_NUMERICAL_RUNTIME_REQUIRED: "1" },
      inspect: () => ({ ready: false }),
    }),
    /numerical runtime is required/,
  );
});

test("prepared builds execute and validate the numerical reactor builder", async () => {
  let validated = false;
  const summary = await buildLazyNumericalReactors({
    environment: {},
    inspect: () => ({ ready: true }),
    runCommand: async (_command, arguments_) => {
      assert.match(arguments_[0], /numerical[\\/]scripts[\\/]build-all\.cjs$/);
      return "built exact numerical runtime\n";
    },
    validate: () => { validated = true; },
  });
  assert.equal(validated, true);
  assert.equal(summary, "built exact numerical runtime");
});

test("native bootstrap refreshes a proven source-build receipt", (context) => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-build-receipt-"));
  context.after(() => require("node:fs").rmSync(root, { recursive: true }));
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{}\n');
  for (const name of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
    mkdirSync(join(root, "dist", name));
    writeFileSync(join(root, "dist", name, "witness"), "built\n");
  }
  for (const name of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) {
    writeFileSync(join(root, "dist", name), "built\n");
  }
  const identity = {
    workspaceSha256: workspaceFingerprint(root),
    artifactInputsSha256: artifactInputsFingerprint(root),
    nativeInputs: [{ package: "flint", status: "absent" }],
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
  };
  writeFileSync(
    join(root, "dist", "build-receipt.json"),
    `${JSON.stringify({
      schema: "sagejs.build-receipt/v3",
      completedAt: "2026-08-20T00:00:00.000Z",
      durationMilliseconds: 12,
      identity,
      outputs: outputWitnesses(root, identity),
      outputBindings: outputBindings(root, outputWitnesses(root, identity)),
    })}\n`,
  );
  assert.equal(inspectSourceBuildReceipt(root).current, true);
  const refreshed = refreshBuildReceiptAfterNative(root);
  assert.equal(refreshed.identity.workspaceSha256, identity.workspaceSha256);
  assert.notDeepEqual(refreshed.identity.nativeInputs, identity.nativeInputs);
  assert.equal(
    JSON.parse(readFileSync(join(root, "dist", "build-receipt.json"), "utf8"))
      .identity.workspaceSha256,
    identity.workspaceSha256,
  );
});
