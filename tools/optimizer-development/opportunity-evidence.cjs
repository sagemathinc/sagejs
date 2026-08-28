"use strict";

const {
  array,
  attachIdentity,
  canonicalJson,
  contentId,
  contentIdentity,
  deepFreeze,
  digest,
  documentIdentity,
  enumeration,
  exactKeys,
  fail,
  finiteNumber,
  identifier,
  nonemptyString,
  repositoryPath,
  safeInteger,
  stableName,
} = require("./common.cjs");
const {
  compilerIdentity,
  compilerImplementationsCompatible,
  sourceUnitIdentity,
  validateRange,
} = require("./identity.cjs");

const OPPORTUNITY_EVIDENCE_SCHEMA = "sagejs.optimizer-opportunity-evidence/v1";
const PAIRING_METHOD = "paired-abba-minimum-observed-improvement-v1";
const OPPORTUNITY_SCOPE_SCHEMA = "sagejs.optimizer-opportunity-scope/v1";
const MINIMUM_PAIRS = 11;
const TARGETS = ["v8", "wasm", "native", "library", "generic"];
const COMPILER_OPPORTUNITY_CLASS_NAMES = [
  "representation",
  "dynamic-dispatch-coercion",
  "boundary-dominated",
  "allocation-materialization",
  "compiler-rejection",
  "target-mismatch",
];
const COMPILER_OPPORTUNITY_CLASSES = new Set(COMPILER_OPPORTUNITY_CLASS_NAMES);
const CLASSIFICATIONS = [
  "algorithmic",
  "repeated-proof-state",
  ...COMPILER_OPPORTUNITY_CLASS_NAMES,
  "cold-startup-dominated",
  "unknown",
];
const MATURE_ALGORITHM_DISPOSITIONS = [
  "not-duplicate",
  "mature-algorithm-available",
  "no-mature-implementation",
  "unresolved",
];

function assert(condition, label, message) {
  if (!condition) fail(label, message);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function median(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function expectedOrder(index) {
  return ["AB", "BA", "BA", "AB"][index % 4];
}

function normalizePair(label, value, index) {
  exactKeys(label, value, [
    "order",
    "baselineMicroseconds",
    "feasibleLowerBoundMicroseconds",
    "baselineOutputDigest",
    "feasibleOutputDigest",
  ]);
  const order = enumeration(`${label}.order`, value.order, ["AB", "BA"]);
  assert(order === expectedOrder(index), `${label}.order`,
    `must follow deterministic ABBA order; expected ${expectedOrder(index)}`);
  const baselineOutputDigest = digest(
    `${label}.baselineOutputDigest`, value.baselineOutputDigest,
  );
  const feasibleOutputDigest = digest(
    `${label}.feasibleOutputDigest`, value.feasibleOutputDigest,
  );
  assert(baselineOutputDigest === feasibleOutputDigest, label,
    "baseline and feasible outputs must be exactly equal");
  return {
    order,
    baselineMicroseconds: safeInteger(
      `${label}.baselineMicroseconds`, value.baselineMicroseconds, 1,
    ),
    feasibleLowerBoundMicroseconds: safeInteger(
      `${label}.feasibleLowerBoundMicroseconds`, value.feasibleLowerBoundMicroseconds, 1,
    ),
    baselineOutputDigest,
    feasibleOutputDigest,
  };
}

function normalizePairs(label, value) {
  let index = 0;
  return array(label, value, (itemLabel, item) => {
    const result = normalizePair(itemLabel, item, index);
    index += 1;
    return result;
  }, { minimum: MINIMUM_PAIRS });
}

/**
 * Compute the intentionally conservative empirical lower bound used to choose
 * a prospective campaign. This is not a population confidence interval. A
 * positive result means every one of at least eleven ABBA-paired observations
 * improved, and the claimed wall-time saving is no larger than the worst
 * observed paired saving.
 */
function computeOpportunityStatistics(rawPairs) {
  const pairs = normalizePairs("opportunity pairs", rawPairs);
  const baseline = pairs.map((pair) => pair.baselineMicroseconds);
  const feasible = pairs.map((pair) => pair.feasibleLowerBoundMicroseconds);
  const differences = pairs.map((pair) =>
    pair.baselineMicroseconds - pair.feasibleLowerBoundMicroseconds);
  const minimumDifference = Math.min(...differences);
  const removableWallLowerMicroseconds = Math.max(0, minimumDifference);
  const baselineMaximumMicroseconds = Math.max(...baseline);
  return deepFreeze({
    pairCount: pairs.length,
    baselineMedianMicroseconds: median(baseline),
    baselineMaximumMicroseconds,
    feasibleMedianMicroseconds: median(feasible),
    pairedDifferenceMedianMicroseconds: median(differences),
    pairedDifferenceMinimumMicroseconds: minimumDifference,
    positivePairs: differences.filter((difference) => difference > 0).length,
    removableWallLowerMicroseconds,
    removableFractionLower: removableWallLowerMicroseconds / baselineMaximumMicroseconds,
  });
}

function normalizeStatistics(label, value) {
  exactKeys(label, value, [
    "pairCount",
    "baselineMedianMicroseconds",
    "baselineMaximumMicroseconds",
    "feasibleMedianMicroseconds",
    "pairedDifferenceMedianMicroseconds",
    "pairedDifferenceMinimumMicroseconds",
    "positivePairs",
    "removableWallLowerMicroseconds",
    "removableFractionLower",
  ]);
  return {
    pairCount: safeInteger(`${label}.pairCount`, value.pairCount, MINIMUM_PAIRS),
    baselineMedianMicroseconds: finiteNumber(
      `${label}.baselineMedianMicroseconds`, value.baselineMedianMicroseconds, 1,
    ),
    baselineMaximumMicroseconds: safeInteger(
      `${label}.baselineMaximumMicroseconds`, value.baselineMaximumMicroseconds, 1,
    ),
    feasibleMedianMicroseconds: finiteNumber(
      `${label}.feasibleMedianMicroseconds`, value.feasibleMedianMicroseconds, 1,
    ),
    pairedDifferenceMedianMicroseconds: finiteNumber(
      `${label}.pairedDifferenceMedianMicroseconds`, value.pairedDifferenceMedianMicroseconds,
    ),
    pairedDifferenceMinimumMicroseconds: finiteNumber(
      `${label}.pairedDifferenceMinimumMicroseconds`, value.pairedDifferenceMinimumMicroseconds,
    ),
    positivePairs: safeInteger(`${label}.positivePairs`, value.positivePairs),
    removableWallLowerMicroseconds: safeInteger(
      `${label}.removableWallLowerMicroseconds`, value.removableWallLowerMicroseconds,
    ),
    removableFractionLower: finiteNumber(
      `${label}.removableFractionLower`, value.removableFractionLower, 0, 1,
    ),
  };
}

function normalizeCompiler(label, value) {
  exactKeys(label, value, [
    "schema",
    "id",
    "irSchema",
    "compilerSourceBundleId",
    "frontendDigest",
    "catalogDigest",
    "optionsDigest",
  ]);
  const expected = compilerIdentity({
    irSchema: value.irSchema,
    compilerSourceBundleId: value.compilerSourceBundleId,
    frontendDigest: value.frontendDigest,
    catalogDigest: value.catalogDigest,
    optionsDigest: value.optionsDigest,
  });
  assert(value.schema === expected.schema && value.id === expected.id,
    `${label}.id`, `is stale; expected ${expected.id}`);
  return expected;
}

function normalizeSource(label, value) {
  exactKeys(label, value, [
    "path",
    "range",
    "sourceUnitId",
    "functionId",
    "regionId",
    "semanticFingerprint",
    "excerptDigest",
  ]);
  return {
    path: repositoryPath(`${label}.path`, value.path),
    range: validateRange(`${label}.range`, value.range),
    sourceUnitId: contentId(`${label}.sourceUnitId`, value.sourceUnitId),
    functionId: contentId(`${label}.functionId`, value.functionId),
    regionId: contentId(`${label}.regionId`, value.regionId),
    semanticFingerprint: contentId(
      `${label}.semanticFingerprint`, value.semanticFingerprint,
    ),
    excerptDigest: digest(`${label}.excerptDigest`, value.excerptDigest),
  };
}

function opportunityScopeIdentity(payload) {
  return contentIdentity(OPPORTUNITY_SCOPE_SCHEMA, payload);
}

function normalizeScope(label, value) {
  exactKeys(label, value, [
    "id",
    "candidateScope",
    "phaseId",
    "path",
    "range",
    "sourceUnitId",
    "functionId",
    "primaryRegionId",
    "hotChildRegionIds",
  ]);
  const payload = {
    candidateScope: enumeration(`${label}.candidateScope`, value.candidateScope,
      ["fused-outer-region", "inner-loop-only"]),
    phaseId: identifier(`${label}.phaseId`, value.phaseId),
    path: repositoryPath(`${label}.path`, value.path),
    range: validateRange(`${label}.range`, value.range),
    sourceUnitId: contentId(`${label}.sourceUnitId`, value.sourceUnitId),
    functionId: contentId(`${label}.functionId`, value.functionId),
    primaryRegionId: contentId(`${label}.primaryRegionId`, value.primaryRegionId),
    hotChildRegionIds: array(`${label}.hotChildRegionIds`, value.hotChildRegionIds,
      (itemLabel, item) => contentId(itemLabel, item), {
        uniqueBy: (item) => item,
        sortedBy: (item) => item,
      }),
  };
  const id = contentId(`${label}.id`, value.id);
  const expectedId = opportunityScopeIdentity(payload);
  assert(id === expectedId, `${label}.id`, `is stale; expected ${expectedId}`);
  return { id, ...payload };
}

function normalizeProfileReferences(label, value) {
  exactKeys(label, value, [
    "baselineId",
    "feasibleLowerBoundId",
    "negativeIds",
  ]);
  const baselineId = contentId(`${label}.baselineId`, value.baselineId);
  const feasibleLowerBoundId = contentId(
    `${label}.feasibleLowerBoundId`, value.feasibleLowerBoundId,
  );
  assert(baselineId !== feasibleLowerBoundId, label,
    "baseline and feasible lower-bound profiles must be distinct");
  const negativeIds = array(`${label}.negativeIds`, value.negativeIds,
    (itemLabel, item) => contentId(itemLabel, item), {
      minimum: 1,
      uniqueBy: (item) => item,
      sortedBy: (item) => item,
    });
  assert(!negativeIds.includes(baselineId) && !negativeIds.includes(feasibleLowerBoundId),
    label, "negative profiles must be distinct from baseline and feasible profiles");
  return { baselineId, feasibleLowerBoundId, negativeIds };
}

function normalizeNegativeEvidence(label, value) {
  return array(label, value, (itemLabel, item) => {
    exactKeys(itemLabel, item, [
      "profileId",
      "target",
      "disposition",
      "medianMicroseconds",
      "slowdownVersusFeasible",
      "summary",
    ]);
    return {
      profileId: contentId(`${itemLabel}.profileId`, item.profileId),
      target: enumeration(`${itemLabel}.target`, item.target, TARGETS),
      disposition: enumeration(`${itemLabel}.disposition`, item.disposition, [
        "measured-slower",
        "inconclusive",
      ]),
      medianMicroseconds: finiteNumber(
        `${itemLabel}.medianMicroseconds`, item.medianMicroseconds, 1,
      ),
      slowdownVersusFeasible: finiteNumber(
        `${itemLabel}.slowdownVersusFeasible`, item.slowdownVersusFeasible, 0,
      ),
      summary: nonemptyString(`${itemLabel}.summary`, item.summary),
    };
  }, {
    minimum: 1,
    uniqueBy: (item) => item.profileId,
    sortedBy: (item) => item.profileId,
  });
}

function normalizeDocument(value) {
  const label = "opportunity evidence";
  exactKeys(label, value, [
    "schema",
    "id",
    "status",
    "dashboard",
    "compiler",
    "compilerDecision",
    "source",
    "scope",
    "workload",
    "profiles",
    "feasibleCandidate",
    "measurement",
    "classification",
    "matureAlgorithm",
    "negativeEvidence",
  ]);
  assert(value.schema === OPPORTUNITY_EVIDENCE_SCHEMA, `${label}.schema`,
    `unknown schema ${value.schema}`);
  exactKeys(`${label}.dashboard`, value.dashboard, [
    "id", "sourceBundleId", "compilerId",
  ]);
  const dashboard = {
    id: contentId(`${label}.dashboard.id`, value.dashboard.id),
    sourceBundleId: contentId(
      `${label}.dashboard.sourceBundleId`, value.dashboard.sourceBundleId,
    ),
    compilerId: contentId(`${label}.dashboard.compilerId`, value.dashboard.compilerId),
  };
  exactKeys(`${label}.workload`, value.workload, ["id", "inputDigest", "corpusId"]);
  const workload = {
    id: contentId(`${label}.workload.id`, value.workload.id),
    inputDigest: digest(`${label}.workload.inputDigest`, value.workload.inputDigest),
    corpusId: identifier(`${label}.workload.corpusId`, value.workload.corpusId),
  };
  exactKeys(`${label}.compilerDecision`, value.compilerDecision, ["decisionId", "passId"]);
  const compilerDecision = {
    decisionId: contentId(
      `${label}.compilerDecision.decisionId`, value.compilerDecision.decisionId,
    ),
    passId: stableName(`${label}.compilerDecision.passId`, value.compilerDecision.passId),
  };
  exactKeys(`${label}.feasibleCandidate`, value.feasibleCandidate, [
    "id", "target", "status", "representation", "compilerRoute", "scopeId",
    "candidateScope",
  ]);
  const feasibleCandidate = {
    id: identifier(`${label}.feasibleCandidate.id`, value.feasibleCandidate.id),
    target: enumeration(
      `${label}.feasibleCandidate.target`, value.feasibleCandidate.target, TARGETS,
    ),
    status: enumeration(`${label}.feasibleCandidate.status`,
      value.feasibleCandidate.status, ["lower-bound-only"]),
    representation: nonemptyString(
      `${label}.feasibleCandidate.representation`, value.feasibleCandidate.representation,
    ),
    compilerRoute: enumeration(`${label}.feasibleCandidate.compilerRoute`,
      value.feasibleCandidate.compilerRoute, ["none"]),
    scopeId: contentId(`${label}.feasibleCandidate.scopeId`,
      value.feasibleCandidate.scopeId),
    candidateScope: enumeration(`${label}.feasibleCandidate.candidateScope`,
      value.feasibleCandidate.candidateScope,
      ["fused-outer-region", "inner-loop-only"]),
  };
  exactKeys(`${label}.measurement`, value.measurement,
    ["method", "scope", "pairs", "statistics"]);
  const pairs = normalizePairs(`${label}.measurement.pairs`, value.measurement.pairs);
  const statistics = normalizeStatistics(
    `${label}.measurement.statistics`, value.measurement.statistics,
  );
  exactKeys(`${label}.classification`, value.classification,
    ["primary", "rationale", "profileIds"]);
  const classification = {
    primary: enumeration(`${label}.classification.primary`,
      value.classification.primary, CLASSIFICATIONS),
    rationale: nonemptyString(`${label}.classification.rationale`,
      value.classification.rationale),
    profileIds: array(`${label}.classification.profileIds`,
      value.classification.profileIds,
      (itemLabel, item) => contentId(itemLabel, item), {
        minimum: 1,
        uniqueBy: (item) => item,
        sortedBy: (item) => item,
      }),
  };
  exactKeys(`${label}.matureAlgorithm`, value.matureAlgorithm,
    ["disposition", "rationale", "profileIds"]);
  const matureAlgorithm = {
    disposition: enumeration(`${label}.matureAlgorithm.disposition`,
      value.matureAlgorithm.disposition, MATURE_ALGORITHM_DISPOSITIONS),
    rationale: nonemptyString(`${label}.matureAlgorithm.rationale`,
      value.matureAlgorithm.rationale),
    profileIds: array(`${label}.matureAlgorithm.profileIds`,
      value.matureAlgorithm.profileIds,
      (itemLabel, item) => contentId(itemLabel, item), {
        minimum: 1,
        uniqueBy: (item) => item,
        sortedBy: (item) => item,
      }),
  };
  return {
    schema: value.schema,
    id: contentId(`${label}.id`, value.id),
    status: enumeration(`${label}.status`, value.status,
      ["eligible", "inconclusive", "rejected"]),
    dashboard,
    compiler: normalizeCompiler(`${label}.compiler`, value.compiler),
    compilerDecision,
    source: normalizeSource(`${label}.source`, value.source),
    scope: normalizeScope(`${label}.scope`, value.scope),
    workload,
    profiles: normalizeProfileReferences(`${label}.profiles`, value.profiles),
    feasibleCandidate,
    measurement: {
      method: enumeration(`${label}.measurement.method`, value.measurement.method,
        [PAIRING_METHOD]),
      scope: enumeration(`${label}.measurement.scope`, value.measurement.scope,
        ["complete-warm-workload", "reviewed-phase"]),
      pairs,
      statistics,
    },
    classification,
    matureAlgorithm,
    negativeEvidence: normalizeNegativeEvidence(
      `${label}.negativeEvidence`, value.negativeEvidence,
    ),
  };
}

function defaultAdapter() {
  const repository = require("./repository-adapter.cjs");
  const { validateProfileReceipt, validateWorkload } = require("./schemas.cjs");
  return {
    validateDashboard: repository.validateDashboard,
    validateWorkload,
    validateProfileReceipt,
  };
}

function requireAdapter(adapter) {
  for (const name of ["validateDashboard", "validateWorkload", "validateProfileReceipt"]) {
    assert(adapter && typeof adapter[name] === "function", "adapter", `${name} is required`);
  }
  return adapter;
}

function exactProfileOutput(label, profile, workload) {
  assert(profile.workload.id === workload.id, `${label}.workload.id`,
    "does not match the reviewed workload");
  assert(profile.outcome.status === "success" && profile.output.digest !== null,
    `${label}.outcome`, "must be a successful exact workload run");
  const observed = new Map(profile.output.oracleResults.map((oracle) => [oracle.id, oracle]));
  for (const oracle of workload.oracles) {
    const result = observed.get(oracle.id);
    assert(result && result.status === "pass", `${label}.output.oracleResults`,
      `missing passing workload oracle ${oracle.id}`);
    assert(result.digest === oracle.expectedDigest, `${label}.output.oracleResults`,
      `oracle ${oracle.id} digest does not match the workload contract`);
  }
  return profile.output.digest;
}

function profileContainsSource(profile, source) {
  return profile.sourceBundle.files.some((file) => {
    if (file.path !== source.path) return false;
    return sourceUnitIdentity({ path: file.path, digest: file.digest, language: "python" }).id ===
      source.sourceUnitId;
  });
}

function exactCandidate(candidate, source, includeRange) {
  if (candidate.sourceUnitId !== source.sourceUnitId ||
      candidate.functionId !== source.functionId || candidate.regionId !== source.regionId) {
    return false;
  }
  if (!includeRange) return true;
  return candidate.path === source.path && same(candidate.range, source.range);
}

function attributedRegionTicks(profile, sources) {
  return profile.sampling.positionTicks.reduce((total, tick) => {
    if (tick.mapping.status !== "attributed") return total;
    return sources.some((source) => exactCandidate(
      tick.mapping.candidates[0], source, true,
    )) ? total + tick.ticks : total;
  }, 0);
}

function carriesCompilerRoute(profile, sources) {
  const regionIds = new Set(sources.map((source) => source.regionId));
  if (profile.optimizer.regions.some((region) =>
    regionIds.has(region.regionId) && region.selected)) return true;
  return profile.runtime.routeEvents.some((event) => event.mapping.status === "attributed" &&
    sources.some((source) => exactCandidate(
      event.mapping.candidates[0], source, false,
    )));
}

function sameHostAndEnvironment(left, right) {
  return same(left.host, right.host) &&
    left.configuration.environmentDigest === right.configuration.environmentDigest &&
    left.configuration.mode === right.configuration.mode;
}

function sameHostAndMode(left, right) {
  return same(left.host, right.host) &&
    left.configuration.mode === right.configuration.mode;
}

function requireWarmSealedBaseline(profile) {
  const protocol = profile.sampling.protocol;
  assert(protocol && typeof protocol === "object",
    "opportunity evidence.profiles.baselineId",
    "requires an explicit warm prepared sealed sampling protocol");
  assert(protocol.scope ===
    "warm-prepared-sealed-generated-javascript-execution",
  "opportunity evidence.profiles.baselineId",
  "requires warm-prepared-sealed generated-JavaScript source sampling");
  safeInteger("baseline sampling protocol.preparationMicroseconds",
    protocol.preparationMicroseconds);
  safeInteger("baseline sampling protocol.warmupRuns", protocol.warmupRuns, 1);
  safeInteger("baseline sampling protocol.repetitions", protocol.repetitions, 1);
  const declared = safeInteger("baseline sampling protocol.declaredArtifactCount",
    protocol.declaredArtifactCount, 1);
  const authenticated = safeInteger(
    "baseline sampling protocol.authenticatedArtifactCount",
    protocol.authenticatedArtifactCount, 1,
  );
  assert(declared === authenticated,
    "opportunity evidence.profiles.baselineId",
    "requires every declared artifact to be authenticated before sampling");
  assert(safeInteger("baseline sampling protocol.lateArtifactCount",
    protocol.lateArtifactCount) === 0,
  "opportunity evidence.profiles.baselineId",
  "requires zero artifacts declared after the closure was sealed");
  digest("baseline sampling protocol.closureDigest", protocol.closureDigest);
}

function dashboardSource(dashboard, source) {
  const matches = dashboard.loops.filter((loop) => loop.id === source.regionId);
  assert(matches.length === 1, "opportunity evidence.source.regionId",
    `must identify exactly one current dashboard region; found ${matches.length}`);
  const loop = matches[0];
  const actual = {
    path: loop.source.path,
    range: {
      startLine: loop.source.line,
      startColumn: loop.source.column,
      endLine: loop.source.endLine,
      endColumn: loop.source.endColumn,
    },
    sourceUnitId: loop.sourceUnitId,
    functionId: loop.functionId,
    regionId: loop.id,
    semanticFingerprint: loop.semanticFingerprint,
    excerptDigest: loop.excerptDigest,
  };
  assert(loop.functionId !== null, "opportunity evidence.source.functionId",
    "module-scope loops cannot be prospective compiler opportunities");
  assert(same(source, actual), "opportunity evidence.source",
    "does not match the exact current dashboard region");
  return loop;
}

function rangeContains(outer, inner) {
  const startsBefore = outer.startLine < inner.startLine ||
    (outer.startLine === inner.startLine && outer.startColumn <= inner.startColumn);
  const endsAfter = outer.endLine > inner.endLine ||
    (outer.endLine === inner.endLine && outer.endColumn >= inner.endColumn);
  return startsBefore && endsAfter;
}

function normalizedLoopSource(loop) {
  return {
    path: loop.source.path,
    range: {
      startLine: loop.source.line,
      startColumn: loop.source.column,
      endLine: loop.source.endLine,
      endColumn: loop.source.endColumn,
    },
    sourceUnitId: loop.sourceUnitId,
    functionId: loop.functionId,
    regionId: loop.id,
  };
}

function dashboardScope(dashboard, scope, primarySource) {
  assert(scope.path === primarySource.path &&
    scope.sourceUnitId === primarySource.sourceUnitId &&
    scope.functionId === primarySource.functionId &&
    scope.primaryRegionId === primarySource.regionId,
  "opportunity evidence.scope",
  "does not bind the selected primary source region");
  assert(rangeContains(scope.range, primarySource.range),
    "opportunity evidence.scope.range", "does not contain the selected region");
  if (scope.candidateScope === "fused-outer-region") {
    assert(scope.hotChildRegionIds.length > 0,
      "opportunity evidence.scope.hotChildRegionIds",
      "a fused outer-region scope requires at least one exact hot child");
  } else {
    assert(scope.hotChildRegionIds.length === 0,
      "opportunity evidence.scope.hotChildRegionIds",
      "an inner-loop-only scope cannot cite fused child regions");
    assert(same(scope.range, primarySource.range),
      "opportunity evidence.scope.range",
      "an inner-loop-only scope must equal its selected region range");
  }
  const children = scope.hotChildRegionIds.map((regionId) => {
    const matches = dashboard.loops.filter((loop) => loop.id === regionId);
    assert(matches.length === 1, "opportunity evidence.scope.hotChildRegionIds",
      `must resolve ${regionId} exactly once in the current dashboard`);
    const child = normalizedLoopSource(matches[0]);
    assert(child.sourceUnitId === scope.sourceUnitId &&
      child.functionId === scope.functionId && child.path === scope.path,
    "opportunity evidence.scope.hotChildRegionIds",
    `child ${regionId} is not in the scoped function and source unit`);
    assert(rangeContains(scope.range, child.range),
      "opportunity evidence.scope.range", `does not contain child ${regionId}`);
    return child;
  });
  return [primarySource, ...children];
}

/**
 * Validate a reviewed opportunity document against current, independently
 * validated repository evidence. The adapter boundary is deliberately only
 * validation; it cannot project or manufacture IDs used by this contract.
 */
function validateOpportunityEvidence(value, context, adapter = context?.adapter || defaultAdapter()) {
  const normalized = normalizeDocument(value);
  requireAdapter(adapter);
  assert(context && context.dashboard && context.workload &&
    Array.isArray(context.profileReceipts), "context",
  "dashboard, workload, and profileReceipts are required");
  const dashboard = adapter.validateDashboard(context.dashboard);
  const workload = adapter.validateWorkload(context.workload);
  const profiles = context.profileReceipts.map((profile) =>
    adapter.validateProfileReceipt(profile));
  const profilesById = new Map();
  for (const profile of profiles) {
    assert(!profilesById.has(profile.id), "context.profileReceipts",
      `contains duplicate profile ${profile.id}`);
    profilesById.set(profile.id, profile);
  }

  const dashboardReference = {
    id: dashboard.id,
    sourceBundleId: dashboard.sourceBundle.id,
    compilerId: dashboard.compilerIdentity.id,
  };
  assert(same(normalized.dashboard, dashboardReference), "opportunity evidence.dashboard",
    "does not match the exact current dashboard");
  assert(same(normalized.compiler, dashboard.compilerIdentity),
    "opportunity evidence.compiler",
    "implementation tuple does not match the current dashboard compiler");
  const primaryLoop = dashboardSource(dashboard, normalized.source);
  const matchingDecisions = primaryLoop.decisions.filter((decision) =>
    decision.id === normalized.compilerDecision.decisionId &&
    decision.passId === normalized.compilerDecision.passId);
  assert(matchingDecisions.length === 1,
    "opportunity evidence.compilerDecision",
    "does not identify exactly one current dashboard decision for the reviewed region");
  const scopedSources = dashboardScope(dashboard, normalized.scope, normalized.source);
  const workloadReference = {
    id: workload.id,
    inputDigest: workload.input.digest,
    corpusId: workload.corpus.id,
  };
  assert(same(normalized.workload, workloadReference), "opportunity evidence.workload",
    "does not match the exact validated workload");
  assert(Array.isArray(workload.phases) && workload.phases.some((phase) =>
    phase.id === normalized.scope.phaseId), "opportunity evidence.scope.phaseId",
  "does not name a phase in the exact validated workload");
  assert(normalized.feasibleCandidate.scopeId === normalized.scope.id &&
    normalized.feasibleCandidate.candidateScope === normalized.scope.candidateScope,
  "opportunity evidence.feasibleCandidate",
  "does not bind the exact reviewed composite scope");

  const referencedIds = [
    normalized.profiles.baselineId,
    normalized.profiles.feasibleLowerBoundId,
    ...normalized.profiles.negativeIds,
  ];
  const referenced = referencedIds.map((id) => {
    const profile = profilesById.get(id);
    assert(profile, "opportunity evidence.profiles", `missing validated profile ${id}`);
    assert(compilerImplementationsCompatible(profile.compiler, normalized.compiler),
      `profile ${id}.compiler`,
      "does not match the reviewed compiler implementation tuple");
    exactProfileOutput(`profile ${id}`, profile, workload);
    return profile;
  });
  const baseline = referenced[0];
  const feasible = referenced[1];
  assert(profileContainsSource(baseline, normalized.source),
    `profile ${baseline.id}.sourceBundle`,
    "does not contain the exact reviewed source unit");
  requireWarmSealedBaseline(baseline);
  assert(sameHostAndMode(baseline, feasible), "opportunity evidence.profiles",
    "baseline and feasible profiles must use the same host and language mode");
  assert(attributedRegionTicks(baseline, scopedSources) > 0,
    "opportunity evidence.profiles.baselineId",
    "baseline profile has no authenticated samples for the exact region");
  assert(!carriesCompilerRoute(feasible, scopedSources),
    "opportunity evidence.feasibleCandidate",
    "lower-bound-only evidence must not claim an optimizer-selected or runtime route");
  assert(feasible.configuration.target === normalized.feasibleCandidate.target,
    "opportunity evidence.feasibleCandidate.target",
    "does not match its validated profile target");
  if (normalized.measurement.scope === "reviewed-phase") {
    for (const [name, profile] of [["baseline", baseline], ["feasible", feasible]]) {
      assert(profile.phases.some((phase) => phase.id === normalized.scope.phaseId),
        `opportunity evidence.profiles.${name}`,
        `does not measure reviewed phase ${normalized.scope.phaseId}`);
    }
  }

  const pairs = normalized.measurement.pairs;
  assert(workload.protocol.repetitions === pairs.length,
    "opportunity evidence.measurement.pairs",
    "count must match the reviewed workload repetitions");
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    assert(pair.baselineOutputDigest === baseline.output.digest &&
      pair.feasibleOutputDigest === feasible.output.digest,
    `opportunity evidence.measurement.pairs[${index}]`,
    "output digests do not match the validated profiles");
  }
  const expectedStatistics = computeOpportunityStatistics(pairs);
  assert(same(normalized.measurement.statistics, expectedStatistics),
    "opportunity evidence.measurement.statistics",
    "does not match the conservative statistics recomputed from raw pairs");

  const referencedSet = new Set(referencedIds);
  for (const profileId of [
    ...normalized.classification.profileIds,
    ...normalized.matureAlgorithm.profileIds,
  ]) {
    assert(referencedSet.has(profileId), "opportunity evidence review",
      `cites unreviewed profile ${profileId}`);
  }
  assert(normalized.classification.profileIds.includes(baseline.id),
    "opportunity evidence.classification.profileIds",
    "must cite the authenticated baseline attribution profile");
  assert(normalized.negativeEvidence.length === normalized.profiles.negativeIds.length,
    "opportunity evidence.negativeEvidence",
    "must preserve every declared negative profile exactly once");
  const negativeById = new Map(normalized.negativeEvidence.map((item) => [item.profileId, item]));
  for (const profileId of normalized.profiles.negativeIds) {
    const evidence = negativeById.get(profileId);
    assert(evidence, "opportunity evidence.negativeEvidence",
      `is missing profile ${profileId}`);
    const profile = profilesById.get(profileId);
    assert(sameHostAndEnvironment(feasible, profile),
      `opportunity evidence.negativeEvidence ${profileId}`,
      "must use the same host, mode, and environment as the feasible profile");
    assert(profile.configuration.target === evidence.target,
      `opportunity evidence.negativeEvidence ${profileId}.target`,
      "does not match the validated profile target");
    const observedMedian = profile.execution.warm.median;
    const slowdown = observedMedian / expectedStatistics.feasibleMedianMicroseconds;
    assert(evidence.medianMicroseconds === observedMedian &&
      evidence.slowdownVersusFeasible === slowdown,
    `opportunity evidence.negativeEvidence ${profileId}`,
    "comparative statistics do not match the validated profile");
    if (evidence.disposition === "measured-slower") {
      assert(observedMedian > expectedStatistics.feasibleMedianMicroseconds,
        `opportunity evidence.negativeEvidence ${profileId}.disposition`,
        "measured-slower requires a slower validated median");
    }
  }

  if (normalized.status === "eligible") {
    assert(matchingDecisions[0].selected === false,
      "opportunity evidence.compilerDecision",
      "an eligible prospective compiler opportunity cannot bind an already-selected decision");
    assert(expectedStatistics.removableWallLowerMicroseconds > 0 &&
      expectedStatistics.positivePairs === expectedStatistics.pairCount,
    "opportunity evidence.status",
    "eligible evidence requires a positive conservative bound from every pair");
    assert(COMPILER_OPPORTUNITY_CLASSES.has(normalized.classification.primary),
      "opportunity evidence.classification.primary",
      "eligible compiler evidence requires a compiler opportunity classification");
    assert(normalized.matureAlgorithm.disposition === "not-duplicate",
      "opportunity evidence.matureAlgorithm.disposition",
      "eligible compiler evidence must rule out duplicating a mature algorithm");
  }

  const expectedId = documentIdentity(normalized);
  assert(normalized.id === expectedId, "opportunity evidence.id",
    `is stale; expected ${expectedId}`);
  return deepFreeze(normalized);
}

/** Build and immediately validate a content-addressed opportunity document. */
function createOpportunityEvidence(payload, context, adapter = context?.adapter || defaultAdapter()) {
  const document = attachIdentity(OPPORTUNITY_EVIDENCE_SCHEMA, payload);
  return validateOpportunityEvidence(document, context, adapter);
}

module.exports = Object.freeze({
  CLASSIFICATIONS,
  COMPILER_OPPORTUNITY_CLASSES: Object.freeze([...COMPILER_OPPORTUNITY_CLASS_NAMES]),
  MATURE_ALGORITHM_DISPOSITIONS,
  MINIMUM_PAIRS,
  OPPORTUNITY_EVIDENCE_SCHEMA,
  OPPORTUNITY_SCOPE_SCHEMA,
  PAIRING_METHOD,
  computeOpportunityStatistics,
  createOpportunityEvidence,
  opportunityScopeIdentity,
  validateOpportunityEvidence,
});
