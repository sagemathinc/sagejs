// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessStartup,
  median,
  sampleCount,
  startupDefaults,
} = require("../scripts/check-startup-budget.cjs");

test("startup medians are deterministic for odd and even samples", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([9, 1, 5, 3]), 4);
});

test("startup budget never rewards a faster-than-reference host", () => {
  const result = assessStartup({ nodeMedianMs: 15, targetMedianMs: 299 });
  assert.equal(result.loadFactor, 1);
  assert.equal(result.normalizedMs, 299);
  assert.equal(result.passed, true);
});

test("startup budget compensates for contemporaneous host slowdown", () => {
  const result = assessStartup({ nodeMedianMs: 60, targetMedianMs: 400 });
  assert.equal(result.loadFactor, 2);
  assert.equal(result.normalizedMs, 200);
  assert.equal(result.passed, true);
});

test("startup budget catches normalized and catastrophic regressions", () => {
  assert.equal(
    assessStartup({ nodeMedianMs: 30, targetMedianMs: 301 }).passed,
    false,
  );
  const catastrophic = assessStartup({
    nodeMedianMs: 300,
    targetMedianMs: 1501,
  });
  assert.equal(catastrophic.normalizedMs, 150.1);
  assert.equal(catastrophic.withinNormalizedBudget, true);
  assert.equal(catastrophic.withinHardLimit, false);
  assert.equal(catastrophic.passed, false);
});

test("startup sample count must be odd so its median is observed", () => {
  assert.equal(sampleCount(undefined), 11);
  assert.equal(sampleCount("7"), 7);
  assert.throws(() => sampleCount("2"), /odd integer/);
  assert.throws(() => sampleCount("8"), /odd integer/);
});

test("empty startup has a distinct stricter regression budget", () => {
  assert.ok(
    startupDefaults(false, true).budgetMs < startupDefaults(false).budgetMs,
  );
  assert.ok(
    startupDefaults(true, true).hardLimitMs < startupDefaults(true).hardLimitMs,
  );
});

test("startup budgets can account for a measured platform-architecture cost", () => {
  assert.equal(startupDefaults(false, false, "linux", "arm64").budgetMs, 400);
  assert.equal(startupDefaults(false, false, "linux", "x64").budgetMs, 350);
  assert.equal(startupDefaults(true, false, "linux", "arm64").budgetMs, 350);
  assert.equal(startupDefaults(true, false, "darwin", "arm64").budgetMs, 300);
  assert.equal(startupDefaults(true, false, "linux", "x64").budgetMs, 300);
});
