"use strict";

const {
  array,
  contentId,
  deepFreeze,
  enumeration,
  exactKeys,
  finiteNumber,
  nonemptyString,
  safeInteger,
} = require("../optimizer-development/common.cjs");
const {
  INTERVENTION_CATEGORIES,
  createDocument,
  validateIntervention,
  validateSubject,
} = require("./contracts.cjs");
const {
  architectureForCategory,
  evidenceIdsForDetails,
  requiredLaneRoles,
  validateCategoryDetails,
} = require("./category-contracts.cjs");

const HARD_GATE_CODES = Object.freeze([
  "current-epoch-identities",
  "exact-public-equivalence",
  "fallback-or-rollback",
  "complete-cost-boundary",
  "mature-capability-audit",
  "semantic-obligations",
  "platform-fallback",
  "positive-eleven-pair-separation",
  "worst-pair-ten-percent",
  "negative-evidence-retained",
]);

function fail(label, message) {
  throw new Error(`optimization auditor ${label}: ${message}`);
}

function byId(value) {
  if (!value) return new Map();
  if (value instanceof Map) return value;
  if (Array.isArray(value)) return new Map(value.map((item) => [item.id, item]));
  return new Map(Object.entries(value));
}

function evidenceIndex(context) {
  const result = new Map();
  for (const name of ["evidence", "observations", "workloads", "components"]) {
    for (const [id, value] of byId(context?.[name])) result.set(id, value);
  }
  return result;
}

function evidenceEpoch(value) {
  return value?.binding?.epochId || value?.epochId || value?.epoch?.id || null;
}

function validateProposal(label, proposal) {
  exactKeys(label, proposal, [
    "category", "owner", "mechanism", "changedComponents", "sourceRelationship",
    "evidenceBoundary", "fallback", "costTransfer", "matureCapability",
    "semanticObligations", "architectureObligations", "platformObligations",
    "rejectionConditions", "alternativeDispositions", "specific",
  ]);
  return proposal;
}

function auditIntervention({ epoch, subject, proposal }, context = {}) {
  validateSubject(subject);
  validateProposal("proposal", proposal);
  const category = enumeration("proposal.category", proposal.category, INTERVENTION_CATEGORIES);
  const specific = validateCategoryDetails("proposal.specific", category, proposal.specific);
  const index = evidenceIndex(context);
  const requiredIds = [...new Set([
    ...evidenceIdsForDetails(category, specific),
    ...proposal.matureCapability.capabilityIds,
    ...proposal.matureCapability.auditEvidenceIds,
  ])].sort();
  const requirements = [];
  let wrongEpoch = false;
  for (const evidenceId of requiredIds) {
    const evidence = index.get(evidenceId);
    if (!evidence) {
      requirements.push({
        code: `missing:${evidenceId}`,
        status: "missing",
        evidenceIds: [],
      });
      continue;
    }
    const binding = evidenceEpoch(evidence);
    if (binding !== null && binding !== epoch.id) {
      wrongEpoch = true;
      requirements.push({
        code: `wrong-epoch:${evidenceId}`,
        status: "fail",
        evidenceIds: [evidenceId],
      });
      continue;
    }
    requirements.push({
      code: `validated:${evidenceId}`,
      status: "pass",
      evidenceIds: [evidenceId],
    });
  }
  let status = wrongEpoch ? "rejected"
    : requirements.some((requirement) => requirement.status === "missing")
      ? "investigate" : "eligible";
  const mature = proposal.matureCapability;
  if (category === "library-route" && mature.status !== "available") status = "investigate";
  if ((category === "algorithm" || category === "compiler") && mature.status === "available") {
    status = "rejected";
    requirements.push({
      code: "duplicate-mature-capability",
      status: "fail",
      evidenceIds: [...mature.auditEvidenceIds].sort(),
    });
  }
  if (proposal.fallback.kind === "not-applicable") {
    status = "rejected";
    requirements.push({ code: "missing-fallback", status: "fail", evidenceIds: [] });
  }
  requirements.sort((left, right) => left.code.localeCompare(right.code));
  const knownInputIds = requiredIds.filter((id) => index.has(id));
  const intervention = createDocument("intervention", {
    authority: {
      kind: "validated-input-set",
      producer: `optimization.${category}-auditor.v2`,
      validatedInputIds: [epoch.id, subject.id, ...knownInputIds].sort(),
    },
    binding: { epochId: epoch.id, state: "current", predecessorIds: [] },
    subjectId: subject.id,
    ...proposal,
    specific,
  }, { subjects: [subject] });
  return deepFreeze({
    intervention,
    audit: {
      status,
      architecture: architectureForCategory(category),
      requirements,
      requiredLaneRoles: requiredLaneRoles(category),
      reasons: status === "eligible"
        ? ["all deterministic category obligations are present"]
        : status === "investigate"
          ? ["one or more required authorities are missing"]
          : ["a deterministic category requirement failed"],
    },
  });
}

function validatePair(label, value) {
  exactKeys(label, value, [
    "order", "baselineMicroseconds", "candidateMicroseconds",
    "baselineOutputDigest", "candidateOutputDigest",
  ]);
  const baseline = finiteNumber(
    `${label}.baselineMicroseconds`, value.baselineMicroseconds, Number.MIN_VALUE,
  );
  const candidate = finiteNumber(`${label}.candidateMicroseconds`, value.candidateMicroseconds, 0);
  if (value.baselineOutputDigest !== value.candidateOutputDigest) {
    fail(label, "baseline and candidate outputs differ");
  }
  return {
    order: enumeration(`${label}.order`, value.order, ["ABBA", "BAAB"]),
    baselineMicroseconds: baseline,
    candidateMicroseconds: candidate,
    baselineOutputDigest: nonemptyString(
      `${label}.baselineOutputDigest`, value.baselineOutputDigest,
    ),
    candidateOutputDigest: nonemptyString(
      `${label}.candidateOutputDigest`, value.candidateOutputDigest,
    ),
  };
}

function comparisonStatistics(comparisons) {
  const checked = array("candidate comparisons", comparisons, (label, comparison) => {
    exactKeys(label, comparison, ["role", "workloadId", "pairs"]);
    return {
      role: enumeration(`${label}.role`, comparison.role, ["representative", "held-out"]),
      workloadId: contentId(`${label}.workloadId`, comparison.workloadId),
      pairs: array(`${label}.pairs`, comparison.pairs, validatePair, { minimum: 1 }),
    };
  }, {
    minimum: 1,
    uniqueBy: (item) => `${item.role}:${item.workloadId}`,
    sortedBy: (item) => `${item.role}:${item.workloadId}`,
  });
  const fractions = checked.flatMap((comparison) => comparison.pairs.map((pair) =>
    (pair.baselineMicroseconds - pair.candidateMicroseconds) / pair.baselineMicroseconds));
  return {
    comparisons: checked,
    allPositive: fractions.every((fraction) => fraction > 0),
    worstPairFraction: Math.min(...fractions),
    minimumPairs: Math.min(...checked.map((comparison) => comparison.pairs.length)),
    hasRepresentative: checked.some((comparison) => comparison.role === "representative"),
    hasHeldOut: checked.some((comparison) => comparison.role === "held-out"),
  };
}

function validateDimensions(label, value) {
  exactKeys(label, value, [
    "semanticConfidence", "removableWallLowerMicroseconds", "independentWorkloads",
    "matureComponents", "portabilityCoverage", "rollbackSimplicity", "resourceReduction",
    "maintenanceSurface", "overhead",
  ]);
  return {
    semanticConfidence: enumeration(`${label}.semanticConfidence`, value.semanticConfidence, [
      "low", "medium", "high",
    ]),
    removableWallLowerMicroseconds: finiteNumber(
      `${label}.removableWallLowerMicroseconds`, value.removableWallLowerMicroseconds, 0,
    ),
    independentWorkloads: safeInteger(`${label}.independentWorkloads`, value.independentWorkloads),
    matureComponents: safeInteger(`${label}.matureComponents`, value.matureComponents),
    portabilityCoverage: safeInteger(`${label}.portabilityCoverage`, value.portabilityCoverage),
    rollbackSimplicity: enumeration(`${label}.rollbackSimplicity`, value.rollbackSimplicity, [
      "complex", "moderate", "simple",
    ]),
    resourceReduction: finiteNumber(`${label}.resourceReduction`, value.resourceReduction),
    maintenanceSurface: safeInteger(`${label}.maintenanceSurface`, value.maintenanceSurface),
    overhead: safeInteger(`${label}.overhead`, value.overhead),
  };
}

function hardGates(candidate, epochId) {
  validateIntervention(candidate.intervention);
  exactKeys("candidate feasibility", candidate.feasibility, [
    "epochId", "outputEquivalent", "fallbackComplete", "costBoundaryComplete",
    "matureAuditComplete", "semanticObligationsResolved", "platformFallbackComplete",
    "negativeEvidenceRetained", "comparisons", "dimensions", "missingAuthority",
  ]);
  const feasibility = candidate.feasibility;
  const statistics = comparisonStatistics(feasibility.comparisons);
  const gates = {
    "current-epoch-identities": feasibility.epochId === epochId &&
      candidate.intervention.binding.epochId === epochId,
    "exact-public-equivalence": feasibility.outputEquivalent === true,
    "fallback-or-rollback": feasibility.fallbackComplete === true,
    "complete-cost-boundary": feasibility.costBoundaryComplete === true,
    "mature-capability-audit": feasibility.matureAuditComplete === true,
    "semantic-obligations": feasibility.semanticObligationsResolved === true,
    "platform-fallback": feasibility.platformFallbackComplete === true,
    "positive-eleven-pair-separation": statistics.minimumPairs >= 11 &&
      statistics.allPositive && statistics.hasRepresentative && statistics.hasHeldOut,
    "worst-pair-ten-percent": statistics.worstPairFraction >= 0.1,
    "negative-evidence-retained": feasibility.negativeEvidenceRetained === true,
  };
  return {
    gates: HARD_GATE_CODES.map((code) => ({ code, status: gates[code] ? "pass" : "fail" })),
    passes: Object.values(gates).every(Boolean),
    missingAuthority: feasibility.missingAuthority === true,
    statistics,
    dimensions: validateDimensions("candidate dimensions", feasibility.dimensions),
  };
}

const CONFIDENCE = { low: 0, medium: 1, high: 2 };
const ROLLBACK = { complex: 0, moderate: 1, simple: 2 };

function compareCandidates(left, right) {
  const dimensions = [
    [CONFIDENCE[left.semanticConfidence], CONFIDENCE[right.semanticConfidence], "semantic-confidence"],
    [left.removableWallLowerMicroseconds, right.removableWallLowerMicroseconds, "removable-wall"],
    [left.independentWorkloads, right.independentWorkloads, "independent-workloads"],
    [left.matureComponents, right.matureComponents, "mature-component-reuse"],
    [left.portabilityCoverage, right.portabilityCoverage, "portability"],
    [ROLLBACK[left.rollbackSimplicity], ROLLBACK[right.rollbackSimplicity], "rollback"],
    [left.resourceReduction, right.resourceReduction, "resource-reduction"],
    [-left.maintenanceSurface, -right.maintenanceSurface, "maintenance-surface"],
    [-left.overhead, -right.overhead, "overhead"],
  ];
  for (const [leftValue, rightValue, name] of dimensions) {
    if (leftValue !== rightValue) return {
      order: leftValue > rightValue ? -1 : 1,
      decisiveDimension: name,
    };
  }
  return { order: 0, decisiveDimension: "stable-identity" };
}

function adjudicateCandidates({ epochId, candidates, currentAlreadyOptimized = false } = {}) {
  contentId("adjudication.epochId", epochId);
  const checked = array("adjudication candidates", candidates, (label, candidate) => {
    exactKeys(label, candidate, ["intervention", "audit", "feasibility"]);
    const intervention = validateIntervention(candidate.intervention);
    const gates = hardGates(candidate, epochId);
    return { intervention, audit: candidate.audit, feasibility: candidate.feasibility, ...gates };
  }, {
    minimum: 1,
    uniqueBy: (candidate) => candidate.intervention.id,
    sortedBy: (candidate) => candidate.intervention.id,
  });
  const eligible = checked.filter((candidate) =>
    candidate.audit.status === "eligible" && candidate.passes);
  let status;
  let selected = null;
  const pairwiseComparisons = [];
  if (eligible.length > 0) {
    eligible.sort((left, right) => {
      const compared = compareCandidates(left.dimensions, right.dimensions);
      return compared.order || left.intervention.id.localeCompare(right.intervention.id);
    });
    selected = eligible[0];
    status = "select";
    for (const candidate of eligible.slice(1)) {
      const compared = compareCandidates(selected.dimensions, candidate.dimensions);
      pairwiseComparisons.push({
        leftInterventionId: selected.intervention.id,
        rightInterventionId: candidate.intervention.id,
        winnerInterventionId: selected.intervention.id,
        decisiveDimension: compared.decisiveDimension,
      });
    }
  } else if (checked.some((candidate) =>
    candidate.audit.status === "investigate" || candidate.missingAuthority)) {
    status = "investigate";
  } else if (currentAlreadyOptimized) {
    status = "already-optimized";
  } else {
    status = "reject";
  }
  return deepFreeze({
    status,
    selectedInterventionId: selected?.intervention.id || null,
    hardGates: checked.map((candidate) => ({
      interventionId: candidate.intervention.id,
      gates: candidate.gates,
    })),
    dimensions: checked.map((candidate) => ({
      interventionId: candidate.intervention.id,
      ...candidate.dimensions,
    })),
    pairwiseComparisons,
    reasons: status === "select"
      ? ["one or more candidates passed every hard gate; lexicographic comparison selected one"]
      : status === "investigate"
        ? ["no selectable candidate exists and at least one authority is missing"]
        : status === "already-optimized"
          ? ["the current route already satisfies the reviewed boundary"]
          : ["every candidate failed at least one hard gate"],
  });
}

function campaignLaneRoles(category) {
  return requiredLaneRoles(category);
}

module.exports = Object.freeze({
  HARD_GATE_CODES,
  adjudicateCandidates,
  auditIntervention,
  campaignLaneRoles,
  compareCandidates,
  comparisonStatistics,
});
