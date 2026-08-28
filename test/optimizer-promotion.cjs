// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { documentIdentity, sha256 } = require("../tools/optimizer-development/common.cjs");
const {
  completedComparison,
  createPromotionReceipt,
  defaultPromotionPolicy,
  validatePromotionReceipt,
} = require("../tools/optimizer-development/promotion.cjs");

const git = (digit) => digit.repeat(40);
const digest = (label) => sha256(label);
const id = (label) => `sha256:${digest(label)}`;
const orders = ["AB", "BA", "BA", "AB"];

function pairs(baseline = 125, candidate = 100) {
  return Array.from({ length: 11 }, (_, index) => ({
    order: orders[index % orders.length],
    baseline: baseline + index,
    candidate: candidate + index,
  }));
}

function comparison(baseline = 125, candidate = 100) {
  return { unit: "microseconds", pairs: pairs(baseline, candidate), inclusive: true };
}

function revision(name, commitDigit, treeDigit) {
  return {
    commit: git(commitDigit),
    tree: git(treeDigit),
    sourceBundleId: id(`${name}-source`),
    workspaceId: digest(`${name}-workspace`),
    clean: true,
    compilerId: id(`${name}-compiler`),
    artifactId: id(`${name}-artifact`),
    profileIds: [id(`${name}-profile`)],
  };
}

function acceptedDraft() {
  const baseline = revision("baseline", "1", "2");
  const candidate = revision("candidate", "3", "4");
  const browserIds = Object.fromEntries(
    ["chromium", "firefox", "webkit"].map((engine) => [engine, id(`browser-${engine}`)]),
  );
  const draft = {
    campaign: { id: id("campaign") },
    policy: defaultPromotionPolicy({ bootstrapResamples: 1000 }),
    baseline,
    candidate,
    build: {
      workspaceId: candidate.workspaceId,
      receiptDigest: digest("build-receipt"),
      outputsDigest: digest("build-outputs"),
    },
    artifact: {
      kind: "browser-production",
      id: candidate.artifactId,
      sourceCommit: candidate.commit,
      sourceClosureId: id("candidate-closure"),
      manifestDigest: digest("artifact-manifest"),
      receiptDigest: digest("artifact-receipt"),
    },
    workloads: [id("authentic-workload")],
    correctness: [{ id: "exact-output", status: "pass", evidenceId: id("correctness") }],
    compilerDelta: {
      beforeDecisionIds: [id("before-decision")],
      afterDecisionIds: [id("after-decision")],
      resolvedReasons: [],
      introducedReasons: [],
    },
    routes: [{
      id: "v8-route",
      status: "pass",
      evidenceId: id("route"),
      passId: "math.bounded-integer-region.v1",
      lowering: "v8.bounded-integer.v1",
      representation: "primitive exact numbers",
      target: "v8",
      fallbackId: "semantic:fixture.py:1:1",
      runtimeAuthenticated: true,
      o0Selected: false,
      o2Selected: true,
      guardFallback: "pass",
    }],
    performance: { endToEnd: comparison(), phase: null },
    costs: {
      baseline: { boundaryCrossings: 20, copiedBytes: 100, materializations: 20, allocations: 30 },
      candidate: { boundaryCrossings: 0, copiedBytes: 0, materializations: 1, allocations: 1 },
    },
    resources: [{
      id: "resident-memory",
      evidenceId: id("resources"),
      ceilings: [{ metric: "high-water-bytes", unit: "bytes", limit: 1000, observed: 900 }],
    }],
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"].map(
      (platform) => ({
        id: platform,
        availability: "available",
        evidenceId: id(`platform-${platform}`),
        failures: [],
      }),
    ),
    baselineExceptions: [],
    browsers: ["chromium", "firefox", "webkit"].map((engine) => ({
      engine,
      availability: "available",
      receiptId: browserIds[engine],
    })),
    dashboardDelta: {
      beforeId: id("dashboard-before"),
      afterId: id("dashboard-after"),
      resolvedRegions: [id("resolved-region")],
      introducedRegions: [],
    },
    adversarial: [{ id: "mutated-helper", status: "pass", evidenceId: id("adversarial") }],
    neighboring: [{ workloadId: id("neighbor"), comparison: comparison(100, 100) }],
    losingCandidates: ["generic", "library", "native", "wasm"].map((target) => ({
      target,
      status: "measured-slower",
      evidenceId: id(`losing-${target}`),
      reason: "Inclusive costs are worse than the selected target.",
    })),
  };
  const context = {
    campaignId: draft.campaign.id,
    currentCheckout: { ...candidate },
    currentBuild: { ...draft.build },
    currentArtifact: {
      id: draft.artifact.id,
      sourceCommit: draft.artifact.sourceCommit,
      sourceClosureId: draft.artifact.sourceClosureId,
      manifestDigest: draft.artifact.manifestDigest,
      receiptDigest: draft.artifact.receiptDigest,
    },
    validatedBrowserReceiptIds: Object.values(browserIds),
    validatedInputs: {
      campaignIds: [draft.campaign.id],
      sourceBundleIds: [baseline.sourceBundleId, candidate.sourceBundleId].sort(),
      compilerIds: [baseline.compilerId, candidate.compilerId].sort(),
      artifactIds: [baseline.artifactId, candidate.artifactId].sort(),
      profileIds: [...baseline.profileIds, ...candidate.profileIds].sort(),
      workloadIds: [...draft.workloads].sort(),
      correctnessEvidenceIds: draft.correctness.map((item) => item.evidenceId).sort(),
      adversarialEvidenceIds: draft.adversarial.map((item) => item.evidenceId).sort(),
      routeEvidenceIds: draft.routes.map((item) => item.evidenceId).sort(),
      resourceEvidenceIds: draft.resources.map((item) => item.evidenceId).sort(),
      platformEvidenceIds: draft.platforms.map((item) => item.evidenceId).sort(),
      neighboringWorkloadIds: draft.neighboring.map((item) => item.workloadId).sort(),
      losingCandidateEvidenceIds: draft.losingCandidates.map((item) => item.evidenceId).sort(),
      dashboardIds: [draft.dashboardDelta.beforeId, draft.dashboardDelta.afterId].sort(),
      compilerDecisionIds: [
        ...draft.compilerDelta.beforeDecisionIds,
        ...draft.compilerDelta.afterDecisionIds,
      ].sort(),
    },
  };
  return { draft, context };
}

function clone(value) {
  return structuredClone(value);
}

const scenarios = JSON.parse(fs.readFileSync(path.join(
  __dirname,
  "fixtures/optimizer-development/promotion/scenarios.json",
), "utf8"));

test("promotion decisions are deterministic and fail closed", () => {
  for (const scenario of scenarios) {
    const { draft, context } = acceptedDraft();
    if (scenario.mutation === "current-checkout") context.currentCheckout.commit = git("9");
    if (scenario.mutation === "webkit-unavailable") {
      draft.browsers.find((item) => item.engine === "webkit").availability = "unavailable";
    }
    if (scenario.mutation === "unproved-speedup") {
      draft.performance.endToEnd = comparison(100, 100);
    }
    if (scenario.mutation === "unmatched-exception") {
      draft.baselineExceptions.push({
        id: "historical-higher-genus-timeout",
        issue: "https://github.com/sagemathinc/sagejs/issues/74",
        test: "test/higher-genus.cjs: coefficient-prefix",
        platform: "linux-x64",
        fingerprint: digest("historical-fingerprint"),
      });
    }
    const first = createPromotionReceipt(draft, context);
    const second = createPromotionReceipt(draft, context);
    assert.equal(first.decision.status, scenario.expected, scenario.id);
    assert.deepEqual(first, second, `${scenario.id} deterministic`);
    assert.equal(validatePromotionReceipt(first, context).decision.status, scenario.expected);
  }
});

test("an exact baseline exception is narrow and authenticated", () => {
  const { draft, context } = acceptedDraft();
  const exception = {
    id: "historical-higher-genus-timeout",
    issue: "https://github.com/sagemathinc/sagejs/issues/74",
    test: "test/higher-genus.cjs: coefficient-prefix",
    platform: "linux-x64",
    fingerprint: digest("historical-fingerprint"),
  };
  draft.baselineExceptions.push(exception);
  draft.platforms.find((item) => item.id === exception.platform).failures.push({
    test: exception.test,
    fingerprint: exception.fingerprint,
    exceptionId: exception.id,
  });
  assert.equal(createPromotionReceipt(draft, context).decision.status, "accepted");

  draft.platforms.find((item) => item.id === exception.platform).failures[0].fingerprint =
    digest("different-fingerprint");
  assert.equal(createPromotionReceipt(draft, context).decision.status, "rejected");
});

test("receipts reject mutation, forged decisions, unknown fields, and missing authority", () => {
  const { draft, context } = acceptedDraft();
  const receipt = createPromotionReceipt(draft, context);

  const mutated = clone(receipt);
  mutated.artifact.sourceCommit = git("9");
  mutated.id = documentIdentity(mutated);
  assert.throws(() => validatePromotionReceipt(mutated, context), /candidate commit/);

  const forged = clone(receipt);
  forged.decision.status = "rejected";
  forged.id = documentIdentity(forged);
  assert.throws(() => validatePromotionReceipt(forged, context),
    /independently recomputed decision/);

  const extended = clone(receipt);
  extended.unreviewed = true;
  extended.id = documentIdentity(extended);
  assert.throws(() => validatePromotionReceipt(extended, context), /fields must be exactly/);

  assert.throws(() => validatePromotionReceipt(receipt), /independently recomputed decision/);
});

test("candidate compiler, source bundle, artifact, and cited evidence are authenticated", () => {
  const { draft, context } = acceptedDraft();
  assert.equal(createPromotionReceipt(draft, context).decision.status, "accepted");

  for (const field of ["compilerId", "sourceBundleId", "artifactId"]) {
    const counterfeit = clone(context);
    counterfeit.currentCheckout[field] = id(`counterfeit-${field}`);
    assert.equal(createPromotionReceipt(draft, counterfeit).decision.status, "rejected", field);
  }

  const missingRouteEvidence = clone(context);
  missingRouteEvidence.validatedInputs.routeEvidenceIds = [];
  assert.equal(createPromotionReceipt(draft, missingRouteEvidence).decision.status, "rejected");

  const missingEvidenceAuthority = clone(context);
  delete missingEvidenceAuthority.validatedInputs;
  assert.equal(createPromotionReceipt(draft, missingEvidenceAuthority).decision.status,
    "inconclusive");
});

test("paired bootstrap completion is deterministic and ignores claimed summaries", () => {
  const policy = defaultPromotionPolicy({ bootstrapResamples: 1000 });
  const input = comparison();
  const first = completedComparison(input, policy, "fixed-seed");
  const second = completedComparison(input, policy, "fixed-seed");
  assert.deepEqual(first, second);
  assert.equal(first.pairs.length, 11);
  assert.ok(first.confidenceLower > 1.17);
  assert.ok(first.confidenceUpper < 1.25);
});
