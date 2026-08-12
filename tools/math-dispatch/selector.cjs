"use strict";

const { compareVectors, deepFreeze, fail } = require("./common.cjs");

class DispatchSelectionError extends Error {
  constructor(message, decision = null) {
    super(message);
    this.name = "DispatchSelectionError";
    this.decision = decision;
  }
}

function availableSet(capabilities) {
  if (capabilities instanceof Set) return new Set(capabilities);
  if (Array.isArray(capabilities)) return new Set(capabilities);
  return new Set(Object.entries(capabilities || {}).filter(([, value]) => value).map(([key]) => key));
}

function evaluate(expression, features, available) {
  if (expression === true || expression === false || typeof expression === "string" ||
      Number.isSafeInteger(expression)) return expression;
  switch (expression.op) {
    case "literal": return expression.value;
    case "integer": return BigInt(expression.value);
    case "feature":
      if (!Object.prototype.hasOwnProperty.call(features, expression.name)) {
        throw new Error(`missing dispatch feature ${expression.name}`);
      }
      return features[expression.name];
    case "available": return available.has(expression.name);
    case "all": return expression.arguments.every((item) => Boolean(evaluate(item, features, available)));
    case "any": return expression.arguments.some((item) => Boolean(evaluate(item, features, available)));
    case "not": return !Boolean(evaluate(expression.arguments[0], features, available));
    case "minimum": return extremum(expression.arguments.map((item) => evaluate(item, features, available)), false);
    case "maximum": return extremum(expression.arguments.map((item) => evaluate(item, features, available)), true);
    case "compare": {
      let left = evaluate(expression.left, features, available);
      let right = evaluate(expression.right, features, available);
      if (typeof left === "bigint" || typeof right === "bigint") {
        left = exactInteger(left);
        right = exactInteger(right);
      }
      if (expression.operator === "eq") return left === right;
      if (expression.operator === "ne") return left !== right;
      if (typeof left !== typeof right) return false;
      if (expression.operator === "lt") return left < right;
      if (expression.operator === "le") return left <= right;
      if (expression.operator === "gt") return left > right;
      if (expression.operator === "ge") return left >= right;
      throw new Error(`unsupported comparison ${expression.operator}`);
    }
    case "add": return arithmetic(expression, features, available, (a, b) => a + b);
    case "subtract": return arithmetic(expression, features, available, (a, b) => a - b);
    case "multiply": return arithmetic(expression, features, available, (a, b) => a * b);
    default: throw new Error(`unsupported dispatch expression ${expression.op}`);
  }
}

function numeric(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }
  if (!Number.isSafeInteger(value)) throw new Error("dispatch arithmetic requires exact integers");
  return value;
}

function exactInteger(value) {
  if (typeof value === "bigint") return value;
  if (Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  throw new Error("dispatch comparison requires compatible exact integers");
}

function extremum(values, maximum) {
  if (values.length === 0) throw new Error("dispatch extremum requires values");
  const exact = values.some((value) => typeof value === "bigint")
    ? values.map(exactInteger) : values.map(numeric);
  return exact.reduce((best, value) => maximum
    ? (value > best ? value : best)
    : (value < best ? value : best));
}

function arithmetic(expression, features, available, operation) {
  let left = numeric(evaluate(expression.left, features, available));
  let right = numeric(evaluate(expression.right, features, available));
  if (typeof left === "bigint" || typeof right === "bigint") {
    left = exactInteger(left);
    right = exactInteger(right);
  }
  const result = operation(left, right);
  if (typeof result !== "bigint" && !Number.isSafeInteger(result)) {
    throw new Error("dispatch arithmetic overflowed a safe integer");
  }
  return result;
}

function normalizeFeatures(family, operation, provided) {
  if (provided === null || typeof provided !== "object" || Array.isArray(provided)) {
    throw new Error("dispatch features must be an object");
  }
  const expected = new Set(operation.features);
  for (const name of Object.keys(provided)) {
    if (!expected.has(name)) throw new Error(`unknown feature ${name} for ${family.document.id}.${operation.id}`);
  }
  const result = {};
  for (const name of [...expected].sort()) {
    if (!(name in provided)) throw new Error(`missing feature ${name}`);
    const value = provided[name];
    const type = family.document.features[name];
    if (type === "uint64") {
      let integer;
      try {
        integer = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)
          ? BigInt(value) : Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
      } catch {
        integer = null;
      }
      if (integer === null || integer < 0n || integer > 0xFFFFFFFFFFFFFFFFn) {
        throw new Error(`feature ${name} must be an unsigned 64-bit integer`);
      }
      result[name] = integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : integer.toString();
      continue;
    }
    if (type === "integer" && !Number.isSafeInteger(value)) throw new Error(`feature ${name} must be a safe integer`);
    if (type === "boolean" && typeof value !== "boolean") throw new Error(`feature ${name} must be boolean`);
    if (["string", "enum"].includes(type) && typeof value !== "string") {
      throw new Error(`feature ${name} must be a string`);
    }
    result[name] = value;
  }
  return deepFreeze(result);
}

function identityMatches(match, build, options = {}) {
  const mismatches = [];
  for (const [key, expected] of Object.entries(match)) {
    if (key === "library_versions") {
      if (options.exact) {
        const expectedKeys = Object.keys(expected).sort();
        const actualKeys = Object.keys(build.library_versions || {}).sort();
        if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
          mismatches.push(
            `library_versions keys=${actualKeys.join(",") || "missing"}, ` +
            `expected ${expectedKeys.join(",")}`,
          );
        }
      }
      for (const [library, version] of Object.entries(expected)) {
        if (build.library_versions?.[library] !== version) {
          mismatches.push(`${library}=${build.library_versions?.[library] ?? "missing"}, expected ${version}`);
        }
      }
    } else if (build[key] !== expected) {
      mismatches.push(`${key}=${build[key] ?? "missing"}, expected ${expected}`);
    }
  }
  return { matches: mismatches.length === 0, mismatches };
}

function profileSpecificity(profile) {
  const match = profile.document.match;
  return [
    match.build_fingerprint ? 1 : 0,
    match.cpu_family ? 1 : 0,
    match.os && match.arch ? 1 : 0,
    Object.keys(match).length,
  ];
}

function selectProfile(registry, key, build, localProfile) {
  const diagnostics = [];
  if (localProfile) {
    if (localProfile.document.kind !== "local") throw new Error("activated local profile must have kind local");
    const match = identityMatches(localProfile.document.match, build, { exact: true });
    if (match.matches && localProfile.operationMap.has(key)) {
      return { profile: localProfile, origin: "local", diagnostics };
    }
    diagnostics.push({ profile: localProfile.document.id, ignored: true, reasons: match.mismatches.length ? match.mismatches : [`no rules for ${key}`] });
  }
  const matching = registry.profiles.filter((profile) =>
    profile.document.kind === "checked" && profile.operationMap.has(key) &&
    identityMatches(profile.document.match, build).matches);
  if (matching.length > 0) {
    matching.sort((left, right) => compareVectors(profileSpecificity(right), profileSpecificity(left)) ||
      left.document.id.localeCompare(right.document.id));
    if (matching.length > 1 && compareVectors(
      profileSpecificity(matching[0]), profileSpecificity(matching[1]),
    ) === 0) {
      throw new Error(`ambiguous equal-specificity dispatch profiles ${matching[0].document.id} and ${matching[1].document.id}`);
    }
    return { profile: matching[0], origin: "checked", diagnostics };
  }
  const portable = registry.profiles.find((profile) =>
    profile.document.kind === "portable" && profile.operationMap.has(key));
  if (!portable) throw new Error(`portable dispatch profile has no rules for ${key}`);
  return { profile: portable, origin: "portable", diagnostics };
}

function selectImplementation(registry, request) {
  const family = registry.families.get(request.family);
  if (!family) throw new Error(`unknown dispatch family ${request.family}`);
  const operation = family.operations.get(request.operation);
  if (!operation) throw new Error(`unknown dispatch operation ${request.family}.${request.operation}`);
  const features = normalizeFeatures(family, operation, request.features || {});
  const available = availableSet(request.capabilities);
  const representationMatches = family.document.representations.filter((item) =>
    Boolean(evaluate(item.when, features, available)));
  if (representationMatches.length !== 1) {
    throw new Error(`canonical representation policy matched ${representationMatches.length} representations`);
  }
  const capabilityResults = new Map();
  const requiredCapabilities = new Set(operation.algorithms.flatMap((algorithm) => algorithm.requires));
  for (const capability of family.document.capabilities.filter((item) => requiredCapabilities.has(item.id))) {
    capabilityResults.set(capability.id, Boolean(evaluate(capability.requires, features, available)));
  }
  const candidates = operation.algorithms.map((algorithm) => {
    const reasons = [];
    for (const capability of algorithm.requires) {
      if (!capabilityResults.get(capability)) {
        reasons.push(family.capabilities.get(capability).reason);
      }
    }
    if (!Boolean(evaluate(algorithm.when, features, available))) {
      reasons.push(`hard predicate for ${algorithm.id} did not match`);
    }
    return deepFreeze({
      id: algorithm.id,
      available: reasons.length === 0,
      rejection_reasons: Object.freeze(reasons),
      conversions: algorithm.conversions,
    });
  });
  const byCandidate = new Map(candidates.map((item) => [item.id, item]));
  const algorithms = new Map(operation.algorithms.map((item) => [item.id, item]));
  const key = `${request.family}.${request.operation}`;
  let rule = null;
  let preferred = null;
  let explicit = request.algorithm;
  if (explicit === null || explicit === undefined || explicit === "auto") explicit = null;
  const profileChoice = explicit === null
    ? selectProfile(registry, key, request.build || {}, request.localProfile)
    : { profile: null, origin: "explicit", diagnostics: [] };
  if (explicit !== null) {
    if (!algorithms.has(explicit)) throw new DispatchSelectionError(`unknown explicit algorithm ${explicit}`);
    const candidate = byCandidate.get(explicit);
    if (!candidate.available) {
      const decision = deepFreeze({ family: request.family, operation: request.operation, features, candidates, explicit_algorithm: explicit });
      throw new DispatchSelectionError(
        `explicit algorithm ${explicit} is unavailable: ${candidate.rejection_reasons.join("; ")}`,
        decision,
      );
    }
    preferred = explicit;
  } else {
    const profiled = profileChoice.profile.operationMap.get(key);
    rule = profiled.rules.find((item) => Boolean(evaluate(item.when, features, available))) || null;
    if (!rule) throw new Error(`dispatch profile ${profileChoice.profile.document.id} matched no rule for ${key}`);
    preferred = rule.choose;
  }
  const walked = [];
  function firstAvailable(id, path = new Set()) {
    if (path.has(id)) throw new Error(`fallback cycle reached at ${id}`);
    path.add(id);
    walked.push(id);
    if (byCandidate.get(id).available) return id;
    for (const next of algorithms.get(id).fallback) {
      const selected = firstAvailable(next, new Set(path));
      if (selected) return selected;
    }
    return null;
  }
  const selected = firstAvailable(preferred);
  if (selected === null) throw new DispatchSelectionError(`no available implementation for ${key}`);
  return deepFreeze({
    schema: "sagejs.math-dispatch/decision-v1",
    family: request.family,
    operation: request.operation,
    features,
    representation: {
      id: representationMatches[0].id,
      policy: representationMatches[0].policy,
      reason: representationMatches[0].reason,
    },
    candidates,
    explicit_algorithm: explicit,
    profile: {
      id: profileChoice.profile?.document.id ?? "explicit",
      origin: profileChoice.origin,
      fingerprint: profileChoice.profile?.fingerprint ?? null,
      diagnostics: profileChoice.diagnostics,
    },
    rule: rule === null ? null : {
      id: rule.id,
      reason: rule.reason,
      evidence: rule.evidence,
      source: rule.source,
    },
    preferred,
    fallback_chain: Object.freeze(walked),
    implementation: selected,
    declaration_fingerprint: family.fingerprint,
    profile_set_fingerprint: registry.identity.profile_set_fingerprint,
    build: deepFreeze({ ...(request.build || {}) }),
  });
}

function traceLine(decision) {
  const salient = Object.entries(decision.features).map(([key, value]) => `${key}=${value}`).join(",");
  return `[sagejs math] ${decision.family}.${decision.operation} ${salient} -> ` +
    `${decision.implementation} (${decision.representation.id}; ${decision.profile.id}/${decision.rule?.id || "explicit"}; ` +
    `${decision.profile.fingerprint?.slice(0, 12) || "no-profile"})`;
}

module.exports = {
  DispatchSelectionError,
  evaluate,
  identityMatches,
  normalizeFeatures,
  profileSpecificity,
  selectImplementation,
  traceLine,
};
