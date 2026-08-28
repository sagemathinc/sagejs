"use strict";

const DOSSIER_SCHEMA = "sagejs.optimizer-dossier/v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function requireAdapter(adapter) {
  for (const name of ["validateHotnessOverlay", "validateDashboard", "validateProfileReceipt",
    "dashboard", "profile", "dossier", "attachIdentity", "validateDossier"]) {
    assert(adapter && typeof adapter[name] === "function", `dossier adapter.${name} is required`);
  }
}

/** Generate a detached dossier for one exact semantic region identity. */
function generateDossier({ overlay, dashboard, profileReceipts, regionId, adapter }) {
  requireAdapter(adapter);
  assert(Array.isArray(profileReceipts) && profileReceipts.length > 0,
    "at least one profile receipt is required");
  const checkedOverlay = adapter.validateHotnessOverlay(overlay);
  const checkedDashboard = adapter.validateDashboard(dashboard);
  assert(typeof regionId === "string" && regionId.length > 0,
    "an exact region identity is required");
  const overlayMatches = checkedOverlay.regions.filter((item) => item.source.regionId === regionId);
  assert(overlayMatches.length === 1, overlayMatches.length === 0
    ? `exact region identity not present in sparse overlay: ${regionId}`
    : `ambiguous exact region identity in overlay: ${regionId}`);
  const overlayRegion = overlayMatches[0];
  assert(overlayRegion.eligibility.status !== "stale" && overlayRegion.eligibility.status !== "ambiguous",
    `cannot generate an actionable dossier for ${overlayRegion.eligibility.status} region ${regionId}`);

  const dashboardView = adapter.dashboard(checkedDashboard);
  assert(dashboardView.reference.id === checkedOverlay.dashboard.id,
    "overlay dashboard identity is stale relative to the supplied dashboard");
  const dashboardMatches = dashboardView.regions.filter((item) => item.loopId === regionId);
  assert(dashboardMatches.length === 1,
    `exact region identity must occur once in current dashboard: ${regionId}`);
  const dashboardRegion = dashboardMatches[0];
  const receipts = profileReceipts.map((receipt) => adapter.validateProfileReceipt(receipt));
  const profileViews = receipts.map((receipt) => adapter.profile(
    receipt, dashboardView, checkedOverlay.joinPolicy.minimumCoverage,
  ));
  const suppliedProfileIds = new Set(profileViews.map((view) => view.id));
  for (const observation of overlayRegion.observations) {
    assert(suppliedProfileIds.has(observation.profileId),
      `missing authenticated profile receipt ${observation.profileId} required by dossier region`);
  }
  const details = adapter.dossier({ dashboardRegion, overlayRegion,
    profileReceipts: receipts, profileViews });
  assert(details && details.currentIr && details.currentIr.program && details.currentIr.decision,
    "complete detached optimizer program and exact decision IR are required");
  const decisionMatches = overlayRegion.staticDecisions.filter(
    (decision) => decision.decisionId === details.currentIr.decisionId,
  );
  assert(decisionMatches.length === 1,
    "dossier current IR decision must match exactly one overlay static decision");
  const profileIds = sortedUnique(overlayRegion.observations.map((item) => item.profileId));
  assert(profileIds.length > 0, "dossier region must have authenticated profile observations");

  let recommendedAction = overlayRegion.recommendedAction;
  const required = [
    [details.currentIr.program, "complete optimizer IR"],
    [details.dynamicFallback, "dynamic fallback obligation"],
    [details.independentVerifier, "independent verifier obligation"],
    [details.oracles && details.oracles.length, "oracle obligations"],
    [details.benchmarkObligations && details.benchmarkObligations.length, "benchmark obligations"],
    [details.generality && details.generality.length, "held-out generality hypothesis"],
  ];
  const missing = required.filter(([present]) => !present).map(([, label]) => label);
  if (recommendedAction === "compiler-campaign" && missing.length > 0) {
    recommendedAction = "investigate";
  }
  const requiredList = (items, label) => items && items.length > 0
    ? sortedUnique(items) : [`MISSING: ${label}`];
  assert(Array.isArray(details.candidates) && details.candidates.length > 0,
    "at least one target candidate, including the generic control, is required");
  assert(Array.isArray(details.claims) && details.claims.length > 0,
    "at least one narrowly proposed file claim is required");
  const payload = {
    status: recommendedAction === "reject" ? "rejected"
      : recommendedAction === "already-optimized" ? "measured" : "draft",
    classification: overlayRegion.classification,
    recommendedAction,
    source: copy(overlayRegion.source),
    evidence: {
      dashboardId: checkedOverlay.dashboard.id,
      overlayId: checkedOverlay.id,
      profileIds,
    },
    excerpt: copy(details.excerpt),
    currentIr: copy(details.currentIr),
    facts: copy(details.facts),
    rejections: copy(details.rejections),
    costs: copy(details.costs),
    candidates: copy(details.candidates),
    unresolvedProofs: sortedUnique([...(details.unresolvedProofs || []),
      ...missing.map((item) => `missing: ${item}`)]),
    suggestedContract: copy(details.suggestedContract),
    witness: copy(details.witness),
    oracles: requiredList(details.oracles, "define an independent oracle"),
    adversarialObligations: sortedUnique(details.adversarialObligations || []),
    benchmarkObligations: requiredList(details.benchmarkObligations,
      "define cold, warm, compile, size, and resource benchmarks"),
    generality: requiredList(details.generality, "name a held-out consumer hypothesis"),
    negativeEvidence: sortedUnique(details.negativeEvidence || []),
    claims: sortedUnique(details.claims || []),
    integration: copy(details.integration),
    promotionCriteria: copy(details.promotionCriteria),
  };
  const document = adapter.attachIdentity(DOSSIER_SCHEMA, payload);
  return adapter.validateDossier(document, {
    overlayId: checkedOverlay.id,
    compilerDecision: {
      decisionId: details.currentIr.decisionId,
      passId: details.currentIr.passId,
      selected: details.currentIr.selected,
    },
  });
}

module.exports = { DOSSIER_SCHEMA, generateDossier };
