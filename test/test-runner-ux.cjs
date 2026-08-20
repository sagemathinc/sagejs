"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { plans } = require("../scripts/run-test-plan.cjs");
const {
  estimateRemaining,
  formatDuration,
  parseRunnerOptions,
  partition,
} = require("../scripts/run-test-tier.cjs");

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
  assert.equal(fullScripts.includes("test:integration"), true);
  assert.equal(fullScripts.includes("test:native"), true);
  assert.ok(plans.routine.length < plans.full.length);
});
