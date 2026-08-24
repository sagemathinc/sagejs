// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { materializePlan, plans } = require("../scripts/run-test-plan.cjs");
const { validateBuildReceipt } = require("../scripts/build-receipt.cjs");
const {
  estimateRemaining,
  formatDuration,
  parseRunnerOptions,
  partition,
} = require("../scripts/run-test-tier.cjs");
const packageScripts = require("../package.json").scripts;

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
      batchSize: 7,
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
  assert.equal(fullScripts.includes("test:integration"), true);
  assert.equal(fullScripts.includes("test:native"), true);
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
  ]);
  assert.deepEqual(stale[1], [
    "Build readiness (rebuild required)",
    "build:check",
    300,
  ]);
});

test("build receipts require identical inputs and every output witness", () => {
  const identity = { source: "same", node: "same" };
  const receipt = {
    schema: "sagejs.build-receipt/v1",
    completedAt: "2026-08-20T00:00:00.000Z",
    durationMilliseconds: 12,
    identity,
    outputs: ["package.json"],
  };
  assert.equal(validateBuildReceipt(receipt, identity).current, true);
  assert.deepEqual(
    validateBuildReceipt(receipt, { ...identity, source: "changed" }),
    { current: false, reason: "build inputs changed" },
  );
  assert.match(
    validateBuildReceipt({ ...receipt, outputs: ["definitely-missing"] }, identity)
      .reason,
    /output is missing/,
  );
});
