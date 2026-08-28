"use strict";

const crypto = require("node:crypto");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
  return value;
}

function cid(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function attachIdentity(schema, payload) {
  const id = cid(JSON.stringify(canonical({ schema, payload })));
  return Object.freeze({ schema, id, ...canonical(payload) });
}

function reason(code) {
  return { code, detail: {} };
}

const dashboardId = cid("dashboard:current");
const oldDashboardId = cid("dashboard:old");
const sourceUnitId = cid("source-unit");
const compilerId = cid("compiler");

function staticRegion(region) {
  const regionId = cid(region.identity.id);
  const evidence = region.staticEvidence;
  const source = {
    path: region.source.path,
    range: {
      startLine: region.source.start.line,
      startColumn: region.source.start.column,
      endLine: region.source.end.line,
      endColumn: region.source.end.column,
    },
    sourceUnitId,
    functionId: cid(`function:${region.owningFunction.qualifiedName}`),
    regionId,
  };
  const staticDecisions = (evidence.optimizer.decisions || [{ pass: "math.control.v1",
    decision: evidence.optimizer.selected ? "selected" : "observed" }]).map((decision, index) => ({
    decisionId: cid(`${regionId}:${decision.pass}:${index}`),
    passId: decision.pass,
    status: decision.decision,
    reasons: (evidence.optimizer.reasonCodes || []).map(reason),
  }));
  return {
    loopId: regionId,
    source,
    staticDecisions,
    classification: evidence.primaryClass,
    fallbackPreserving: evidence.fallbackPreservingTransformation === true,
    matureAlgorithmDisposition: evidence.matureAlgorithmDisposition || "unknown",
    negativeEvidence: evidence.primaryClass === "target-mismatch"
      ? ["generated JavaScript is 26x slower inclusively"] : [],
    ranking: {
      removableWallLower: region.identity.id === "region:hot" ? 20 : 0,
      affectedWorkloads: 1,
      nearMissDistance: evidence.nearMissDistance == null ? 9 : evidence.nearMissDistance,
      generality: (evidence.heldOutHypotheses || []).length,
      existingComponents: (evidence.existingComponents || []).length,
      semanticRisk: { low: 0, medium: 1, high: 2 }[evidence.semanticRisk] ?? 3,
      compilationCost: { low: 0, medium: 1, high: 2 }[evidence.compilationAndCodeSizeRisk] ?? 3,
      evidenceQuality: 3,
    },
    removableFraction: region.identity.id === "region:hot" ? { lower: 0.2, upper: 0.5 } : { lower: 0, upper: 0 },
    dossier: { ...evidence, source },
  };
}

const adapter = {
  reason,
  eligibilityReasons(gates) {
    const reasons = [];
    if (!gates.current) reasons.push(reason("evidence.stale-source"));
    if (!gates.coverageSatisfied) reasons.push(reason("evidence.unmatched-sample"));
    if (!gates.exactOutput) reasons.push(reason("telemetry.route-unavailable"));
    if (!gates.material) reasons.push(reason("dashboard.no-current-pass-claimed"));
    if (!gates.classificationKnown) reasons.push(reason("dashboard.no-current-pass-claimed"));
    if (!gates.fallbackPreserving) reasons.push(reason("dashboard.no-current-pass-claimed"));
    if (!gates.algorithmDispositionKnown) reasons.push(reason("dashboard.no-mathematical-domain-evidence"));
    return [...new Map(reasons.map((item) => [item.code, item])).values()];
  },
  attachIdentity,
  validateDashboard(value) { return value; },
  validateProfileReceipt(value) { return value; },
  validateHotnessOverlay(value) { return value; },
  validateDossier(value) { return value; },
  validateCampaign(value) { return value; },
  dashboard(value) {
    return {
      reference: {
        id: value.identity.id === "dashboard:current" ? dashboardId : oldDashboardId,
        digest: digest(value.identity.id),
        sourceBundleId: sourceUnitId,
        compilerId,
      },
      regions: value.regions.map(staticRegion),
    };
  },
  profile(value, staticView) {
    const current = value.dashboardIdentity.id === "dashboard:current";
    const total = value.samples.total;
    const attributed = value.observations.reduce((sum, item) => sum + item.selfSamples, 0);
    return {
      id: cid(value.identity.id),
      workloadId: cid(value.workloadIdentity.id),
      current,
      coverage: total === 0 ? 0 : attributed / total,
      exactOutput: value.output ? value.output.exact : false,
      samples: { total, attributed, ambiguous: value.samples.ambiguous, unmatched: value.samples.unmatched },
      observations: value.observations.map((item) => ({
        regionId: cid(item.regionIdentity.id),
        entryCount: 1,
        inclusiveSamples: item.selfSamples,
        exclusiveSamples: item.selfSamples,
        wallFraction: total === 0 ? 0 : item.selfSamples / total,
        confidence: 0.95,
      })),
      runtimeRoutes: value.observations.flatMap((item) => Object.entries(item.routes || {}).map(([target, count]) => ({
        regionId: cid(item.regionIdentity.id),
        target: target === "selected" ? "v8" : "generic",
        optimizedEntries: target === "selected" ? count : 0,
        fallbackEntries: target === "selected" ? 0 : count,
        errorEntries: 0,
      }))),
      unmatched: [
        ...(value.samples.unmatched ? [{ profileId: cid(value.identity.id), reason: reason("evidence.unmatched-sample"), count: value.samples.unmatched }] : []),
        ...(value.samples.ambiguous ? [{ profileId: cid(value.identity.id), reason: reason("evidence.ambiguous-source-map"), count: value.samples.ambiguous }] : []),
      ],
      reason,
      dashboardId: staticView.reference.id,
    };
  },
  dossier({ dashboardRegion, overlayRegion, profileReceipts }) {
    const evidence = dashboardRegion.dossier;
    const decision = overlayRegion.staticDecisions[0];
    const legacyDecision = {
      id: `legacy-${overlayRegion.source.range.startLine}`,
      passId: decision.passId,
      selected: decision.status === "selected",
      operations: ["load", "mul", "store"],
    };
    const program = { schema: "sagejs.optimizing-mathematics/v1", regions: [legacyDecision] };
    const negative = profileReceipts.flatMap((receipt) => receipt.observations)
      .filter((item) => cid(item.regionIdentity.id) === dashboardRegion.loopId)
      .flatMap((item) => item.negativeEvidence || [])
      .map((item) => `${item.candidate}: ${item.inclusiveRatio}x (${item.disposition})`);
    const zeroCounters = { boundaryCrossings: 0, copiedBytes: 0, materializations: 0, allocations: 0 };
    return {
      excerpt: { text: evidence.sourceExcerpt || "for i in range(n): pass", digest: digest(evidence.sourceExcerpt || "for i in range(n): pass") },
      currentIr: {
        reportDigest: digest(JSON.stringify(canonical(program))),
        program,
        decisionId: decision.decisionId,
        legacyDecisionId: legacyDecision.id,
        passId: decision.passId,
        selected: decision.status === "selected",
        decision: legacyDecision,
      },
      facts: {
        proven: (evidence.facts && evidence.facts.proven || []).map((kind) => ({ kind, authority: "static", evidence: "optimizer IR" })),
        guarded: (evidence.facts && evidence.facts.guarded || []).map((kind) => ({ kind, authority: "runtime-guard", evidence: "entry guard" })),
        unknown: (evidence.unresolvedProofSet || []).map((kind) => ({ kind, authority: "static", evidence: "rejected decision" })),
        invalidated: [],
      },
      rejections: decision.reasons,
      costs: { estimated: zeroCounters, observed: zeroCounters, dominant: "unknown" },
      candidates: (evidence.candidateTargets || ["generic"]).map((target) => ({
        id: `candidate-${target}`, target, representation: (evidence.candidateRepresentations || ["public objects"])[0],
        status: negative.length ? "rejected" : "unmeasured", reason: null,
        inclusiveEvidence: negative[0] || null,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      unresolvedProofs: evidence.unresolvedProofSet || [],
      suggestedContract: { requiredPassId: decision.passId, coverage: "all-loops", target: "auto", guardFailure: "fallback" },
      witness: { path: evidence.witness && evidence.witness.path || "test/fixtures/hot.py", digest: digest(JSON.stringify(evidence.witness || {})) },
      oracles: evidence.obligations && evidence.obligations.oracles || ["CPython", "O0"],
      adversarialObligations: evidence.adversarialCases || [],
      benchmarkObligations: ["cold", "warm", "compile", "size", "resource"],
      generality: (evidence.heldOutHypotheses || []).map((item) => `${item.consumer}: ${item.shape}`),
      negativeEvidence: negative,
      claims: evidence.claimedFiles || ["src/compiler/example.ts"],
      integration: { sharedFiles: evidence.sharedIntegrationRequirements || [], owner: "optimizer-integration" },
      promotionCriteria: { minimumEndToEndImprovement: 0.1, minimumPhaseImprovement: 0.5, maximumRegression: 0.02 },
      dynamicFallback: evidence.obligations && evidence.obligations.dynamicFallback,
      independentVerifier: evidence.obligations && evidence.obligations.independentVerifier,
    };
  },
  cid,
  digest,
  dashboardId,
};

module.exports = adapter;
