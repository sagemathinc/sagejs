"use strict";

const path = require("node:path");

const {
  contentId,
  deepFreeze,
  identifier,
  repositoryPath,
} = require("../optimizer-development/common.cjs");
const {
  createDocument,
  validateDossier,
  validateIntervention,
  validateOpportunity,
} = require("./contracts.cjs");
const { requiredLaneRoles } = require("./category-contracts.cjs");

function fail(label, message) {
  throw new Error(`optimization planner ${label}: ${message}`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function dossierEvidence(intervention) {
  const details = intervention.specific;
  switch (intervention.category) {
    case "algorithm":
      return {
        specificationId: details.specificationId,
        proofEvidenceIds: uniqueSorted([
          ...details.domainProofEvidenceIds,
          ...details.oracleEvidenceIds,
          ...details.complexityEvidenceIds,
        ]),
        crossoverEvidenceIds: details.crossoverObservationIds,
      };
    case "library-route":
      return {
        capabilityEvidenceIds: uniqueSorted([
          details.capabilityId,
          ...details.semanticMappingEvidenceIds,
          ...details.boundaryObservationIds,
        ]),
        conversionPlanId: details.declarationId,
        resourceEvidenceIds: details.resourceEvidenceIds,
      };
    case "representation":
      return {
        ownershipGraphId: details.ownershipGraphId,
        lifetimeEvidenceIds: uniqueSorted([
          details.lifetimeGraphId,
          ...details.scopeEvidenceIds,
        ]),
        resourceEvidenceIds: uniqueSorted([
          ...details.memoryObservationIds,
          ...details.duplicateRepresentationEvidenceIds,
        ]),
      };
    case "runtime":
      return {
        componentEvidenceIds: uniqueSorted([
          ...details.semanticReachEvidenceIds,
          ...details.distributionObservationIds,
        ]),
        compatibilityEvidenceIds: details.compatibilityEvidenceIds,
        budgetEvidenceIds: details.budgetEvidenceIds,
      };
    case "boundary":
      return {
        crossingEvidenceIds: uniqueSorted([
          ...details.crossingObservationIds,
          ...details.payloadObservationIds,
        ]),
        ownershipPlanId: details.ownershipEvidenceIds[0],
        platformEvidenceIds: uniqueSorted([
          ...details.interruptionEvidenceIds,
          ...details.cleanupEvidenceIds,
        ]),
      };
    case "cache":
      return {
        stateTransitionEvidenceIds: uniqueSorted([
          details.stateGraphId,
          ...details.lifecycleObservationIds,
        ]),
        keyEvidenceIds: uniqueSorted([details.keySchemaId, details.sourceClosureId]),
        churnEvidenceIds: uniqueSorted([
          ...details.invalidationEvidenceIds,
          ...details.poisoningEvidenceIds,
          ...details.isolationEvidenceIds,
        ]),
      };
    case "source":
      return {
        replacementSourceIds: uniqueSorted([
          details.priorSourceUnitId,
          details.replacementSourceUnitId,
        ]),
        differentialEvidenceIds: details.differentialEvidenceIds,
        reviewEvidenceIds: uniqueSorted([
          ...details.maintenanceReviewEvidenceIds,
          ...details.strictModuleEvidenceIds,
        ]),
      };
    case "compiler":
      return {
        decisionId: details.decisionId,
        irId: details.optimizerProgramId,
        verifierEvidenceIds: uniqueSorted([
          ...details.factEvidenceIds,
          ...details.invalidationEvidenceIds,
        ]),
        routeEvidenceIds: details.routeEvidenceIds,
      };
    default:
      fail("dossier", `unknown category ${intervention.category}`);
  }
}

function createDossier({ opportunity, intervention, observationIds }) {
  opportunity = validateOpportunity(opportunity);
  intervention = validateIntervention(intervention);
  if (opportunity.decision.status !== "select" ||
      opportunity.decision.selectedInterventionId !== intervention.id) {
    fail("dossier", "requires the exact selected intervention");
  }
  if (opportunity.binding.epochId !== intervention.binding.epochId ||
      opportunity.subjectId !== intervention.subjectId) {
    fail("dossier", "opportunity and intervention scope differ");
  }
  return createDocument("dossier", {
    authority: {
      kind: "validated-input-set",
      producer: "optimization.adjudicator.v2",
      validatedInputIds: uniqueSorted([opportunity.id, intervention.id, ...observationIds]),
    },
    binding: {
      epochId: opportunity.binding.epochId,
      state: "current",
      predecessorIds: [],
    },
    opportunityId: opportunity.id,
    subjectId: opportunity.subjectId,
    interventionId: intervention.id,
    category: intervention.category,
    observationIds: uniqueSorted(observationIds),
    evidence: dossierEvidence(intervention),
    measurementBoundary: [intervention.evidenceBoundary],
    fallbackPlan: {
      entry: intervention.fallback.entry,
      rollback: intervention.fallback.rollback,
      tests: uniqueSorted([
        "guard miss before visible effects",
        "failure leaves no partial publication",
      ]),
    },
    promotionRequirements: uniqueSorted([
      ...intervention.semanticObligations,
      ...intervention.architectureObligations,
      ...intervention.platformObligations,
    ]),
  }, { interventions: [intervention] });
}

function claimOverlaps(left, right) {
  const normalize = (value) => path.posix.normalize(repositoryPath("campaign claim", value));
  left = normalize(left);
  right = normalize(right);
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function generateCampaign({
  dossier,
  opportunity,
  intervention,
  claimsByRole,
  requiredEvidenceIds,
  representativeWorkloadIds,
  heldOutWorkloadIds,
}) {
  dossier = validateDossier(dossier, { interventions: [intervention] });
  opportunity = validateOpportunity(opportunity);
  intervention = validateIntervention(intervention);
  if (opportunity.decision.status !== "select" ||
      opportunity.decision.selectedInterventionId !== intervention.id ||
      dossier.interventionId !== intervention.id) {
    fail("campaign", "only an approved selected dossier can create work");
  }
  const roles = requiredLaneRoles(intervention.category);
  const lanes = roles.map((role) => {
    const claims = claimsByRole[role];
    if (!Array.isArray(claims) || claims.length === 0) {
      fail("campaign", `missing required lane role ${role}`);
    }
    return {
      id: identifier("campaign lane id", `${intervention.category}-${role}`),
      role,
      claims: uniqueSorted(claims),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  for (let left = 0; left < lanes.length; left += 1) {
    for (let right = left + 1; right < lanes.length; right += 1) {
      for (const leftClaim of lanes[left].claims) {
        for (const rightClaim of lanes[right].claims) {
          if (claimOverlaps(leftClaim, rightClaim)) {
            fail("campaign", `overlapping claims ${leftClaim} and ${rightClaim}`);
          }
        }
      }
    }
  }
  return createDocument("campaign", {
    authority: {
      kind: "validated-input-set",
      producer: "optimization.campaign-planner.v2",
      validatedInputIds: uniqueSorted([dossier.id, opportunity.id, intervention.id]),
    },
    binding: {
      epochId: dossier.binding.epochId,
      state: "current",
      predecessorIds: [],
    },
    dossierId: dossier.id,
    interventionId: intervention.id,
    category: intervention.category,
    state: "proposed",
    lanes,
    requiredEvidenceIds: uniqueSorted(requiredEvidenceIds),
    representativeWorkloadIds: uniqueSorted(representativeWorkloadIds),
    heldOutWorkloadIds: uniqueSorted(heldOutWorkloadIds),
  }, { interventions: [intervention] });
}

module.exports = Object.freeze({
  claimOverlaps,
  createDossier,
  dossierEvidence,
  generateCampaign,
});
