"use strict";

const {
  enumeration,
  exactKeys,
  identifier,
  nonemptyString,
} = require("./common.cjs");

const INTERVENTION_CATEGORIES = Object.freeze([
  "algorithm",
  "library-route",
  "representation",
  "runtime",
  "boundary",
  "cache",
  "source",
  "compiler",
]);

const INTERVENTION_ACTIONS = Object.freeze(
  INTERVENTION_CATEGORIES.map((category) => `${category}-campaign`),
);

const SOURCE_RELATIONSHIPS = Object.freeze([
  "source-transparent",
  "source-changing",
  "not-applicable",
]);

const FALLBACK_STRATEGIES = Object.freeze([
  "same-source",
  "guarded-source",
  "library-fallback",
  "rollback",
  "not-applicable",
]);

const EVIDENCE_BOUNDARIES = Object.freeze([
  "complete-public-call",
  "reviewed-phase",
  "system-boundary",
]);

const ARCHITECTURE_STRATEGIES = Object.freeze({
  algorithm: "mathematical-algorithm",
  "library-route": "library-integration",
  representation: "representation-architecture",
  runtime: "runtime-architecture",
  boundary: "foreign-boundary",
  cache: "cache-architecture",
  source: "source-optimization",
  compiler: "compiler-infrastructure",
});

function actionForIntervention(category) {
  return `${enumeration("intervention category", category, INTERVENTION_CATEGORIES)}-campaign`;
}

function architectureForIntervention(category) {
  return ARCHITECTURE_STRATEGIES[
    enumeration("intervention category", category, INTERVENTION_CATEGORIES)
  ];
}

function validateIntervention(label, value) {
  exactKeys(label, value, [
    "category",
    "action",
    "owner",
    "mechanism",
    "evidenceBoundary",
    "sourceRelationship",
    "fallbackStrategy",
  ]);
  const category = enumeration(
    `${label}.category`, value.category, INTERVENTION_CATEGORIES,
  );
  const action = enumeration(`${label}.action`, value.action, INTERVENTION_ACTIONS);
  const expectedAction = actionForIntervention(category);
  if (action !== expectedAction) {
    throw new Error(`${label}.action: expected ${expectedAction} for ${category}`);
  }
  return Object.freeze({
    category,
    action,
    owner: identifier(`${label}.owner`, value.owner),
    mechanism: nonemptyString(`${label}.mechanism`, value.mechanism),
    evidenceBoundary: enumeration(
      `${label}.evidenceBoundary`, value.evidenceBoundary, EVIDENCE_BOUNDARIES,
    ),
    sourceRelationship: enumeration(
      `${label}.sourceRelationship`, value.sourceRelationship, SOURCE_RELATIONSHIPS,
    ),
    fallbackStrategy: enumeration(
      `${label}.fallbackStrategy`, value.fallbackStrategy, FALLBACK_STRATEGIES,
    ),
  });
}

module.exports = Object.freeze({
  ARCHITECTURE_STRATEGIES,
  EVIDENCE_BOUNDARIES,
  FALLBACK_STRATEGIES,
  INTERVENTION_ACTIONS,
  INTERVENTION_CATEGORIES,
  SOURCE_RELATIONSHIPS,
  actionForIntervention,
  architectureForIntervention,
  validateIntervention,
});
