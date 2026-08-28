"use strict";

const OVERLAY_SCHEMA = "sagejs.optimizer-hotness-overlay/v1";
const COMPILER_CLASSES = new Set([
  "representation", "dynamic-dispatch-coercion", "boundary-dominated",
  "allocation-materialization", "compiler-rejection", "target-mismatch",
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function number(value, label, minimum = 0) {
  assert(Number.isFinite(value) && value >= minimum, `${label} must be a finite number at least ${minimum}`);
  return value;
}

function requireAdapter(adapter, hasOpportunityEvidence = false) {
  for (const name of ["validateDashboard", "validateProfileReceipt", "dashboard", "profile",
    "attachIdentity", "validateHotnessOverlay", "eligibilityReasons"]) {
    assert(adapter && typeof adapter[name] === "function", `overlay adapter.${name} is required`);
  }
  if (hasOpportunityEvidence) {
    assert(typeof adapter.validateOpportunityEvidence === "function",
      "overlay adapter.validateOpportunityEvidence is required for reviewed opportunities");
  }
}

function compareNullable(a, b, descending) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return descending ? b - a : a - b;
}

// Ranking is deliberately lexicographic. No weighted score exists to obscure
// why one measured candidate precedes another.
function compareRegions(left, right) {
  const a = left.ranking;
  const b = right.ranking;
  return compareNullable(a.removableWallLower, b.removableWallLower, true)
    || compareNullable(a.affectedWorkloads, b.affectedWorkloads, true)
    || compareNullable(a.nearMissDistance, b.nearMissDistance, false)
    || compareNullable(a.generality, b.generality, true)
    || compareNullable(a.existingComponents, b.existingComponents, true)
    || compareNullable(a.semanticRisk, b.semanticRisk, false)
    || compareNullable(a.compilationCost, b.compilationCost, false)
    || compareNullable(a.evidenceQuality, b.evidenceQuality, true)
    || left.source.regionId.localeCompare(right.source.regionId);
}

function recommendAction(region, negativeEvidence = []) {
  const selected = region.staticDecisions.some((decision) => decision.status === "selected");
  const optimized = region.runtimeRoutes.some((route) => route.optimizedEntries > 0);
  if (selected && optimized) return "already-optimized";
  if (negativeEvidence.length > 0) return "reject";
  if (["algorithmic", "repeated-proof-state"].includes(region.classification)) {
    return "algorithm-work";
  }
  if (region.eligibility.status === "eligible" && COMPILER_CLASSES.has(region.classification)) {
    return "compiler-campaign";
  }
  return "investigate";
}

function mergeObservedRegion(staticRegion, evidence) {
  const observations = evidence.observations.slice().sort((a, b) =>
    `${a.profileId}:${a.workloadId}`.localeCompare(`${b.profileId}:${b.workloadId}`));
  const routes = evidence.runtimeRoutes.slice().sort((a, b) =>
    `${a.profileId}:${a.target}`.localeCompare(`${b.profileId}:${b.target}`));
  const current = evidence.current === true;
  const coverage = Math.min(...observations.map((item) => item.coverage));
  const exactOutput = observations.every((item) => item.exactOutput === true);
  const material = staticRegion.ranking.removableWallLower > 0;
  const eligible = current && coverage >= evidence.minimumCoverage && exactOutput
    && material && staticRegion.classification !== "unknown"
    && staticRegion.fallbackPreserving === true
    && staticRegion.matureAlgorithmDisposition === "not-duplicate";
  const gates = {
    current,
    coverageSatisfied: coverage >= evidence.minimumCoverage,
    exactOutput,
    material,
    classificationKnown: staticRegion.classification !== "unknown",
    fallbackPreserving: staticRegion.fallbackPreserving === true,
    algorithmDispositionKnown: staticRegion.matureAlgorithmDisposition === "not-duplicate",
  };
  const reasons = evidence.eligibilityReasons(gates);
  assert(eligible || reasons.length > 0, "ineligible region must have at least one stable reason");
  const result = {
    source: copy(staticRegion.source),
    loopId: staticRegion.loopId,
    staticDecisions: copy(staticRegion.staticDecisions),
    opportunityEvidenceIds: copy(staticRegion.opportunityEvidenceIds || []),
    observations: observations.map((item) => ({
      profileId: item.profileId,
      workloadId: item.workloadId,
      entryCount: item.entryCount,
      inclusiveSamples: item.inclusiveSamples,
      exclusiveSamples: item.exclusiveSamples,
      wallFraction: item.wallFraction,
      confidence: item.confidence,
    })),
    runtimeRoutes: copy(routes),
    classification: staticRegion.classification,
    recommendedAction: "investigate",
    eligibility: { status: eligible ? "eligible" : current ? "ineligible" : "stale", reasons },
    ranking: copy(staticRegion.ranking),
    removableFraction: copy(staticRegion.removableFraction),
  };
  result.recommendedAction = recommendAction(result, staticRegion.negativeEvidence || []);
  return result;
}

/**
 * Join validated profile receipts to a current static dashboard.
 *
 * `adapter.dashboard` and `adapter.profile` are the only producer-specific
 * boundaries. They must project the versioned dashboard/profile documents to
 * exact region IDs and the fields consumed below. This module never joins by
 * a source line, and it never reimplements content identity or schema logic.
 */
function buildHotnessOverlay({ dashboard, profileReceipts, reviewedOpportunities = [],
  workloads = [], adapter, minimumCoverage = 0.8 }) {
  requireAdapter(adapter, reviewedOpportunities.length > 0);
  number(minimumCoverage, "minimumCoverage", 0);
  assert(minimumCoverage <= 1, "minimumCoverage must not exceed 1");
  const checkedDashboard = adapter.validateDashboard(dashboard);
  const staticView = adapter.dashboard(checkedDashboard);
  assert(Array.isArray(staticView.regions), "dashboard adapter must return regions");
  assert(Array.isArray(profileReceipts) && profileReceipts.length > 0,
    "at least one profile receipt is required");

  const staticById = new Map();
  const duplicateIds = new Set();
  for (const region of staticView.regions) {
    assert(typeof region.loopId === "string", "dashboard region loopId is required");
    if (staticById.has(region.loopId)) duplicateIds.add(region.loopId);
    else staticById.set(region.loopId, {
      ...region,
      ranking: copy(region.ranking),
      removableFraction: copy(region.removableFraction),
      opportunityEvidenceIds: [],
    });
  }

  const checkedProfiles = profileReceipts.map((receipt) =>
    adapter.validateProfileReceipt(receipt));
  const opportunities = [];
  const seenOpportunities = new Set();
  for (const rawOpportunity of reviewedOpportunities) {
    const workload = workloads.find((item) =>
      item && item.id === rawOpportunity?.workload?.id);
    assert(workload, `reviewed opportunity ${rawOpportunity?.id || "<unknown>"} ` +
      "does not have its exact workload contract");
    const opportunity = adapter.validateOpportunityEvidence(rawOpportunity, {
      dashboard: checkedDashboard,
      workload,
      profileReceipts: checkedProfiles,
    });
    assert(!seenOpportunities.has(opportunity.id),
      `duplicate reviewed opportunity ${opportunity.id}`);
    seenOpportunities.add(opportunity.id);
    const region = staticById.get(opportunity.scope.primaryRegionId);
    assert(region && !duplicateIds.has(opportunity.scope.primaryRegionId),
      `reviewed opportunity ${opportunity.id} does not resolve one dashboard region`);
    region.opportunityEvidenceIds.push(opportunity.id);
    if (opportunity.status === "eligible") {
      region.classification = opportunity.classification.primary;
      region.matureAlgorithmDisposition = opportunity.matureAlgorithm.disposition;
      region.ranking.removableWallLower =
        opportunity.measurement.statistics.removableWallLowerMicroseconds;
      region.ranking.affectedWorkloads = 1;
      region.ranking.evidenceQuality = Math.max(region.ranking.evidenceQuality, 5);
      region.removableFraction.lower =
        opportunity.measurement.statistics.removableFractionLower;
      region.removableFraction.upper = 1;
    } else if (opportunity.status === "rejected") {
      region.negativeEvidence = [opportunity.id];
    }
    opportunities.push({
      id: opportunity.id,
      regionId: opportunity.scope.primaryRegionId,
      workloadId: opportunity.workload.id,
      status: opportunity.status,
    });
  }
  opportunities.sort((left, right) => left.id.localeCompare(right.id));
  for (const region of staticById.values()) region.opportunityEvidenceIds.sort();

  const profiles = [];
  const unmatched = [];
  const joined = new Map();
  for (const receipt of checkedProfiles) {
    const view = adapter.profile(receipt, staticView, minimumCoverage);
    assert(Array.isArray(view.observations) && Array.isArray(view.runtimeRoutes)
      && Array.isArray(view.unmatched), "profile adapter returned an incomplete projection");
    assert(view.samples && typeof view.samples === "object", "profile adapter must expose conserved samples");
    for (const field of ["total", "attributed", "ambiguous", "unmatched"]) {
      number(view.samples[field], `profile ${view.id} samples.${field}`);
    }
    assert(view.samples.attributed + view.samples.ambiguous + view.samples.unmatched
      === view.samples.total, `profile ${view.id} projection does not conserve total samples`);
    assert(view.observations.reduce((sum, item) => sum + item.exclusiveSamples, 0)
      === view.samples.attributed, `profile ${view.id} projection does not conserve attributed samples`);
    assert(view.unmatched.reduce((sum, item) => sum + item.count, 0)
      === view.samples.ambiguous + view.samples.unmatched,
    `profile ${view.id} projection does not conserve ambiguous/unmatched samples`);
    profiles.push({ id: view.id, workloadId: view.workloadId, status: view.current ? "current" : "historical" });
    unmatched.push(...view.unmatched.map(copy));
    if (!view.current) continue;
    const observationsByRegion = new Map();
    for (const observation of view.observations) {
      number(observation.exclusiveSamples, "exclusiveSamples");
      number(observation.inclusiveSamples, "inclusiveSamples");
      assert(observation.inclusiveSamples >= observation.exclusiveSamples,
        "inclusiveSamples must be at least exclusiveSamples");
      if (duplicateIds.has(observation.regionId)) {
        unmatched.push({ profileId: view.id, reason: view.reason("evidence.ambiguous-source-map"), count: observation.exclusiveSamples || 1 });
        continue;
      }
      if (!staticById.has(observation.regionId)) {
        unmatched.push({ profileId: view.id, reason: view.reason("evidence.stale-source"), count: observation.exclusiveSamples || 1 });
        continue;
      }
      assert(!observationsByRegion.has(observation.regionId),
        `profile ${view.id} has duplicate exact observation for ${observation.regionId}`);
      observationsByRegion.set(observation.regionId, observation);
      if (!joined.has(observation.regionId)) joined.set(observation.regionId, { observations: [], runtimeRoutes: [] });
      joined.get(observation.regionId).observations.push({ ...copy(observation), profileId: view.id,
        workloadId: view.workloadId, current: true, coverage: view.coverage,
        exactOutput: view.exactOutput });
    }
    for (const route of view.runtimeRoutes) {
      if (!observationsByRegion.has(route.regionId)) continue;
      joined.get(route.regionId).runtimeRoutes.push({
        profileId: view.id,
        target: route.target,
        optimizedEntries: route.optimizedEntries,
        fallbackEntries: route.fallbackEntries,
        errorEntries: route.errorEntries,
      });
    }
  }

  const regions = [];
  for (const [regionId, runtime] of joined) {
    regions.push(mergeObservedRegion(staticById.get(regionId), {
      ...runtime,
      current: true,
      minimumCoverage,
      reason: adapter.reason,
      eligibilityReasons: adapter.eligibilityReasons,
    }));
  }
  // Versioned evidence stays identity-sorted. Callers obtain the transparent
  // actionable queue with `rankedRegions`; document order never encodes rank.
  regions.sort((a, b) => a.source.regionId.localeCompare(b.source.regionId));
  profiles.sort((a, b) => a.id.localeCompare(b.id));
  unmatched.sort((a, b) => `${a.profileId}:${a.reason.code}:${JSON.stringify(a.reason.detail)}`
    .localeCompare(`${b.profileId}:${b.reason.code}:${JSON.stringify(b.reason.detail)}`));
  const payload = {
    dashboard: copy(staticView.reference),
    profiles,
    opportunities,
    joinPolicy: { minimumCoverage, staleProfiles: "historical-only", ambiguity: "fail-closed" },
    regions,
    unmatched,
    summary: {
      currentProfiles: profiles.filter((item) => item.status === "current").length,
      historicalProfiles: profiles.filter((item) => item.status === "historical").length,
      eligibleRegions: regions.filter((item) => item.eligibility.status === "eligible").length,
      staleRegions: regions.filter((item) => item.eligibility.status === "stale").length,
      ambiguousRegions: regions.filter((item) => item.eligibility.status === "ambiguous").length,
    },
  };
  const document = adapter.attachIdentity(OVERLAY_SCHEMA, payload);
  return adapter.validateHotnessOverlay(document, { dashboardId: staticView.reference.id });
}

function rankedRegions(overlay) {
  return [...overlay.regions].sort(compareRegions);
}

module.exports = {
  OVERLAY_SCHEMA,
  buildHotnessOverlay,
  compareRegions,
  rankedRegions,
  recommendAction,
};
