"use strict";

const {
  array,
  contentId,
  deepFreeze,
  enumeration,
  exactKeys,
  stableName,
} = require("../optimizer-development/common.cjs");

const CACHE_INVALIDATION_DIMENSIONS = Object.freeze([
  "abi", "compiler", "engine", "options", "platform", "source",
]);

const CATEGORY_CONTRACTS = deepFreeze({
  algorithm: {
    architecture: "mathematical-algorithm",
    laneRoles: ["semantic-proof", "implementation", "oracle", "workload", "integration"],
    details: [
      "kind", "specificationId", "domainProofEvidenceIds", "oracleEvidenceIds",
      "adversarialCorpusIds", "complexityEvidenceIds", "crossoverObservationIds",
      "failureModeEvidenceIds", "generalityWorkloadIds",
    ],
  },
  "library-route": {
    architecture: "library-integration",
    laneRoles: ["implementation", "oracle", "workload", "platform", "integration"],
    details: [
      "kind", "capabilityId", "libraryArtifactId", "declarationId",
      "semanticMappingEvidenceIds", "conversionObservationIds", "boundaryObservationIds",
      "resourceEvidenceIds", "interruptionEvidenceIds", "batchingObservationIds",
      "residencyObservationIds",
    ],
  },
  representation: {
    architecture: "representation-architecture",
    laneRoles: ["semantic-proof", "implementation", "oracle", "workload", "integration"],
    details: [
      "kind", "ownershipGraphId", "lifetimeGraphId", "aliasMutationEscapeEvidenceIds",
      "observabilityEvidenceIds", "scopeEvidenceIds", "transactionEvidenceIds",
      "memoryObservationIds", "duplicateRepresentationEvidenceIds", "heldOutConsumerIds",
    ],
  },
  runtime: {
    architecture: "runtime-architecture",
    laneRoles: ["implementation", "oracle", "workload", "platform", "integration"],
    details: [
      "kind", "componentId", "semanticReachEvidenceIds", "compatibilityEvidenceIds",
      "adversarialEvidenceIds", "distributionObservationIds", "budgetEvidenceIds",
      "independentWorkloadIds",
    ],
  },
  boundary: {
    architecture: "foreign-boundary",
    laneRoles: ["implementation", "oracle", "workload", "platform", "integration"],
    details: [
      "kind", "boundaryId", "crossingObservationIds", "payloadObservationIds",
      "ownershipEvidenceIds", "lifetimeEvidenceIds", "residencyEvidenceIds",
      "cleanupEvidenceIds", "interruptionEvidenceIds", "crossoverObservationIds",
      "rematerializationObservationIds",
    ],
  },
  cache: {
    architecture: "cache-architecture",
    laneRoles: ["implementation", "oracle", "workload", "integration"],
    details: [
      "kind", "cacheId", "keySchemaId", "sourceClosureId", "stateGraphId",
      "publicationEvidenceIds", "corruptionRecoveryEvidenceIds", "invalidationDimensions",
      "invalidationEvidenceIds", "poisoningEvidenceIds", "isolationEvidenceIds",
      "lifecycleObservationIds", "disabledFallbackEvidenceIds",
    ],
  },
  source: {
    architecture: "source-optimization",
    laneRoles: ["implementation", "oracle", "workload", "integration"],
    details: [
      "kind", "priorSourceUnitId", "replacementSourceUnitId", "parseEvidenceIds",
      "differentialEvidenceIds", "effectPreservationEvidenceIds",
      "maintenanceReviewEvidenceIds", "publicPerformanceObservationIds",
      "heldOutPerformanceObservationIds", "strictModuleEvidenceIds",
    ],
  },
  compiler: {
    architecture: "compiler-infrastructure",
    laneRoles: [
      "semantic-proof", "implementation", "oracle", "workload", "platform", "integration",
    ],
    details: [
      "kind", "compilerId", "optimizerProgramId", "decisionId", "passId",
      "recognitionEvidenceIds", "factEvidenceIds", "invalidationEvidenceIds", "loweringIds",
      "runtimeIntrinsicEvidenceIds", "preflightEvidenceIds", "routeEvidenceIds",
      "compileCostObservationIds", "emittedSizeObservationIds", "independentConsumerIds",
    ],
  },
});

const STABLE_NAME_FIELDS = new Set(["componentId", "boundaryId", "cacheId", "passId"]);
const STABLE_NAME_ARRAY_FIELDS = new Set(["loweringIds"]);
const NON_EVIDENCE_ARRAY_FIELDS = new Set(["invalidationDimensions"]);

function fail(label, message) {
  throw new Error(`optimization category contract ${label}: ${message}`);
}

function categoryContract(category) {
  const contract = CATEGORY_CONTRACTS[category];
  if (!contract) fail("category", `unknown category ${category}`);
  return contract;
}

function validateCategoryDetails(label, category, value) {
  const contract = categoryContract(category);
  exactKeys(label, value, contract.details);
  if (value.kind !== category) fail(`${label}.kind`, `must be ${category}`);
  const normalized = { kind: category };
  for (const field of contract.details.slice(1)) {
    if (field === "invalidationDimensions") {
      const dimensions = array(`${label}.${field}`, value[field],
        (itemLabel, item) => enumeration(itemLabel, item, CACHE_INVALIDATION_DIMENSIONS), {
          minimum: CACHE_INVALIDATION_DIMENSIONS.length,
          uniqueBy: (item) => item,
          sortedBy: (item) => item,
        });
      if (dimensions.length !== CACHE_INVALIDATION_DIMENSIONS.length) {
        fail(`${label}.${field}`, "must cover every cache invalidation dimension");
      }
      normalized[field] = dimensions;
    } else if (STABLE_NAME_ARRAY_FIELDS.has(field)) {
      normalized[field] = array(`${label}.${field}`, value[field],
        (itemLabel, item) => stableName(itemLabel, item), {
          minimum: 1, uniqueBy: (item) => item, sortedBy: (item) => item,
        });
    } else if (field.endsWith("Ids")) {
      normalized[field] = array(`${label}.${field}`, value[field],
        (itemLabel, item) => contentId(itemLabel, item), {
          minimum: 1, uniqueBy: (item) => item, sortedBy: (item) => item,
        });
    } else if (STABLE_NAME_FIELDS.has(field)) {
      normalized[field] = stableName(`${label}.${field}`, value[field]);
    } else if (field.endsWith("Id")) {
      normalized[field] = contentId(`${label}.${field}`, value[field]);
    } else {
      fail(label, `has no validator for field ${field}`);
    }
  }
  return deepFreeze(normalized);
}

function evidenceIdsForDetails(category, details) {
  const normalized = validateCategoryDetails("category details", category, details);
  const ids = [];
  for (const [field, value] of Object.entries(normalized)) {
    if (field === "kind" || STABLE_NAME_FIELDS.has(field) ||
        STABLE_NAME_ARRAY_FIELDS.has(field) || NON_EVIDENCE_ARRAY_FIELDS.has(field)) continue;
    if (Array.isArray(value)) ids.push(...value);
    else ids.push(value);
  }
  return [...new Set(ids)].sort();
}

function requiredLaneRoles(category) {
  return [...categoryContract(category).laneRoles];
}

function architectureForCategory(category) {
  return categoryContract(category).architecture;
}

module.exports = Object.freeze({
  CACHE_INVALIDATION_DIMENSIONS,
  CATEGORY_CONTRACTS,
  architectureForCategory,
  categoryContract,
  evidenceIdsForDetails,
  requiredLaneRoles,
  validateCategoryDetails,
});
