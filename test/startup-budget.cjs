"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessStartup,
  median,
  sampleCount,
  startupBudgetProfiles,
  startupDefaults,
} = require("../scripts/check-startup-budget.cjs");

const baseBudgets = {
  "development-cli": {
    normalized_median_ms: 350,
    hard_limit_ms: 1500,
    samples: 11,
    reference_node_ms: 30,
  },
  "development-cli-empty": {
    normalized_median_ms: 225,
    hard_limit_ms: 1000,
    samples: 11,
    reference_node_ms: 30,
  },
  "sea-cli": {
    normalized_median_ms: 300,
    hard_limit_ms: 1500,
    samples: 11,
    reference_node_ms: 30,
  },
  "sea-cli-empty": {
    normalized_median_ms: 225,
    hard_limit_ms: 1000,
    samples: 11,
    reference_node_ms: 30,
  },
};

function graphWith(profiles) {
  return {
    startup_budgets: structuredClone(baseBudgets),
    startup_budget_profiles: profiles,
  };
}

function armProfile(fullOverride = {}, emptyOverride = {}) {
  return {
    platform: "linux",
    arch: "arm64",
    overrides: {
      "development-cli": {
        normalized_median_ms: 500,
        evidence: ["hosted ARM64 receipt", "bench-arm receipt"],
        ...fullOverride,
      },
      "development-cli-empty": {
        normalized_median_ms: 275,
        evidence: ["hosted ARM64 receipt", "bench-arm receipt"],
        ...emptyOverride,
      },
    },
  };
}

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

test("Linux ARM64 selects only its evidence-backed development overrides", () => {
  const full = startupDefaults(
    false,
    false,
    { platform: "linux", arch: "arm64" },
  );
  assert.equal(full.budgetMs, 500);
  assert.equal(full.hardLimitMs, 1500);
  assert.equal(full.budgetProfile, "linux-arm64");
  assert.equal(full.evidence.length, 3);

  const empty = startupDefaults(
    false,
    true,
    { platform: "linux", arch: "arm64" },
  );
  assert.equal(empty.budgetMs, 275);
  assert.equal(empty.hardLimitMs, 1000);
  assert.equal(empty.budgetProfile, "linux-arm64");
  assert.equal(empty.evidence.length, 3);

  for (const emptySea of [false, true]) {
    const sea = startupDefaults(
      true,
      emptySea,
      { platform: "linux", arch: "arm64" },
    );
    assert.equal(sea.budgetMs, emptySea ? 225 : 300);
    assert.equal(sea.hardLimitMs, emptySea ? 1000 : 1500);
    assert.equal(sea.referenceNodeMs, 30);
    assert.equal(sea.samples, 11);
    assert.equal(sea.budgetProfile, "generic");
    assert.deepEqual(sea.evidence, []);
  }
});

test("generic startup budgets remain the fallback without an exact override", () => {
  for (const target of [
    { platform: "linux", arch: "x64" },
    { platform: "darwin", arch: "arm64" },
    { platform: "freebsd", arch: "x64" },
  ]) {
    const defaults = startupDefaults(false, false, target);
    assert.equal(defaults.budgetMs, 350);
    assert.equal(defaults.hardLimitMs, 1500);
    assert.equal(defaults.budgetProfile, "generic");
  }
  assert.deepEqual(
    [
      startupDefaults(false, false, { platform: "linux", arch: "x64" }),
      startupDefaults(false, true, { platform: "linux", arch: "x64" }),
      startupDefaults(true, false, { platform: "linux", arch: "x64" }),
      startupDefaults(true, true, { platform: "linux", arch: "x64" }),
    ].map(({ budgetMs, hardLimitMs }) => ({ budgetMs, hardLimitMs })),
    [
      { budgetMs: 350, hardLimitMs: 1500 },
      { budgetMs: 225, hardLimitMs: 1000 },
      { budgetMs: 300, hardLimitMs: 1500 },
      { budgetMs: 225, hardLimitMs: 1000 },
    ],
  );
});

test("startup profile declarations reject duplicates and unknown targets", () => {
  assert.throws(
    () => startupBudgetProfiles(graphWith([armProfile(), armProfile()])),
    /duplicate startup budget profile linux-arm64/,
  );
  assert.throws(
    () => startupBudgetProfiles(graphWith([{
      ...armProfile(),
      platform: "plan9",
    }])),
    /unknown target plan9-arm64/,
  );
});

test("startup profile declarations fail closed instead of falling back", () => {
  const target = { platform: "linux", arch: "x64" };
  for (const [profiles, pattern] of [
    [{}, /must be an array/],
    [[{ ...armProfile(), extra: true }], /must contain exactly/],
    [[{ ...armProfile(), overrides: {} }], /must be a nonempty object/],
    [[{
      ...armProfile(),
      overrides: { unknown: armProfile().overrides["development-cli"] },
    }], /unknown generic budget/],
    [[armProfile({ normalized_median_ms: 0 })], /must be a positive number/],
    [[armProfile({ evidence: [] })], /must contain nonempty strings/],
    [[armProfile({}, { evidence: [] })], /must contain nonempty strings/],
    [[armProfile({ hard_limit_ms: 9999 })], /must contain exactly/],
  ]) {
    assert.throws(
      () => startupDefaults(false, false, target, graphWith(profiles)),
      pattern,
    );
  }
});
