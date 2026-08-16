"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessIntegerMatrixTiming,
  cases,
  integerMatrixBudgetCases,
  integerMatrixBudgetProfiles,
} = require("../scripts/check-integer-matrix-budget.cjs");

function graphWith(profiles) {
  return { integer_matrix_budget_profiles: profiles };
}

function windowsProfile(override = {}) {
  return {
    platform: "win32",
    arch: "x64",
    overrides: {
      density_500: {
        normalized_median_ms: 10,
        evidence: ["attempt 13 exact receipt", "diagnostic 2 exact receipt"],
        ...override,
      },
    },
  };
}

function byName(selected, name) {
  return selected.find((entry) => entry.name === name);
}

test("Windows x64 selects only its evidence-backed density budget", () => {
  const selected = integerMatrixBudgetCases({ platform: "win32", arch: "x64" });
  const density = byName(selected, "density_500");
  assert.equal(density.budget, 10);
  assert.equal(density.budgetProfile, "win32-x64");
  assert.equal(density.evidence.length, 3);
  assert.match(density.evidence[0], /6\.15, 5\.93, and 5\.90 ms/);
  assert.match(density.evidence[1], /8\.45, 7\.51, 7\.79, 7\.95, and 8\.77 ms/);
  assert.match(density.evidence[2], /6\.32 ms/);

  for (const generic of cases.filter(({ name }) => name !== "density_500")) {
    const selectedCase = byName(selected, generic.name);
    assert.equal(selectedCase.budget, generic.budget);
    assert.equal(selectedCase.budgetProfile, "generic");
    assert.deepEqual(selectedCase.evidence, []);
  }
});

test("generic and nonmatching targets retain the 8 ms density budget", () => {
  for (const target of [
    { platform: "linux", arch: "x64" },
    { platform: "linux", arch: "arm64" },
    { platform: "darwin", arch: "arm64" },
    { platform: "freebsd", arch: "x64" },
    { platform: "win32", arch: "arm64" },
  ]) {
    const density = byName(integerMatrixBudgetCases(target), "density_500");
    assert.equal(density.budget, 8);
    assert.equal(density.budgetProfile, "generic");
    assert.deepEqual(density.evidence, []);
  }
});

test("the Windows profile accepts observed variance without changing boundaries", () => {
  const windowsBudget = byName(
    integerMatrixBudgetCases({ platform: "win32", arch: "x64" }),
    "density_500",
  ).budget;
  const genericBudget = byName(
    integerMatrixBudgetCases({ platform: "linux", arch: "x64" }),
    "density_500",
  ).budget;

  for (const normalized of [8.77, 10]) {
    assert.equal(assessIntegerMatrixTiming({
      raw: normalized,
      normalized,
      budget: windowsBudget,
    }).passed, true);
  }
  assert.equal(assessIntegerMatrixTiming({
    raw: 10.01,
    normalized: 10.01,
    budget: windowsBudget,
  }).passed, false);
  assert.equal(assessIntegerMatrixTiming({
    raw: 8,
    normalized: 8,
    budget: genericBudget,
  }).passed, true);
  assert.equal(assessIntegerMatrixTiming({
    raw: 8.01,
    normalized: 8.01,
    budget: genericBudget,
  }).passed, false);
});

test("hard limit and budget scaling semantics are unchanged", () => {
  const scaled = assessIntegerMatrixTiming({
    raw: 15,
    normalized: 15,
    budget: 10,
    budgetScale: 1.5,
    hardLimit: 500,
  });
  assert.equal(scaled.scaledBudget, 15);
  assert.equal(scaled.passed, true);
  assert.equal(assessIntegerMatrixTiming({
    raw: 500.01,
    normalized: 1,
    budget: 10,
    hardLimit: 500,
  }).passed, false);
});

test("profile declarations reject duplicates and unknown targets", () => {
  assert.throws(
    () => integerMatrixBudgetProfiles(graphWith([
      windowsProfile(),
      windowsProfile(),
    ])),
    /duplicate integer matrix budget profile win32-x64/,
  );
  assert.throws(
    () => integerMatrixBudgetProfiles(graphWith([{
      ...windowsProfile(),
      platform: "plan9",
    }])),
    /unknown target plan9-x64/,
  );
});

test("profile declarations fail closed instead of weakening generic policy", () => {
  const target = { platform: "win32", arch: "x64" };
  for (const [profiles, pattern] of [
    [{}, /must be an array/],
    [[null], /must be an object/],
    [[{ ...windowsProfile(), extra: true }], /must contain exactly/],
    [[{ ...windowsProfile(), platform: "" }], /must be nonempty strings/],
    [[{ ...windowsProfile(), overrides: {} }], /must be a nonempty object/],
    [[{
      ...windowsProfile(),
      overrides: { unknown: windowsProfile().overrides.density_500 },
    }], /unknown generic budget/],
    [[windowsProfile({ normalized_median_ms: 0 })], /must be a positive number/],
    [[windowsProfile({ evidence: [] })], /must contain nonempty strings/],
    [[windowsProfile({ evidence: [""] })], /must contain nonempty strings/],
    [[windowsProfile({ hard_limit_ms: 999 })], /must contain exactly/],
  ]) {
    assert.throws(
      () => integerMatrixBudgetCases(target, graphWith(profiles)),
      pattern,
    );
  }
});

test("target selection rejects malformed authority", () => {
  for (const target of [
    null,
    [],
    { platform: "win32" },
    { platform: "win32", arch: "x64", extra: true },
    { platform: "", arch: "x64" },
    { platform: "win32", arch: 64 },
  ]) {
    assert.throws(() => integerMatrixBudgetCases(target), /target/);
  }
});
