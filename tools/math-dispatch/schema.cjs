"use strict";

const {
  FINGERPRINT,
  deepFreeze,
  exactKeys,
  fail,
  fingerprint,
  identifier,
  knownKeys,
  nonemptyString,
  safeInteger,
  uniqueStrings,
} = require("./common.cjs");

const FAMILY_SCHEMA = "sagejs.math-dispatch/family-v1";
const PROFILE_SCHEMA = "sagejs.math-dispatch/profile-v1";
const FEATURE_TYPES = new Set(["boolean", "enum", "integer", "string", "uint64"]);
const FEATURE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const REPRESENTATION_POLICIES = new Set(["canonical", "canonical-when-capable"]);
const PROFILE_KINDS = new Set(["portable", "checked", "local"]);
const CONVERSION_ALLOCATIONS = new Set(["borrow", "copy"]);
const MATCH_KEYS = new Set([
  "arch", "benchmark_schema", "blas_provider", "build_fingerprint",
  "cpu_family", "declaration_generation", "library_versions", "os",
  "threading",
]);
const EXPRESSION_OPERATORS = new Set([
  "add", "all", "any", "available", "compare", "feature", "literal",
  "integer", "maximum", "minimum", "multiply", "not", "subtract",
]);
const COMPARISON_OPERATORS = new Set(["eq", "ge", "gt", "le", "lt", "ne"]);

function validateSource(filename, source, label) {
  exactKeys(filename, source, ["column", "line", "path"], `${label}.source`);
  nonemptyString(filename, source.path, `${label}.source.path`);
  if (source.path.startsWith("/") || source.path.split(/[\\/]/).includes("..")) {
    fail(filename, `${label}.source.path must be repository-relative`);
  }
  safeInteger(filename, source.line, `${label}.source.line`, 1);
  safeInteger(filename, source.column, `${label}.source.column`, 1);
  return source;
}

function validateExpression(filename, expression, features, label) {
  if (expression === true || expression === false || Number.isSafeInteger(expression) ||
      typeof expression === "string") return expression;
  knownKeys(filename, expression, ["op", "source"], [
    "arguments", "left", "name", "operator", "right", "value",
  ], label);
  if (!EXPRESSION_OPERATORS.has(expression.op)) {
    fail(filename, `${label}.op is unsupported: ${expression.op}`);
  }
  validateSource(filename, expression.source, label);
  if (expression.op === "integer") {
    exactKeys(filename, expression, ["op", "source", "value"], label);
    if (typeof expression.value !== "string" || !/^-?(?:0|[1-9][0-9]*)$/.test(expression.value)) {
      fail(filename, `${label}.value must be a canonical decimal integer`);
    }
  } else if (expression.op === "literal") {
    exactKeys(filename, expression, ["op", "source", "value"], label);
    if (!["boolean", "number", "string"].includes(typeof expression.value) ||
        (typeof expression.value === "number" && !Number.isSafeInteger(expression.value))) {
      fail(filename, `${label}.value must be a static scalar`);
    }
  } else if (expression.op === "feature") {
    exactKeys(filename, expression, ["name", "op", "source"], label);
    if (!features.has(expression.name)) {
      fail(filename, `${label} references unknown feature ${expression.name}`);
    }
  } else if (expression.op === "available") {
    exactKeys(filename, expression, ["name", "op", "source"], label);
    identifier(filename, expression.name, `${label}.name`);
  } else if (expression.op === "not") {
    exactKeys(filename, expression, ["arguments", "op", "source"], label);
    if (!Array.isArray(expression.arguments) || expression.arguments.length !== 1) {
      fail(filename, `${label}.arguments must contain one expression`);
    }
    validateExpression(filename, expression.arguments[0], features, `${label}.arguments[0]`);
  } else if (["all", "any", "minimum", "maximum"].includes(expression.op)) {
    exactKeys(filename, expression, ["arguments", "op", "source"], label);
    if (!Array.isArray(expression.arguments) || expression.arguments.length < 2) {
      fail(filename, `${label}.arguments must contain at least two expressions`);
    }
    expression.arguments.forEach((item, index) =>
      validateExpression(filename, item, features, `${label}.arguments[${index}]`));
  } else if (expression.op === "compare") {
    exactKeys(filename, expression, ["left", "op", "operator", "right", "source"], label);
    if (!COMPARISON_OPERATORS.has(expression.operator)) {
      fail(filename, `${label}.operator is unsupported`);
    }
    validateExpression(filename, expression.left, features, `${label}.left`);
    validateExpression(filename, expression.right, features, `${label}.right`);
  } else {
    exactKeys(filename, expression, ["left", "op", "right", "source"], label);
    validateExpression(filename, expression.left, features, `${label}.left`);
    validateExpression(filename, expression.right, features, `${label}.right`);
  }
  return expression;
}

function validateFamilyDocument(document, options = {}) {
  const filename = options.filename || "<family>";
  exactKeys(filename, document, [
    "capabilities", "conversions", "features", "generation", "id", "kind", "operations",
    "representations", "schema", "schema_version", "source",
  ], "family");
  if (document.schema !== FAMILY_SCHEMA || document.schema_version !== 1 ||
      document.kind !== "family") fail(filename, "unsupported family schema");
  identifier(filename, document.id, "family.id");
  safeInteger(filename, document.generation, "family.generation", 1);
  validateSource(filename, document.source, "family");
  if (document.features === null || typeof document.features !== "object" ||
      Array.isArray(document.features)) fail(filename, "family.features must be an object");
  const featureNames = new Set(Object.keys(document.features));
  if (featureNames.size === 0) fail(filename, "family.features must not be empty");
  for (const [name, type] of Object.entries(document.features)) {
    if (!FEATURE_NAME.test(name)) fail(filename, `feature ${name} must be snake_case`);
    if (!FEATURE_TYPES.has(type)) fail(filename, `feature ${name} has unknown type ${type}`);
  }
  const capabilities = new Map();
  if (!Array.isArray(document.capabilities)) fail(filename, "family.capabilities must be a list");
  for (const capability of document.capabilities) {
    exactKeys(filename, capability, ["id", "reason", "requires", "source"], "capability");
    identifier(filename, capability.id, "capability.id");
    if (capabilities.has(capability.id)) fail(filename, `duplicate capability ${capability.id}`);
    nonemptyString(filename, capability.reason, `${capability.id}.reason`);
    validateSource(filename, capability.source, capability.id);
    validateExpression(filename, capability.requires, featureNames, `${capability.id}.requires`);
    capabilities.set(capability.id, capability);
  }
  const representations = new Map();
  if (!Array.isArray(document.representations) || document.representations.length === 0) {
    fail(filename, "family.representations must be a nonempty list");
  }
  for (const representation of document.representations) {
    exactKeys(filename, representation, ["id", "policy", "reason", "source", "when"], "representation");
    identifier(filename, representation.id, "representation.id");
    if (representations.has(representation.id)) fail(filename, `duplicate representation ${representation.id}`);
    if (!REPRESENTATION_POLICIES.has(representation.policy)) {
      fail(filename, `${representation.id}.policy is unsupported`);
    }
    nonemptyString(filename, representation.reason, `${representation.id}.reason`);
    validateSource(filename, representation.source, representation.id);
    validateExpression(filename, representation.when, featureNames, `${representation.id}.when`);
    representations.set(representation.id, representation);
  }
  const conversions = new Map();
  if (!Array.isArray(document.conversions)) fail(filename, "family.conversions must be a list");
  for (const conversion of document.conversions) {
    exactKeys(filename, conversion, [
      "allocation", "id", "reason", "source", "source_representation", "target_layout",
    ], "conversion");
    identifier(filename, conversion.id, "conversion.id");
    if (conversions.has(conversion.id)) fail(filename, `duplicate conversion ${conversion.id}`);
    if (!representations.has(conversion.source_representation)) {
      fail(filename, `${conversion.id} uses unknown source representation ${conversion.source_representation}`);
    }
    identifier(filename, conversion.target_layout, `${conversion.id}.target_layout`);
    if (!CONVERSION_ALLOCATIONS.has(conversion.allocation)) {
      fail(filename, `${conversion.id}.allocation must be borrow or copy`);
    }
    nonemptyString(filename, conversion.reason, `${conversion.id}.reason`);
    validateSource(filename, conversion.source, conversion.id);
    conversions.set(conversion.id, conversion);
  }
  const operations = new Map();
  if (!Array.isArray(document.operations) || document.operations.length === 0) {
    fail(filename, "family.operations must be a nonempty list");
  }
  for (const operation of document.operations) {
    exactKeys(filename, operation, ["algorithms", "features", "id", "source"], "operation");
    identifier(filename, operation.id, "operation.id");
    if (operations.has(operation.id)) fail(filename, `duplicate operation ${operation.id}`);
    validateSource(filename, operation.source, operation.id);
    const operationFeatures = uniqueStrings(filename, operation.features, `${operation.id}.features`);
    for (const name of operationFeatures) {
      if (!FEATURE_NAME.test(name)) fail(filename, `${operation.id} feature ${name} must be snake_case`);
      if (!featureNames.has(name)) fail(filename, `${operation.id} uses unknown feature ${name}`);
    }
    const algorithms = new Map();
    if (!Array.isArray(operation.algorithms) || operation.algorithms.length === 0) {
      fail(filename, `${operation.id}.algorithms must be nonempty`);
    }
    for (const algorithm of operation.algorithms) {
      exactKeys(filename, algorithm, [
        "conversions", "fallback", "id", "reason", "requires", "source", "when",
      ], "algorithm");
      identifier(filename, algorithm.id, "algorithm.id");
      if (algorithms.has(algorithm.id)) fail(filename, `duplicate algorithm ${algorithm.id}`);
      validateSource(filename, algorithm.source, algorithm.id);
      nonemptyString(filename, algorithm.reason, `${algorithm.id}.reason`);
      const required = uniqueStrings(filename, algorithm.requires, `${algorithm.id}.requires`, { identifiers: true });
      for (const capability of required) {
        if (!capabilities.has(capability)) fail(filename, `${algorithm.id} requires unknown capability ${capability}`);
      }
      const fallback = uniqueStrings(filename, algorithm.fallback, `${algorithm.id}.fallback`, {
        identifiers: true,
        preserveOrder: true,
      });
      const conversionIds = uniqueStrings(filename, algorithm.conversions, `${algorithm.id}.conversions`, {
        identifiers: true,
        preserveOrder: true,
      });
      for (const conversion of conversionIds) {
        if (!conversions.has(conversion)) {
          fail(filename, `${algorithm.id} uses unknown conversion ${conversion}`);
        }
      }
      validateExpression(filename, algorithm.when, featureNames, `${algorithm.id}.when`);
      algorithms.set(algorithm.id, {
        ...algorithm,
        requires: required,
        fallback,
        conversions: conversionIds,
      });
    }
    for (const algorithm of algorithms.values()) {
      for (const fallback of algorithm.fallback) {
        if (!algorithms.has(fallback)) fail(filename, `${algorithm.id} falls back to unknown algorithm ${fallback}`);
        if (fallback === algorithm.id) fail(filename, `${algorithm.id} cannot fall back to itself`);
      }
    }
    const visiting = new Set();
    const visited = new Set();
    function visit(id) {
      if (visiting.has(id)) fail(filename, `${operation.id} has a fallback cycle through ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const next of algorithms.get(id).fallback) visit(next);
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of algorithms.keys()) visit(id);
    operations.set(operation.id, deepFreeze({
      ...operation,
      features: operationFeatures,
      algorithms: Object.freeze([...algorithms.values()].sort((a, b) => a.id.localeCompare(b.id))),
    }));
  }
  const normalized = deepFreeze({
    ...document,
    features: deepFreeze(Object.fromEntries(Object.entries(document.features).sort())),
    capabilities: Object.freeze([...capabilities.values()].sort((a, b) => a.id.localeCompare(b.id))),
    conversions: Object.freeze([...conversions.values()].sort((a, b) => a.id.localeCompare(b.id))),
    representations: Object.freeze([...representations.values()].sort((a, b) => a.id.localeCompare(b.id))),
    operations: Object.freeze([...operations.values()].sort((a, b) => a.id.localeCompare(b.id))),
  });
  return deepFreeze({
    document: normalized,
    fingerprint: fingerprint(normalized),
    features: featureNames,
    capabilities: new Map(normalized.capabilities.map((item) => [item.id, item])),
    conversions: new Map(normalized.conversions.map((item) => [item.id, item])),
    representations: new Map(normalized.representations.map((item) => [item.id, item])),
    operations: new Map(normalized.operations.map((item) => [item.id, item])),
  });
}

function validateMatch(filename, match, kind) {
  if (match === null || typeof match !== "object" || Array.isArray(match)) {
    fail(filename, "profile.match must be an object");
  }
  for (const key of Object.keys(match)) {
    if (!MATCH_KEYS.has(key)) fail(filename, `profile.match has unknown field ${key}`);
  }
  if (kind === "portable" && Object.keys(match).length !== 0) {
    fail(filename, "portable profile.match must be empty");
  }
  if (kind !== "portable" &&
      (!Object.hasOwn(match, "os") || !Object.hasOwn(match, "arch"))) {
    fail(filename, `${kind} profile.match requires os and arch`);
  }
  for (const [key, value] of Object.entries(match)) {
    if (key === "library_versions") {
      if (value === null || typeof value !== "object" || Array.isArray(value) ||
          Object.values(value).some((item) => typeof item !== "string")) {
        fail(filename, "profile.match.library_versions must be a string map");
      }
    } else if (["declaration_generation", "benchmark_schema"].includes(key)) {
      safeInteger(filename, value, `profile.match.${key}`, 1);
    } else if (typeof value !== "string" || value.length === 0) {
      fail(filename, `profile.match.${key} must be a nonempty string`);
    }
  }
  if (match.build_fingerprint !== undefined && !FINGERPRINT.test(match.build_fingerprint)) {
    fail(filename, "profile.match.build_fingerprint must be sha256 hex");
  }
  if (kind === "local") {
    for (const key of MATCH_KEYS) {
      if (!Object.hasOwn(match, key)) fail(filename, `local profile.match requires exact ${key}`);
    }
  }
  return deepFreeze(match);
}

function validateProfileDocument(document, families, options = {}) {
  const filename = options.filename || "<profile>";
  exactKeys(filename, document, [
    "declarations", "evidence", "generation", "id", "kind", "match",
    "operations", "schema", "schema_version", "source",
  ], "profile");
  if (document.schema !== PROFILE_SCHEMA || document.schema_version !== 1 ||
      !PROFILE_KINDS.has(document.kind)) fail(filename, "unsupported profile schema or kind");
  identifier(filename, document.id, "profile.id");
  safeInteger(filename, document.generation, "profile.generation", 1);
  validateSource(filename, document.source, "profile");
  const match = validateMatch(filename, document.match, document.kind);
  if (document.declarations === null || typeof document.declarations !== "object" ||
      Array.isArray(document.declarations)) fail(filename, "profile.declarations must be an object");
  for (const [familyId, expected] of Object.entries(document.declarations)) {
    if (!families.has(familyId)) fail(filename, `profile references unknown family ${familyId}`);
    if (!FINGERPRINT.test(expected)) fail(filename, `profile declaration fingerprint for ${familyId} is invalid`);
    if (families.get(familyId).fingerprint !== expected) {
      fail(filename, `profile declaration fingerprint for ${familyId} is stale`);
    }
  }
  if (document.kind !== "portable" && Object.keys(document.declarations).length === 0) {
    fail(filename, `${document.kind} profile must bind declaration fingerprints`);
  }
  const evidence = uniqueStrings(filename, document.evidence, "profile.evidence");
  const seen = new Set();
  if (!Array.isArray(document.operations)) fail(filename, "profile.operations must be a list");
  const operations = [];
  for (const profiled of document.operations) {
    exactKeys(filename, profiled, ["family", "operation", "rules", "source"], "profile operation");
    const family = families.get(profiled.family);
    if (!family) fail(filename, `profile references unknown family ${profiled.family}`);
    const operation = family.operations.get(profiled.operation);
    if (!operation) fail(filename, `profile references unknown operation ${profiled.family}.${profiled.operation}`);
    if (document.kind !== "portable" && !(profiled.family in document.declarations)) {
      fail(filename, `${document.kind} profile must bind declaration fingerprint for ${profiled.family}`);
    }
    const key = `${profiled.family}.${profiled.operation}`;
    if (seen.has(key)) fail(filename, `duplicate profile operation ${key}`);
    seen.add(key);
    validateSource(filename, profiled.source, key);
    if (!Array.isArray(profiled.rules) || profiled.rules.length === 0) {
      fail(filename, `${key}.rules must be nonempty`);
    }
    const ruleIds = new Set();
    let terminal = false;
    const rules = [];
    for (const rule of profiled.rules) {
      exactKeys(filename, rule, ["choose", "evidence", "id", "reason", "source", "when"], "rule");
      identifier(filename, rule.id, "rule.id");
      if (ruleIds.has(rule.id)) fail(filename, `duplicate rule ${key}.${rule.id}`);
      ruleIds.add(rule.id);
      if (terminal) fail(filename, `${key}.${rule.id} is unreachable after an unconditional rule`);
      if (!operation.algorithms.some((item) => item.id === rule.choose)) {
        fail(filename, `${key}.${rule.id} chooses unknown algorithm ${rule.choose}`);
      }
      nonemptyString(filename, rule.reason, `${key}.${rule.id}.reason`);
      if (rule.evidence !== null) {
        nonemptyString(filename, rule.evidence, `${key}.${rule.id}.evidence`);
        if (!evidence.includes(rule.evidence)) fail(filename, `${key}.${rule.id} cites undeclared evidence ${rule.evidence}`);
      }
      validateSource(filename, rule.source, `${key}.${rule.id}`);
      validateExpression(filename, rule.when, family.features, `${key}.${rule.id}.when`);
      if (rule.when === true) terminal = true;
      rules.push(rule);
    }
    if (document.kind === "portable" && !terminal) {
      fail(filename, `portable ${key} requires a final unconditional correctness rule`);
    }
    operations.push(deepFreeze({ ...profiled, rules: Object.freeze(rules) }));
  }
  const normalized = deepFreeze({
    ...document,
    declarations: deepFreeze(Object.fromEntries(Object.entries(document.declarations).sort())),
    evidence,
    match,
    operations: Object.freeze(operations.sort((a, b) =>
      `${a.family}.${a.operation}`.localeCompare(`${b.family}.${b.operation}`))),
  });
  return deepFreeze({
    document: normalized,
    fingerprint: fingerprint(normalized),
    operationMap: new Map(normalized.operations.map((item) =>
      [`${item.family}.${item.operation}`, item])),
  });
}

module.exports = {
  FAMILY_SCHEMA,
  FEATURE_TYPES,
  MATCH_KEYS,
  PROFILE_SCHEMA,
  validateExpression,
  validateFamilyDocument,
  validateProfileDocument,
};
