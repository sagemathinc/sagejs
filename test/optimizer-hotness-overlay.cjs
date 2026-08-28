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

test("ranking remains lexicographic and never creates an opaque score", () => {
  const make = (id, lower, importance) => ({ source: { regionId: id }, ranking: {
    removableWallLower: lower, affectedWorkloads: importance, nearMissDistance: 1,
    generality: 1, existingComponents: 1, semanticRisk: 1, compilationCost: 1,
    evidenceQuality: 3,
  } });
  assert.equal(compareRegions(make("a", 20, 1), make("b", 19, 1000)) < 0, true);
  assert.equal("score" in make("a", 1, 1).ranking, false);
});
