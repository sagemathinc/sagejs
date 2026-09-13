"use strict";

const performancePolicySchema = "sagejs.python-performance-policy/v1";

function finiteNonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite nonnegative number`);
  }
  return value;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
  return value;
}

function validateThreshold(value, label, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  for (const field of fields) positive(value[field], `${label}.${field}`);
  return value;
}

function validatePolicy(policy) {
  if (policy?.schema !== performancePolicySchema) {
    throw new Error(`unsupported Python performance policy schema ${JSON.stringify(policy?.schema)}`);
  }
  if (policy.referenceRuntime !== "python" || policy.subjectRuntime !== "sagejs") {
    throw new Error("the initial Python performance policy must compare Sage.js with CPython");
  }
  positive(policy.minimumConfirmedSamples, "minimumConfirmedSamples");
  if (!Number.isSafeInteger(policy.minimumConfirmedSamples)) {
    throw new Error("minimumConfirmedSamples must be a positive safe integer");
  }
  finiteNonnegative(policy.referenceNoiseFloorMs, "referenceNoiseFloorMs");
  if (!Array.isArray(policy.interactiveScopes) ||
      policy.interactiveScopes.some((scope) => typeof scope !== "string" || scope.length === 0)) {
    throw new Error("interactiveScopes must be an array of nonempty strings");
  }
  const thresholds = policy.thresholds;
  validateThreshold(thresholds?.watch, "thresholds.watch", [
    "minimumRatio",
    "minimumDeltaMs",
  ]);
  validateThreshold(thresholds?.performanceCliff, "thresholds.performanceCliff", [
    "minimumRatio",
    "minimumDeltaMs",
  ]);
  validateThreshold(
    thresholds?.interactiveLatencyCliff,
    "thresholds.interactiveLatencyCliff",
    ["minimumRatio", "minimumDeltaMs", "minimumSubjectMs"],
  );
  validateThreshold(thresholds?.criticalCliff, "thresholds.criticalCliff", [
    "minimumRatio",
    "minimumDeltaMs",
    "timeoutSubjectMs",
    "timeoutReferenceMaximumMs",
  ]);
  return policy;
}

function result(status, ratio, deltaMs, reason) {
  return { status, ratio, deltaMs, reason };
}

function classifyMeasurement(policyValue, measurement) {
  const policy = validatePolicy(policyValue);
  const scope = measurement.scope;
  if (typeof scope !== "string" || scope.length === 0) {
    throw new Error("measurement.scope must be a nonempty string");
  }
  if (measurement.behaviorMatch !== true || measurement.comparable !== true) {
    return result("not-comparable", null, null, "behavior-or-workload-not-comparable");
  }
  const subjectMs = finiteNonnegative(measurement.subjectMs, "measurement.subjectMs");
  const referenceMs = finiteNonnegative(measurement.referenceMs, "measurement.referenceMs");
  const deltaMs = subjectMs - referenceMs;
  const ratio = referenceMs === 0 ? (subjectMs === 0 ? 1 : Infinity) : subjectMs / referenceMs;
  const thresholds = policy.thresholds;
  const critical = thresholds.criticalCliff;
  if ((ratio >= critical.minimumRatio && deltaMs >= critical.minimumDeltaMs) ||
      (subjectMs >= critical.timeoutSubjectMs &&
       referenceMs <= critical.timeoutReferenceMaximumMs)) {
    return result("critical-performance-cliff", ratio, deltaMs, "critical-threshold");
  }
  const interactive = thresholds.interactiveLatencyCliff;
  if (policy.interactiveScopes.includes(scope) &&
      ratio >= interactive.minimumRatio &&
      deltaMs >= interactive.minimumDeltaMs &&
      subjectMs >= interactive.minimumSubjectMs) {
    return result("performance-cliff", ratio, deltaMs, "interactive-latency-threshold");
  }
  const cliff = thresholds.performanceCliff;
  if (referenceMs >= policy.referenceNoiseFloorMs &&
      ratio >= cliff.minimumRatio && deltaMs >= cliff.minimumDeltaMs) {
    return result("performance-cliff", ratio, deltaMs, "default-threshold");
  }
  const watch = thresholds.watch;
  if (ratio >= watch.minimumRatio && deltaMs >= watch.minimumDeltaMs) {
    return result("watch", ratio, deltaMs, "watch-threshold");
  }
  return result("within-envelope", ratio, deltaMs, "below-thresholds");
}

module.exports = {
  classifyMeasurement,
  performancePolicySchema,
  validatePolicy,
};
