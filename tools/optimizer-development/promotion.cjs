"use strict";

// Collection helpers for promotion and browser evidence.  Promotion receipt
// semantics live in schemas.cjs: this module only fills recomputable fields,
// binds a draft to reviewed runtime evidence, and delegates validation.

const {
  array,
  attachIdentity,
  boolean,
  canonicalJson,
  contentId,
  detached,
  digest,
  documentIdentity,
  enumeration,
  exactKeys,
  nonemptyString,
  safeInteger,
  sha256,
} = require("./common.cjs");
const {
  SCHEMAS,
  computeComparisonStatistics,
  promotionDecision,
  validatePromotionReceipt: validateSharedPromotionReceipt,
} = require("./schemas.cjs");

const PROMOTION_SCHEMA = SCHEMAS.promotion;
const BROWSER_RECEIPT_SCHEMA = "sagejs.optimizer-browser-receipt/v1";
const DECISION_POLICY = "pilot-v1";
const PLATFORM_IDS = ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"];
const BROWSER_ENGINES = ["chromium", "firefox", "webkit"];
const LOSING_TARGETS = ["generic", "library", "native", "wasm"];

function defaultPromotionPolicy(overrides = {}) {
  const defaults = {
    id: DECISION_POLICY,
    minPairs: 11,
    bootstrapResamples: 10_000,
    confidence: 0.95,
    bootstrapSeedDigest: sha256("sagejs optimizer promotion pilot v1"),
    minimumEndToEndImprovement: 0.1,
    minimumPhaseImprovement: 0.5,
    minimumPhaseShare: 0.1,
    minimumPhaseEndToEndImprovement: 0.05,
    requiredConsumers: 2,
    maximumRegression: 0.03,
    requiredTargets: [...LOSING_TARGETS],
    requiredPlatforms: [...PLATFORM_IDS],
    requiredBrowsers: [...BROWSER_ENGINES],
  };
  const merged = { ...defaults, ...overrides };
  delete merged.digest;
  return Object.freeze({
    ...merged,
    digest: sha256(canonicalJson(merged)),
  });
}

function completedComparison(value, policy, salt) {
  exactKeys("comparison draft", value, ["unit", "pairs", "inclusive"]);
  const statistics = computeComparisonStatistics(value.pairs, policy, salt);
  return {
    unit: value.unit,
    pairs: detached(value.pairs),
    method: "paired-bootstrap-median-speedup-v1",
    ...statistics,
    inclusive: value.inclusive,
  };
}

function bindingState(current, actual, fields) {
  if (current === undefined) return "missing";
  return fields.every((field) =>
    canonicalJson(current[field]) === canonicalJson(actual[field])) ? "verified" : "mismatch";
}

function promotionBindings(document, context = {}) {
  const result = {
    checkout: bindingState(context.currentCheckout, document.candidate,
      [
        "commit", "tree", "sourceBundleId", "workspaceId", "clean", "compilerId", "artifactId",
        "profileIds",
      ]),
    build: bindingState(context.currentBuild, document.build,
      ["workspaceId", "receiptDigest", "outputsDigest"]),
    artifact: bindingState(context.currentArtifact, document.artifact,
      ["id", "sourceCommit", "sourceClosureId", "manifestDigest", "receiptDigest"]),
    browsers: document.browsers.filter((browser) =>
      Array.isArray(context.validatedBrowserReceiptIds) &&
      context.validatedBrowserReceiptIds.includes(browser.receiptId)).map(
      (browser) => browser.engine,
    ),
  };
  if (context.validatedInputs === undefined) {
    result.evidence = "missing";
    return result;
  }
  const cited = {
    campaignIds: [document.campaign.id],
    sourceBundleIds: [document.baseline.sourceBundleId, document.candidate.sourceBundleId],
    compilerIds: [document.baseline.compilerId, document.candidate.compilerId],
    artifactIds: [document.baseline.artifactId, document.candidate.artifactId],
    profileIds: [...document.baseline.profileIds, ...document.candidate.profileIds],
    workloadIds: [
      ...document.workloads,
      ...(document.performance.phase?.heldOutConsumers ?? []),
    ],
    correctnessEvidenceIds: document.correctness.map((item) => item.evidenceId),
    adversarialEvidenceIds: document.adversarial.map((item) => item.evidenceId),
    routeEvidenceIds: document.routes.map((item) => item.evidenceId),
    resourceEvidenceIds: document.resources.map((item) => item.evidenceId),
    platformEvidenceIds: document.platforms.map((item) => item.evidenceId),
    neighboringWorkloadIds: document.neighboring.map((item) => item.workloadId),
    losingCandidateEvidenceIds: document.losingCandidates.map((item) => item.evidenceId),
    dashboardIds: [document.dashboardDelta.beforeId, document.dashboardDelta.afterId],
    compilerDecisionIds: document.compilerDelta === null ? [] : [
      ...document.compilerDelta.beforeDecisionIds,
      ...document.compilerDelta.afterDecisionIds,
    ],
  };
  result.evidence = Object.entries(cited).every(([field, ids]) =>
    Array.isArray(context.validatedInputs[field]) &&
    ids.every((id) => context.validatedInputs[field].includes(id))) ? "verified" : "mismatch";
  return result;
}

function createPromotionReceipt(draft, context = {}) {
  const policy = draft.policy ?? defaultPromotionPolicy();
  const campaignId = draft.campaign?.id;
  const workloads = draft.workloads ?? [];
  const workloadSalt = workloads.join(",");
  const performance = {
    endToEnd: completedComparison(
      draft.performance.endToEnd,
      policy,
      `${campaignId}:${workloadSalt}:end-to-end`,
    ),
    phase: null,
  };
  if (draft.performance.phase !== null) {
    performance.phase = {
      id: draft.performance.phase.id,
      share: draft.performance.phase.share,
      comparison: completedComparison(
        draft.performance.phase.comparison,
        policy,
        `${campaignId}:${workloadSalt}:phase:${draft.performance.phase.id}`,
      ),
      heldOutConsumers: detached(draft.performance.phase.heldOutConsumers),
    };
  }
  const neighboring = draft.neighboring.map((item) => ({
    workloadId: item.workloadId,
    comparison: completedComparison(
      item.comparison,
      policy,
      `${campaignId}:neighbor:${item.workloadId}`,
    ),
  }));
  const core = detached({
    ...draft,
    authority: "promotion-validator",
    policy,
    performance,
    neighboring,
  });
  delete core.schema;
  delete core.id;
  delete core.decision;
  const decision = promotionDecision(core, promotionBindings(core, context));
  const receipt = attachIdentity(PROMOTION_SCHEMA, { ...core, decision });
  return validateSharedPromotionReceipt(receipt, context);
}

function validatePromotionReceipt(value, context = {}) {
  return validateSharedPromotionReceipt(value, context);
}

function validateGitObject(label, value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`optimizer browser evidence ${label}: must be a Git object id`);
  }
  return value;
}

function validateBrowserCheckout(label, value) {
  exactKeys(label, value, ["commit", "tree", "workspace_id", "clean"]);
  return {
    commit: validateGitObject(`${label}.commit`, value.commit),
    tree: validateGitObject(`${label}.tree`, value.tree),
    workspace_id: contentId(`${label}.workspace_id`, value.workspace_id),
    clean: boolean(`${label}.clean`, value.clean),
  };
}

function validateBrowserArtifact(label, value) {
  exactKeys(label, value, [
    "status", "kind", "id", "source_commit", "source_closure_id",
    "manifest_sha256", "receipt_sha256",
  ]);
  return {
    status: enumeration(`${label}.status`, value.status, ["verified", "invalid", "missing"]),
    kind: enumeration(`${label}.kind`, value.kind, ["wasm-production", "not-applicable"]),
    id: contentId(`${label}.id`, value.id),
    source_commit: validateGitObject(`${label}.source_commit`, value.source_commit),
    source_closure_id: contentId(`${label}.source_closure_id`, value.source_closure_id),
    manifest_sha256: digest(`${label}.manifest_sha256`, value.manifest_sha256),
    receipt_sha256: digest(`${label}.receipt_sha256`, value.receipt_sha256),
  };
}

function validateBrowserRoute(label, value) {
  exactKeys(label, value, [
    "pass_id", "selected", "lowering", "representation", "target", "fallback_id",
    "candidates",
  ]);
  return {
    pass_id: nonemptyString(`${label}.pass_id`, value.pass_id),
    selected: boolean(`${label}.selected`, value.selected),
    lowering: nonemptyString(`${label}.lowering`, value.lowering),
    representation: nonemptyString(`${label}.representation`, value.representation),
    target: nonemptyString(`${label}.target`, value.target),
    fallback_id: nonemptyString(`${label}.fallback_id`, value.fallback_id),
    candidates: array(`${label}.candidates`, value.candidates, (itemLabel, item) => {
      exactKeys(itemLabel, item, ["id", "kind", "availability", "rejection_reason"]);
      return {
        id: nonemptyString(`${itemLabel}.id`, item.id),
        kind: nonemptyString(`${itemLabel}.kind`, item.kind),
        availability: nonemptyString(`${itemLabel}.availability`, item.availability),
        rejection_reason: item.rejection_reason === null
          ? null
          : nonemptyString(`${itemLabel}.rejection_reason`, item.rejection_reason),
      };
    }, { uniqueBy: (item) => item.id }),
  };
}

function validateBrowserLevel(label, value) {
  exactKeys(label, value, ["output_sha256", "stderr_sha256", "routes"]);
  return {
    output_sha256: digest(`${label}.output_sha256`, value.output_sha256),
    stderr_sha256: digest(`${label}.stderr_sha256`, value.stderr_sha256),
    routes: array(`${label}.routes`, value.routes, validateBrowserRoute,
      { uniqueBy: (item) => `${item.pass_id}:${item.fallback_id}` }),
  };
}

function validateBrowserDomain(label, value) {
  exactKeys(label, value, [
    "domain", "source_sha256", "expected_pass_id", "status", "o0", "o2", "resources",
  ]);
  const o0 = validateBrowserLevel(`${label}.o0`, value.o0);
  const o2 = validateBrowserLevel(`${label}.o2`, value.o2);
  exactKeys(`${label}.resources`, value.resources,
    ["status", "before", "after_first", "after_second", "high_water", "ceiling"]);
  const resources = {
    status: enumeration(`${label}.resources.status`, value.resources.status,
      ["pass", "fail", "unavailable"]),
    before: safeInteger(`${label}.resources.before`, value.resources.before),
    after_first: safeInteger(`${label}.resources.after_first`, value.resources.after_first),
    after_second: safeInteger(`${label}.resources.after_second`, value.resources.after_second),
    high_water: safeInteger(`${label}.resources.high_water`, value.resources.high_water),
    ceiling: safeInteger(`${label}.resources.ceiling`, value.resources.ceiling),
  };
  if ((resources.high_water <= resources.ceiling) !== (resources.status === "pass") &&
      resources.status !== "unavailable") {
    throw new Error(`optimizer browser evidence ${label}.resources: status disagrees with ceiling`);
  }
  return {
    domain: nonemptyString(`${label}.domain`, value.domain),
    source_sha256: digest(`${label}.source_sha256`, value.source_sha256),
    expected_pass_id: nonemptyString(`${label}.expected_pass_id`, value.expected_pass_id),
    status: enumeration(`${label}.status`, value.status, ["pass", "fail"]),
    o0,
    o2,
    resources,
  };
}

function validateBrowserEngine(label, value) {
  exactKeys(label, value, [
    "engine", "version", "status", "diagnostics", "domains", "guard_fallback", "recovery",
    "source_sampling", "page_errors",
  ]);
  const diagnostics = value.diagnostics;
  exactKeys(`${label}.diagnostics`, diagnostics, [
    "cross_origin_isolated", "shared_array_buffer", "hardware_concurrency", "user_agent",
    "js_heap_size_limit",
  ]);
  const guard = value.guard_fallback;
  exactKeys(`${label}.guard_fallback`, guard,
    ["status", "pass_id", "optimized_output_sha256", "generic_output_sha256"]);
  const recovery = value.recovery;
  exactKeys(`${label}.recovery`, recovery,
    ["status", "interrupted", "recovered_output_sha256"]);
  const sourceSampling = value.source_sampling;
  exactKeys(`${label}.source_sampling`, sourceSampling, ["status", "reason_code"]);
  if (sourceSampling.status !== "unavailable" ||
      sourceSampling.reason_code !== "browser.uniform-source-sampling-unavailable") {
    throw new Error(
      `optimizer browser evidence ${label}.source_sampling: must disclaim browser source sampling`,
    );
  }
  return {
    engine: enumeration(`${label}.engine`, value.engine, BROWSER_ENGINES),
    version: nonemptyString(`${label}.version`, value.version),
    status: enumeration(`${label}.status`, value.status, ["pass", "fail"]),
    diagnostics: {
      cross_origin_isolated: boolean(`${label}.diagnostics.cross_origin_isolated`,
        diagnostics.cross_origin_isolated),
      shared_array_buffer: boolean(`${label}.diagnostics.shared_array_buffer`,
        diagnostics.shared_array_buffer),
      hardware_concurrency: safeInteger(`${label}.diagnostics.hardware_concurrency`,
        diagnostics.hardware_concurrency, 1),
      user_agent: nonemptyString(`${label}.diagnostics.user_agent`, diagnostics.user_agent),
      js_heap_size_limit: diagnostics.js_heap_size_limit === null
        ? null
        : safeInteger(`${label}.diagnostics.js_heap_size_limit`, diagnostics.js_heap_size_limit, 1),
    },
    domains: array(`${label}.domains`, value.domains, validateBrowserDomain,
      { minimum: 1, uniqueBy: (item) => item.domain }),
    guard_fallback: {
      status: enumeration(`${label}.guard_fallback.status`, guard.status, ["pass", "fail"]),
      pass_id: nonemptyString(`${label}.guard_fallback.pass_id`, guard.pass_id),
      optimized_output_sha256: digest(`${label}.guard_fallback.optimized_output_sha256`,
        guard.optimized_output_sha256),
      generic_output_sha256: digest(`${label}.guard_fallback.generic_output_sha256`,
        guard.generic_output_sha256),
    },
    recovery: {
      status: enumeration(`${label}.recovery.status`, recovery.status, ["pass", "fail"]),
      interrupted: boolean(`${label}.recovery.interrupted`, recovery.interrupted),
      recovered_output_sha256: digest(`${label}.recovery.recovered_output_sha256`,
        recovery.recovered_output_sha256),
    },
    source_sampling: { ...sourceSampling },
    page_errors: array(`${label}.page_errors`, value.page_errors,
      (itemLabel, item) => nonemptyString(itemLabel, item)),
  };
}

function createBrowserReceipt({ source, artifact, engines }) {
  return attachIdentity(BROWSER_RECEIPT_SCHEMA, {
    authority: "host-collector-with-private-evaluator-evidence",
    source: validateBrowserCheckout("browser receipt.source", source),
    artifact: validateBrowserArtifact("browser receipt.artifact", artifact),
    engines: array("browser receipt.engines", engines, validateBrowserEngine,
      { minimum: 1, uniqueBy: (item) => item.engine }),
  });
}

function validateBrowserReceipt(value, context = {}) {
  exactKeys("browser receipt", value,
    ["schema", "id", "authority", "source", "artifact", "engines"]);
  if (value.schema !== BROWSER_RECEIPT_SCHEMA) {
    throw new Error(`optimizer browser evidence browser receipt.schema: must be ${BROWSER_RECEIPT_SCHEMA}`);
  }
  contentId("browser receipt.id", value.id);
  if (value.authority !== "host-collector-with-private-evaluator-evidence") {
    throw new Error("optimizer browser evidence browser receipt.authority: invalid authority");
  }
  const expected = createBrowserReceipt(value);
  if (value.id !== documentIdentity(expected)) {
    throw new Error(`optimizer browser evidence browser receipt.id: is stale; expected ${expected.id}`);
  }
  if (context.current_checkout !== undefined &&
      canonicalJson(validateBrowserCheckout("context.current_checkout", context.current_checkout)) !==
      canonicalJson(expected.source)) {
    throw new Error("optimizer browser evidence browser receipt.source: does not match current checkout");
  }
  if (expected.artifact.kind !== "wasm-production" || expected.artifact.status !== "verified" ||
      expected.artifact.source_commit !== expected.source.commit) {
    throw new Error(
      "optimizer browser evidence browser receipt.artifact: must be a verified Wasm artifact built from this source commit",
    );
  }
  for (const engine of expected.engines) {
    if (engine.status !== "pass" || engine.page_errors.length ||
        engine.guard_fallback.status !== "pass" || engine.recovery.status !== "pass" ||
        engine.domains.some((domain) => domain.status !== "pass" ||
          domain.resources.status !== "pass" ||
          domain.o0.output_sha256 !== domain.o2.output_sha256 ||
          domain.o0.routes.some((route) => route.selected) ||
          !domain.o2.routes.some((route) => route.selected &&
            route.pass_id === domain.expected_pass_id))) {
      throw new Error(
        `optimizer browser evidence browser receipt.engines.${engine.engine}: failed route, differential, resource, or recovery evidence`,
      );
    }
    if (engine.guard_fallback.optimized_output_sha256 !==
        engine.guard_fallback.generic_output_sha256 || !engine.recovery.interrupted) {
      throw new Error(
        `optimizer browser evidence browser receipt.engines.${engine.engine}: guard fallback or interruption differential failed`,
      );
    }
  }
  return Object.freeze({ valid: true, receipt: expected });
}

module.exports = {
  BROWSER_ENGINES,
  BROWSER_RECEIPT_SCHEMA,
  DECISION_POLICY,
  PLATFORM_IDS,
  PROMOTION_SCHEMA,
  canonicalJson,
  completedComparison,
  createBrowserReceipt,
  createPromotionReceipt,
  defaultPromotionPolicy,
  promotionBindings,
  receiptIdentity: documentIdentity,
  validateBrowserReceipt,
  validatePromotionReceipt,
};
