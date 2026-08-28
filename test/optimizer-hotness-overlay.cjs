// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildHotnessOverlay, compareRegions, recommendAction } = require("../tools/optimizer-development/overlay.cjs");
const adapter = require("./fixtures/optimizer-development/dossiers/adapter.cjs");

const fixtures = path.join(__dirname, "fixtures/optimizer-development/dossiers");
const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));

test("sparse exact-ID overlay conserves samples and keeps static/runtime evidence distinct", () => {
  const overlay = buildHotnessOverlay({
    dashboard: load("dashboard.json"), profileReceipts: [load("profile-current.json")], adapter,
  });
  assert.equal(overlay.regions.length, 4);
  assert.equal(overlay.regions.some((item) => item.source.regionId === adapter.cid("region:cold")), false);
  const hot = overlay.regions.find((item) => item.source.regionId === adapter.cid("region:hot"));
  assert.equal(recommendAction(hot), "compiler-campaign");
  assert.equal(hot.recommendedAction, "compiler-campaign");
  assert.equal(hot.staticDecisions[0].reasons[0].code, "bounded-integer.mutable-buffer-access");
  assert.equal(hot.observations[0].exclusiveSamples, 50);
  assert.equal(overlay.unmatched.reduce((sum, item) => sum + item.count, 0), 10);
});

test("selected, negative, and algorithmic controls retain conservative actions", () => {
  const overlay = buildHotnessOverlay({
    dashboard: load("dashboard.json"), profileReceipts: [load("profile-current.json")], adapter,
  });
  const by = (name) => overlay.regions.find((item) => item.source.regionId === adapter.cid(name));
  assert.equal(recommendAction(by("region:selected")), "already-optimized");
  assert.equal(by("region:negative").recommendedAction, "reject");
  assert.equal(recommendAction(by("region:algorithm")), "algorithm-work");
});

test("historical receipts and stale region IDs cannot enter the actionable join", () => {
  const overlay = buildHotnessOverlay({
    dashboard: load("dashboard.json"),
    profileReceipts: [load("profile-stale.json"), load("profile-ambiguous.json")], adapter,
  });
  assert.equal(overlay.regions.length, 0);
  assert.deepEqual(overlay.profiles.map((item) => item.status).sort(), ["current", "historical"]);
  assert.deepEqual(overlay.unmatched.map((item) => item.reason.code).sort(), [
    "evidence.ambiguous-source-map", "evidence.stale-source",
  ]);
});

test("adapter projections must independently conserve all profile samples", () => {
  const bad = { ...adapter, profile(receipt, dashboard, threshold) {
    const view = adapter.profile(receipt, dashboard, threshold);
    view.samples.total += 1;
    return view;
  } };
  assert.throws(() => buildHotnessOverlay({
    dashboard: load("dashboard.json"), profileReceipts: [load("profile-current.json")], adapter: bad,
  }), /does not conserve total samples/);
});

test("duplicate exact dashboard identities are ambiguous and never joined", () => {
  const dashboard = load("dashboard.json");
  dashboard.regions.push(JSON.parse(JSON.stringify(dashboard.regions[0])));
  const overlay = buildHotnessOverlay({
    dashboard, profileReceipts: [load("profile-current.json")], adapter,
  });
  assert.equal(overlay.regions.some((item) => item.source.regionId === adapter.cid("region:hot")), false);
  assert.equal(overlay.unmatched.some((item) => item.reason.code === "evidence.ambiguous-source-map"), true);
});

test("a measured but unrecognized loop remains investigate-only", () => {
  const dashboard = load("dashboard.json");
  dashboard.regions[0].staticEvidence.primaryClass = "unknown";
  const overlay = buildHotnessOverlay({
    dashboard, profileReceipts: [load("profile-current.json")], adapter,
  });
  const hot = overlay.regions.find((item) => item.source.regionId === adapter.cid("region:hot"));
  assert.equal(hot.eligibility.status, "ineligible");
  assert.equal(hot.recommendedAction, "investigate");
});

test("validated fused opportunities consume exact hot children into their outer scope", () => {
  const dashboard = load("dashboard.json");
  const primary = dashboard.regions.find((item) => item.identity.id === "region:cold");
  primary.staticEvidence.fallbackPreservingTransformation = true;
  const profile = load("profile-current.json");
  profile.samples = { total: 50, unmatched: 0, ambiguous: 0 };
  profile.observations = profile.observations.filter((item) =>
    item.regionIdentity.id === "region:hot");
  const profileId = adapter.cid("profile:current");
  const workloadId = adapter.cid("workload:authentic");
  const primaryRegionId = adapter.cid("region:cold");
  const childRegionId = adapter.cid("region:hot");
  const passId = "math.control.v1";
  const reviewed = {
    id: adapter.cid("reviewed fused opportunity"),
    status: "eligible",
    workload: { id: workloadId },
    compilerDecision: {
      decisionId: adapter.cid(`${primaryRegionId}:${passId}:0`),
      passId,
    },
    scope: {
      candidateScope: "fused-outer-region",
      primaryRegionId,
      hotChildRegionIds: [childRegionId],
    },
    profiles: { attributionId: profileId },
    classification: { primary: "dynamic-dispatch-coercion" },
    matureAlgorithm: { disposition: "not-duplicate" },
    measurement: { statistics: {
      removableWallLowerMicroseconds: 25,
      removableFractionLower: 0.25,
    } },
  };
  const opportunityAdapter = {
    ...adapter,
    validateOpportunityEvidence(value) { return value; },
  };
  const overlay = buildHotnessOverlay({
    dashboard,
    profileReceipts: [profile],
    reviewedOpportunities: [reviewed],
    workloads: [{ id: workloadId }],
    adapter: opportunityAdapter,
  });
  assert.equal(overlay.regions.length, 1);
  const fused = overlay.regions[0];
  assert.equal(fused.source.regionId, primaryRegionId);
  assert.equal(fused.observations[0].exclusiveSamples, 50);
  assert.equal(fused.recommendedAction, "compiler-campaign");
  assert.equal(fused.eligibility.status, "eligible");
  assert.equal(overlay.opportunities[0].candidateScope, "fused-outer-region");
  assert.deepEqual(overlay.opportunities[0].hotChildRegionIds, [childRegionId]);
  assert.equal(overlay.opportunities[0].attributionProfileId, profileId);
  assert.equal(overlay.regions.some((item) => item.source.regionId === childRegionId), false);
});

test("ranking remains lexicographic and never creates an opaque score", () => {
  const make = (id, lower, importance) => ({ source: { regionId: id }, ranking: {
    removableWallLower: lower, affectedWorkloads: importance, nearMissDistance: 1,
    generality: 1, existingComponents: 1, semanticRisk: 1, compilationCost: 1,
    evidenceQuality: 3,
  } });
  assert.equal(compareRegions(make("a", 20, 1), make("b", 19, 1000)) < 0, true);
  assert.equal("score" in make("a", 1, 1).ranking, false);
});
